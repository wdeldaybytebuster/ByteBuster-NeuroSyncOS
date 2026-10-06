import { EventEmitter } from 'events';
import { db } from '../basevault/db';
import { scoutEmitter } from './sse';
import crypto from 'crypto';
import * as si from 'systeminformation';
import { ScoutResearch } from './research';
import { log } from '../observability/logger';

export class IdleDetector extends EventEmitter {
  private lastHeartbeat: number;
  private idleThresholdMs: number;
  private indexingFlushThresholdMs: number = 30 * 1000; // 30 seconds
  private checkInterval: NodeJS.Timeout | null = null;
  private isIdle: boolean = false;
  private isIndexingIdle: boolean = false;
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
          if (this.originalMaxWorkers === undefined) {
            try {
              const row = db.prepare("SELECT rule_value FROM environment_rules WHERE rule_key = 'max_workers' ORDER BY created_at DESC LIMIT 1").get() as { rule_value: string } | undefined;
              this.originalMaxWorkers = row && row.rule_value ? parseInt(row.rule_value, 10) : 3;
            } catch (err) {
              this.originalMaxWorkers = 3;
            }
          }
          db.prepare("INSERT INTO environment_rules (id, rule_key, rule_value, created_at) VALUES (?, ?, ?, ?)").run(crypto.randomUUID(), 'max_workers', '0', Date.now());
        } else if (this.originalMaxWorkers !== undefined && temp.main < 75) {
          log.info('[ScoutDaemon] Thermals recovered. Restoring worker config.');
          db.prepare("INSERT INTO environment_rules (id, rule_key, rule_value, created_at) VALUES (?, ?, ?, ?)").run(crypto.randomUUID(), 'max_workers', this.originalMaxWorkers.toString(), Date.now());
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

      if (now - this.lastHeartbeat > this.indexingFlushThresholdMs && !this.isIndexingIdle) {
        this.isIndexingIdle = true;
        this.emit('indexing_idle');
      } else if (now - this.lastHeartbeat <= this.indexingFlushThresholdMs && this.isIndexingIdle) {
        this.isIndexingIdle = false;
      }
    }, 10000); // check every 10 seconds
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

import { GitNexusParser } from './parser';
import { DBSync } from './db-sync';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

function scanDirectory(dir: string, fileList: string[] = []): string[] {
  try {
    const files = readdirSync(dir);
    for (const file of files) {
      const stat = statSync(path.join(dir, file));
      if (stat.isDirectory()) {
        scanDirectory(path.join(dir, file), fileList);
      } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        fileList.push(path.join(dir, file));
      }
    }
  } catch (e) {
    // ignore
  }
  return fileList;
}

// When idle, trigger the built-in system maintenance DAG
idleDetector.on('idle', async () => {
  log.info('[ScoutDaemon] System is idle. Triggering autonomous maintenance...');
  try {
    const runId = crypto.randomUUID();
    
    // A synthetic DAG layout for maintenance
    const dagLayout = {
      nodes: [
        { id: crypto.randomUUID(), dependencies: [] } // e.g., "Knowledge Graph Pruning"
      ]
    };

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

    // ScoutDaemon boundary: ONLY stage a pending run in BaseVault.
    // CoreExec's dispatchLoop watchdog (5s interval) picks it up organically.
    // ScoutDaemon must NEVER call executeRun directly — that crosses the
    // Watcher→Orchestrator module boundary.
    db.prepare("UPDATE workflow_runs SET status='pending' WHERE id=?").run(runId);
    scoutEmitter.emit('update', {
      type: 'MAINTENANCE_STAGED',
      runId,
      timestamp: Date.now(),
    });
    log.info(`[ScoutDaemon] Maintenance run ${runId} staged for CoreExec pickup.`);
  } catch (err) {
    log.error('[ScoutDaemon] Failed to stage maintenance run:', err);
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
  
  // AST Indexing background task
  try {
    log.info('[ScoutDaemon] Beginning AST indexing of local codebase...');
    const srcDir = path.resolve(__dirname, '../../');
    const files = scanDirectory(srcDir);
    const parser = new GitNexusParser();
    const dbSync = new DBSync(db);
    
    let allSymbols: any[] = [];
    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf8');
        const symbols = await parser.parseCodebase(content);
        symbols.forEach(s => s.file_path = file);
        allSymbols.push(...symbols);
      } catch (e) {
        // log.error(`[ScoutDaemon] Error parsing ${file}:`, e);
      }
    }
    
    if (allSymbols.length > 0) {
      await dbSync.insertSymbols(allSymbols);
      log.info(`[ScoutDaemon] AST indexing complete. Synced ${allSymbols.length} symbols across ${files.length} files.`);
    }
  } catch (err) {
    log.error('[ScoutDaemon] AST Indexing failed:', err);
  }
});

export const indexingQueue: string[] = [];

export function queueForIndexing(filePath: string) {
  if (!indexingQueue.includes(filePath)) {
    indexingQueue.push(filePath);
  }
}

export function flushIndexingQueue() {
  if (indexingQueue.length === 0) return;
  log.info(`[ScoutDaemon] Flushing ${indexingQueue.length} files to indexing queue in CoreExec...`);
  
  const filesToProcess = [...indexingQueue];
  indexingQueue.length = 0; // Clear queue
  
  try {
    const runId = crypto.randomUUID();
    const dagLayout = {
      nodes: [
        { 
          id: crypto.randomUUID(), 
          plugin: 'okf_indexer',
          dependencies: [],
          params: { files: filesToProcess }
        }
      ]
    };

    db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
        'system-maintenance', 'System Maintenance', Date.now()
      );

      db.prepare('INSERT INTO workflow_runs (id, project_id, dag_layout, status, created_at, track) VALUES (?, ?, ?, ?, ?, ?)').run(
        runId, 'system-maintenance', JSON.stringify(dagLayout), 'pending', Date.now(), 'track2'
      );

      const insertTask = db.prepare('INSERT INTO tasks (id, run_id, status) VALUES (?, ?, ?)');
      for (const node of dagLayout.nodes) {
        insertTask.run(node.id, runId, 'unclaimed');
      }
    })();

    scoutEmitter.emit('update', {
      type: 'INDEXING_STAGED',
      runId,
      timestamp: Date.now(),
    });
    log.info(`[ScoutDaemon] Indexing run ${runId} staged for CoreExec pickup (Track 2).`);
  } catch (err) {
    log.error('[ScoutDaemon] Failed to stage indexing run:', err);
  }
}

idleDetector.on('indexing_idle', () => {
  if (indexingQueue.length > 0) {
    log.info(`[ScoutDaemon] System idle for 30s.`);
    flushIndexingQueue();
  }
});
