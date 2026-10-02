import { ThreadWorker } from 'poolifier';
import { CommandSandbox } from '../portgrid/sandbox';
import { StealthScraper } from './scraping';
import { classifyDirective, NodeDirective } from './dispatch';
import { checkActionPermission } from './permission-gate';

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
  data?: unknown;
}

/**
 * Standardized output envelope so engine.ts can JSON.stringify and store it
 * directly in tasks.output_data. Every optional field is `T | undefined` so it
 * compiles cleanly under `exactOptionalPropertyTypes: true`.
 */
export interface WorkerOutput {
  status: 'success' | 'error';
  action: 'shell' | 'scrape' | 'verify' | 'generic' | 'legacy';
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

          // ── Permission enforcement (Phase 5) ─────────────────────────────
          // Gate the two real executable actions (shell / scrape) against the
          // project's assigned permission archetype + the tool registry. When
          // a project has NO archetype (permission_archetype IS NULL) this is a
          // no-op and behaviour is exactly as before — the non-negotiable
          // permissive default for existing/unconfigured projects. Only a
          // project that has explicitly opted in (non-NULL archetype) is gated.
          if (directive.action === 'shell' || directive.action === 'scrape') {
            const gate = await checkActionPermission(projectId, directive.action);
            if (gate.blocked) {
              return errEnvelope(gate.reason, taskId, directive.action);
            }
          }

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
