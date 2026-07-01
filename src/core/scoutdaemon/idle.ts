import { EventEmitter } from 'events';
import { executeRun } from '../coreexec/engine';
import { db } from '../basevault/db';
import crypto from 'crypto';
import * as si from 'systeminformation';
import { systemConfig } from '../../server/routes/system';
import { ScoutResearch } from './research';

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
          console.warn('[ScoutDaemon] Thermal spike detected. Yielding foreground via maxWorkers=0.');
          // Save original config if not already yielding
          if (!this.originalMaxWorkers) this.originalMaxWorkers = systemConfig.maxWorkers;
          systemConfig.maxWorkers = 0; // Suspend coreexec engine
        } else if (this.originalMaxWorkers !== undefined && temp.main < 75) {
          console.log('[ScoutDaemon] Thermals recovered. Restoring worker config.');
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
  console.log('[ScoutDaemon] System is idle. Triggering autonomous maintenance...');
  try {
    const runId = crypto.randomUUID();
    
    // A synthetic DAG layout for maintenance
    const dagLayout = {
      nodes: [
        { id: crypto.randomUUID(), dependencies: [] } // e.g., "Knowledge Graph Pruning"
      ]
    };

    db.prepare('INSERT INTO workflow_runs (id, project_id, dag_layout, status, created_at) VALUES (?, ?, ?, ?, ?)').run(
      runId, 'system-maintenance', JSON.stringify(dagLayout), 'pending', Date.now()
    );

    const insertTask = db.prepare('INSERT INTO tasks (id, run_id, status) VALUES (?, ?, ?)');
    for (const node of dagLayout.nodes) {
      insertTask.run(node.id, runId, 'unclaimed');
    }

    executeRun(runId).catch(err => console.error('[ScoutDaemon] Maintenance failed:', err));
  } catch (err) {
    console.error('[ScoutDaemon] Failed to trigger maintenance:', err);
  }

  // During idle, review pending scout drafts and log their count
  try {
    const pendingDrafts = ScoutResearch.listDrafts();
    if (pendingDrafts.length > 0) {
      console.log(`[ScoutDaemon] ${pendingDrafts.length} scout draft(s) pending review.`);
    }
  } catch (err) {
    console.error('[ScoutDaemon] Failed to check scout drafts:', err);
  }
});
