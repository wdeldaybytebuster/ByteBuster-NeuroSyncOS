import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import * as si from 'systeminformation';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { db, dbPath } from '../../core/basevault/db';
import { encrypt, decrypt } from '../../core/basevault/crypto';
import { workerPool } from '../../core/coreexec/worker-pool';
import { SensitiveDataRedactor } from '../../core/basevault/redactor';
import { log } from '../../core/observability/logger';
import { activeGovernor } from './llm';
import { isBwrapAvailable } from '../../core/portgrid/terminal-session';
import { getConfiguredMaxConcurrent } from '../../core/coreexec/settings';

export const systemRouter = new Hono();

const HARDWARE_SAFE_MAX_WORKERS = Math.max(1, os.cpus().length - 1);

// In-memory config state. `maxWorkers` is CoreExec's real live concurrency
// gate (engine.ts's dispatch loop reads it every tick). Initialized from
// UnifiedMasterDashboard's persisted `max_concurrent` setting when present
// (Set-up view, Control A) so a saved preference survives a restart instead
// of always resetting to the hardware-safe default; falls back to that
// default exactly as before when unset.
export const systemConfig = {
  maxWorkers: getConfiguredMaxConcurrent(HARDWARE_SAFE_MAX_WORKERS),
};

/**
 * One-shot system telemetry snapshot — the exact payload shape the SSE loop
 * below pushes on every tick, factored out so a plain-GET polling consumer
 * (ScoutDaemonDashboard's "polling" Sensory Modality, and the snapshot route
 * just below) can get the identical numbers without holding an EventSource
 * open. Never throws — callers get `null` on a read failure so a transient
 * `si.cpuTemperature()` hiccup can't 500 a poll request.
 */
export async function getMetricsSnapshot() {
  const temp = await si.cpuTemperature();
  // Calculate basic CPU utilization by diffing os.cpus() times
  // A simple approximation: sum(idle) / sum(total)
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const core of cpus) {
    for (const type in core.times) {
      total += core.times[type as keyof typeof core.times];
    }
    idle += core.times.idle;
  }

  const utilization = 100 - Math.round((idle / total) * 100);

  // systeminformation returns -1 (or null) when no thermal sensor is readable;
  // treat that as "unavailable", not a real 0°C reading.
  const temperature = typeof temp.main === 'number' && temp.main >= 0 ? temp.main : null;

  return {
    temperature,
    utilization,
    cores: cpus.length,
    maxWorkersConfig: systemConfig.maxWorkers,
    pool: {
      minSize: workerPool.info.minSize,
      maxSize: workerPool.info.maxSize,
      workerNodes: workerPool.info.workerNodes,
      idleWorkerNodes: workerPool.info.idleWorkerNodes,
      busyWorkerNodes: workerPool.info.busyWorkerNodes,
      queuedTasks: workerPool.info.queuedTasks
    }
  };
}

systemRouter.get('/metrics', async (c) => {
  return streamSSE(c, async (stream) => {
    let active = true;

    c.req.raw.signal.addEventListener('abort', () => {
      active = false;
    });

    while (active) {
      try {
        const snapshot = await getMetricsSnapshot();
        await stream.writeSSE({
          data: JSON.stringify(snapshot),
          event: 'telemetry'
        });

      } catch (err) {
        log.error('Metrics stream error:', err);
      }

      // Wait 3 seconds
      await stream.sleep(3000);
    }
  });
});

/**
 * Plain-GET, single-shot counterpart to the SSE `/metrics` stream above —
 * the polling-compatible endpoint ScoutDaemon's "polling" Sensory Modality
 * needs (see ScoutDaemonDashboard.tsx / src/ui/views/scoutTelemetry.ts).
 * Same payload shape as one SSE `telemetry` tick, wrapped in the
 * `{ success, metrics }` envelope this codebase's other GET routes use.
 */
systemRouter.get('/metrics/snapshot', async (c) => {
  try {
    const metrics = await getMetricsSnapshot();
    return c.json({ success: true, metrics });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

systemRouter.get('/settings', async (c) => {
  try {
    const rows = db.prepare('SELECT key, value FROM system_settings').all() as {key: string, value: string}[];
    const settings: Record<string, any> = {};
    for (const row of rows) {
      if (row.key === 'llm_api_key') {
        const dec = decrypt(row.value);
        if (dec && dec.length > 4) {
          settings[row.key] = dec.substring(0, 3) + '...****';
        } else {
          settings[row.key] = '****';
        }
      } else {
        try {
          settings[row.key] = JSON.parse(row.value);
        } catch {
          settings[row.key] = row.value;
        }
      }
    }
    return c.json({ success: true, settings });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

systemRouter.post('/settings', async (c) => {
  const body = await c.req.json();
  try {
    const stmt = db.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    db.transaction(() => {
      for (const [k, v] of Object.entries(body)) {
        if (v === undefined || v === null) continue;
        let valueToSave = typeof v === 'object' ? JSON.stringify(v) : String(v);
        if (k === 'llm_api_key' && typeof v === 'string') {
          if (v.includes('...****')) continue;
          valueToSave = encrypt(v);
        }
        stmt.run(k, valueToSave);
      }
    })();
    // Live-apply max_concurrent immediately (mirrors POST /config's
    // `maxWorkers` handling below) instead of only taking effect on next
    // server restart — engine.ts's dispatch loop reads systemConfig.maxWorkers
    // fresh every tick, so this is a genuine no-restart-needed setting.
    if (body.max_concurrent !== undefined) {
      const requested = parseInt(body.max_concurrent, 10);
      if (!isNaN(requested) && requested > 0) {
        systemConfig.maxWorkers = requested;
      }
    }
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

systemRouter.post('/config', async (c) => {
  const body = await c.req.json();
  if (body.maxWorkers !== undefined) {
    const requested = parseInt(body.maxWorkers, 10);
    if (!isNaN(requested) && requested > 0) {
      systemConfig.maxWorkers = requested;
      return c.json({ success: true, maxWorkers: systemConfig.maxWorkers });
    }
  }
  return c.json({ success: false, error: 'Invalid configuration' }, 400);
});
systemRouter.get('/backup', async (c) => {
  return streamSSE(c, async (stream) => {
    try {
      const backupPath = path.resolve(process.cwd(), `backup-${Date.now()}.db`);
      db.backup(backupPath, {
        progress: ({ totalPages, remainingPages }) => {
          const percent = totalPages > 0 ? Math.round(((totalPages - remainingPages) / totalPages) * 100) : 0;
          stream.writeSSE({
            data: JSON.stringify({ progress: percent, file: backupPath }),
            event: 'backup-progress'
          });
          return 0; // 0 to continue
        }
      });
      await stream.writeSSE({
        data: JSON.stringify({ progress: 100, file: backupPath }),
        event: 'backup-complete'
      });
    } catch (err: any) {
      log.error('Backup failed', err);
      await stream.writeSSE({ data: err.message, event: 'error' });
    }
  });
});

systemRouter.post('/restore', async (c) => {
  const body = await c.req.parseBody();
  const file = body['backup_file'];

  if (file instanceof File) {
    try {
      // 1. Save uploaded file to temp path
      const arrayBuffer = await file.arrayBuffer();
      const tempPath = path.resolve(process.cwd(), 'restore-temp.db');
      fs.writeFileSync(tempPath, Buffer.from(arrayBuffer));

      // 2. Drain workers & close DB
      log.warn('[System] Initiating System Restore. Draining workers...');
      workerPool.destroy(); // Wait for workers to finish current jobs then kill
      db.close();

      // 3. Overwrite Vault DB
      log.warn('[System] Overwriting BaseVault SQLite database...');
      fs.copyFileSync(tempPath, dbPath);
      fs.unlinkSync(tempPath);

      // 4. Force process restart (assuming pm2, nodemon, or systemd is watching)
      log.warn('[System] Restore complete. Triggering process exit for process manager to reboot...');
      setTimeout(() => process.exit(0), 1000);

      return c.json({ success: true, message: 'System restored. Rebooting OS...' });
    } catch (err: any) {
      log.error('Restore failed', err);
      return c.json({ success: false, error: err.message }, 500);
    }
  }

  return c.json({ success: false, error: 'No file provided' }, 400);
});

// Redaction event log — surfaces recent SensitiveDataRedactor activity to the BaseVault dashboard
systemRouter.get('/redaction-log', (c) => {
  return c.json({ success: true, events: SensitiveDataRedactor.getRecentEvents() });
});

// Daemon kill — sets maxWorkers to 0 effectively parking all background work
systemRouter.post('/daemon/kill', (c) => {
  systemConfig.maxWorkers = 0;
  return c.json({ success: true, message: 'Daemon killed. maxWorkers set to 0.', maxWorkers: 0 });
});

// Daemon restart — restores maxWorkers to the user's configured
// `max_concurrent` setting when one is saved, else the hardware-safe
// default. Mirrors the real startup init above (systemConfig.maxWorkers)
// so "restart" returns to the same configured state a real process boot
// would, instead of always discarding a saved concurrency preference.
systemRouter.post('/daemon/restart', (c) => {
  systemConfig.maxWorkers = getConfiguredMaxConcurrent(HARDWARE_SAFE_MAX_WORKERS);
  return c.json({ success: true, message: 'Daemon restarted.', maxWorkers: systemConfig.maxWorkers });
});

// Schema migration — runs initDB() idempotently (all CREATE IF NOT EXISTS)
systemRouter.post('/migrate', (c) => {
  try {
    const { initDB } = require('../../core/basevault/db');
    initDB();
    return c.json({ success: true, message: 'Schema migrations applied successfully. All tables current.' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Retention stats — disk usage and pruning metrics for BaseVault dashboard
systemRouter.get('/retention-stats', (c) => {
  try {
    const stats = fs.statSync(dbPath);
    const dbSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    // Count stale runs (older than 30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const staleRuns = db.prepare('SELECT COUNT(*) as count FROM workflow_runs WHERE status = ? AND created_at < ?').get('failed', thirtyDaysAgo) as { count: number } | undefined;
    const totalRuns = db.prepare('SELECT COUNT(*) as count FROM workflow_runs').get() as { count: number } | undefined;
    const orphanedTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'unclaimed' AND claim_lease IS NOT NULL AND claim_lease < ?").get(Date.now() - (5 * 60 * 1000)) as { count: number } | undefined;

    // Check WAL file size
    let walSizeMB = '0.00';
    const walPath = dbPath + '-wal';
    if (fs.existsSync(walPath)) {
      walSizeMB = (fs.statSync(walPath).size / (1024 * 1024)).toFixed(2);
    }

    return c.json({
      success: true,
      stats: {
        dbSizeMB: parseFloat(dbSizeMB),
        walSizeMB: parseFloat(walSizeMB),
        totalRuns: totalRuns?.count || 0,
        staleFailedRuns: staleRuns?.count || 0,
        orphanedLeases: orphanedTasks?.count || 0,
        retentionThresholdDays: 30,
      }
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Real-time DB health — actual SELECT 1 round-trip latency + real WAL checkpoint
// count, replacing the BaseVault dashboard's old Math.random() jitter.
systemRouter.get('/db-health', (c) => {
  try {
    const start = performance.now();
    db.prepare('SELECT 1').get();
    const latencyMs = performance.now() - start;

    // better-sqlite3's .pragma() runs PRAGMA wal_checkpoint(PASSIVE) for real and
    // returns [{ busy, log, checkpointed }] — checkpointed is the real count of
    // WAL frames actually written back to the main DB file this cycle.
    const checkpointRows = db.pragma('wal_checkpoint(PASSIVE)') as { busy: number; log: number; checkpointed: number }[];
    const walCheckpoints = checkpointRows?.[0]?.checkpointed ?? 0;

    return c.json({
      success: true,
      latencyMs: Math.round(latencyMs * 100) / 100,
      walCheckpoints,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Verifiable Confidence Badges — computes all 8 PortGrid "proof badge" flags
// server-side from real signals instead of a hand-typed literal array.
systemRouter.get('/proof-badges', (c) => {
  try {
    const projectId = c.req.query('projectId') || '';

    // Local Only — no *enabled* external (cloud) provider configured. llama-cpp
    // and mock providers are both local/offline, so only openai-compatible counts.
    const externalProviderRow = db.prepare(
      "SELECT COUNT(*) as cnt FROM llm_providers WHERE is_enabled = 1 AND type = 'openai-compatible'"
    ).get() as { cnt: number } | undefined;
    const localOnly = (externalProviderRow?.cnt || 0) === 0;

    // Redacted — the real SensitiveDataRedactor ring buffer has at least one entry.
    const redacted = SensitiveDataRedactor.getRecentEvents().length > 0;

    // Human Approved — at least one os_todos row actually resolved (approved) in
    // the last 30 days (mirrors the 30-day window used by /retention-stats).
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const approvedRow = db.prepare(
      "SELECT COUNT(*) as cnt FROM os_todos WHERE status = 'resolved' AND created_at >= ?"
    ).get(thirtyDaysAgo) as { cnt: number } | undefined;
    const humanApproved = (approvedRow?.cnt || 0) > 0;

    // Source Linked — no clean automated signal exists yet for "the current/last
    // proposal references an OKF node". Left honestly static rather than faking
    // a check that wouldn't mean anything.
    const sourceLinked = false;

    // Low Confidence — a pending (open) os_todos row below the Deference UI
    // threshold (0.70), same threshold already used in PortGridDashboard/todos.ts.
    const lowConfRow = db.prepare(
      "SELECT COUNT(*) as cnt FROM os_todos WHERE status = 'open' AND confidence < 0.70"
    ).get() as { cnt: number } | undefined;
    const lowConfidence = (lowConfRow?.cnt || 0) > 0;

    // Quota Protected — the live RouteSwitch governor is wired in and actually
    // gates every generation call via canProceed() in engine.ts before any
    // provider is invoked (real enforcement, not a display-only number).
    const quotaProtected = !!activeGovernor;

    // Project Scoped — caller supplies the active project id (client nav state);
    // active whenever a real (non-Global) project is selected.
    const projectScoped = !!projectId;

    // Sandbox Enforced — mirrors terminal-session.ts's real bwrap availability
    // check (same function the Embedded Terminal uses to gate itself).
    const sandboxEnforced = isBwrapAvailable();

    const badges = [
      { label: 'Local Only', active: localOnly },
      { label: 'Redacted', active: redacted },
      { label: 'Human Approved', active: humanApproved },
      { label: 'Source Linked', active: sourceLinked },
      { label: 'Low Confidence', active: lowConfidence },
      { label: 'Quota Protected', active: quotaProtected },
      { label: 'Project Scoped', active: projectScoped },
      { label: 'Sandbox Enforced', active: sandboxEnforced },
    ];

    return c.json({ success: true, badges });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// MCP Connection Manager — stored as JSON in system_settings under key 'mcp_connections'.
//
// SCOPE NOTE: this performs a real *reachability* probe of each configured
// endpoint — it does NOT implement the MCP JSON-RPC protocol, tool listing, or
// tool invocation (there is no MCP client anywhere in this codebase). For a
// stdio/command server we check the executable exists (on PATH or as an
// absolute file); for a URL server we attempt a bounded-timeout HTTP connect.
// Each connection is returned with a real reachability status instead of the
// old behaviour of echoing the stored/default list back as if all were live.

const MCP_PROBE_TIMEOUT_MS = 2000;

async function probeMcpReachability(
  conn: { command?: string; url?: string; transport?: string; [k: string]: unknown }
): Promise<'reachable' | 'unreachable' | 'unknown'> {
  // URL-based (http/sse) server — real bounded HTTP connect.
  if (typeof conn.url === 'string' && conn.url.trim() !== '') {
    try {
      const res = await fetch(conn.url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(MCP_PROBE_TIMEOUT_MS),
      });
      // Any HTTP response (even 4xx/405) proves the host answered the socket.
      return res ? 'reachable' : 'unreachable';
    } catch {
      return 'unreachable';
    }
  }

  // Command/stdio server — verify the executable resolves without spawning it.
  if (typeof conn.command === 'string' && conn.command.trim() !== '') {
    const cmd = conn.command.trim();
    try {
      // Absolute/relative path to a binary → check the file directly.
      if (cmd.includes('/')) {
        return fs.existsSync(cmd) ? 'reachable' : 'unreachable';
      }
      // Bare command name → resolve on PATH via `which` (short-timeout, no spawn
      // of the actual MCP server process).
      const { spawnSync } = require('child_process') as typeof import('child_process');
      const res = spawnSync('which', [cmd], { timeout: MCP_PROBE_TIMEOUT_MS });
      return res.status === 0 ? 'reachable' : 'unreachable';
    } catch {
      return 'unreachable';
    }
  }

  // Neither a URL nor a command to probe (e.g. legacy stored entries that only
  // carried a display transport) — we honestly cannot determine liveness.
  return 'unknown';
}

systemRouter.get('/mcp/connections', async (c) => {
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'mcp_connections'").get() as { value: string } | undefined;
    const stored = row ? JSON.parse(row.value) : [
      { id: 'sqlite-vec', name: 'SQLite Vector Adapter', transport: 'stdio', status: 'active' },
      { id: 'gitnexus', name: 'GitNexus AST Map', transport: 'stdio', status: 'active' },
    ];

    const connections = await Promise.all(
      (Array.isArray(stored) ? stored : []).map(async (conn: any) => ({
        ...conn,
        status: await probeMcpReachability(conn),
      }))
    );

    return c.json({ success: true, connections });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

systemRouter.post('/mcp/connections', async (c) => {
  try {
    const body = await c.req.json();
    const { connections } = body;
    if (!Array.isArray(connections)) return c.json({ success: false, error: 'connections must be an array' }, 400);
    db.prepare("INSERT INTO system_settings (key, value) VALUES ('mcp_connections', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(connections));
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Tool Registry — returns the registered tools list (stored in system_settings or defaults)
systemRouter.get('/tools', (c) => {
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'tool_registry'").get() as { value: string } | undefined;
    const tools = row ? JSON.parse(row.value) : [
      { id: 'read_file', name: 'read_file', type: 'Read', status: 'Active' },
      { id: 'write_file', name: 'write_file', type: 'Write', status: 'Active' },
      { id: 'list_directory', name: 'list_directory', type: 'Read', status: 'Active' },
      { id: 'run_command', name: 'run_command', type: 'Execute', status: 'Sandboxed' },
      { id: 'web_scrape', name: 'web_scrape', type: 'Network', status: 'Active' },
      { id: 'git_nexus', name: 'git_nexus', type: 'Read', status: 'Active' },
      { id: 'sqlite_vec', name: 'sqlite_vec', type: 'Read', status: 'Active' },
    ];
    return c.json({ success: true, tools });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Agent Permissions — returns the permission matrix (stored in system_settings or defaults)
systemRouter.get('/agents/permissions', (c) => {
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'agent_permissions'").get() as { value: string } | undefined;
    const permissions = row ? JSON.parse(row.value) : {
      archetypes: [
        { id: 'code_execute', label: 'code_execute', read: true, write: true, exec: 'sandboxed', git: true, network: true },
        { id: 'research_only', label: 'research_only', read: true, write: false, exec: false, git: true, network: true },
        { id: 'admin_operator', label: 'admin_operator', read: true, write: true, exec: true, git: true, network: true },
      ]
    };
    return c.json({ success: true, permissions });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─── Proposal Staging (System B, now table-backed) ───────────────────────────
// Persists a ScopeLogic-generated DAG proposal so it survives frontend
// navigation. Migrated off the old single-JSON-blob-in-system_settings hack
// onto the real `dag_proposals` table.
//
// Design call — SINGLE active pending proposal at a time (unchanged UX):
// ScopeLogic's server-side interview sessions are now scoped per project (see
// scopelogic-router.ts), but the review queue still surfaces one proposal at a
// time across the app — the UI only ever surfaces one proposal for review, and multi-proposal review adds
// UX/scope this task doesn't need. So `stage` rejects any currently-pending
// proposal before inserting the new one, and `GET /pending` returns the newest
// still-pending row. The table itself keeps full history (approved/rejected
// rows are retained) so nothing is lost and multi-proposal is a future
// non-breaking extension.

// ScopeLogic's LLM-driven `_generateProposal()` now self-reports a real
// model-confidence per proposal (interview.ts DAG_PROPOSAL_SCHEMA), so the
// caller MAY supply a `confidence` in [0,1]. When it does, we store that real
// value; when it's absent or out of range — notably the template fallback
// path, which has no genuine confidence signal — we fall back to a conservative
// 0.5. A 0.5 always routes into the manual "Attention Required" review path
// (< 0.70 Deference threshold), never the auto-approve pill bar, which is the
// correct conservative outcome when no real confidence exists. This mirrors the
// exact validation pattern in todos.ts's /promote endpoint.
const DEFAULT_PROPOSAL_CONFIDENCE = 0.5;

systemRouter.post('/proposals/stage', async (c) => {
  try {
    const body = await c.req.json();
    const { proposal, confidence } = body;
    // Accept either `projectId` or `project_id`; nullable ("Global" scope is ok).
    const projectId = body.projectId ?? body.project_id ?? null;
    if (!proposal) return c.json({ success: false, error: 'proposal is required' }, 400);

    // Real model-confidence if the caller supplied a valid one; else conservative default.
    const confidenceValue =
      typeof confidence === 'number' && confidence >= 0 && confidence <= 1
        ? confidence
        : DEFAULT_PROPOSAL_CONFIDENCE;

    const id = randomUUID();
    db.transaction(() => {
      // Single-active-proposal: supersede any still-pending proposal so the
      // review queue never shows two competing drafts.
      db.prepare("UPDATE dag_proposals SET status = 'superseded' WHERE status = 'pending'").run();
      db.prepare(
        'INSERT INTO dag_proposals (id, project_id, proposal, confidence, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(id, projectId, JSON.stringify(proposal), confidenceValue, 'pending', Date.now());
    })();

    return c.json({ success: true, id, message: 'Proposal staged for review.' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

systemRouter.get('/proposals/pending', (c) => {
  try {
    const row = db
      .prepare("SELECT id, project_id, proposal, confidence FROM dag_proposals WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1")
      .get() as { id: string; project_id: string | null; proposal: string; confidence: number } | undefined;
    if (!row) return c.json({ success: true, proposal: null });
    // Keep the `proposal` field shape backward-compatible with existing
    // consumers (ScopeLogic history check, PortGrid canvas) that read
    // `d.proposal.nodes`; expose id/confidence/project_id for the merged queue.
    return c.json({
      success: true,
      id: row.id,
      projectId: row.project_id,
      confidence: row.confidence,
      proposal: JSON.parse(row.proposal),
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Clears the current pending proposal (marks it rejected). Backward-compatible
// with the old DELETE contract used by ScopeLogic's reset and PortGrid's reject.
systemRouter.delete('/proposals/pending', (c) => {
  try {
    db.prepare("UPDATE dag_proposals SET status = 'rejected' WHERE status = 'pending'").run();
    return c.json({ success: true, message: 'Proposal cleared.' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Mark a specific proposal approved (by id). The actual DAG launch still goes
// through the human-gated /api/coreexec/approve endpoint; this only records
// that the draft was accepted, keeping the AI-actions-stay-draft-only invariant.
systemRouter.post('/proposals/resolve', async (c) => {
  try {
    const { id } = await c.req.json();
    if (!id) return c.json({ success: false, error: 'id is required' }, 400);
    const info = db.prepare("UPDATE dag_proposals SET status = 'approved' WHERE id = ? AND status = 'pending'").run(id);
    if (info.changes === 0) return c.json({ success: false, error: 'Pending proposal not found' }, 404);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Mark a specific proposal rejected (by id).
systemRouter.post('/proposals/reject', async (c) => {
  try {
    const { id } = await c.req.json();
    if (!id) return c.json({ success: false, error: 'id is required' }, 400);
    const info = db.prepare("UPDATE dag_proposals SET status = 'rejected' WHERE id = ? AND status = 'pending'").run(id);
    if (info.changes === 0) return c.json({ success: false, error: 'Pending proposal not found' }, 404);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Directory browser — lists contents of a local directory for the UI path picker
systemRouter.post('/browse-directory', async (c) => {
  try {
    const { path: dirPath } = await c.req.json();
    const targetPath = dirPath || os.homedir();
    
    if (!fs.existsSync(targetPath)) {
      return c.json({ success: false, error: 'Directory not found' }, 404);
    }
    
    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return c.json({ success: false, error: 'Not a directory' }, 400);
    }

    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    const items = entries
      .filter(e => !e.name.startsWith('.')) // Hide dotfiles by default
      .map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(targetPath, e.name),
      }))
      .sort((a, b) => {
        // Directories first, then alphabetical
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

    return c.json({ success: true, currentPath: targetPath, parentPath: path.dirname(targetPath), items });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});
