import cron, { ScheduledTask } from 'node-cron';
import { db } from '../basevault/db';
import { sweepOrphanedWorkspaces } from './memory-sweep';
import crypto from 'crypto';
import { executeRun } from './engine';
import { validateDAGTemplate, escalateBlockedDAGToOsTodos } from './validateDAG';

const activeJobs = new Map<string, ScheduledTask>();

// Module-level handles
let refreshInterval: NodeJS.Timeout | null = null;
let reflectionInterval: NodeJS.Timeout | null = null;
let reflectionWorker: import('worker_threads').Worker | null = null;

/**
 * Test-only helper: clears the periodic refresh interval and stops every
 * active cron job. Production code does NOT need to call this — the process
 * lifecycle owns the interval until SIGINT.
 */
export function _stopSchedulerLoopForTests(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
  if (reflectionInterval) {
    clearInterval(reflectionInterval);
    reflectionInterval = null;
  }
  if (reflectionWorker) {
    reflectionWorker.terminate();
    reflectionWorker = null;
  }
  for (const job of activeJobs.values()) {
    job.stop();
  }
  activeJobs.clear();
}

export function initScheduler() {
  console.log('[CoreExec] Initializing Cron Scheduler...');
  sweepOrphanedWorkspaces();
  refreshJobs();

  // Periodically refresh jobs from DB to catch new/updated schedules.
  refreshInterval = setInterval(refreshJobs, 60000);

  // Initialize background reflection worker
  try {
    const { Worker } = require('worker_threads');
    const path = require('path');
    const workerPath = path.join(__dirname, '../basevault/reflection-worker.ts');
    
    // We use execArgv to allow tsx/ts-node to run the typescript worker if needed
    // Usually the main process is already spawned with tsx in this project.
    reflectionWorker = new Worker(workerPath);
    
    reflectionWorker?.on('message', (msg) => {
      if (msg.type === 'reflection_done') {
        console.log(`[CoreExec] Reflection cycle complete. Pruned ${msg.pruned} memories.`);
      } else if (msg.type === 'reflection_error') {
        console.error(`[CoreExec] Reflection cycle failed: ${msg.error}`);
      }
    });

    reflectionWorker?.on('error', (err) => {
      console.error('[CoreExec] Reflection worker encountered an error:', err);
    });

    // Run every 10 minutes
    reflectionInterval = setInterval(() => {
      reflectionWorker?.postMessage({ type: 'run_reflection' });
    }, 10 * 60 * 1000);
    
    // Trigger initial run
    reflectionWorker?.postMessage({ type: 'run_reflection' });
  } catch (err) {
    console.error('[CoreExec] Failed to initialize reflection worker:', err);
  }
}

/**
 * §3.4 — exported for direct unit-test invocation. Walks every workflow row
 * with a non-null cron_schedule. Each row is gated through `validateDAGTemplate`
 * before being scheduled; failures escalate via `escalateBlockedDAGToOsTodos`
 * and skip the workflow (other rows keep processing within the same refresh).
 *
 * Returns nothing — effects are side-effect-only via the DB and scout emitter.
 */
export function refreshJobs(): void {
  try {
    const workflows = db
      .prepare(
        'SELECT id, project_id, dag_template, cron_schedule FROM workflows WHERE cron_schedule IS NOT NULL',
      )
      .all() as any[];

    const currentIds = new Set(workflows.map((w) => w.id));

    // Cancel removed jobs
    for (const [id, job] of activeJobs.entries()) {
      if (!currentIds.has(id)) {
        job.stop();
        activeJobs.delete(id);
      }
    }

    // Add or ignore existing jobs
    for (const wf of workflows) {
      // §3.4 validator gate — runs BEFORE cron registration to ensure a
      // a malicious dag_template inserted directly into SQLite cannot be
      // turned into a live ScheduledTask even if cron.validate(expr) passes.
      const { error: validationError } = validateDAGTemplate(wf.dag_template);
      if (validationError) {
        // Drop any prior in-memory schedule for this row (so a previously-valid
        //  DB DAG that was edited to violate SA-07 is removed immediately).
        if (activeJobs.has(wf.id)) {
          activeJobs.get(wf.id)!.stop();
          activeJobs.delete(wf.id);
        }

        escalateBlockedDAGToOsTodos(wf.id, validationError, 'scheduler');

        console.error(
          `[CoreExec] DAG validation gate blocked workflow ${wf.id}: ${validationError}`,
        );
        continue;
      }

      if (!activeJobs.has(wf.id)) {
        if (cron.validate(wf.cron_schedule)) {
          const job = cron.schedule(wf.cron_schedule, () => triggerWorkflow(wf));
          activeJobs.set(wf.id, job);
          console.log(`[CoreExec] Scheduled workflow ${wf.id} with cron: ${wf.cron_schedule}`);
        } else {
          console.error(
            `[CoreExec] Invalid cron schedule for workflow ${wf.id}: ${wf.cron_schedule}`,
          );
        }
      }
    }
  } catch (error) {
    console.error('[CoreExec] Scheduler refresh error:', error);
  }
}

async function triggerWorkflow(wf: any) {
  try {
    const runId = crypto.randomUUID();
    const dagLayout = JSON.parse(wf.dag_template);

    db.prepare(
      'INSERT INTO workflow_runs (id, project_id, dag_layout, status, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(runId, wf.project_id, wf.dag_template, 'pending', Date.now());

    const insertTask = db.prepare('INSERT INTO tasks (id, run_id, status) VALUES (?, ?, ?)');
    for (const node of dagLayout.nodes) {
      insertTask.run(node.id, runId, 'unclaimed');
    }

    console.log(`[CoreExec] Triggered scheduled workflow run: ${runId}`);

    // Background execution
    executeRun(runId).catch((err) => console.error(`[CoreExec] Cron Run ${runId} failed:`, err));
  } catch (error) {
    console.error(`[CoreExec] Failed to trigger workflow ${wf.id}:`, error);
  }
}
