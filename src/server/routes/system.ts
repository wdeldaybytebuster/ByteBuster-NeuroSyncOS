import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import * as si from 'systeminformation';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { db, dbPath } from '../../core/basevault/db';
import { encrypt, decrypt } from '../../core/basevault/crypto';
import { workerPool } from '../../core/coreexec/worker-pool';

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
