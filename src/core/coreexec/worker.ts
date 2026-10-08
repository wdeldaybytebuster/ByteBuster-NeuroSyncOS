import { ThreadWorker } from 'poolifier';
import { CommandSandbox } from '../portgrid/sandbox';
import { StealthScraper } from './scraping';
import { classifyDirective, NodeDirective } from './dispatch';
import { HarnessProfileEnum, type HarnessProfile } from '../basevault/schema';
// §2.3 C8 — the gate seam (replaces the inline checkActionPermission call that
// used to run AFTER executePlugin) + RouteSwitch's governed egress for
// okf_indexer's URL fetch.
import { gateAndDispatch } from './gate-order';
import { egressFetch } from '../routeswitch/egress';
import { RouteSwitchEngine } from '../routeswitch/engine';
// SA-01: all gitnexus CLI invocation goes through this audited bridge
// (CHILD_PROCESS_ALLOWLIST in scripts/audit-ground-rules.ts), never raw
// child_process in the orchestrator. Static import so test doubles via
// vi.mock() reliably intercept it.
import { runGitNexusQuery } from '../memory/gitnexus-client';
/**
 * Single-shape worker input. Backward-compat is preserved by `kind: 'legacy'`
 * whose `data` field carries the legacy stub payload. `kind: 'dag' | undefined`
 * is the §2.1 dispatch path; callers (engine.ts) currently send duck-typed
 * `{ taskId, prompt }` because Poolifier's DynamicThreadPool is not currently
 * parameterised on our custom type, so we accept either form explicitly.
 */
export interface WorkerInput {
  kind?: 'legacy' | 'dag';
  taskId?: string;
  prompt?: string;
  directive?: NodeDirective;
  harnessProfile?: HarnessProfile;
  data?: unknown;
  plugin?: string;
  params?: any;
}

/**
 * P3-S6 — acquisition bounds for the okf_indexer files batch (interim
 * single-writer-topology discipline: workers still hold write-capable
 * handles, so each worker task must bound its own write burst — see
 * docs/security/WORKER-WRITE-TOPOLOGY.md).
 * - Count cap: one pathological flush (e.g. a branch checkout touching 10k
 *   files) must not issue 10k vector INSERTs + 10k os_todos INSERTs from a
 *   single worker thread. Over-cap files are NOT processed by this task;
 *   the count is surfaced (the next idle flush / watcher event re-queues
 *   fresh change sets; flush snapshots are best-effort background
 *   indexing — same class as the AST-indexing skip on unreadable files).
 * - Size cap: one giant file must not blow the in-worker embedding read.
 * Skips of either kind are counted and surfaced — never silent.
 */
export const MAX_OKF_FILES_PER_TASK = 100;
export const MAX_OKF_FILE_BYTES = 1_000_000;

export async function executePlugin(
  input: WorkerInput, 
  projectId: string | null,
  workerDb: any,
  CerebroVectorStore: any
): Promise<WorkerOutput | null> {
  const taskId = input.taskId ?? 'unknown';
  const pluginName = input.plugin;
  if (!pluginName) return null;

  if (pluginName === 'gitnexus_mapper') {
    // SA-01: Never invoke child_process directly here. The GitNexus CLI is
    // bridged through gitnexus-client.ts (which is on the audit's approved
    // CHILD_PROCESS_ALLOWLIST) so all shell exec stays in one audited surface.
    const crypto = require('crypto');
    
    let cwd = process.cwd();
    if (projectId) {
      const projRes = workerDb.prepare(`SELECT workspace_path, project_root_path FROM projects WHERE id = ?`).get(projectId) as { workspace_path: string | null, project_root_path: string | null } | undefined;
      if (projRes) {
        cwd = projRes.workspace_path ?? projRes.project_root_path ?? cwd;
      }
    }
    
    const query = input.params?.query ?? '';
    const { stdout, stderr } = await runGitNexusQuery(query, cwd);
    
    if (stderr && !stdout) {
      return { status: 'error', action: 'generic', error: `GitNexus CLI failed: ${stderr}`, taskId, stdout: undefined, stderr: undefined, markdown: undefined, pageMetadata: undefined, message: undefined, prompt: undefined, data: undefined, reason: 'generic' };
    }
    
    const routeSwitch = new RouteSwitchEngine();
    const mockEmbedding = await routeSwitch.generateEmbedding(stdout);
    
    // Inserting into Cerebro Vector Store (uses vec_quantize_binary internally)
    CerebroVectorStore.insert(stdout, 'gitnexus_ast', mockEmbedding, projectId);
    
    return {
       status: 'success', action: 'generic',
       taskId, stdout: 'GitNexus AST captured and embedded.', stderr: undefined,
       markdown: undefined, pageMetadata: undefined, message: 'GitNexus AST captured and embedded.',
       prompt: undefined, data: undefined, error: undefined, reason: 'plugin execution'
    };
  } else if (pluginName === 'okf_indexer') {
    const url = input.params?.url;
    let content = input.params?.mockContent;
    const defaultSourceTool = input.params?.sourceTool;
    const files = input.params?.files;
    
    const crypto = require('crypto');
    const fs = require('fs');

    let processedCount = 0;

    if (files && Array.isArray(files)) {
      // P3-S6 — bounded acquisition: at most MAX_OKF_FILES_PER_TASK files and
      // MAX_OKF_FILE_BYTES bytes per file per worker task (see constants above).
      const capped = files.slice(0, MAX_OKF_FILES_PER_TASK);
      const cappedOutCount = files.length - capped.length;
      let skippedCount = 0;
      for (const file of capped) {
        try {
          let size = -1;
          try {
            size = fs.statSync(file).size;
          } catch {
            /* unreadable — the read below fails and is counted as skipped */
          }
          if (size > MAX_OKF_FILE_BYTES) {
            skippedCount++;
            continue;
          }
          const fileContent = fs.readFileSync(file, 'utf8');
          
          let inferredSourceTool = defaultSourceTool;
          if (!inferredSourceTool) {
             if (file.includes('.gemini/antigravity-ide')) {
                inferredSourceTool = 'Antigravity';
             } else if (file.includes('hermes')) {
                inferredSourceTool = 'Hermes';
             } else if (file.includes('qwen')) {
                inferredSourceTool = 'Qwen Studio';
             } else if (file.includes('deepseek')) {
                inferredSourceTool = 'Deepseek Web';
             }
          }

          const memoryId = CerebroVectorStore.insert(fileContent, 'external_document', undefined, projectId, true, inferredSourceTool);
          
          const todoId = crypto.randomUUID();
          workerDb.prepare(`
             INSERT INTO os_todos (
                id, project_id, source_module, context_payload, 
                severity, escalation_reason, required_action_type, status, created_at
             ) VALUES (?, ?, 'CoreExec', ?, 'medium', 'Quarantined OKF Ingestion (File)', 'REVIEW', 'pending', ?)
          `).run(todoId, projectId, JSON.stringify({ action: 'REVIEW_QUARANTINE', file, memoryId }), Date.now());
          processedCount++;
        } catch (e) {
          // ignore read errors — but count them (P3-S6: never silent)
          skippedCount++;
        }
      }
      const unprocessedCount = skippedCount + cappedOutCount;
      if (unprocessedCount > 0) {
        console.warn(
          `[CoreExec] okf_indexer files batch bounded: indexed ${processedCount}, ` +
          `skipped ${skippedCount} (unreadable/oversize), ` +
          `deferred ${cappedOutCount} (over ${MAX_OKF_FILES_PER_TASK}/task cap).`
        );
      }
      const summary =
        `Indexed ${processedCount} files.` +
        (unprocessedCount > 0 ? ` Skipped ${skippedCount}, deferred ${cappedOutCount}.` : '');
      return {
         status: 'success', action: 'generic',
         taskId, stdout: summary, stderr: undefined,
         markdown: undefined, pageMetadata: undefined, message: summary,
         prompt: undefined, data: undefined, error: undefined, reason: 'plugin execution'
      };
    }

    if (!content && url) {
       // §2.3 C8-a — RouteSwitch owns egress (AGENTS.md boundary): this URL
       // fetch goes through the governed door (scheme/host/DNS-address/kill
       // switch/policy gates + timeout + byte cap), never a bare fetch.
       const res = await egressFetch(
          url,
          { timeoutMs: 15_000, maxBytes: 2_000_000 },
          { projectId, action: 'fetch', owner: 'coreexec/okf_indexer' },
       );
       if (res.blocked) {
          return { status: 'error', action: 'generic', error: `Egress blocked (${res.blocked}) for ${url}`, taskId, stdout: undefined, stderr: undefined, markdown: undefined, pageMetadata: undefined, message: undefined, prompt: undefined, data: undefined, reason: 'generic' };
       }
       if (!res.ok) {
          const detail = res.status > 0
             ? `Failed to fetch URL: HTTP ${res.status}`
             : 'Failed to fetch URL: network error';
          return { status: 'error', action: 'generic', error: detail, taskId, stdout: undefined, stderr: undefined, markdown: undefined, pageMetadata: undefined, message: undefined, prompt: undefined, data: undefined, reason: 'generic' };
       }
       content = res.text;
    }

    if (!content) {
       return { status: 'error', action: 'generic', error: 'No content provided to OKF Indexer.', taskId, stdout: undefined, stderr: undefined, markdown: undefined, pageMetadata: undefined, message: undefined, prompt: undefined, data: undefined, reason: 'generic' };
    }

    // Insert directly to memory_quarantine (isAutoIngested = true)
    const memoryId = CerebroVectorStore.insert(content, 'external_document', undefined, projectId, true, defaultSourceTool);

    // ToDo Escalation: fetching external data creates an os_todos ticket for user review
    const todoId = crypto.randomUUID();
    workerDb.prepare(`
       INSERT INTO os_todos (
          id, project_id, source_module, context_payload, 
          severity, escalation_reason, required_action_type, status, created_at
       ) VALUES (?, ?, 'CoreExec', ?, 'medium', 'Quarantined OKF Ingestion', 'REVIEW', 'pending', ?)
    `).run(todoId, projectId, JSON.stringify({ action: 'REVIEW_QUARANTINE', url, memoryId }), Date.now());

    return {
       status: 'success', action: 'generic',
       taskId, stdout: 'External content fetched and quarantined.', stderr: undefined,
       markdown: undefined, pageMetadata: undefined, message: 'Content quarantined.',
       prompt: undefined, data: undefined, error: undefined, reason: 'plugin execution'
    };
  } else if (pluginName === 'schema_patcher') {
    const errorTrace = input.params?.errorTrace;
    
    if (!errorTrace) {
      return { status: 'error', action: 'generic', error: 'No error trace provided to Schema Patcher.', taskId, stdout: undefined, stderr: undefined, markdown: undefined, pageMetadata: undefined, message: undefined, prompt: undefined, data: undefined, reason: 'generic' };
    }

    const crypto = require('crypto');
    const fs = require('fs');
    const path = require('path');

    let cwd = process.cwd();
    if (projectId) {
      const projRes = workerDb.prepare(`SELECT workspace_path, project_root_path FROM projects WHERE id = ?`).get(projectId) as { workspace_path: string | null, project_root_path: string | null } | undefined;
      if (projRes) {
        cwd = projRes.workspace_path ?? projRes.project_root_path ?? cwd;
      }
    }

    const routeSwitch = new RouteSwitchEngine();
    const prompt = `Draft a schema patch repair script for the following schema drift delta:\n${errorTrace.delta}\nAPI Name: ${errorTrace.apiName}\nError: ${errorTrace.error}`;
    
    // Draft a repair script using RouteSwitchEngine
    const generation = await routeSwitch.execute({
      prompt,
      estimatedTokens: 1000,
      scope: 'agent'
    });
    
    const draftPatch = generation.content;
    const patchFileName = `schema_patch_${crypto.randomUUID()}.js`;
    const patchFile = path.join(cwd, patchFileName);
    fs.writeFileSync(patchFile, draftPatch, 'utf-8');

    // Queue os_todos ticket for user review
    const todoId = crypto.randomUUID();
    workerDb.prepare(`
       INSERT INTO os_todos (
          id, project_id, source_module, context_payload, 
          severity, escalation_reason, required_action_type, status, created_at
       ) VALUES (?, ?, 'CoreExec', ?, 'high', 'Schema Drift Circuit Breaker Tripped', 'REVIEW', 'pending', ?)
    `).run(todoId, projectId, JSON.stringify({ action: 'REVIEW_SCHEMA_PATCH', errorTrace, draftPatch, patchFile }), Date.now());

    return {
       status: 'success', action: 'generic',
       taskId, stdout: 'Schema patch drafted and queued for review.', stderr: undefined,
       markdown: undefined, pageMetadata: undefined, message: 'Patch queued.',
       prompt: undefined, data: undefined, error: undefined, reason: 'plugin execution'
    };
  }
  
  return null;
}

/**
 * Standardized output envelope so engine.ts can JSON.stringify and store it
 * directly in tasks.output_data. Every optional field is `T | undefined` so it
 * compiles cleanly under `exactOptionalPropertyTypes: true`.
 */
export interface WorkerOutput {
  status: 'success' | 'error';
  action: 'shell' | 'scrape' | 'verify' | 'generic' | 'legacy' | 'fetch';
  taskId: string | undefined;
  stdout: string | undefined;
  stderr: string | undefined;
  markdown: string | undefined;
  pageMetadata: Record<string, unknown> | undefined;
  message: string | undefined;
  prompt: string | undefined;
  data: unknown;
  error: string | undefined;
  reason: string | undefined;
}

class CoreExecWorker extends ThreadWorker<WorkerInput, WorkerOutput> {

  public constructor() {
    super({
      // Poolifier's TaskFunction infers Data/Reply from the class generics; we
      // can't explicitly annotate `Promise<WorkerOutput>` because that breaks
      // assignability to TaskFunction<Data|undefined, Data|Reply>. Let TS infer.
      execute: async (input) => {
        try {
          // Phase-7 legacy stub path (kind === 'legacy' set explicitly).
          if (input?.kind === 'legacy') {
            return {
              status: 'success', action: 'legacy',
              taskId: undefined, stdout: undefined, stderr: undefined,
              markdown: undefined, pageMetadata: undefined,
              message: 'Hello from worker', prompt: undefined,
              data: input.data, error: undefined, reason: 'legacy stub',
            };
          }

          const taskId = input?.taskId;
          const prompt = input?.prompt ?? '';
          const harnessParse = HarnessProfileEnum.safeParse(input?.harnessProfile ?? 'default');
          if (!harnessParse.success) return errEnvelope('invalid harness profile', taskId);
          const harnessProfile = harnessParse.data;
          const directive = input?.directive ?? classifyDirective(prompt);

          if (!taskId) {
            return errEnvelope('empty taskId');
          }

          let projectId: string | undefined;
          try {
            const { db, initDB } = require('../basevault/db');
            // Under the test runner, each worker thread gets its own private
            // ':memory:' database (see basevault/db.ts) that doesn't share
            // the main thread's schema the way a real file-backed db does in
            // production — initDB() no-ops outside test mode via its own
            // isMainThread guard, so this is safe/cheap to call unconditionally.
            initDB();
            const res = db.prepare(`
              SELECT r.project_id
              FROM tasks t
              JOIN workflow_runs r ON t.run_id = r.id
              WHERE t.id = ?
            `).get(taskId) as { project_id: string } | undefined;
            if (res?.project_id) {
              projectId = res.project_id;
            }
          } catch (err) {
            console.error('Failed to resolve project_id for task', taskId, err);
          }

          if (harnessProfile === 'evaluator') {
            return errEnvelope('Evaluator harness unavailable: local Chrome DevTools/Playwright MCP protocol client is not configured', taskId);
          }

          if (harnessProfile === 'planner' || harnessProfile === 'generator' || harnessProfile === 'scout') {
            return errEnvelope(`${harnessProfile} harness must run through CoreExec's isolated main-thread generation path`, taskId);
          }

          // ── Permission enforcement (Phase 5 + §2.3 C8 gate hoist) ────────
          // Gate EVERY action this task needs — the plugin's egress ('fetch')
          // AND the directive's shell/scrape — BEFORE anything is dispatched.
          // Pre-C8 order ran executePlugin (with okf_indexer's raw fetch) and
          // returned before the gate, then gated only shell/scrape afterwards,
          // so a network plugin egressed with zero policy checks. With no
          // network plugin and a non-shell/scrape directive this resolves to
          // zero checks and behaves exactly as before — the non-negotiable
          // permissive default for existing/unconfigured projects (NO
          // archetype → allow) is untouched; only a project that has opted in
          // (non-NULL archetype) is gated.
          const gated = await gateAndDispatch(input, directive, projectId, async () => {
            if (input.plugin) {
              const { CerebroVectorStore } = require('../memory/cerebro/vector');
              const { db: workerDb } = require('../basevault/db');
              const result = await executePlugin(input, projectId ?? null, workerDb, CerebroVectorStore);
              if (result) return result;
            }
            return undefined;
          });
          if (gated.blocked) return errEnvelope(gated.reason, taskId, gated.action);
          if (gated.output) return gated.output;

          // CommandSandbox/StealthScraper both resolve the project's on-disk
          // cwd in their constructor and throw if the project has neither a
          // project_root_path nor a workspace_path configured. Construct each
          // lazily, only inside the branch that actually needs it — a
          // 'generic' no-op task (the common case for a bare/default DAG
          // node) must never fail just because the project has no root path,
          // since it never touches the filesystem at all.
          switch (directive.action) {
            case 'verify': {
              // §4.0 — Adversarial Verification Gate (Axiom 4: Deterministic Reality).
              // Reads the immediately prior completed task's output_data from DB,
              // then checks required keys declared in the payload. Zero LLM calls.
              // If verification fails, returns an error envelope so CoreExec
              // parks this node as 'blocked-by-validation' for human review.
              let priorOutput: Record<string, unknown> = {};
              try {
                const { db: workerDb, initDB: workerInitDB } = require('../basevault/db');
                workerInitDB();
                // Find the most recently completed sibling task in this run.
                const priorTask = workerDb.prepare(`
                  SELECT t.output_data FROM tasks t
                  JOIN workflow_runs r ON t.run_id = r.id
                  JOIN tasks self_t ON self_t.run_id = r.id AND self_t.id = ?
                  WHERE t.status = 'completed' AND t.id != ?
                  ORDER BY t.rowid DESC LIMIT 1
                `).get(taskId, taskId) as { output_data: string | null } | undefined;
                if (priorTask?.output_data) {
                  priorOutput = JSON.parse(priorTask.output_data);
                }
              } catch {
                // Non-fatal: if we can't read prior output, treat as empty object.
              }

              // Payload is a comma-separated list of required keys to assert.
              // e.g.: "status,message" — both keys must be present and non-null.
              const requiredKeys = directive.payload
                .split(',')
                .map((k: string) => k.trim())
                .filter(Boolean);

              const missingKeys = requiredKeys.filter(
                (k: string) => priorOutput[k] === undefined || priorOutput[k] === null
              );

              if (missingKeys.length > 0) {
                return errEnvelope(
                  `§VERIFY FAILED: prior node output missing required keys: [${missingKeys.join(', ')}]. ` +
                  `Actual keys present: [${Object.keys(priorOutput).join(', ')}]`,
                  taskId,
                  'verify',
                );
              }

              return {
                status: 'success', action: 'verify',
                taskId,
                stdout: undefined, stderr: undefined,
                markdown: undefined, pageMetadata: undefined,
                message: `§VERIFY PASSED: all required keys [${requiredKeys.join(', ')}] present in prior output.`,
                prompt, data: undefined, error: undefined,
                reason: directive.reason,
              };
            }
            case 'shell': {
              const sandbox = new CommandSandbox(projectId);
              const { stdout, stderr } = await sandbox.execute(directive.payload);
              return {
                status: 'success', action: 'shell',
                taskId, stdout, stderr,
                markdown: undefined, pageMetadata: undefined,
                message: undefined, prompt, data: undefined, error: undefined,
                reason: directive.reason,
              };
            }
            case 'scrape': {
              const scraper = new StealthScraper(projectId);
              const result = await scraper.scrape(directive.payload, true);
              return {
                status: 'success', action: 'scrape',
                taskId,
                stdout: undefined, stderr: undefined,
                markdown: typeof result === 'string' ? result : (result?.markdown ?? ''),
                pageMetadata: typeof result === 'object' && result !== null ? (result?.metadata ?? {}) : {},
                message: undefined, prompt, data: undefined, error: undefined,
                reason: directive.reason,
              };
            }
            case 'generic':
            default: {
              return {
                status: 'success', action: 'generic',
                taskId,
                stdout: undefined, stderr: undefined,
                markdown: undefined, pageMetadata: undefined,
                message: `Task ${taskId} executed (metadata echo)`,
                prompt, data: undefined, error: undefined,
                reason: directive.reason,
              };
            }
          }
        } catch (err: any) {
          const taskId = input?.kind === 'legacy' ? undefined : input?.taskId;
          return errEnvelope(err?.message ?? String(err), taskId);
        }
      }
    });
  }
}

function errEnvelope(
  error: string,
  taskId?: string,
  action: WorkerOutput['action'] = 'generic',
): WorkerOutput {
  return {
    status: 'error', action,
    taskId,
    stdout: undefined, stderr: undefined,
    markdown: undefined, pageMetadata: undefined,
    message: undefined, prompt: undefined, data: undefined,
    error, reason: error,
  };
}

export default new CoreExecWorker();
