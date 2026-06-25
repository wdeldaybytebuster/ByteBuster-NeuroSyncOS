import { db } from '../basevault/db';
import crypto from 'crypto';

/**
 * Creates a project, run, and initial tasks. Useful for tests and initialization.
 */
export function createRunAndTasks(projectId: string, taskCount: number) {
  const runId = crypto.randomUUID();
  const taskIds: string[] = [];
  
  const insertSetup = db.transaction(() => {
    // Insert dummy project if not exists
    db.prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
      projectId,
      `Project ${projectId}`,
      Date.now()
    );

    // Create workflow run
    db.prepare(`
      INSERT INTO workflow_runs (id, project_id, dag_layout, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(runId, projectId, '{}', 'pending', Date.now());

    // Create tasks
    const insertTask = db.prepare(`
      INSERT INTO tasks (id, run_id, status, claim_lease, output_data)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < taskCount; i++) {
      const taskId = crypto.randomUUID();
      insertTask.run(taskId, runId, 'unclaimed', null, null);
      taskIds.push(taskId);
    }
  });

  insertSetup();
  return { runId, taskIds };
}

/**
 * Attempts to claim a task using a BEGIN IMMEDIATE transaction.
 * @param taskId The task to claim
 * @param leaseTime The epoch timestamp when the lease expires
 * @returns true if claimed, false if already claimed, completed, or failed
 */
export const claimTask = db.transaction((taskId: string, leaseTime: number): boolean => {
  const getTask = db.prepare('SELECT status, claim_lease FROM tasks WHERE id = ?');
  const task = getTask.get(taskId) as { status: string; claim_lease: number | null } | undefined;

  if (!task) {
    return false; // Task does not exist
  }

  // Can only claim unclaimed tasks, OR tasks whose lease has expired
  const isExpired = task.claim_lease !== null && task.claim_lease < Date.now();
  
  if (task.status === 'unclaimed' || (task.status === 'claimed' && isExpired)) {
    const update = db.prepare("UPDATE tasks SET status = 'claimed', claim_lease = ? WHERE id = ?");
    update.run(leaseTime, taskId);
    return true;
  }

  return false;
}).immediate;
