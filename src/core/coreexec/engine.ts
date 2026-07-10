import { db } from '../basevault/db';
import { claimTask } from './queue';
import { scoutEmitter } from '../scoutdaemon/sse';
import { workerPool } from './worker-pool';
import { systemConfig } from '../../server/routes/system';
import { getClaimBatchSize } from './settings';
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

/**
 * Execute a DAG workflow run.
 * @param runId The ID of the workflow run
 */
export async function executeRun(
  runId: string
): Promise<boolean> {
  // Update run status to running
  db.prepare("UPDATE workflow_runs SET status = 'running' WHERE id = ? AND status = 'pending'").run(runId);
  scoutEmitter.emit('update', { type: 'RUN_STATUS', runId, status: 'running' });

  const getRun = db.prepare('SELECT dag_layout, status FROM workflow_runs WHERE id = ?');
  const run = getRun.get(runId) as { dag_layout: string; status: string } | undefined;
  
  if (!run || (run.status !== 'running' && run.status !== 'pending')) {
    return false;
  }

  const layout: { nodes: PromptedDAGNode[] } = JSON.parse(run.dag_layout);
  const getTasks = db.prepare('SELECT id, status, claim_lease FROM tasks WHERE run_id = ?');

  // Create an isolated .nexus_worktrees/<runId> directory if the project has a root path.
  // All AI-drafted file mutations go here instead of the user's primary codebase.
  const runRow = db.prepare('SELECT project_id FROM workflow_runs WHERE id = ?').get(runId) as { project_id: string } | undefined;
  const worktreePath = runRow?.project_id ? WorktreeIsolation.createRunWorktree(runRow.project_id, runId) : null;
  if (worktreePath) {
    console.log(`[CoreExec] Worktree created for run ${runId}: ${worktreePath}`);
  }
  
  let allCompleted = false;
  const timeoutMs = 5 * 60 * 1000; // 5 minute lease

  while (!allCompleted) {
    const tasks = getTasks.all(runId) as { id: string; status: string; claim_lease: number | null }[];
    const completedTaskIds = new Set(tasks.filter(t => t.status === 'completed').map(t => t.id));
    const failedTaskIds = new Set(tasks.filter(t => t.status === 'failed').map(t => t.id));

    if (failedTaskIds.size > 0) {
      db.prepare("UPDATE workflow_runs SET status = 'failed', completed_at = ? WHERE id = ?").run(Date.now(), runId);
      scoutEmitter.emit('update', { type: 'RUN_STATUS', runId, status: 'failed' });
      return false; // Run fails if any task fails
    }

    if (completedTaskIds.size === layout.nodes.length) {
      allCompleted = true;
      break;
    }

    // Find eligible tasks: unclaimed tasks (or expired claimed tasks) whose dependencies are fully completed
    const eligibleTasks = layout.nodes.filter(node => {
      const taskObj = tasks.find(t => t.id === node.id);
      if (!taskObj) return false;
      
      const isUnclaimed = taskObj.status === 'unclaimed';
      const isExpired = taskObj.status === 'claimed' && taskObj.claim_lease !== null && taskObj.claim_lease < Date.now();

      if (!isUnclaimed && !isExpired) return false;
      
      return node.dependencies.every(depId => completedTaskIds.has(depId));
    });

    if (eligibleTasks.length === 0) {
      // Check if any tasks are currently 'claimed' but not completed.
      // If there are, we might just need to wait for them to finish (or timeout).
      const claimedTasks = tasks.filter(t => t.status === 'claimed');
      if (claimedTasks.length === 0) {
        const parkedTasks = tasks.filter(t => t.status === 'parked');
        if (parkedTasks.length > 0) {
          db.prepare("UPDATE workflow_runs SET status = 'parked' WHERE id = ?").run(runId);
          return false;
        }

        // Deadlock or disconnected DAG
        db.prepare("UPDATE workflow_runs SET status = 'failed', completed_at = ? WHERE id = ?").run(Date.now(), runId);
        return false;
      }
      
      // Artificial delay to prevent tight spin loops while waiting for async task completion
      await new Promise(resolve => setTimeout(resolve, 50));
      continue;
    }

    // Throttle execution based on Governor UI
    const availableSlots = Math.max(0, systemConfig.maxWorkers - workerPool.info.executingTasks);
    if (availableSlots === 0) {
      await new Promise(resolve => setTimeout(resolve, 50));
      continue;
    }
    // §Task-3 — UnifiedMasterDashboard's "Claim Batch Size" setting: an
    // additional, independent cap on how many eligible tasks get claimed per
    // dispatch tick, separate from availableSlots (worker-pool headroom).
    // Read fresh every tick (getClaimBatchSize()) so a saved change takes
    // effect on the very next iteration. Defaults to unbounded, reproducing
    // the pre-existing behavior of dispatching every available slot.
    const batchLimit = getClaimBatchSize();
    const tasksToDispatch = eligibleTasks.slice(0, Math.min(availableSlots, batchLimit));

    // Execute eligible tasks in parallel via worker pool
    const promises = tasksToDispatch.map(async (node) => {
      const claimed = claimTask(node.id, Date.now() + timeoutMs);
      if (!claimed) return; // someone else claimed it

      scoutEmitter.emit('update', { type: 'TASK_STATUS', runId, taskId: node.id, status: 'claimed' });

      const parkTask = (errorMsg: string) => {
        const redactedErrorMsg = SensitiveDataRedactor.redact(errorMsg, DataTier.INTERNAL);
        const updateTask = db.prepare("UPDATE tasks SET status = 'parked', output_data = ? WHERE id = ?");
        updateTask.run(JSON.stringify({ error: redactedErrorMsg }), node.id);

        const todoId = crypto.randomUUID();
        const insertTodo = db.prepare("INSERT INTO os_todos (id, dag_node_id, severity, escalation_reason, required_action_type, status, created_at, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        // Hard failure (thrown, or a worker-internal error envelope such as a
        // permission-gate block) — not an AI confidence judgment. Always below
        // the 0.70 threshold, always needs a human look.
        insertTodo.run(todoId, node.id, 'HIGH', errorMsg, 'LLM_RETRY_OR_FIX', 'open', Date.now(), 0.0);

        scoutEmitter.emit('update', { type: 'TASK_STATUS', runId, taskId: node.id, status: 'parked', error: errorMsg });
      };

      try {
        // §2.1 — classify the prompt on the MAIN THREAD so we can decide where it
        // runs before touching the worker pool.
        //   - shell | scrape → worker pool (CPU/IO-isolated sandbox & scraper),
        //     passing the already-computed directive so the worker skips re-classifying.
        //   - generic (non-empty NL prompt, e.g. "summarize the findings") → the
        //     injected main-thread LLM. Worker threads have no live RouteSwitch /
        //     provider registry / decrypted keys, so the real completion must happen
        //     here. This replaces the old worker "metadata echo" no-op that silently
        //     "completed" real DAG tasks without doing any work.
        //   - generic with an EMPTY / whitespace prompt is the legacy / pre-Phase-7
        //     backward-compat path (nothing to send an LLM) → keep the worker's
        //     metadata-echo behaviour unchanged.
        const prompt = node.prompt ?? '';
        const directive = classifyDirective(prompt);
        const isLLMGeneric = directive.action === 'generic' && prompt.trim() !== '';

        let result: WorkerOutput;
        if (isLLMGeneric) {
          if (!_coreExecGenerateFn) {
            // Not wired (early boot / test harness w/o injector). Degrade exactly
            // like a worker failure below — never a disguised fake success.
            throw new Error('CoreExec generateFn not injected — cannot execute generic LLM task');
          }
          // Text-generation ONLY: the completion is stored as output_data for a human
          // to read. It is NOT given the ability to write files or run commands — that
          // stays strictly out of scope (AI actions remain draft-only).
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
          // Poolifier's pool isn't parameterised on our custom type (see worker.ts),
          // so execute() is typed `unknown`; the worker always returns a WorkerOutput.
          result = await workerPool.execute({
            taskId: node.id,
            prompt,
            directive,
          }) as WorkerOutput;

          // worker.ts catches its own internal failures (sandbox errors, scrape
          // errors, permission-gate blocks) and returns a { status: 'error' }
          // envelope rather than throwing — so a resolved promise here does NOT
          // mean success. Treat a returned error envelope exactly like a thrown
          // one: park the task and escalate, instead of silently recording it
          // as 'completed' with the error buried in output_data. (The
          // isLLMGeneric branch above doesn't need this check: it either
          // throws — caught below — or builds a status:'success' object itself.)
          if (result && typeof result === 'object' && result.status === 'error') {
            const reason = result.error ?? result.reason ?? 'Worker returned an error envelope';
            parkTask(reason);
            return;
          }
        }

        const redactedResult = SensitiveDataRedactor.redactObject(result, DataTier.INTERNAL);
        const updateTask = db.prepare("UPDATE tasks SET status = 'completed', output_data = ? WHERE id = ?");
        updateTask.run(JSON.stringify(redactedResult), node.id);
        scoutEmitter.emit('update', { type: 'TASK_STATUS', runId, taskId: node.id, status: 'completed', output: redactedResult });
      } catch (error) {
        parkTask(String(error));
      }
    });

    await Promise.all(promises);
  }

  db.prepare("UPDATE workflow_runs SET status = 'completed', completed_at = ? WHERE id = ?").run(Date.now(), runId);
  scoutEmitter.emit('update', { type: 'RUN_STATUS', runId, status: 'completed' });
  return true;
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
