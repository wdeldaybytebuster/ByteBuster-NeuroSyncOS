import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { RouteSwitchEngine } from '../core/routeswitch/engine';
import { FreeModeGovernor, systemGovernor } from '../core/routeswitch/governor';
import { instantiateProvider } from '../core/routeswitch/provider-factory';
import { executeRun, injectCoreExecGenerateFn, resumeInProgressRuns, type CoreExecGenerationRequest } from '../core/coreexec/engine';
import { db, initDB } from '../core/basevault/db';
import { WorkflowRunSchema, TaskSchema, partitionBySchema } from '../core/basevault/schema';
import { scoutRouter, scoutEmitter } from '../core/scoutdaemon/sse';
import { serveStatic } from '@hono/node-server/serve-static';
import { injectLLMGenerator, ReflectionExecutor } from '../core/memory/cerebro/reflection';
import path from 'path';
import fs from 'fs';

import { log } from '../core/observability/logger';
import { bootstrapGlobalOKFSeed } from '../core/okf/global-seed';

import { MDNSDiscovery } from '../core/basevault/network/mdns-discovery';
import { NodeTransport } from '../core/basevault/network/transport';
import {
  validateManualPeer,
  isSyncEnabled,
  isSyncAllowPublic,
  getApprovedPeers,
  addApprovedPeer,
} from '../core/basevault/network/sync-consent';
import type { DiscoveredNode } from '../core/basevault/network/mdns-discovery';

const app = new Hono();

// §2.1-C5 — explicit CORS allowlist (replaces the wildcard cors(); closes T1:
// a foreign origin never receives Access-Control-Allow-Origin). Registered
// before auth so OPTIONS preflight short-circuits ahead of the 401.
import { perimeterCors, rateLimitMiddleware, wsUpgradeGuard } from './perimeter';
import { NEUROSYNC_PORT, allowedPeerPorts } from './port';
import { shutdownDrainingMiddleware } from './shutdown';
// §2.2-C6 — the operator credential gate replaces the old anonymous block
// (readiness-derived gating + header-presence-only check both failed open).
import { authMiddleware } from './auth/middleware';
import { registerAuthRoutes } from './auth/routes';
import { isSetupComplete, openSetupWindow, setBindAddress } from './auth/credentials';
// P2-2: drain guard mounts FIRST so a shutting-down server 503s before any
// perimeter bookkeeping, auth, or route handling.
app.use('/*', shutdownDrainingMiddleware);
app.use('/*', perimeterCors);

const transport = new NodeTransport();
const mdnsDiscovery = new MDNSDiscovery(NEUROSYNC_PORT); // P2-3: single PORT const (shared with serve below)

/**
 * §2.1-C4 — mDNS discovery no longer auto-connects (PortGrid consent boundary).
 * A discovered peer is staged as PENDING and announced over scoutEmitter;
 * only POST /api/sync/peers {action:'approve'} may call transport.connectToPeer.
 */
const pendingPeers = new Map<string, DiscoveredNode>();

mdnsDiscovery.on('peer-discovered', (node: DiscoveredNode) => {
  const nodeId = `${node.ip}:${node.port}`;
  pendingPeers.set(nodeId, node);
  console.log(`[Sync] Peer discovered — staged as PENDING (consent required): ${nodeId}`);
  scoutEmitter.emit('update', { type: 'PEER_DISCOVERED', node, timestamp: Date.now() });
});

// start() self-gates on system_settings.sync_enabled (default false).
mdnsDiscovery.start();


// §2.1-C5 — payload cap + bounded per-peer-address rate limit, extracted to
// ./perimeter so the sweep/evict logic and getIp TRUST_PROXY gate are testable
// without importing this file (it binds a port).
app.use('/*', rateLimitMiddleware);

// §2.2-C6 — mount order matters: cors (:pre-35) → rate limit → auth → routes.
// The old block here checked `readiness.configured` (an orphaned LLM setting)
// and only the PRESENCE of an Authorization header — it never inspected the
// value, so `Authorization: Bearer garbage` passed. authMiddleware instead
// derives state from system_settings.operator_credential, verifies Bearer
// sessions / short-lived ?ticket= streams (§2.2 b/c), and refuses non-loopback
// sources outright while no credential exists (§2.2(i)). The dead /health and
// /api/config exemptions went with the old block — neither is a route.
app.use('/*', authMiddleware);
// /api/auth/* is public inside the middleware (it OWNS those 401s).
registerAuthRoutes(app);

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

/**
 * §2.3-P1-2 — RFC 6455 heartbeat (30 s ping/terminate sweep). server-main.ts
 * owns the ONLY interval: every 30 s each tracked WS peer that failed to
 * answer the previous ping (isAlive === false) is terminated; the rest are
 * marked unanswered and pinged. Pong responses re-arm isAlive via the
 * listener attached in trackWsHeartbeat. Peers are added on upgrade onOpen
 * and removed on close/error so the set never grows past live sockets.
 *
 * wsHeartbeatSweep takes the peer set as an optional parameter (defaulting
 * to the live set) so the sweep logic is unit-testable with fake
 * { isAlive, ping(), terminate() } peers without importing this module
 * (it binds a port — §4.2). transport.handleIncomingMessage is untouched.
 */
export const WS_HEARTBEAT_MS = 30_000;
export const wsHeartbeatPeers = new Set<any>();
export function wsHeartbeatSweep(peers: Set<any> = wsHeartbeatPeers): void {
  for (const ws of [...peers]) {
    try {
      if (ws.isAlive === false) {
        try { ws.terminate(); } catch { /* socket already gone */ }
        peers.delete(ws);
      } else {
        ws.isAlive = false;
        try { ws.ping(); } catch { /* socket already gone */ }
      }
    } catch {
      try { peers.delete(ws); } catch { /* ignore */ }
    }
  }
}
function trackWsHeartbeat(ws: any): void {
  ws.isAlive = true;
  wsHeartbeatPeers.add(ws);
  try {
    ws.on?.('pong', () => { ws.isAlive = true; });
  } catch { /* non-ws socket — sweep still terminates it on silence */ }
}
function untrackWsHeartbeat(ws: any): void {
  wsHeartbeatPeers.delete(ws);
}
const wsHeartbeatTimer = setInterval(wsHeartbeatSweep, WS_HEARTBEAT_MS);
(wsHeartbeatTimer as unknown as { unref?: () => void })?.unref?.();

/** P2-2 — stop the WS heartbeat interval (called by the centralized shutdown). */
export function stopWsHeartbeat(): void {
  clearInterval(wsHeartbeatTimer);
}

app.get(
  '/api/portgrid/terminal/:projectId',
  wsUpgradeGuard,
  upgradeWebSocket((c) => {
    const projectId = c.req.param('projectId');
    let session: TerminalSession | null = null;
    let rawWs: any = null;
    return {
      onOpen(_evt, ws) {
        rawWs = ws;
        trackWsHeartbeat(ws);
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
        untrackWsHeartbeat(rawWs);
        rawWs = null;
        session?.dispose('ws-close');
        session = null;
      },
      onError() {
        untrackWsHeartbeat(rawWs);
        rawWs = null;
        session?.dispose('ws-error');
        session = null;
      },
    };
  })
);

app.get(
  '/api/sync',
  wsUpgradeGuard,
  upgradeWebSocket((c) => {
    const peerId = `incoming-${crypto.randomUUID()}`;
    let rawWs: any = null;
    return {
      onOpen(_evt, ws) {
        rawWs = ws;
        trackWsHeartbeat(ws);
        transport.addIncomingConnection(peerId, ws);
      },
      onMessage(evt, ws) {
        const raw = typeof evt.data === 'string' ? evt.data : evt.data?.toString?.() ?? '';
        transport.handleIncomingMessage(raw, peerId, ws as any);
      },
      onClose() {
        untrackWsHeartbeat(rawWs);
        rawWs = null;
        console.log(`[Transport] Incoming peer ${peerId} disconnected`);
      },
      onError() {
        untrackWsHeartbeat(rawWs);
        rawWs = null;
        console.log(`[Transport] Incoming peer ${peerId} error`);
      }
    };
  })
);

/**
 * §2.1-C4 — manual pairing: validate ip/port, default-deny non-private
 * targets (closes the §0-V1-5 delta-exfil chain), and append the target to
 * the SAME consent list used by discovery approvals (one list, one guard).
 * Session auth on this route lands with C6 (server-main middleware swap).
 *
 * P2-B4 — the peer-port trap is enforced HERE at the route layer (not in
 * the transport, so transport-level pairing tests stay green): any
 * otherwise-valid port outside {configured} ∪ {PEER_PORT_ALLOWLIST} is a
 * 400 with a readable error. An optional `fingerprint` body field is
 * persisted (TOFU seed); when absent, the first successful handshake learns
 * it and a later different one refuses the peer (see transport.ts).
 */
app.post('/api/sync/manual', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    const check = validateManualPeer(body?.ip, body?.port, isSyncAllowPublic(db), allowedPeerPorts());
    if (!check.ok) {
      if (check.error === 'port-not-allowlisted') {
        const allowed = [...allowedPeerPorts()].sort((a, b) => a - b).join(', ');
        return c.json({ error: `port ${String(body?.port)} is not an allowed peer port (allowed: ${allowed}; extend with PEER_PORT_ALLOWLIST)` }, 400);
      }
      return c.json({ error: check.error }, 400);
    }
    const ip: string = body.ip;
    const port: number = body.port;
    const fingerprint: string | undefined = typeof body?.fingerprint === 'string' && body.fingerprint !== '' ? body.fingerprint : undefined;
    const added = addApprovedPeer(db, ip, port, fingerprint);
    if (!added.ok) {
      return c.json({ error: added.error }, 409);
    }
    await transport.connectToManualPeer(ip, port);
    return c.json({ success: true, message: `Connected to ${ip}:${port}` });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * §2.1-C4 — PortGrid consent surface: list pending/approved peers, approve
 * (validated + capped + connect), reject (drop from pending).
 * Session auth on this route lands with C6 (server-main middleware swap).
 */
app.post('/api/sync/peers', async (c) => {
  const body = await c.req.json().catch(() => null);
  const action = body?.action;

  if (action === 'list') {
    return c.json({
      enabled: isSyncEnabled(db),
      allowPublic: isSyncAllowPublic(db),
      pending: [...pendingPeers.values()],
      approved: getApprovedPeers(db),
    });
  }

  if (action !== 'approve' && action !== 'reject') {
    return c.json({ error: 'invalid-action' }, 400);
  }

  const check = validateManualPeer(body?.ip, body?.port, isSyncAllowPublic(db), allowedPeerPorts());
  if (!check.ok) {
    if (check.error === 'port-not-allowlisted') {
      const allowed = [...allowedPeerPorts()].sort((a, b) => a - b).join(', ');
      return c.json({ error: `port ${String(body?.port)} is not an allowed peer port (allowed: ${allowed}; extend with PEER_PORT_ALLOWLIST)` }, 400);
    }
    return c.json({ error: check.error }, 400);
  }
  const ip: string = body.ip;
  const port: number = body.port;
  const nodeId = `${ip}:${port}`;

  if (action === 'reject') {
    pendingPeers.delete(nodeId);
    scoutEmitter.emit('update', { type: 'PEER_REJECTED', node: { ip, port }, timestamp: Date.now() });
    return c.json({ success: true, pending: [...pendingPeers.values()] });
  }

  // approve → persist to the consent list, then connect (§2.1-C4: ONLY this
  // route and /api/sync/manual may call connect*). P2-B4: an optional
  // `fingerprint` body field seeds TOFU; otherwise the first handshake
  // learns it (see transport.ts handleAuthFrame).
  const fingerprint: string | undefined = typeof body?.fingerprint === 'string' && body.fingerprint !== '' ? body.fingerprint : undefined;
  const added = addApprovedPeer(db, ip, port, fingerprint);
  if (!added.ok) {
    return c.json({ error: added.error }, 409);
  }
  pendingPeers.delete(nodeId);
  await transport.connectToPeer({ hostname: ip, ip, port });
  scoutEmitter.emit('update', { type: 'PEER_APPROVED', node: { ip, port }, timestamp: Date.now() });
  return c.json({ success: true, approved: getApprovedPeers(db) });
});


// ─── LLM Provider Boot Sequence ──────────────────────────────────────────────
// Load all enabled providers from the llm_providers DB table into the engine's
// providerRegistry. Then set the global routing rule's position-0 as the active
// primary. Falls back to env vars or MockProvider if no DB entries exist.
import { decrypt } from '../core/basevault/crypto';

function bootProviderRegistry() {
  // P3-S1 continue-never-throw: one retired/unknown row (e.g. Zen while the
  // flag is off) must NEVER abort the whole registry — skip it with a warning
  // and keep loading the rest. Previously any single throw landed in the
  // catch below and fell back to env/mock for ALL rows.
  const safeInstantiate = (type: string, config: any, apiKey: string, id: string) => {
    try {
      return instantiateProvider(type, config, apiKey, id);
    } catch (err: any) {
      log.warn(`[NeuroSync] Boot: skipping provider row ${id} (type '${type}'): ${err?.message}`);
      return null;
    }
  };
  try {
    const rows = db.prepare(`SELECT id, type, config_json, api_key_encrypted FROM llm_providers WHERE is_enabled = 1`).all() as any[];
    for (const row of rows) {
      const config = JSON.parse(row.config_json || '{}');
      const apiKey = row.api_key_encrypted ? decrypt(row.api_key_encrypted) : '';
      const provider = safeInstantiate(row.type, config, apiKey, row.id);
      if (!provider) continue;
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
            const primary = safeInstantiate(pRow.type, pConfig, pKey, pRow.id);
            if (primary) {
              routeSwitch.setProvider(primary);
              log.info(`[NeuroSync] Boot: Primary provider set from global rule: ${primaryId} (${rows.length} total registered)`);
              return;
            }
            // Retired/unknown primary — fall through to first-registered below.
            }
          }
        }
      }

    // If we got DB providers but no global rule, set the first one as active primary
    if (rows.length > 0) {
      for (const firstRow of rows) {
        const firstConfig = JSON.parse(firstRow.config_json || '{}');
        const firstKey = firstRow.api_key_encrypted ? decrypt(firstRow.api_key_encrypted) : '';
        const firstProvider = safeInstantiate(firstRow.type, firstConfig, firstKey, firstRow.id);
        if (!firstProvider) continue;
        routeSwitch.setProvider(firstProvider);
        log.info(`[NeuroSync] Boot: ${rows.length} provider(s) loaded from DB. Primary set to: ${firstRow.id} (no global rule yet)`);
        return;
      }
      // Every row was skipped (all retired/unknown) — fall through to env/mock.
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
//
// NOTE ON estimatedTokens: this is the background reflection/preference
// extractor (one short line per fact, or a single classification word) — NOT
// the interactive Cerebro chat endpoint that live-testing found failing on
// longer prompts (that's `chatEngine.execute` in routes/cerebro.ts, since
// bumped to 900). This value stays low deliberately since the floor in
// openai-compatible.ts (DEFAULT_MAX_TOKENS_FLOOR, raised 512 -> 1024) already
// covers it, and that adapter now also retries once with a larger budget if a
// response looks like the model burned it all on hidden reasoning
// (finish_reason=length + a reasoning_content/reasoning field) rather than
// failing outright.
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
// (`coreexec-<harness>`) so operators can route each harness independently
// of the ScopeLogic interview or Cerebro chat; it falls back to the
// plain `agent`-scope rule (then global) when no specific rule is registered.
// estimatedTokens 1000: a generic task response is real work output (analysis /
// summary / draft) — larger than Cerebro's 150-token chat reply, smaller than
// ScopeLogic's 2000-token DAG-schema generation. Text-generation only; the result
// is stored for a human to read, never executed.
const _coreExecGenerateFn = async ({ prompt, harnessProfile }: CoreExecGenerationRequest) => {
  const isolatedPrompt = ['[ISOLATED_SINGLE_TURN_REQUEST]', prompt].join('\n\n');
  const result = await routeSwitch.execute({
    prompt: isolatedPrompt,
    estimatedTokens: 1000,
    scope: 'agent',
    scopeId: `coreexec-${harnessProfile}`,
    useKnowledgeContext: false,
  });
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

    const provider = instantiateProvider(type, config || {}, config?.apiKey);
    routeSwitch.setProvider(provider);

    // Keep the llm.ts currentConfig in sync so GET /api/llm/config reflects
    // the live provider even when the switch happened via this endpoint.
    const { activeEngine, currentConfig: llmCurrentConfig } = require('./routes/llm');
    if (llmCurrentConfig) {
      llmCurrentConfig.provider = type;
      if (config) llmCurrentConfig.config = { ...llmCurrentConfig.config, ...config };
      if (config?.apiKey !== undefined) llmCurrentConfig.apiKey = config.apiKey;
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

const port = NEUROSYNC_PORT; // P2-3: single const (shared with MDNS above), env NEUROSYNC_PORT || 3743

/**
 * §2.1-C5 — loopback bind (closes T2/T6: LAN + all-interfaces exposure).
 * NEUROSYNC_BIND env wins, then the operator-set `bind_address` row in
 * system_settings (settable via PortGrid), else fail-closed to 127.0.0.1.
 * An empty string / garbage value falls through to the loopback default.
 */
function dbSetting(key: string): string | undefined {
  try {
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  } catch {
    return undefined;
  }
}
const bindAddress = process.env.NEUROSYNC_BIND || dbSetting('bind_address') || '127.0.0.1';
// §2.2(a)(3)(4) — the setup route needs both facts (loopback bind + boot-time
// window) before it will accept a first-run credential. Both are set here,
// before serve() accepts a single request; the window itself lives in RAM
// (one eMMC write total: the credential hash at setup — Axiom 6 cost table).
setBindAddress(bindAddress);
openSetupWindow();
log.info(`[NeuroSync] API Gateway running on http://${bindAddress === '127.0.0.1' ? 'localhost' : bindAddress}:${port} (bind ${bindAddress})`);
log.info(`[NeuroSync] Auth: ${isSetupComplete() ? 'enabled' : 'disabled (setup pending)'}`);

import { ModelDiscovery } from '../core/routeswitch/discovery';
ModelDiscovery.fetchModels().then(() => {
  log.info('[NeuroSync] Model Discovery complete. Available models cached.');
}).catch(err => {
  log.error('[NeuroSync] Model Discovery failed:', err);
});

const server = serve({
  fetch: app.fetch,
  port,
  hostname: bindAddress,
});

// Attach the WebSocket upgrade handler to the underlying http.Server so the
// PortGrid terminal endpoint (/api/portgrid/terminal/:projectId) can upgrade.
injectWebSocket(server);

// ─── P2-2 centralized graceful shutdown (single SIGINT/SIGTERM owner) ───────
// setBindAddress/openSetup ran before serve() above; injectWebSocket stays
// after serve — this wiring only ADDS the shutdown owner, moving nothing.
import { installShutdownHandlers } from './shutdown';
import { _stopSchedulerLoopForTests as stopSchedulerLoop } from '../core/coreexec/scheduler';
import { workerPool } from '../core/coreexec/worker-pool';
installShutdownHandlers({
  server: server as unknown as import('./shutdown').ShutdownServer,
  stopHeartbeat: stopWsHeartbeat,
  stopMdns: () => mdnsDiscovery.stop(),
  stopTransport: () => transport.dispose(),
  stopIdle: () => idleDetector.stop(),
  stopReflection: () => ReflectionExecutor.stopDaemon(),
  stopScheduler: () => stopSchedulerLoop(),
  stopWorkerPool: () => workerPool.destroy(),
});
