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

// Deference UI bulk-approve — resolves a batch of high-confidence (>=0.70 by
// default) todos in one transaction, mirroring /resolve's per-item logic for
// each id.
//
// The 0.70 default mirrors the CoreExec "Autonomy & Delegation" dial's own
// default of 30% (`src/ui/components/AutonomyDials.tsx`,
// `src/ui/lib/approvalQueue.ts`'s `autonomyToThreshold`): threshold = 1 -
// autonomy/100. This is a server-side trust boundary (a client could forward
// any threshold it likes), so it independently re-reads the same `autonomy`
// setting rather than trusting a client-supplied value — same duplication
// pattern as `DEFERENCE_THRESHOLD` in `approvalQueue.ts`. Cached with the same
// short-TTL pattern used for `free_mode_unlocked` in `governor.ts` so a UI
// change takes effect within a couple seconds without a DB hit per request.
const DEFAULT_DEFERENCE_THRESHOLD = 0.70;
const AUTONOMY_CACHE_TTL_MS = 2000;
let cachedDeferenceThreshold = DEFAULT_DEFERENCE_THRESHOLD;
let cachedAutonomyAt = 0;

function getDeferenceThreshold(): number {
  const now = Date.now();
  if (now - cachedAutonomyAt > AUTONOMY_CACHE_TTL_MS) {
    cachedAutonomyAt = now;
    try {
      const row = db
        .prepare("SELECT value FROM system_settings WHERE key = 'autonomy'")
        .get() as { value: string } | undefined;
      const autonomy = row ? Number(row.value) : NaN;
      if (Number.isFinite(autonomy)) {
        const clamped = Math.min(100, Math.max(0, autonomy));
        cachedDeferenceThreshold = 1 - clamped / 100;
      } else {
        cachedDeferenceThreshold = DEFAULT_DEFERENCE_THRESHOLD;
      }
    } catch {
      // DB not initialized yet, or table missing — safe default.
      cachedDeferenceThreshold = DEFAULT_DEFERENCE_THRESHOLD;
    }
  }
  return cachedDeferenceThreshold;
}

/** Test-only: force the autonomy cache to re-read on the next call. */
export function _resetDeferenceThresholdCache(): void {
  cachedAutonomyAt = 0;
}

todosRouter.post('/resolve-bulk', async (c) => {
  const body = await c.req.json();
  const { todoIds } = body;

  if (!Array.isArray(todoIds) || todoIds.length === 0) {
    return c.json({ success: false, error: 'todoIds must be a non-empty array' }, 400);
  }

  try {
    const resolved: string[] = [];
    const failed: { id: string; error: string }[] = [];
    // Read once per request so every item in this batch is judged against
    // the same threshold, even if the cache TTL happens to expire mid-loop.
    const deferenceThreshold = getDeferenceThreshold();

    db.transaction(() => {
      for (const todoId of todoIds) {
        try {
          const todo = db
            .prepare('SELECT dag_node_id, status, confidence FROM os_todos WHERE id = ?')
            .get(todoId) as any;

          if (!todo) {
            failed.push({ id: todoId, error: 'To-Do not found' });
            continue;
          }
          if (todo.status !== 'open') {
            failed.push({ id: todoId, error: `todo is not open (status: ${todo.status})` });
            continue;
          }
          const confidenceValue = todo.confidence;
          if (typeof confidenceValue !== 'number' || Number.isNaN(confidenceValue) || confidenceValue < deferenceThreshold) {
            failed.push({
              id: todoId,
              error: `confidence ${confidenceValue} is below the ${deferenceThreshold} auto-approve threshold — resolve individually via /resolve instead`,
            });
            continue;
          }

          const updateTodo = db.prepare("UPDATE os_todos SET status = 'resolved' WHERE id = ?");
          const info = updateTodo.run(todoId);
          if (info.changes === 0) {
            failed.push({ id: todoId, error: 'To-Do not found' });
            continue;
          }

          const redactedResolution = SensitiveDataRedactor.redactObject('approved', DataTier.INTERNAL);
          const updateTask = db.prepare("UPDATE tasks SET status = 'unclaimed', output_data = ?, claim_lease = NULL WHERE id = ?");
          updateTask.run(JSON.stringify({ resolution: redactedResolution }), todo.dag_node_id);

          const task = db.prepare('SELECT run_id FROM tasks WHERE id = ?').get(todo.dag_node_id) as any;
          if (task) {
            db.prepare("UPDATE workflow_runs SET status = 'running' WHERE id = ? AND status = 'parked'").run(task.run_id);
          }
          resolved.push(todoId);
        } catch (err: any) {
          failed.push({ id: todoId, error: err.message });
        }
      }
    })();

    return c.json({ success: true, resolved, failed });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Reject a single todo. Unlike /resolve, this does NOT unclaim the associated
// task or resume the parked workflow run -- rejecting means the escalation was
// looked at and declined, not that the underlying work should retry.
todosRouter.post('/reject', async (c) => {
  const body = await c.req.json();
  const { todoId } = body;

  try {
    const info = db.prepare("UPDATE os_todos SET status = 'rejected' WHERE id = ?").run(todoId);
    if (info.changes === 0) return c.json({ success: false, error: 'To-Do not found' }, 404);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Deference UI bulk-reject — mirrors /resolve-bulk's batching but only flips
// status to 'rejected', matching /reject's single-item semantics above.
todosRouter.post('/reject-bulk', async (c) => {
  const body = await c.req.json();
  const { todoIds } = body;

  if (!Array.isArray(todoIds) || todoIds.length === 0) {
    return c.json({ success: false, error: 'todoIds must be a non-empty array' }, 400);
  }

  try {
    const rejected: string[] = [];
    const failed: { id: string; error: string }[] = [];

    db.transaction(() => {
      for (const todoId of todoIds) {
        const info = db.prepare("UPDATE os_todos SET status = 'rejected' WHERE id = ?").run(todoId);
        if (info.changes === 0) {
          failed.push({ id: todoId, error: 'To-Do not found' });
        } else {
          rejected.push(todoId);
        }
      }
    })();

    return c.json({ success: true, rejected, failed });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Promote a ScoutDaemon discovery to the PortGrid HITL approval queue
todosRouter.post('/promote', async (c) => {
  const body = await c.req.json();
  const { fact, sourceId, confidence } = body;

  if (!fact) return c.json({ success: false, error: 'fact is required' }, 400);

  // Deference UI (0.70 threshold): optional caller-supplied confidence for
  // this discovery. Defaults to 0.5 (matches scout_okf_nodes' own default and
  // the os_todos column default) when the caller doesn't provide one.
  const confidenceValue = typeof confidence === 'number' && confidence >= 0 && confidence <= 1 ? confidence : 0.5;

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
      db.prepare('INSERT INTO os_todos (id, dag_node_id, severity, escalation_reason, required_action_type, status, created_at, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        id, sentinelTaskId, 'MEDIUM', `ScoutDaemon Discovery: ${fact.substring(0, 120)}`, 'APPROVE_PROPOSAL', 'open', Date.now(), confidenceValue
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
