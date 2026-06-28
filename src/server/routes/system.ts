import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import * as si from 'systeminformation';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { db, dbPath } from '../../core/basevault/db';
import { encrypt, decrypt } from '../../core/basevault/crypto';
import { workerPool } from '../../core/coreexec/worker-pool';
import { SensitiveDataRedactor } from '../../core/basevault/redactor';

export const systemRouter = new Hono();

// In-memory config state
export const systemConfig = {
  maxWorkers: Math.max(1, os.cpus().length - 1),
};

systemRouter.get('/metrics', async (c) => {
  return streamSSE(c, async (stream) => {
    let active = true;

    c.req.raw.signal.addEventListener('abort', () => {
      active = false;
    });

    while (active) {
      try {
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

        await stream.writeSSE({
          data: JSON.stringify({
            temperature: temp.main || 0,
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
          }),
          event: 'telemetry'
        });

      } catch (err) {
        console.error('Metrics stream error:', err);
      }
      
      // Wait 3 seconds
      await stream.sleep(3000);
    }
  });
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
      console.error('Backup failed', err);
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
      console.warn('[System] Initiating System Restore. Draining workers...');
      workerPool.destroy(); // Wait for workers to finish current jobs then kill
      db.close();

      // 3. Overwrite Vault DB
      console.warn('[System] Overwriting BaseVault SQLite database...');
      fs.copyFileSync(tempPath, dbPath);
      fs.unlinkSync(tempPath);

      // 4. Force process restart (assuming pm2, nodemon, or systemd is watching)
      console.warn('[System] Restore complete. Triggering process exit for process manager to reboot...');
      setTimeout(() => process.exit(0), 1000);

      return c.json({ success: true, message: 'System restored. Rebooting OS...' });
    } catch (err: any) {
      console.error('Restore failed', err);
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

// Daemon restart — restores maxWorkers to hardware-safe limit
systemRouter.post('/daemon/restart', (c) => {
  systemConfig.maxWorkers = Math.max(1, os.cpus().length - 1);
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

// MCP Connection Manager — stored as JSON in system_settings under key 'mcp_connections'
systemRouter.get('/mcp/connections', (c) => {
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'mcp_connections'").get() as { value: string } | undefined;
    const connections = row ? JSON.parse(row.value) : [
      { id: 'sqlite-vec', name: 'SQLite Vector Adapter', transport: 'stdio', status: 'active' },
      { id: 'gitnexus', name: 'GitNexus AST Map', transport: 'stdio', status: 'active' },
    ];
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
        { id: 'code_execute', label: 'code_execute', read: true, write: true, exec: 'sandboxed', git: true },
        { id: 'research_only', label: 'research_only', read: true, write: false, exec: false, git: true },
        { id: 'admin_operator', label: 'admin_operator', read: true, write: true, exec: true, git: true },
      ]
    };
    return c.json({ success: true, permissions });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─── Proposal Staging ────────────────────────────────────────────────────────
// Persists a ScopeLogic-generated DAG proposal so it survives frontend navigation.
// Only one pending proposal exists at a time (keyed as 'pending_proposal' in system_settings).

systemRouter.post('/proposals/stage', async (c) => {
  try {
    const body = await c.req.json();
    const { proposal } = body;
    if (!proposal) return c.json({ success: false, error: 'proposal is required' }, 400);
    db.prepare("INSERT INTO system_settings (key, value) VALUES ('pending_proposal', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(proposal));
    return c.json({ success: true, message: 'Proposal staged for review.' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

systemRouter.get('/proposals/pending', (c) => {
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'pending_proposal'").get() as { value: string } | undefined;
    if (!row) return c.json({ success: true, proposal: null });
    return c.json({ success: true, proposal: JSON.parse(row.value) });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

systemRouter.delete('/proposals/pending', (c) => {
  try {
    db.prepare("DELETE FROM system_settings WHERE key = 'pending_proposal'").run();
    return c.json({ success: true, message: 'Proposal cleared.' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});
