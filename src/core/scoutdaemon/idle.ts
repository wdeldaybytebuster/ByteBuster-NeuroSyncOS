import { EventEmitter } from 'events';
import { executeRun } from '../coreexec/engine';
import { db } from '../basevault/db';
import crypto from 'crypto';
import * as si from 'systeminformation';
import { systemConfig } from '../../server/routes/system';
import { ScoutResearch } from './research';
import { log } from '../observability/logger';

export class IdleDetector extends EventEmitter {
  private lastHeartbeat: number;
  private idleThresholdMs: number;
  private checkInterval: NodeJS.Timeout | null = null;
  private isIdle: boolean = false;
  private originalMaxWorkers?: number;

  constructor(idleThresholdMinutes: number = 10) {
    super();
    this.idleThresholdMs = idleThresholdMinutes * 60 * 1000;
    this.lastHeartbeat = Date.now();
  }

  public start() {
    this.checkInterval = setInterval(async () => {
      const now = Date.now();
      
      try {
        const temp = await si.cpuTemperature();
        if (temp.main > 85) {
          log.warn('[ScoutDaemon] Thermal spike detected. Yielding foreground via maxWorkers=0.');
          // Save original config if not already yielding
          if (!this.originalMaxWorkers) this.originalMaxWorkers = systemConfig.maxWorkers;
          systemConfig.maxWorkers = 0; // Suspend coreexec engine
        } else if (this.originalMaxWorkers !== undefined && temp.main < 75) {
          log.info('[ScoutDaemon] Thermals recovered. Restoring worker config.');
          systemConfig.maxWorkers = this.originalMaxWorkers;
          delete this.originalMaxWorkers;
        }
      } catch (err) {
        // ignore
      }

      if (now - this.lastHeartbeat > this.idleThresholdMs && !this.isIdle) {
        this.isIdle = true;
        this.emit('idle');
      } else if (now - this.lastHeartbeat <= this.idleThresholdMs && this.isIdle) {
        this.isIdle = false;
        this.emit('active');
      }
    }, 60000); // check every minute
  }

  public stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  public ping() {
    this.lastHeartbeat = Date.now();
    if (this.isIdle) {
      this.isIdle = false;
      this.emit('active');
    }
  }
}

export const idleDetector = new IdleDetector(10); // 10 minutes

// When idle, trigger the built-in system maintenance DAG
idleDetector.on('idle', () => {
  log.info('[ScoutDaemon] System is idle. Triggering autonomous maintenance...');
  try {
    const runId = crypto.randomUUID();
    
    // A synthetic DAG layout for maintenance
    const dagLayout = {
      nodes: [
        { id: crypto.randomUUID(), dependencies: [] } // e.g., "Knowledge Graph Pruning"
      ]
    };

    // `workflow_runs.project_id` has `FOREIGN KEY(project_id) REFERENCES
    // projects(id)` with `foreign_keys = ON` (src/core/basevault/db.ts). The
    // literal 'system-maintenance' project id used below was never actually
    // created anywhere in this codebase, so this insert failed with
    // "FOREIGN KEY constraint failed" on every single idle trigger, not just
    // some edge case (observed in server logs, tracker doc 2026-07-03).
    // Fix: follow the same sentinel-row convention already established in
    // `src/server/routes/todos.ts` (promote) and `src/core/coreexec/validateDAG.ts`
    // (escalateBlockedDAGToOsTodos) — ensure the referenced parent row genuinely
    // exists before inserting the child row that references it. Unlike those
    // call sites (which mint a fresh UUID sentinel per call), this one reuses
    // the same well-known 'system-maintenance' id across every idle trigger, so
    // `INSERT OR IGNORE` is the correct one-time-creation form: the first idle
    // trigger ever creates it, every subsequent trigger is a no-op against the
    // now-existing row.
    db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
        'system-maintenance', 'System Maintenance', Date.now()
      );

      db.prepare('INSERT INTO workflow_runs (id, project_id, dag_layout, status, created_at) VALUES (?, ?, ?, ?, ?)').run(
        runId, 'system-maintenance', JSON.stringify(dagLayout), 'pending', Date.now()
      );

      const insertTask = db.prepare('INSERT INTO tasks (id, run_id, status) VALUES (?, ?, ?)');
      for (const node of dagLayout.nodes) {
        insertTask.run(node.id, runId, 'unclaimed');
      }
    })();

    executeRun(runId).catch(err => log.error('[ScoutDaemon] Maintenance failed:', err));
  } catch (err) {
    log.error('[ScoutDaemon] Failed to trigger maintenance:', err);
  }

  // During idle, review pending scout drafts and log their count
  try {
    const pendingDrafts = ScoutResearch.listDrafts();
    if (pendingDrafts.length > 0) {
      log.info(`[ScoutDaemon] ${pendingDrafts.length} scout draft(s) pending review.`);
    }
  } catch (err) {
    log.error('[ScoutDaemon] Failed to check scout drafts:', err);
  }
});
