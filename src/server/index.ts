import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { RouteSwitchEngine } from '../core/routeswitch/engine';
import { FreeModeGovernor, systemGovernor } from '../core/routeswitch/governor';
import { instantiateProvider } from '../core/routeswitch/provider-factory';
import { executeRun, injectCoreExecGenerateFn, resumeInProgressRuns } from '../core/coreexec/engine';
import { db, initDB } from '../core/basevault/db';
import { WorkflowRunSchema, TaskSchema, partitionBySchema } from '../core/basevault/schema';
import { scoutRouter } from '../core/scoutdaemon/sse';
import { serveStatic } from '@hono/node-server/serve-static';
import { injectLLMGenerator, ReflectionExecutor } from '../core/memory/cerebro/reflection';
import path from 'path';
import fs from 'fs';

import { readiness } from '../core/basevault/readiness';
import { log } from '../core/observability/logger';
import { bootstrapGlobalOKFSeed } from '../core/okf/global-seed';

const app = new Hono();

// Global CORS to allow Vite frontend to access API
app.use('/*', cors());

// Rate Limiter Memory Store
const rateLimits = new Map<string, { count: number, resetTime: number }>();

app.use('/*', async (c, next) => {
  // 1. Payload Size Limit (64 KB)
  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength, 10) > 64 * 1024) {
    return c.json({ error: 'Payload Too Large' }, 413);
  }

  // 2. Rate Limiting (120 req/min per client)
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const now = Date.now();
  let limit = rateLimits.get(ip);
  if (!limit || limit.resetTime < now) {
    limit = { count: 0, resetTime: now + 60000 };
  }
  if (limit.count >= 120) {
    return c.json({ error: 'Too Many Requests' }, 429);
  }
  limit.count++;
  rateLimits.set(ip, limit);

  // 3. Authentication & Exemptions
  const path = c.req.path;
  if (path.startsWith('/health') || path.startsWith('/api/config')) {
    return next();
  }
  
  if (!readiness.configured) {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    // If we're hitting API routes but missing auth
    if (path.startsWith('/api/')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  }

  await next();
});

// Initialize Database
initDB();

// Seed the GLOBAL OKF knowledge tier from the repo-shipped base-knowledge
// content on first run (no-ops once the tier has any content).
bootstrapGlobalOKFSeed();

// Initialize Scheduler
import { initScheduler } from '../core/coreexec/scheduler';
initScheduler();

// Crash recovery: re-drive any workflow_runs left 'running'/'pending' by a hard
// crash through the existing idempotent executeRun loop, so the "resumes from
// the last completed step" guarantee actually holds after a non-graceful death.
// Fire-and-forget per run (executeRun logs/parks its own failures); resumeInProgressRuns
// itself logs how many it found so this is observable rather than silent.
resumeInProgressRuns();

// Serve Static UI in Production
const distPath = path.resolve(__dirname, '../../dist/ui');
if (fs.existsSync(distPath)) {
  app.use('/*', serveStatic({ root: 'dist/ui' }));
}


// Mount SSE ScoutDaemon
app.route('/api/scout', scoutRouter);

import { idleDetector } from '../core/scoutdaemon/idle';
idleDetector.start();
// OQ-004 resolved: wire idle events to Cerebro reflection lifecycle.
// 'idle'   → start the reflection daemon so memories are consolidated during downtime.
// 'active' → ping activity so the 30-min reflection idle threshold resets correctly.
idleDetector.on('idle', () => ReflectionExecutor.startDaemon());
idleDetector.on('active', () => ReflectionExecutor.pingActivity());

import telemetryRouter from './routes/telemetry';
// Mount Telemetry
app.route('/api/telemetry', telemetryRouter);

import { systemRouter } from './routes/system';
// Mount System Telemetry & Config
app.route('/api/system', systemRouter);

import { todosRouter } from './routes/todos';
// Mount OS Todos
app.route('/api/todos', todosRouter);

import { projectsRouter } from './routes/projects';
// Mount Projects
app.route('/api/projects', projectsRouter);
// Initialize singletons for MVP
const routeSwitch = new RouteSwitchEngine(systemGovernor);

import { llmRouter, injectLLMEngine } from './routes/llm';
injectLLMEngine(routeSwitch, systemGovernor);
app.route('/api/llm', llmRouter);

import { cerebroRouter, injectChatEngine } from './routes/cerebro';
app.route('/api/cerebro', cerebroRouter);

import { modelsRouter } from './routes/models';
app.route('/api/models', modelsRouter);

import { schedulerListRouter } from './routes/scheduler-list';
// Mount Scheduler Jobs listing (§3.1 Master widgets)
app.route('/api/scheduler', schedulerListRouter);

import { coreexecRouter } from './routes/coreexec-router';
// Mount CoreExec gate (§3.4) — the router implements validateDAGProposal/escalateBlockedDAGToOsTodos
// BEFORE any workflow_runs / tasks INSERT, so the DB-bypass HIGH risk is closed for both cron
// AND interactive approval paths. DO NOT reintroduce an inline /api/coreexec/* handler here;
// routes mounted by app.route take precedence and the inline variants bypass the gate.
app.route('/api/coreexec', coreexecRouter);

import { okfRouter, injectOKFGenerateFn } from './routes/okf';
app.route('/api/okf', okfRouter);

// ─── PortGrid Interactive Terminal (Task 8) ──────────────────────────────────
// A REAL interactive shell embedded in PortGrid, confined to one project's
// directory with network removed via hardened bwrap (see
// core/portgrid/terminal-session.ts for the recipe + why it can't reuse
// CommandSandbox's `--dev-bind / /` invocation). Human-only: opened solely by an
// explicit UI action, never auto-launched by any agent code path. Inherits the
// app's existing auth posture (this route is under /api/, so the auth middleware
// above applies exactly as it does to every other API route).
import { createNodeWebSocket } from '@hono/node-ws';
import {
  createTerminalSession,
  installTerminalShutdownHooks,
  type TerminalSession,
} from '../core/portgrid/terminal-session';

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
installTerminalShutdownHooks();

app.get(
  '/api/portgrid/terminal/:projectId',
  upgradeWebSocket((c) => {
    const projectId = c.req.param('projectId');
    let session: TerminalSession | null = null;
    return {
      onOpen(_evt, ws) {
        try {
          if (!projectId) throw new Error('Terminal unavailable: no project selected.');
          session = createTerminalSession(projectId, { cols: 80, rows: 24 });
          session.onData((data) => {
            try { ws.send(data); } catch { /* socket gone */ }
          });
          session.onExit((code) => {
            try {
              ws.send(`\r\n\x1b[90m[process exited with code ${code}]\x1b[0m\r\n`);
              ws.close();
            } catch { /* socket gone */ }
          });
        } catch (err: any) {
          const msg = err?.message || 'Failed to start terminal session.';
          try {
            ws.send(`\r\n\x1b[31m${msg}\x1b[0m\r\n`);
            ws.close();
          } catch { /* ignore */ }
        }
      },
      onMessage(evt, _ws) {
        if (!session) return;
        const raw = typeof evt.data === 'string' ? evt.data : evt.data?.toString?.() ?? '';
        // Control messages are JSON envelopes; anything else is raw keystroke input.
        if (raw.startsWith('{')) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.type === 'resize') {
              session.resize(Number(parsed.cols), Number(parsed.rows));
              return;
            }
            if (parsed && parsed.type === 'input' && typeof parsed.data === 'string') {
              session.write(parsed.data);
              return;
            }
          } catch { /* fall through: treat as raw input */ }
        }
        session.write(raw);
      },
      onClose() {
        session?.dispose('ws-close');
        session = null;
      },
      onError() {
        session?.dispose('ws-error');
        session = null;
      },
    };
  })
);

// ─── LLM Provider Boot Sequence ──────────────────────────────────────────────
// Load all enabled providers from the llm_providers DB table into the engine's
// providerRegistry. Then set the global routing rule's position-0 as the active
// primary. Falls back to env vars or MockProvider if no DB entries exist.
import { decrypt } from '../core/basevault/crypto';

function bootProviderRegistry() {
  try {
    const rows = db.prepare(`SELECT id, type, config_json, api_key_encrypted FROM llm_providers WHERE is_enabled = 1`).all() as any[];
    for (const row of rows) {
      const config = JSON.parse(row.config_json || '{}');
      const apiKey = row.api_key_encrypted ? decrypt(row.api_key_encrypted) : '';
      const provider = instantiateProvider(row.type, config, apiKey, row.id);
      routeSwitch.registerProvider(provider);
    }

    // Set primary provider from global routing rule (position 0)
    const globalRule = db.prepare(`SELECT provider_chain FROM llm_routing_rules WHERE scope = 'global' AND scope_id IS NULL`).get() as { provider_chain: string } | undefined;
    if (globalRule) {
      const chain: string[] = JSON.parse(globalRule.provider_chain);
      if (chain.length > 0 && chain[0]) {
        const primaryId = chain[0];
        const registeredIds = routeSwitch.getRegisteredProviderIds();
        if (registeredIds.includes(primaryId)) {
          // Instantiate and set as active primary
          const pRow = rows.find((r: any) => r.id === primaryId);
          if (pRow) {
            const pConfig = JSON.parse(pRow.config_json || '{}');
            const pKey = pRow.api_key_encrypted ? decrypt(pRow.api_key_encrypted) : '';
            const primary = instantiateProvider(pRow.type, pConfig, pKey, pRow.id);
            routeSwitch.setProvider(primary);
          }
          log.info(`[NeuroSync] Boot: Primary provider set from global rule: ${primaryId} (${rows.length} total registered)`);
          return;
        }
      }
    }

    // If we got DB providers but no global rule, set the first one as active primary
    if (rows.length > 0) {
      const firstRow = rows[0];
      const firstConfig = JSON.parse(firstRow.config_json || '{}');
      const firstKey = firstRow.api_key_encrypted ? decrypt(firstRow.api_key_encrypted) : '';
      const firstProvider = instantiateProvider(firstRow.type, firstConfig, firstKey, firstRow.id);
      routeSwitch.setProvider(firstProvider);
      log.info(`[NeuroSync] Boot: ${rows.length} provider(s) loaded from DB. Primary set to: ${firstRow.id} (no global rule yet)`);
      return;
    }
  } catch (err) {
    log.warn('[NeuroSync] Boot: Failed to load providers from DB, falling back to env/mock:', err);
  }

  // Legacy fallback: env vars or mock
  const envBaseUrl = process.env.NEUROSYNC_LLM_BASE_URL;
  const envApiKey = process.env.NEUROSYNC_LLM_API_KEY;
  const envModel = process.env.NEUROSYNC_LLM_MODEL || 'auto';
  if (envBaseUrl) {
    log.info(`[NeuroSync] Boot: Auto-configuring from env: ${envBaseUrl}`);
    routeSwitch.setProvider(instantiateProvider('openai-compatible', { baseUrl: envBaseUrl, modelId: envModel }, envApiKey));
  } else {
    routeSwitch.setProvider(instantiateProvider('mock', {}, undefined));
  }
}

bootProviderRegistry();

// Inject RouteSwitchEngine into Cerebro chat endpoint
injectChatEngine(routeSwitch);

// Inject LLM generate function into OKF routes for document/chat generation
const _okfGenerateFn = async (prompt: string, schema?: any) => {
  // Reasoning models spend most of their budget on chain-of-thought before emitting
  // the final JSON, so this needs much more headroom than a plain completion call.
  const result = await routeSwitch.execute({ prompt, estimatedTokens: 8000, scope: 'cerebro', responseSchema: schema });
  return result.content;
};
injectOKFGenerateFn(_okfGenerateFn);

// OQ-002 resolved: inject live RouteSwitch generate function into Cerebro
// ReflectionExecutor so preference extraction routes through the real LLM
// instead of keyword heuristics. Falls back to keyword extraction automatically
// when MockProvider is active (offline / free-tier quota exhausted).
const _cerebroGenerateFn = async (prompt: string) => {
  const result = await routeSwitch.execute({ prompt, estimatedTokens: 150, scope: 'cerebro' });
  return result.content;
};
injectLLMGenerator(_cerebroGenerateFn);

// Pass RouteSwitch generateFn into ScopeLogic so the interview (and the LLM-
// driven DAG proposal generation) uses the real LLM when available. The optional
// `schema` param forwards a JSON-schema hint as responseSchema for structured
// output on schema-capable providers (see interview.ts DAG_PROPOSAL_SCHEMA).
// estimatedTokens is 2000 (not 200) so the completed-interview DAG-generation
// call has output headroom; it maps to the provider's max_tokens.
const generateFn = async (prompt: string, schema?: any, projectId?: string) => {
  const result = await routeSwitch.execute({
    prompt, estimatedTokens: 2000, scope: 'agent', scopeId: 'scopelogic-interview', responseSchema: schema,
    ...(projectId !== undefined ? { projectId } : {}),
  });
  return result.content;
};

import { scopelogicRouter, injectScopeLogicGenerateFn } from './routes/scopelogic-router';
injectScopeLogicGenerateFn(generateFn);
app.route('/api/scopelogic', scopelogicRouter);

// Wire the live RouteSwitch into CoreExec so a `'generic'`-classified DAG task
// (a natural-language work item like "summarize the findings" that maps to no
// shell command or URL) gets a REAL LLM completion on the main thread instead of
// the worker pool's old canned "metadata echo" no-op. Own `scopeId`
// ('coreexec-generic-task') so operators can route generic task execution
// independently of the ScopeLogic interview or Cerebro chat; it falls back to the
// plain `agent`-scope rule (then global) when no specific rule is registered.
// estimatedTokens 1000: a generic task response is real work output (analysis /
// summary / draft) — larger than Cerebro's 150-token chat reply, smaller than
// ScopeLogic's 2000-token DAG-schema generation. Text-generation only; the result
// is stored for a human to read, never executed.
const _coreExecGenerateFn = async (prompt: string) => {
  const result = await routeSwitch.execute({ prompt, estimatedTokens: 1000, scope: 'agent', scopeId: 'coreexec-generic-task' });
  return result.content;
};
injectCoreExecGenerateFn(_coreExecGenerateFn);

app.get('/', (c) => c.json({ status: 'ok', service: 'NeuroSync Local API Gateway', version: '0.3.0' }));

// ─── RouteSwitch Engine Routes ───────────────────────────────────────────────

app.post('/api/routeswitch/test', async (c) => {
  try {
    const { prompt, estimatedTokens } = await c.req.json();
    const result = await routeSwitch.execute({ prompt, estimatedTokens: estimatedTokens || 50 });
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 403);
  }
});

app.post('/api/routeswitch/provider', async (c) => {
  try {
    const { type, config } = await c.req.json();

    routeSwitch.setProvider(instantiateProvider(type, config || {}, config?.apiKey));


    return c.json({ success: true, message: `Switched provider to ${type}` });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// ─── BaseVault Routes ────────────────────────────────────────────────────────

// §3.3 — runtime-parse every list row against WorkflowRunSchema via the
// shared partitionBySchema helper. RunHistory.tsx consumes this list directly
// via setRuns(data.runs), so dirty rows (status typos, schema-dirty
// workflow_runs) would silently fall through without this gate.
//
// ?projectId= is optional: CoreExecDashboard.tsx, BaseVaultDashboard.tsx, and
// PortGridDashboard.tsx all re-fetch on activeProjectId change but, until this
// fix, never actually sent it -- a brand-new project showed another project's
// run history in its "Active Workflow Runs" widget (confirmed live). Omitting
// the param preserves the original all-projects behavior for RunHistory.tsx,
// which has no notion of an active project and legitimately wants everything.
app.get('/api/basevault/runs', (c) => {
  try {
    const projectId = c.req.query('projectId');
    const raw = projectId
      ? (db.prepare(`
          SELECT id, project_id, dag_layout, status, created_at
          FROM workflow_runs
          WHERE project_id = ?
          ORDER BY created_at DESC
          LIMIT 50
        `).all(projectId) as Record<string, unknown>[])
      : (db.prepare(`
          SELECT id, project_id, dag_layout, status, created_at
          FROM workflow_runs
          ORDER BY created_at DESC
          LIMIT 50
        `).all() as Record<string, unknown>[]);

    const { clean: runs, dirtyIds: dirtyRunIds } = partitionBySchema(raw, WorkflowRunSchema, '/api/basevault/runs');
    return c.json({ runs, dirtyRunIds });
  } catch (err: any) {
    return c.json({ error: err.message, runs: [], dirtyRunIds: [] }, 500);
  }
});

// §1.3 — Full run detail (DAG layout + per-task output_data) for history rehydration.
// §3.3 — runtime-parse every row against the Zod schema so the new status enum
// (notably 'blocked-by-validation' from §3.4 escalation) is enforced at the
// HTTP boundary. Rows that fail to parse are logged as schema-dirty and the
// offending fields are dropped so the UI doesn't silently receive garbage —
// the schema enum is the canonical truth, not a docstring.
app.get('/api/basevault/run/:runId', (c) => {
  try {
    const { runId } = c.req.param();
    const rawRun = db.prepare(`
      SELECT id, project_id, dag_layout, status, created_at
      FROM workflow_runs
      WHERE id = ?
    `).get(runId) as Record<string, unknown> | undefined;
    if (!rawRun) return c.json({ error: 'Run not found' }, 404);

    const runParse = WorkflowRunSchema.safeParse(rawRun);
    if (!runParse.success) {
      log.error(`[§3.3] /api/basevault/run/${runId} run row failed schema parse:`, runParse.error.format());
      return c.json({
        error: 'workflow_runs row is schema-dirty; refusing to rehydrate.',
        runId,
        issues: runParse.error.flatten(),
      }, 500);
    }

    const rawTasks = db.prepare(`
      SELECT id, status, claim_lease, output_data
      FROM tasks
      WHERE run_id = ?
    `).all(runId) as Record<string, unknown>[];

    // §3.3 — partition tasks so dirty rows don't take the whole response down.
    // Expose dirtyTaskIds so a downstream consumer (NotificationCenter, operator
    // dashboard) can flag partial-rehydration cleanly. Single source of
    // partition semantics lives in core/basevault/schema.ts.
    const { clean: tasks, dirtyIds: dirtyTaskIds } = partitionBySchema(
      rawTasks,
      TaskSchema,
      `/api/basevault/run/${runId}`,
    );

    return c.json({ run: runParse.data, tasks, dirtyTaskIds });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── CoreExec Routes ─────────────────────────────────────────────────────────
// §3.4 — delegates `/api/coreexec/*` to `coreexecRouter`, which gates every
// interactive approval through `validateDAGProposal` + `escalateBlockedDAGToOsTodos`
// before any DB write. The previous inline implementations were removed because
// they bypassed the validation gate (the DB-bypass HIGH risk surfaced by the
// §3.1 audit). See ./routes/coreexec-router.ts.

// ─── Server Start ─────────────────────────────────────────────────────────────

const port = 3743;
log.info(`[NeuroSync] API Gateway running on http://localhost:${port}`);

import { ModelDiscovery } from '../core/routeswitch/discovery';
ModelDiscovery.fetchModels().then(() => {
  log.info('[NeuroSync] Model Discovery complete. Available models cached.');
}).catch(err => {
  log.error('[NeuroSync] Model Discovery failed:', err);
});

const server = serve({
  fetch: app.fetch,
  port
});

// Attach the WebSocket upgrade handler to the underlying http.Server so the
// PortGrid terminal endpoint (/api/portgrid/terminal/:projectId) can upgrade.
injectWebSocket(server);
