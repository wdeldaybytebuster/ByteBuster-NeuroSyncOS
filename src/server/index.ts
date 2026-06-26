import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ScopeLogicSession } from '../core/scopelogic/interview';
import { RouteSwitchEngine } from '../core/routeswitch/engine';
import { FreeModeGovernor, systemGovernor } from '../core/routeswitch/governor';
import { LlamaCppProvider } from '../core/routeswitch/adapters/llama-cpp';
import { OpenAICompatibleProvider } from '../core/routeswitch/adapters/openai-compatible';
import { MockProvider } from '../core/routeswitch/providers';
import { executeRun } from '../core/coreexec/engine';
import { db, initDB } from '../core/basevault/db';
import { WorkflowRunSchema, TaskSchema, partitionBySchema } from '../core/basevault/schema';
import { scoutRouter } from '../core/scoutdaemon/sse';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'path';
import fs from 'fs';

import { readiness } from '../core/basevault/readiness';

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

// Initialize Scheduler
import { initScheduler } from '../core/coreexec/scheduler';
initScheduler();

// Serve Static UI in Production
const distPath = path.resolve(__dirname, '../../dist/ui');
if (fs.existsSync(distPath)) {
  app.use('/*', serveStatic({ root: 'dist/ui' }));
}


// Mount SSE ScoutDaemon
app.route('/api/scout', scoutRouter);

import { idleDetector } from '../core/scoutdaemon/idle';
idleDetector.start();

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

import { cerebroRouter } from './routes/cerebro';
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

// Auto-configure provider from env vars if set
const envBaseUrl = process.env.NEUROSYNC_LLM_BASE_URL;
const envApiKey = process.env.NEUROSYNC_LLM_API_KEY;
const envModel = process.env.NEUROSYNC_LLM_MODEL || 'auto';
if (envBaseUrl) {
  console.log(`[NeuroSync] Auto-configuring OpenAI-compatible provider from env: ${envBaseUrl}`);
  routeSwitch.setProvider(new OpenAICompatibleProvider({ baseUrl: envBaseUrl, apiKey: envApiKey || '', modelId: envModel }));
} else {
  routeSwitch.setProvider(new MockProvider());
}

// Pass RouteSwitch generateFn into ScopeLogic so interview uses real LLM when available
const generateFn = async (prompt: string) => {
  const result = await routeSwitch.execute({ prompt, estimatedTokens: 200 });
  return result.content;
};
let session = new ScopeLogicSession(generateFn);

app.get('/', (c) => c.json({ status: 'ok', service: 'NeuroSync Local API Gateway', version: '0.3.0' }));

// ─── ScopeLogic Routes ───────────────────────────────────────────────────────

app.get('/api/scopelogic/history', (c) => {
  return c.json({
    round: session.round,
    isComplete: session.isComplete,
    history: session.getHistory()
  });
});

app.post('/api/scopelogic/prompt', async (c) => {
  try {
    const { message } = await c.req.json();
    if (!message) return c.json({ error: 'Message is required' }, 400);

    const result = await session.processUserInputAsync(message);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post('/api/scopelogic/reset', (c) => {
  session = new ScopeLogicSession(generateFn);
  return c.json({ success: true, message: 'Session reset. Ready for a new interview.' });
});

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
    
    if (type === 'llama-cpp') {
      routeSwitch.setProvider(new LlamaCppProvider(config));
    } else if (type === 'openai-compatible') {
      routeSwitch.setProvider(new OpenAICompatibleProvider(config));
    } else {
      routeSwitch.setProvider(new MockProvider());
    }
    
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
app.get('/api/basevault/runs', (c) => {
  try {
    const raw = db.prepare(`
      SELECT id, status, created_at
      FROM workflow_runs
      ORDER BY created_at DESC
      LIMIT 50
    `).all() as Record<string, unknown>[];

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
      console.error(`[§3.3] /api/basevault/run/${runId} run row failed schema parse:`, runParse.error.format());
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
console.log(`[NeuroSync] API Gateway running on http://localhost:${port}`);

import { ModelDiscovery } from '../core/routeswitch/discovery';
ModelDiscovery.fetchModels().then(() => {
  console.log('[NeuroSync] Model Discovery complete. Available models cached.');
}).catch(err => {
  console.error('[NeuroSync] Model Discovery failed:', err);
});

serve({
  fetch: app.fetch,
  port
});
