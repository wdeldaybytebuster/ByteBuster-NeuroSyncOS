import { db } from '../basevault/db';
import { scoutEmitter } from './sse';
import { log } from '../observability/logger';
import crypto from 'crypto';

/**
 * P3-S9 — ScoutDaemon's single run-staging chokepoint.
 *
 * Unifies the three previously copy-pasted "stage a pending run" blocks:
 *   - idle.ts `idle` handler (maintenance DAG, system-maintenance project),
 *   - idle.ts `flushIndexingQueue` (okf_indexer DAG, system-maintenance),
 *   - genesis.ts `bootstrapSkills` (skill_evaluator DAG, caller project).
 *
 * P8-1 module boundary: this helper stages `pending` rows in BaseVault ONLY.
 * CoreExec's dispatchLoop watchdog picks them up organically. It must NEVER
 * call `executeRun` — staging is the Watcher's whole job; execution belongs
 * to CoreExec.
 *
 * `track` is REQUIRED (no default): every staging site must declare its lane
 * explicitly. (The schema default is 'track2' — previously the maintenance
 * handler relied on it implicitly by omitting the column; now it says so.)
 *
 * Divergence note: genesis.ts intentionally passes NO `ensureProjectName` —
 * the caller owns that project's lifecycle, and a missing project surfaces
 * as an FK failure (logged, null returned) exactly as before. The two
 * system-maintenance sites pass `ensureProjectName` to preserve their
 * INSERT OR IGNORE project bootstrap (the FK fix idle.test.ts pins).
 */
export interface StagedNode {
  id: string;
  dependencies?: unknown[];
  plugin?: string;
  params?: unknown;
}

export interface StagePendingRunOpts {
  /** workflow_runs.project_id. */
  projectId: string;
  /** When present, INSERT OR IGNOREs the projects bootstrap row first. */
  ensureProjectName?: string;
  /** One `unclaimed` tasks row is inserted per node. */
  nodes: StagedNode[];
  /** Dispatch lane — REQUIRED, no default. */
  track: string;
  /** scoutEmitter event type, e.g. 'MAINTENANCE_STAGED'. */
  stagedEvent: string;
  /** Extra fields merged into the emitted event (e.g. genesis's projectId). */
  eventExtra?: Record<string, unknown>;
}

/** Stage a pending run + its unclaimed tasks; returns runId, or null on failure. */
export function stagePendingRun(opts: StagePendingRunOpts): string | null {
  try {
    const runId = crypto.randomUUID();
    const dagLayout = {
      nodes: opts.nodes.map((n) => ({
        id: n.id,
        dependencies: n.dependencies ?? [],
        ...(n.plugin !== undefined ? { plugin: n.plugin } : {}),
        ...(n.params !== undefined ? { params: n.params } : {}),
      })),
    };

    db.transaction(() => {
      if (opts.ensureProjectName !== undefined) {
        db.prepare(
          'INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)',
        ).run(opts.projectId, opts.ensureProjectName, Date.now());
      }

      db.prepare(
        'INSERT INTO workflow_runs (id, project_id, dag_layout, status, created_at, track) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(runId, opts.projectId, JSON.stringify(dagLayout), 'pending', Date.now(), opts.track);

      const insertTask = db.prepare('INSERT INTO tasks (id, run_id, status) VALUES (?, ?, ?)');
      for (const node of opts.nodes) {
        insertTask.run(node.id, runId, 'unclaimed');
      }
    })();

    scoutEmitter.emit('update', {
      type: opts.stagedEvent,
      runId,
      timestamp: Date.now(),
      ...(opts.eventExtra ?? {}),
    });
    return runId;
  } catch (err) {
    log.error(`[ScoutDaemon] Failed to stage ${opts.stagedEvent} run:`, err);
    return null;
  }
}
