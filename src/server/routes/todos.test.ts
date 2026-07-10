import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { db, initDB } from '../../core/basevault/db';
import { todosRouter, _resetDeferenceThresholdCache } from './todos';
import crypto from 'crypto';

beforeAll(() => {
  initDB();
});

async function post(path: string, body: any): Promise<{ status: number; data: any }> {
  const res = await todosRouter.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function get(path: string): Promise<{ status: number; data: any }> {
  const res = await todosRouter.request(path);
  return { status: res.status, data: await res.json() };
}

function seedTodo(confidence = 0.5): string {
  const id = crypto.randomUUID();
  const taskId = `test-task-${id}`;
  const runId = `test-run-${id}`;
  const projectId = `test-project-${id}`;

  db.prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
    projectId,
    'Todos Test Project',
    Date.now()
  );
  db.prepare(
    'INSERT INTO workflow_runs (id, project_id, dag_layout, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(runId, projectId, JSON.stringify({ nodes: [{ id: taskId }] }), 'parked', Date.now());
  db.prepare(
    'INSERT INTO tasks (id, run_id, status, claim_lease, output_data) VALUES (?, ?, ?, ?, ?)'
  ).run(taskId, runId, 'blocked', null, null);
  db.prepare(
    'INSERT INTO os_todos (id, dag_node_id, severity, escalation_reason, required_action_type, status, created_at, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, taskId, 'MEDIUM', 'Test escalation', 'APPROVE_PROPOSAL', 'open', Date.now(), confidence);

  return id;
}

describe('todosRouter /reject', () => {
  it('marks a single todo as rejected and it drops out of the open list', async () => {
    const todoId = seedTodo();

    const rejectRes = await post('/reject', { todoId });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.data.success).toBe(true);

    const row = db.prepare('SELECT status FROM os_todos WHERE id = ?').get(todoId) as any;
    expect(row.status).toBe('rejected');

    const listRes = await get('/');
    expect(listRes.data.todos.some((t: any) => t.id === todoId)).toBe(false);
  });

  it('does NOT unclaim the associated task or resume the parked run (unlike /resolve)', async () => {
    const todoId = seedTodo();
    const todoRow = db.prepare('SELECT dag_node_id FROM os_todos WHERE id = ?').get(todoId) as any;
    const taskRow = db.prepare('SELECT run_id FROM tasks WHERE id = ?').get(todoRow.dag_node_id) as any;

    await post('/reject', { todoId });

    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get(todoRow.dag_node_id) as any;
    expect(task.status).toBe('blocked');
    const run = db.prepare('SELECT status FROM workflow_runs WHERE id = ?').get(taskRow.run_id) as any;
    expect(run.status).toBe('parked');
  });

  it('returns 404 for an unknown todoId', async () => {
    const res = await post('/reject', { todoId: crypto.randomUUID() });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });
});

describe('todosRouter /resolve-bulk', () => {
  it('resolves a todo with confidence >= 0.70 and requeues its task', async () => {
    const todoId = seedTodo(0.85);
    const todoRow = db.prepare('SELECT dag_node_id FROM os_todos WHERE id = ?').get(todoId) as any;

    const res = await post('/resolve-bulk', { todoIds: [todoId] });
    expect(res.status).toBe(200);
    expect(res.data.resolved).toEqual([todoId]);
    expect(res.data.failed).toEqual([]);

    const row = db.prepare('SELECT status FROM os_todos WHERE id = ?').get(todoId) as any;
    expect(row.status).toBe('resolved');

    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get(todoRow.dag_node_id) as any;
    expect(task.status).toBe('unclaimed');
  });

  it('rejects a todo with confidence < 0.70 into failed and leaves it untouched', async () => {
    const todoId = seedTodo(0.4);
    const todoRow = db.prepare('SELECT dag_node_id FROM os_todos WHERE id = ?').get(todoId) as any;

    const res = await post('/resolve-bulk', { todoIds: [todoId] });
    expect(res.status).toBe(200);
    expect(res.data.resolved).toEqual([]);
    expect(res.data.failed).toHaveLength(1);
    expect(res.data.failed[0].id).toBe(todoId);

    const row = db.prepare('SELECT status FROM os_todos WHERE id = ?').get(todoId) as any;
    expect(row.status).toBe('open');

    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get(todoRow.dag_node_id) as any;
    expect(task.status).toBe('blocked');
  });

  it('resolves a todo with confidence exactly 0.70 (inclusive boundary)', async () => {
    const todoId = seedTodo(0.70);

    const res = await post('/resolve-bulk', { todoIds: [todoId] });
    expect(res.data.resolved).toEqual([todoId]);
    expect(res.data.failed).toEqual([]);

    const row = db.prepare('SELECT status FROM os_todos WHERE id = ?').get(todoId) as any;
    expect(row.status).toBe('resolved');
  });

  it('partitions a mixed batch: high-confidence resolved, low-confidence and missing failed, independently', async () => {
    const highId = seedTodo(0.9);
    const lowId = seedTodo(0.2);
    const missingId = crypto.randomUUID();

    const res = await post('/resolve-bulk', { todoIds: [highId, lowId, missingId] });
    expect(res.status).toBe(200);
    expect(res.data.resolved).toEqual([highId]);
    expect(res.data.failed.map((f: any) => f.id).sort()).toEqual([lowId, missingId].sort());

    const highRow = db.prepare('SELECT status FROM os_todos WHERE id = ?').get(highId) as any;
    expect(highRow.status).toBe('resolved');

    const lowRow = db.prepare('SELECT status FROM os_todos WHERE id = ?').get(lowId) as any;
    expect(lowRow.status).toBe('open');
  });
});

describe('todosRouter /resolve-bulk — Autonomy dial wiring', () => {
  const setAutonomy = (percent: number | null) => {
    if (percent === null) {
      db.prepare("DELETE FROM system_settings WHERE key = 'autonomy'").run();
    } else {
      db.prepare(
        "INSERT INTO system_settings (key, value) VALUES ('autonomy', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).run(String(percent));
    }
    _resetDeferenceThresholdCache();
  };

  afterEach(() => {
    setAutonomy(null);
  });

  it('with autonomy absent, behaves exactly like the old hardcoded 0.70 (0.65 confidence still fails)', async () => {
    setAutonomy(null);
    const todoId = seedTodo(0.65);
    const res = await post('/resolve-bulk', { todoIds: [todoId] });
    expect(res.data.resolved).toEqual([]);
    expect(res.data.failed).toHaveLength(1);
  });

  it('raising autonomy lowers the bar: a 0.65-confidence todo that failed at default now auto-resolves', async () => {
    // autonomy=50 -> threshold 1 - 0.5 = 0.5, so 0.65 clears it.
    setAutonomy(50);
    const todoId = seedTodo(0.65);
    const res = await post('/resolve-bulk', { todoIds: [todoId] });
    expect(res.data.resolved).toEqual([todoId]);
    expect(res.data.failed).toEqual([]);

    const row = db.prepare('SELECT status FROM os_todos WHERE id = ?').get(todoId) as any;
    expect(row.status).toBe('resolved');
  });

  it('lowering autonomy raises the bar: a 0.75-confidence todo that would auto-resolve by default now needs review', async () => {
    // autonomy=10 -> threshold 1 - 0.1 = 0.9, so 0.75 no longer clears it.
    setAutonomy(10);
    const todoId = seedTodo(0.75);
    const res = await post('/resolve-bulk', { todoIds: [todoId] });
    expect(res.data.resolved).toEqual([]);
    expect(res.data.failed).toHaveLength(1);
    expect(res.data.failed[0].error).toMatch(/below the 0\.9.* auto-approve threshold/);

    const row = db.prepare('SELECT status FROM os_todos WHERE id = ?').get(todoId) as any;
    expect(row.status).toBe('open');
  });
});

describe('todosRouter /reject-bulk', () => {
  it('rejects a batch of todos in one call, reporting resolved/failed separately', async () => {
    const id1 = seedTodo();
    const id2 = seedTodo();
    const missingId = crypto.randomUUID();

    const res = await post('/reject-bulk', { todoIds: [id1, id2, missingId] });
    expect(res.status).toBe(200);
    expect(res.data.rejected.sort()).toEqual([id1, id2].sort());
    expect(res.data.failed).toEqual([{ id: missingId, error: 'To-Do not found' }]);

    const row1 = db.prepare('SELECT status FROM os_todos WHERE id = ?').get(id1) as any;
    const row2 = db.prepare('SELECT status FROM os_todos WHERE id = ?').get(id2) as any;
    expect(row1.status).toBe('rejected');
    expect(row2.status).toBe('rejected');
  });

  it('rejects an empty/non-array todoIds with 400', async () => {
    const res = await post('/reject-bulk', { todoIds: [] });
    expect(res.status).toBe(400);
  });
});
