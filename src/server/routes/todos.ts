import { Hono } from 'hono';
import { db } from '../../core/basevault/db';

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
        const updateTask = db.prepare("UPDATE tasks SET status = 'unclaimed', output_data = ?, claim_lease = NULL WHERE id = ?");
        updateTask.run(JSON.stringify({ resolution: resolutionData }), todo.dag_node_id);
        
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
