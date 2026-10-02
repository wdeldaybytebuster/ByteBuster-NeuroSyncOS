import { db } from '../basevault/db';
import { claimTask } from './queue';
import { scoutEmitter } from '../scoutdaemon/sse';
import { workerPool } from './worker-pool';
import { systemConfig, getClaimBatchSize } from './settings';
import { SensitiveDataRedactor, DataTier } from '../basevault/redactor';
import { WorktreeIsolation } from './worktree';
import { classifyDirective } from './dispatch';
import { log } from '../observability/logger';
import type { WorkerOutput } from './worker';

/**
 * Main-thread LLM generator injected from server/index.ts (closure over the live
 * RouteSwitchEngine). Mirrors the same injection pattern already used for Cerebro
 * (`injectLLMGenerator`), OKF (`injectOKFGenerateFn`) and ScopeLogic
 * (`injectScopeLogicGenerateFn`). A `'generic'`-classified DAG task cannot reach a
 * live RouteSwitch/provider/keys from inside a poolifier worker thread (each worker
 * has its own private ':memory:' DB and no shared singletons), so generic tasks are
 * executed here on the main thread instead of the worker pool. Null until wired.
 */
type CoreExecGenerateFn = (prompt: string) => Promise<string>;
let _coreExecGenerateFn: CoreExecGenerateFn | null = null;

/**
 * Inject the main-thread LLM generate function used for `'generic'` DAG tasks.
 * Accepts `null` to explicitly clear the wiring (used by tests to exercise the
 * unwired degradation path).
 */
export function injectCoreExecGenerateFn(fn: CoreExecGenerateFn | null): void {
  _coreExecGenerateFn = fn;
}

export interface DAGNode {
  id: string;
  dependencies: string[];
}

/** §2.1 — Extended DAG node shape carrying the prompt that drives worker dispatch. */
export interface PromptedDAGNode extends DAGNode {
  prompt: string;
}

export interface DAGLayout {
  nodes: DAGNode[];
}

let isDispatching = false;
let dispatchQueued = false;
let globalLeaseTimer: NodeJS.Timeout | null = null;
const runResolvers = new Map<string, (val: boolean) => void>();

export function triggerDispatch() {
  if (isDispatching) {
    dispatchQueued = true;
    return;
  }
  isDispatching = true;
  Promise.resolve().then(async () => {
    do {
      dispatchQueued = false;
      await dispatchLoop().catch(err => log.error('[CoreExec] Dispatch Loop Error:', err));
    } while (dispatchQueued);
  }).finally(() => {
    isDispatching = false;
  });
}

/**
 * Execute a DAG workflow run.
 * Under Dual-Track Scheduling, this acts as a gateway that queues the run and wakes up the global dispatcher.
 * @param runId The ID of the workflow run
 */
export function executeRun(
  runId: string
): Promise<boolean> {
  const run = db.prepare('SELECT status FROM workflow_runs WHERE id = ?').get(runId) as { status: string } | undefined;
  if (!run || (run.status !== 'pending' && run.status !== 'running')) {
    return Promise.resolve(false);
  }
  
  return new Promise((resolve) => {
    runResolvers.set(runId, resolve);
    triggerDispatch();
  });
}

function getEnvironmentMaxWorkers(): number {
  try {
    const row = db.prepare("SELECT rule_value FROM environment_rules WHERE rule_key = 'max_workers' ORDER BY created_at DESC LIMIT 1").get() as { rule_value: string } | undefined;
    if (row && row.rule_value) {
      const parsed = parseInt(row.rule_value, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch (err) {
    // Ignore db errors, use fallback
  }
  return 3;
}

async function dispatchLoop() {
  const timeoutMs = 5 * 60 * 1000; // 5 minute lease
  const batchLimit = getClaimBatchSize();

  // Circuit Breaker: Evaluate recent failure rate (last 15 minutes)
  const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
  const recentRuns = db.prepare(`
    SELECT status, count(*) as count 
    FROM workflow_runs 
    WHERE completed_at > ? 
    GROUP BY status
  `).all(fifteenMinutesAgo) as { status: string, count: number }[];

  let completedCount = 0;
  let failedCount = 0;
  for (const row of recentRuns) {
    if (row.status === 'completed') completedCount += row.count;
    if (row.status === 'failed') failedCount += row.count;
  }

  const totalFinished = completedCount + failedCount;
  if (totalFinished > 0) {
    const failureRate = failedCount / totalFinished;
    if (failureRate > 0.4) {
      log.warn(`[CoreExec] CIRCUIT BREAKER TRIGGERED: Failure rate ${failureRate.toFixed(2)} exceeds 0.4 threshold. Pausing dispatch.`);
      scoutEmitter.emit('alert', { message: 'Circuit Breaker triggered. High failure rate.' });
      return; // Return early
    }
  }
  
  const runs = db.prepare("SELECT id, track, dag_layout, status, project_id FROM workflow_runs WHERE status IN ('pending', 'running')").all() as any[];
  if (runs.length === 0) return;
  
  // Track A (User/Interactive - e.g., 'track1') takes precedence over Track B (Background - e.g., 'track2')
  runs.sort((a, b) => (a.track || 'track2').localeCompare(b.track || 'track2'));

  let hasClaimedTasksGlobal = false;
  let trackANeedsSlots = false;

  for (const run of runs) {
    const isTrackA = (run.track || 'track2') === 'track1';

    if (run.status === 'pending') {
      db.prepare("UPDATE workflow_runs SET status = 'running' WHERE id = ?").run(run.id);
      scoutEmitter.emit('update', { type: 'RUN_STATUS', runId: run.id, status: 'running' });
      run.status = 'running';
      
      const worktreePath = run.project_id ? WorktreeIsolation.createRunWorktree(run.project_id, run.id) : null;
      if (worktreePath) {
        log.info(`[CoreExec] Worktree created for run ${run.id}: ${worktreePath}`);
      }
    }

    const layout = JSON.parse(run.dag_layout);
    const tasks = db.prepare('SELECT id, status, claim_lease FROM tasks WHERE run_id = ?').all(run.id) as any[];
    const completedTaskIds = new Set(tasks.filter(t => t.status === 'completed').map(t => t.id));
    const failedTaskIds = new Set(tasks.filter(t => t.status === 'failed').map(t => t.id));

    if (failedTaskIds.size > 0) {
      db.prepare("UPDATE workflow_runs SET status = 'failed', completed_at = ? WHERE id = ?").run(Date.now(), run.id);
      scoutEmitter.emit('update', { type: 'RUN_STATUS', runId: run.id, status: 'failed' });
      const resolve = runResolvers.get(run.id);
      if (resolve) { resolve(false); runResolvers.delete(run.id); }
      continue;
    }

    if (completedTaskIds.size === layout.nodes.length) {
      db.prepare("UPDATE workflow_runs SET status = 'completed', completed_at = ? WHERE id = ?").run(Date.now(), run.id);
      scoutEmitter.emit('update', { type: 'RUN_STATUS', runId: run.id, status: 'completed' });
      const resolve = runResolvers.get(run.id);
      if (resolve) { resolve(true); runResolvers.delete(run.id); }
      continue;
    }

    const eligibleTasks = layout.nodes.filter((node: any) => {
      const taskObj = tasks.find(t => t.id === node.id);
      if (!taskObj) return false;
      const isUnclaimed = taskObj.status === 'unclaimed';
      const isExpired = taskObj.status === 'claimed' && taskObj.claim_lease !== null && taskObj.claim_lease < Date.now();
      if (!isUnclaimed && !isExpired) return false;
      return (node.dependencies || []).every((depId: string) => completedTaskIds.has(depId));
    });

    if (eligibleTasks.length === 0) {
      const claimedTasks = tasks.filter(t => t.status === 'claimed');
      if (claimedTasks.length > 0) {
        hasClaimedTasksGlobal = true;
      } else {
        const parkedTasks = tasks.filter(t => t.status === 'parked');
        if (parkedTasks.length > 0) {
          db.prepare("UPDATE workflow_runs SET status = 'parked' WHERE id = ?").run(run.id);
          const resolve = runResolvers.get(run.id);
          if (resolve) { resolve(false); runResolvers.delete(run.id); }
        } else {
          db.prepare("UPDATE workflow_runs SET status = 'failed', completed_at = ? WHERE id = ?").run(Date.now(), run.id);
          const resolve = runResolvers.get(run.id);
          if (resolve) { resolve(false); runResolvers.delete(run.id); }
        }
      }
      continue;
    }

    // Defer spawning Track B if Track A is pending/running and needs slots
    if (!isTrackA && trackANeedsSlots) {
      continue;
    }

    const envMaxWorkers = getEnvironmentMaxWorkers();
    const availableSlots = Math.max(0, envMaxWorkers - workerPool.info.executingTasks);
    if (availableSlots === 0) {
      if (isTrackA) trackANeedsSlots = true;
      hasClaimedTasksGlobal = true;
      continue; // Move to next run, but effectively we are full since workers are saturated
    }

    const tasksToDispatch = eligibleTasks.slice(0, Math.min(availableSlots, batchLimit));
    
    // If we dispatched fewer tasks than are eligible, and this is Track A, it still needs slots for the rest
    if (isTrackA && tasksToDispatch.length < eligibleTasks.length) {
      trackANeedsSlots = true;
    }
    
    for (const node of tasksToDispatch) {
      const claimed = claimTask(node.id, Date.now() + timeoutMs);
      if (!claimed) continue;
      
      hasClaimedTasksGlobal = true;
      scoutEmitter.emit('update', { type: 'TASK_STATUS', runId: run.id, taskId: node.id, status: 'claimed' });
      
      const prompt = node.prompt ?? '';
      
      // Async IIFE execution for the task to avoid blocking the dispatch loop
      (async () => {
        const parkTask = (errorMsg: string) => {
          const taskRow = db.prepare('SELECT retry_count FROM tasks WHERE id = ?').get(node.id) as { retry_count: number } | undefined;
          const retryCount = taskRow?.retry_count || 0;

          if (retryCount < 3) {
            db.prepare("UPDATE tasks SET status = 'unclaimed', claim_lease = NULL, retry_count = retry_count + 1 WHERE id = ?").run(node.id);
            scoutEmitter.emit('update', { type: 'TASK_STATUS', runId: run.id, taskId: node.id, status: 'unclaimed', retryCount: retryCount + 1, error: errorMsg });
            triggerDispatch();
            return;
          }

          const redactedErrorMsg = SensitiveDataRedactor.redact(errorMsg, DataTier.INTERNAL);
          const updateTask = db.prepare("UPDATE tasks SET status = 'parked', output_data = ? WHERE id = ?");
          updateTask.run(JSON.stringify({ error: redactedErrorMsg }), node.id);

          const todoId = crypto.randomUUID();
          const insertTodo = db.prepare("INSERT INTO os_todos (id, dag_node_id, source_module, context_payload, severity, escalation_reason, required_action_type, status, created_at, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
          // Escalations use confidence 0.0 to guarantee hitting Deference UI threshold
          insertTodo.run(todoId, node.id, 'CoreExec', JSON.stringify({ error: errorMsg, runId: run.id, taskId: node.id }), 'HIGH', errorMsg, 'LLM_RETRY_OR_FIX', 'open', Date.now(), 0.0);

          scoutEmitter.emit('update', { type: 'TASK_STATUS', runId: run.id, taskId: node.id, status: 'parked', error: errorMsg });
          triggerDispatch();
        };

        try {
          const directive = classifyDirective(prompt);
          const isLLMGeneric = directive.action === 'generic' && prompt.trim() !== '';

          let result: WorkerOutput;
          if (isLLMGeneric) {
            if (!_coreExecGenerateFn) {
              throw new Error('CoreExec generateFn not injected — cannot execute generic LLM task');
            }
            const content = await _coreExecGenerateFn(prompt);
            result = {
              status: 'success', action: 'generic',
              taskId: node.id,
              stdout: undefined, stderr: undefined,
              markdown: undefined, pageMetadata: undefined,
              message: content, prompt, data: undefined, error: undefined,
              reason: directive.reason,
            };
          } else {
            result = await workerPool.execute({
              taskId: node.id,
              prompt,
              directive,
            }) as WorkerOutput;

            if (result && typeof result === 'object' && result.status === 'error') {
              const reason = result.error ?? result.reason ?? 'Worker returned an error envelope';
              parkTask(reason);
              return;
            }
          }

          const redactedResult = SensitiveDataRedactor.redactObject(result, DataTier.INTERNAL);
          const updateTask = db.prepare("UPDATE tasks SET status = 'completed', output_data = ? WHERE id = ?");
          updateTask.run(JSON.stringify(redactedResult), node.id);
          scoutEmitter.emit('update', { type: 'TASK_STATUS', runId: run.id, taskId: node.id, status: 'completed', output: redactedResult });
          triggerDispatch();
        } catch (error) {
          parkTask(String(error));
        }
      })();
    }
  }

  // Fallback watchdog lease check
  if (globalLeaseTimer) {
    clearTimeout(globalLeaseTimer);
    globalLeaseTimer = null;
  }
  if (hasClaimedTasksGlobal) {
    globalLeaseTimer = setTimeout(triggerDispatch, 5000);
  }
}

/**
 * Boot-time crash recovery ("resumes from the last completed step").
 *
 * Nothing calls executeRun again after a hard crash, so any run left at
 * status='running' (crashed mid-flight) or status='pending' (crashed between
 * the workflow_runs INSERT and its first executeRun call ever firing) sits
 * stuck forever with no automatic recovery. Called once from server boot
 * (see server/index.ts, next to initDB/initScheduler), this finds those runs
 * and re-drives each through the SAME idempotent executeRun loop.
 *
 * executeRun is already task-state-driven: on re-entry it re-reads live task
 * state, recognises tasks already 'completed' and never re-runs them, waits
 * out any still-valid claim lease on a genuinely in-flight task, then continues
 * dispatching whatever is left. So simply calling it again is a correct resume
 * — this is pure infrastructure resilience, it starts NO new AI-initiated work.
 *
 * Fire-and-forget with a per-run .catch() (mirrors coreexec-router.ts's retry
 * handler) so one bad run can't take down boot; returns the number of runs
 * found so the caller can log/observe it. Exported for unit testing.
 */
export function resumeInProgressRuns(): number {
  const staleRuns = db
    .prepare("SELECT id FROM workflow_runs WHERE status IN ('running', 'pending')")
    .all() as { id: string }[];

  if (staleRuns.length === 0) {
    log.info('[CoreExec] Boot resume: no in-progress (running/pending) runs to resume.');
    return 0;
  }

  log.info(
    `[CoreExec] Boot resume: found ${staleRuns.length} in-progress run(s) after restart; resuming from last completed step.`,
  );
  for (const { id } of staleRuns) {
    log.info(`[CoreExec] Boot resume: re-driving run ${id}.`);
    executeRun(id).catch((err) => log.error(`[CoreExec] Boot resume failed for run ${id}:`, err));
  }
  return staleRuns.length;
}
