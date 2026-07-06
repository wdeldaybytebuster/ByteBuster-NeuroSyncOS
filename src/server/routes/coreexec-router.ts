import { Hono } from 'hono';
import { db } from '../../core/basevault/db';
import crypto from 'crypto';
import { executeRun } from '../../core/coreexec/engine';
import {
  validateDAGProposal,
  validateDAGTemplate,
  escalateBlockedDAGToOsTodos,
} from '../../core/coreexec/validateDAG';
import { systemGovernor } from '../../core/routeswitch/governor';

export const coreexecRouter = new Hono();

/**
 * §3.4 — /api/coreexec/approve gate: each interactive approval is run through
 * the shared DAG validator BEFORE any DB writes or executeRun kickoff.
 * Matches the gate in coreexec/scheduler.ts so both the cron path and the
 * interactive approval path refuse to launch invalid DAGs.
 */
coreexecRouter.post('/approve', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch (_e) {
    return c.json({ error: 'Invalid JSON body.' }, 400);
  }

  const proposal = body?.proposal;
  if (!proposal || !Array.isArray(proposal.nodes)) {
    return c.json({ error: 'Invalid proposal (must have a nodes array).' }, 400);
  }

  // §3.4 — single validator gate, shared with scheduler.ts.
  const { error } = validateDAGProposal(proposal);
  if (error) {
    const placeholderRunId = `pending-approve-${crypto.randomUUID()}`;
    escalateBlockedDAGToOsTodos(placeholderRunId, error, 'approve-route');
    return c.json({ error }, 400);
  }

  try {
    systemGovernor.assertCanProceedDAG(proposal.nodes);
  } catch (err: any) {
    const placeholderRunId = `pending-approve-${crypto.randomUUID()}`;
    escalateBlockedDAGToOsTodos(placeholderRunId, err.message, 'approve-route');
    return c.json({ error: err.message }, 400);
  }

  const runId = crypto.randomUUID();
  const projectId = body.projectId || crypto.randomUUID();

  db.prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
    projectId,
    'ScopeLogic Session',
    Date.now(),
  );

  const dagLayout = JSON.stringify({ nodes: proposal.nodes });
  db.prepare(
    'INSERT INTO workflow_runs (id, project_id, dag_layout, status, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(runId, projectId, dagLayout, 'pending', Date.now());

  const insertTask = db.prepare(
    'INSERT INTO tasks (id, run_id, status, claim_lease, output_data) VALUES (?, ?, ?, ?, ?)',
  );
  for (const node of proposal.nodes) {
    insertTask.run(node.id, runId, 'unclaimed', null, null);
  }

  executeRun(runId).catch((err) => console.error('Run failed:', err));

  return c.json({ success: true, runId, message: `DAG approved. Run ${runId} started.` });
});

/**
 * Real runtime task-health metrics (replaces the old hardcoded
 * "398 Tests PASSING" widget on CoreExecDashboard). Computed over all-time
 * task history — this is a local, single-user app with low task volume, so a
 * rolling time window adds complexity without meaningful benefit. Every number
 * is derived from the started_at/completed_at/retry_count columns the engine
 * stamps during real DAG execution.
 */
coreexecRouter.get('/task-health', (c) => {
  try {
    // Success rate: completed vs. (completed + parked) terminal tasks.
    const terminal = db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN status = 'parked' THEN 1 ELSE 0 END) AS parked
         FROM tasks
         WHERE status IN ('completed', 'parked')`,
      )
      .get() as { completed: number | null; parked: number | null };
    const completed = terminal.completed ?? 0;
    const parked = terminal.parked ?? 0;
    const terminalTotal = completed + parked;
    const successRate = terminalTotal > 0 ? (completed / terminalTotal) * 100 : null;

    // Average duration across tasks with both timestamps (true end-to-end
    // wall-clock, including any retries).
    const dur = db
      .prepare(
        `SELECT AVG(completed_at - started_at) AS avgMs
         FROM tasks
         WHERE started_at IS NOT NULL AND completed_at IS NOT NULL`,
      )
      .get() as { avgMs: number | null };
    const avgDurationMs = dur.avgMs !== null ? Math.round(dur.avgMs) : null;

    // Retry rate: tasks retried at least once, out of all tasks that ever started.
    const retry = db
      .prepare(
        `SELECT
           COUNT(*) AS started,
           SUM(CASE WHEN retry_count > 0 THEN 1 ELSE 0 END) AS retried
         FROM tasks
         WHERE started_at IS NOT NULL`,
      )
      .get() as { started: number; retried: number | null };
    const started = retry.started ?? 0;
    const retried = retry.retried ?? 0;
    const retryRate = started > 0 ? (retried / started) * 100 : null;

    // sampleSize = tasks that have actually run (non-null started_at). 0 lets
    // the frontend honestly render "no completed tasks yet" instead of a fake 0%.
    return c.json({
      success: true,
      successRate,
      avgDurationMs,
      retryRate,
      sampleSize: started,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

coreexecRouter.get('/run/:runId/status', (c) => {
  try {
    const { runId } = c.req.param();
    const run = db.prepare('SELECT id, status FROM workflow_runs WHERE id = ?').get(runId) as any;
    if (!run) return c.json({ error: 'Run not found' }, 404);

    const tasks = db.prepare('SELECT id, status, output_data FROM tasks WHERE run_id = ?').all(runId);
    return c.json({ runId, status: run.status, tasks });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Real "Orchestration Metrics" for CoreExecDashboard's Widget B, replacing
// what used to be hardcoded strings ("398 Tests / PASSING", "Duplicates 0",
// "Retry Rate 1.2%", "Latency 42ms") with numbers aggregated from actual
// workflow_runs/tasks/os_todos rows. All optionally scoped to a project via
// ?projectId= (joins workflow_runs.project_id).
coreexecRouter.get('/metrics', (c) => {
  try {
    const projectId = c.req.query('projectId');
    const runFilter = projectId ? 'WHERE project_id = ?' : '';
    const runParams = projectId ? [projectId] : [];

    const runCounts = db
      .prepare(`SELECT status, COUNT(*) AS n FROM workflow_runs ${runFilter} GROUP BY status`)
      .all(...runParams) as { status: string; n: number }[];

    const completed = runCounts.find((r) => r.status === 'completed')?.n ?? 0;
    const failed = runCounts.find((r) => r.status === 'failed')?.n ?? 0;
    const terminalTotal = completed + failed;
    const successRate = terminalTotal > 0 ? (completed / terminalTotal) * 100 : null;

    const activeStatuses = ['pending', 'running', 'parked'];
    const activeRuns = runCounts
      .filter((r) => activeStatuses.includes(r.status))
      .reduce((sum, r) => sum + r.n, 0);

    const taskFilter = projectId
      ? 'JOIN workflow_runs ON workflow_runs.id = tasks.run_id WHERE workflow_runs.project_id = ?'
      : '';
    const totalTasks = (
      db.prepare(`SELECT COUNT(*) AS n FROM tasks ${taskFilter}`).get(...runParams) as { n: number }
    ).n;
    const resolvedEscalations = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM os_todos
           JOIN tasks ON tasks.id = os_todos.dag_node_id
           ${projectId ? 'JOIN workflow_runs ON workflow_runs.id = tasks.run_id WHERE workflow_runs.project_id = ? AND' : 'WHERE'}
           os_todos.status = 'resolved'`,
        )
        .get(...runParams) as { n: number }
    ).n;
    // "Retry rate": how often a task needed a human to resolve an os_todos
    // escalation before it could be re-queued, relative to total task volume.
    const retryRate = totalTasks > 0 ? (resolvedEscalations / totalTasks) * 100 : null;

    const avgLatencyRow = db
      .prepare(
        `SELECT AVG(completed_at - created_at) AS avgMs FROM workflow_runs
         ${projectId ? 'WHERE project_id = ? AND' : 'WHERE'}
         status = 'completed' AND completed_at IS NOT NULL`,
      )
      .get(...runParams) as { avgMs: number | null };

    return c.json({
      successRate,
      completedRuns: completed,
      failedRuns: failed,
      activeRuns,
      retryRate,
      totalTasks,
      resolvedEscalations,
      avgLatencyMs: avgLatencyRow.avgMs,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// §1.3 — Retry failed/parked tasks for an existing run.
// §3.4 — Re-validates `workflow_runs.dag_layout` before retrying. A run may
// have been inserted when /approve vetted the proposal, but AdminSQL or a
// backup-restore can mutate dag_layout after the fact. The original DB-bypass
// class re-opens if retry trusts the layout blindly.
coreexecRouter.post('/retry/:runId', async (c) => {
  try {
    const { runId } = c.req.param();
    const run = db
      .prepare('SELECT id, status, dag_layout FROM workflow_runs WHERE id = ?')
      .get(runId) as any;
    if (!run) return c.json({ error: 'Run not found' }, 404);

    const { error: layoutError } = validateDAGTemplate(run.dag_layout);
    if (layoutError) {
      escalateBlockedDAGToOsTodos(runId, layoutError, 'approve-route');
      return c.json({ error: layoutError }, 400);
    }

    // Reset failed/parked tasks AND any 'claimed' task whose lease has ALREADY
    // expired, so an operator who spots a stuck run doesn't have to wait out the
    // remaining lease for the engine to self-heal. A 'claimed' task whose lease
    // is still in the future is left untouched on purpose — resetting it would
    // break the lease's mutual exclusion and allow a second concurrent attempt at
    // a task some in-flight process may still legitimately be working on.
    db.prepare(
      `UPDATE tasks
       SET status = 'unclaimed', claim_lease = NULL
       WHERE run_id = ? AND (
         status IN ('failed', 'parked')
         OR (status = 'claimed' AND claim_lease IS NOT NULL AND claim_lease < ?)
       )`,
    ).run(runId, Date.now());
    db.prepare("UPDATE workflow_runs SET status = 'pending', completed_at = NULL WHERE id = ?").run(runId);

    executeRun(runId).catch((err) => console.error('Run retry failed:', err));

    return c.json({ success: true, runId, message: `Retry started for ${runId}.` });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
