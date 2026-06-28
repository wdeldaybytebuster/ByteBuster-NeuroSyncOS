import { Hono } from 'hono';
import { db } from '../../core/basevault/db';
import { SensitiveDataRedactor, DataTier } from '../../core/basevault/redactor';

export const todosRouter = new Hono();

todosRouter.get('/', async (c) => {
  try {
    const todos = db.prepare('SELECT * FROM os_todos WHERE status = ? ORDER BY created_at DESC').all('open');
    return c.json({ success: true, todos });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

todosRouter.post('/resolve', async (c) => {
  const body = await c.req.json();
  const { todoId, resolutionData } = body;

  try {
    db.transaction(() => {
      // 1. Mark todo as resolved
      const updateTodo = db.prepare("UPDATE os_todos SET status = 'resolved' WHERE id = ?");
      const info = updateTodo.run(todoId);
      
      if (info.changes === 0) throw new Error('To-Do not found');

      // 2. Find the associated task
      const todo = db.prepare('SELECT dag_node_id FROM os_todos WHERE id = ?').get(todoId) as any;
      if (todo) {
        // 3. Update task status back to unclaimed so the engine will re-queue it
        // We inject the resolutionData into the task's output_data so the worker has context on retry
        const redactedResolution = SensitiveDataRedactor.redactObject(resolutionData, DataTier.INTERNAL);
        const updateTask = db.prepare("UPDATE tasks SET status = 'unclaimed', output_data = ?, claim_lease = NULL WHERE id = ?");
        updateTask.run(JSON.stringify({ resolution: redactedResolution }), todo.dag_node_id);
        
        // 4. Update the parent workflow_run status from 'parked' to 'running'
        const task = db.prepare('SELECT run_id FROM tasks WHERE id = ?').get(todo.dag_node_id) as any;
        if (task) {
          db.prepare("UPDATE workflow_runs SET status = 'running' WHERE id = ? AND status = 'parked'").run(task.run_id);
        }
      }
    })();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Promote a ScoutDaemon discovery to the PortGrid HITL approval queue
todosRouter.post('/promote', async (c) => {
  const body = await c.req.json();
  const { fact, sourceId } = body;

  if (!fact) return c.json({ success: false, error: 'fact is required' }, 400);

  try {
    const id = require('crypto').randomUUID();
    // Create a sentinel task and os_todo so PortGrid's HITL queue surfaces it
    const sentinelTaskId = `promote-${id}`;
    const sentinelRunId = `scout-discovery-${id}`;
    const projectId = `scout-promote-${id}`;

    db.transaction(() => {
      // Insert sentinel project, run, and task to satisfy FK constraints
      db.prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(projectId, 'ScoutDaemon Discovery', Date.now());
      db.prepare('INSERT INTO workflow_runs (id, project_id, dag_layout, status, created_at) VALUES (?, ?, ?, ?, ?)').run(sentinelRunId, projectId, JSON.stringify({ nodes: [{ id: sentinelTaskId, prompt: fact }] }), 'pending', Date.now());
      db.prepare('INSERT INTO tasks (id, run_id, status, claim_lease, output_data) VALUES (?, ?, ?, ?, ?)').run(sentinelTaskId, sentinelRunId, 'unclaimed', null, null);
      db.prepare('INSERT INTO os_todos (id, dag_node_id, severity, escalation_reason, required_action_type, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        id, sentinelTaskId, 'MEDIUM', `ScoutDaemon Discovery: ${fact.substring(0, 120)}`, 'APPROVE_PROPOSAL', 'open', Date.now()
      );
    })();

    // If sourceId provided, mark the learning approval as handled
    if (sourceId) {
      db.prepare("UPDATE cerebro_learning_approvals SET status = 'promoted' WHERE id = ?").run(sourceId);
    }

    return c.json({ success: true, todoId: id });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});
