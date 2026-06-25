import { db } from '../basevault/db';
import { claimTask } from './queue';
import { scoutEmitter } from '../scoutdaemon/sse';
import { workerPool } from './worker-pool';
import { systemConfig } from '../../server/routes/system';
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
  
  let allCompleted = false;
  const timeoutMs = 5 * 60 * 1000; // 5 minute lease

  while (!allCompleted) {
    const tasks = getTasks.all(runId) as { id: string; status: string; claim_lease: number | null }[];
    const completedTaskIds = new Set(tasks.filter(t => t.status === 'completed').map(t => t.id));
    const failedTaskIds = new Set(tasks.filter(t => t.status === 'failed').map(t => t.id));

    if (failedTaskIds.size > 0) {
      db.prepare("UPDATE workflow_runs SET status = 'failed' WHERE id = ?").run(runId);
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
        db.prepare("UPDATE workflow_runs SET status = 'failed' WHERE id = ?").run(runId);
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
    const tasksToDispatch = eligibleTasks.slice(0, availableSlots);

    // Execute eligible tasks in parallel via worker pool
    const promises = tasksToDispatch.map(async (node) => {
      const claimed = claimTask(node.id, Date.now() + timeoutMs);
      if (!claimed) return; // someone else claimed it

      scoutEmitter.emit('update', { type: 'TASK_STATUS', runId, taskId: node.id, status: 'claimed' });

      try {
        // §2.1 — propagate the prompt through so worker.ts dispatch can
        // route shell | scrape | generic. Backward-compat path preserved
        // when prompt is missing (legacy tests / pre-Phase-7 DAGs).
        const result = await workerPool.execute({
          taskId: node.id,
          prompt: node.prompt ?? '',
        });
        const updateTask = db.prepare("UPDATE tasks SET status = 'completed', output_data = ? WHERE id = ?");
        updateTask.run(JSON.stringify(result), node.id);
        scoutEmitter.emit('update', { type: 'TASK_STATUS', runId, taskId: node.id, status: 'completed', output: result });
      } catch (error) {
        const errorMsg = String(error);
        const updateTask = db.prepare("UPDATE tasks SET status = 'parked', output_data = ? WHERE id = ?");
        updateTask.run(JSON.stringify({ error: errorMsg }), node.id);
        
        const todoId = crypto.randomUUID();
        const insertTodo = db.prepare("INSERT INTO os_todos (id, dag_node_id, severity, escalation_reason, required_action_type, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
        insertTodo.run(todoId, node.id, 'HIGH', errorMsg, 'LLM_RETRY_OR_FIX', 'open', Date.now());

        scoutEmitter.emit('update', { type: 'TASK_STATUS', runId, taskId: node.id, status: 'parked', error: errorMsg });
      }
    });

    await Promise.all(promises);
  }

  db.prepare("UPDATE workflow_runs SET status = 'completed' WHERE id = ?").run(runId);
  scoutEmitter.emit('update', { type: 'RUN_STATUS', runId, status: 'completed' });
  return true;
}
