import { EventEmitter } from 'events';
import { db } from '../basevault/db';
import { stagePendingRun } from './stage-run';
import crypto from 'crypto';
import * as si from 'systeminformation';
import { ScoutResearch } from './research';
import { getActiveHardwareProfile } from './hardware-profiler';
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
          // C.4a — environment_rules.profile_id is NOT NULL and REFERENCES
          // hardware_profiles(id) (src/core/basevault/db.ts:718), so a rule row
          // CANNOT be written without attributing it to the active genesis
          // profile. Fetching the profile here also lets the read below be
          // scoped to it, instead of returning whatever historical row for the
          // key happens to be newest regardless of which profile wrote it.
          const activeProfile = getActiveHardwareProfile();
          if (!activeProfile) {
            // Genesis has not run yet — there is no profile to attach a rule
            // to and the NOT NULL/FK makes the write impossible. Refuse here
            // rather than letting it throw into the swallow-all catch below,
            // which is exactly how this path silently did nothing before.
            log.warn('[ScoutDaemon] No active hardware profile in BaseVault — cannot yield workers (environment_rules requires profile_id). Skipping thermal yield.');
          } else {
            // Save original config if not already yielding
            if (this.originalMaxWorkers === undefined) {
              try {
                const row = db.prepare("SELECT rule_value FROM environment_rules WHERE profile_id = ? AND rule_key = 'max_workers' ORDER BY created_at DESC LIMIT 1").get(activeProfile.id) as { rule_value: string } | undefined;
                this.originalMaxWorkers = row && row.rule_value ? parseInt(row.rule_value, 10) : 3;
              } catch (err) {
                this.originalMaxWorkers = 3;
              }
            }
            db.prepare("INSERT INTO environment_rules (id, profile_id, rule_key, rule_value, created_at) VALUES (?, ?, ?, ?, ?)").run(crypto.randomUUID(), activeProfile.id, 'max_workers', '0', Date.now());
          }
        } else if (this.originalMaxWorkers !== undefined && temp.main < 75) {
          log.info('[ScoutDaemon] Thermals recovered. Restoring worker config.');
          // C.4a — the restore write needs the same profile attribution, or it
          // hits the identical NOT NULL/FK failure as the yield write did.
          const activeProfile = getActiveHardwareProfile();
          if (activeProfile) {
            db.prepare("INSERT INTO environment_rules (id, profile_id, rule_key, rule_value, created_at) VALUES (?, ?, ?, ?, ?)").run(crypto.randomUUID(), activeProfile.id, 'max_workers', this.originalMaxWorkers.toString(), Date.now());
          }
          // C.4a — cleared unconditionally. Before the fix the restore INSERT
          // always threw, the outer catch swallowed it, and this delete never
          // ran, leaving originalMaxWorkers latched on forever.
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
  // P3-S9 — staged via the shared chokepoint (track 'track2' was previously
  // the implicit schema default; now explicit). Pure staging: the redundant
  // self-UPDATE to 'pending' is dropped — the row is born pending.
  const runId = stagePendingRun({
    projectId: 'system-maintenance',
    ensureProjectName: 'System Maintenance',
    // A synthetic DAG layout for maintenance, e.g. "Knowledge Graph Pruning"
    nodes: [{ id: crypto.randomUUID(), dependencies: [] }],
    track: 'track2',
    stagedEvent: 'MAINTENANCE_STAGED',
  });
  if (runId) {
    // ScoutDaemon boundary: ONLY a pending run is staged in BaseVault.
    // CoreExec's dispatchLoop watchdog (5s interval) picks it up organically.
    // ScoutDaemon must NEVER call executeRun directly — that crosses the
    // Watcher→Orchestrator module boundary. (stagePendingRun already emitted
    // MAINTENANCE_STAGED; log only here.)
    log.info(`[ScoutDaemon] Maintenance run ${runId} staged for CoreExec pickup.`);
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

  // P3-S9 — staged via the shared chokepoint (Track 2). Pure staging only.
  const runId = stagePendingRun({
    projectId: 'system-maintenance',
    ensureProjectName: 'System Maintenance',
    nodes: [
      {
        id: crypto.randomUUID(),
        plugin: 'okf_indexer',
        dependencies: [],
        params: { files: filesToProcess },
      },
    ],
    track: 'track2',
    stagedEvent: 'INDEXING_STAGED',
  });
  if (runId) {
    log.info(`[ScoutDaemon] Indexing run ${runId} staged for CoreExec pickup (Track 2).`);
  }
}

idleDetector.on('indexing_idle', () => {
  if (indexingQueue.length > 0) {
    log.info(`[ScoutDaemon] System idle for 30s.`);
    flushIndexingQueue();
  }
});
