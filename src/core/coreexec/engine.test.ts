import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { db, initDB, dbPath } from '../basevault/db';
import { executeRun, injectCoreExecGenerateFn, resumeInProgressRuns } from './engine';
import { workerPool } from './worker-pool';
import { systemConfig } from '../../server/routes/system';
import fs from 'fs';
import crypto from 'crypto';

describe('CoreExec Engine - Async DAG Runner', () => {
  beforeAll(() => {
    initDB();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM workflow_runs').run();
    db.prepare('DELETE FROM projects').run();
    db.prepare('DELETE FROM os_todos').run();
    // Each test starts with CoreExec unwired; tests that exercise the LLM path
    // inject their own mock explicitly.
    injectCoreExecGenerateFn(null);
    vi.restoreAllMocks();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
  });

  it('should successfully execute a 3-node DAG in topological order', async () => {
    const projectId = 'proj-123';
    db.prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
      projectId, 'Test Project', Date.now()
    );

    const runId = crypto.randomUUID();
    const t1 = crypto.randomUUID();
    const t2 = crypto.randomUUID();
    const t3 = crypto.randomUUID();

    const dagLayout = {
      nodes: [
        { id: t1, dependencies: [] },
        { id: t2, dependencies: [t1] },
        { id: t3, dependencies: [t1] }
      ]
    };

    db.prepare(`
      INSERT INTO workflow_runs (id, project_id, dag_layout, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(runId, projectId, JSON.stringify(dagLayout), 'pending', Date.now());

    // Insert the tasks
    const insertTask = db.prepare(`INSERT INTO tasks (id, run_id, status) VALUES (?, ?, 'unclaimed')`);
    insertTask.run(t1, runId);
    insertTask.run(t2, runId);
    insertTask.run(t3, runId);

    const results = await executeRun(runId);

    expect(results).toBe(true);

    const run = db.prepare('SELECT status FROM workflow_runs WHERE id = ?').get(runId) as any;
    expect(run.status).toBe('completed');
  });

  it('should recover from a crashed run and not duplicate completed tasks', async () => {
    const projectId = 'proj-recover';
    db.prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
      projectId, 'Recover Project', Date.now()
    );

    const runId = crypto.randomUUID();
    const t1 = crypto.randomUUID(); // completed
    const t2 = crypto.randomUUID(); // crashed while running (claimed, but expired)
    const t3 = crypto.randomUUID(); // unclaimed

    const dagLayout = {
      nodes: [
        { id: t1, dependencies: [] },
        { id: t2, dependencies: [t1] },
        { id: t3, dependencies: [t2] }
      ]
    };

    db.prepare(`
      INSERT INTO workflow_runs (id, project_id, dag_layout, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(runId, projectId, JSON.stringify(dagLayout), 'running', Date.now());

    const insertTask = db.prepare(`INSERT INTO tasks (id, run_id, status, claim_lease, output_data) VALUES (?, ?, ?, ?, ?)`);
    
    // t1 completed before crash
    insertTask.run(t1, runId, 'completed', null, JSON.stringify({ status: 'success' }));
    
    // t2 was claimed but the process crashed. The lease expired in the past.
    insertTask.run(t2, runId, 'claimed', Date.now() - 100000, null);
    
    // t3 never started
    insertTask.run(t3, runId, 'unclaimed', null, null);

    const results = await executeRun(runId);

    expect(results).toBe(true);
    

    const run = db.prepare('SELECT status FROM workflow_runs WHERE id = ?').get(runId) as any;
    expect(run.status).toBe('completed');
  });

  // ─── Main-thread 'generic' LLM interception (dashboard reality pass) ──────────
  // A single-node run whose one task carries the given natural-language prompt.
  function seedSingleNodeRun(prompt: string): { runId: string; taskId: string } {
    const projectId = 'proj-generic';
    db.prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
      projectId, 'Generic Project', Date.now()
    );
    const runId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const dagLayout = { nodes: [{ id: taskId, dependencies: [], prompt }] };
    db.prepare(`
      INSERT INTO workflow_runs (id, project_id, dag_layout, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(runId, projectId, JSON.stringify(dagLayout), 'pending', Date.now());
    db.prepare(`INSERT INTO tasks (id, run_id, status) VALUES (?, ?, 'unclaimed')`).run(taskId, runId);
    return { runId, taskId };
  }

  it("routes a non-empty 'generic' prompt to the injected main-thread LLM and stores its real response", async () => {
    const mockFn = vi.fn(async (_p: string) => 'REAL LLM SUMMARY OUTPUT');
    injectCoreExecGenerateFn(mockFn);

    const { runId, taskId } = seedSingleNodeRun('summarize the findings into three bullet points');
    const ok = await executeRun(runId);

    expect(ok).toBe(true);
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith('summarize the findings into three bullet points');

    const task = db.prepare('SELECT status, output_data FROM tasks WHERE id = ?').get(taskId) as any;
    expect(task.status).toBe('completed');
    const out = JSON.parse(task.output_data);
    expect(out.action).toBe('generic');
    expect(out.status).toBe('success');
    // The real LLM response is stored — NOT the old canned "metadata echo" string.
    expect(out.message).toBe('REAL LLM SUMMARY OUTPUT');
    expect(out.message).not.toMatch(/metadata echo/);
  });

  it("still routes a 'shell'-classified prompt through the worker pool unchanged (regression)", async () => {
    const mockFn = vi.fn(async () => 'should NOT be called for shell');
    injectCoreExecGenerateFn(mockFn);

    const execSpy = vi.spyOn(workerPool, 'execute').mockResolvedValue({
      status: 'success', action: 'shell', taskId: 'x', stdout: 'ok', stderr: '',
      markdown: undefined, pageMetadata: undefined, message: undefined,
      prompt: 'ls -la', data: undefined, error: undefined, reason: 'bare allowlisted command',
    } as any);

    const { runId, taskId } = seedSingleNodeRun('ls -la');
    const ok = await executeRun(runId);

    expect(ok).toBe(true);
    expect(execSpy).toHaveBeenCalledTimes(1);
    // Shell tasks must never touch the main-thread LLM path.
    expect(mockFn).not.toHaveBeenCalled();
    // Directive is precomputed on the main thread and passed to the worker.
    const arg = execSpy.mock.calls[0]![0] as any;
    expect(arg.directive.action).toBe('shell');

    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskId) as any;
    expect(task.status).toBe('completed');
  });

  it("parks a 'generic' task with a 0.0-confidence os_todo when no generateFn is wired", async () => {
    injectCoreExecGenerateFn(null); // explicit: unwired

    const { runId, taskId } = seedSingleNodeRun('review the code and suggest improvements');
    const ok = await executeRun(runId);

    expect(ok).toBe(false);
    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskId) as any;
    expect(task.status).toBe('parked');

    const todo = db.prepare(
      'SELECT severity, confidence, required_action_type, status FROM os_todos WHERE dag_node_id = ?'
    ).get(taskId) as any;
    expect(todo).toBeTruthy();
    expect(todo.confidence).toBe(0.0);
    expect(todo.severity).toBe('HIGH');
    expect(todo.status).toBe('open');
  });

  it("parks a 'generic' task when the injected generateFn throws (providers exhausted / governor block)", async () => {
    injectCoreExecGenerateFn(async () => { throw new Error('Governor blocked execution'); });

    const { runId, taskId } = seedSingleNodeRun('draft a release note for v0.4');
    const ok = await executeRun(runId);

    expect(ok).toBe(false);
    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskId) as any;
    expect(task.status).toBe('parked');

    const todo = db.prepare('SELECT confidence FROM os_todos WHERE dag_node_id = ?').get(taskId) as any;
    expect(todo).toBeTruthy();
    expect(todo.confidence).toBe(0.0);
  });

  // ─── Boot-time crash recovery (dashboard reality pass) ───────────────────────
  // Proves the marketing claim "if it crashes mid-task, it resumes from the last
  // completed step": after a hard restart, resumeInProgressRuns() must re-drive
  // exactly the runs left 'running'/'pending' (never 'completed'/'failed') and,
  // because executeRun is idempotent, complete them WITHOUT re-running work that
  // was already 'completed'.
  function seedRunWithStatus(status: string, taskStatuses: string[]): { runId: string; taskIds: string[] } {
    const projectId = 'proj-resume';
    db.prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
      projectId, 'Resume Project', Date.now()
    );
    const runId = crypto.randomUUID();
    const taskIds = taskStatuses.map(() => crypto.randomUUID());
    const nodes = taskIds.map((id) => ({ id, dependencies: [] as string[] }));
    db.prepare(`
      INSERT INTO workflow_runs (id, project_id, dag_layout, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(runId, projectId, JSON.stringify({ nodes }), status, Date.now());
    const insertTask = db.prepare(
      `INSERT INTO tasks (id, run_id, status, claim_lease, output_data) VALUES (?, ?, ?, ?, ?)`
    );
    taskIds.forEach((id, i) => {
      const ts = taskStatuses[i];
      const out = ts === 'completed' ? JSON.stringify({ status: 'success', frozen: true }) : null;
      insertTask.run(id, runId, ts, null, out);
    });
    return { runId, taskIds };
  }

  it('resumeInProgressRuns re-drives only running/pending runs and returns their count', async () => {
    const running = seedRunWithStatus('running', ['completed']);
    const pending = seedRunWithStatus('pending', ['completed']);
    const done = seedRunWithStatus('completed', ['completed']);
    const failed = seedRunWithStatus('failed', ['failed']);

    const found = resumeInProgressRuns();
    expect(found).toBe(2); // only the running + pending runs

    // Let the fire-and-forget executeRun calls settle.
    await new Promise((r) => setTimeout(r, 100));

    // Both stale runs were resumed to completion by the idempotent loop.
    const runningRow = db.prepare('SELECT status FROM workflow_runs WHERE id = ?').get(running.runId) as any;
    const pendingRow = db.prepare('SELECT status FROM workflow_runs WHERE id = ?').get(pending.runId) as any;
    expect(runningRow.status).toBe('completed');
    expect(pendingRow.status).toBe('completed');

    // Terminal runs were never touched.
    const doneRow = db.prepare('SELECT status FROM workflow_runs WHERE id = ?').get(done.runId) as any;
    const failedRow = db.prepare('SELECT status FROM workflow_runs WHERE id = ?').get(failed.runId) as any;
    expect(doneRow.status).toBe('completed');
    expect(failedRow.status).toBe('failed');

    // The already-'completed' task's output_data is untouched — NOT re-executed.
    const frozen = db.prepare('SELECT output_data FROM tasks WHERE id = ?').get(running.taskIds[0]) as any;
    expect(JSON.parse(frozen.output_data).frozen).toBe(true);
  });

  it('resumeInProgressRuns returns 0 and drives nothing when there are no stale runs', () => {
    seedRunWithStatus('completed', ['completed']);
    seedRunWithStatus('failed', ['failed']);
    expect(resumeInProgressRuns()).toBe(0);
  });

  // Proves UnifiedMasterDashboard's "Claim Batch Size" setting genuinely caps
  // how many eligible tasks get dispatched per tick, independent of
  // availableSlots (systemConfig.maxWorkers headroom) — previously there was
  // no such cap at all; every eligible task within availableSlots dispatched
  // in the same Promise.all batch. Nested inside the outer describe (rather
  // than a second top-level describe) so it shares the outer's beforeAll
  // (initDB) and runs BEFORE the outer afterAll closes the shared `:memory:`
  // db connection.
  describe('claim_batch_size setting caps per-tick dispatch concurrency', () => {
    let originalMaxWorkers: number;

    beforeEach(() => {
      db.prepare("DELETE FROM system_settings WHERE key = 'claim_batch_size'").run();
      // Give plenty of worker headroom so availableSlots is never the
      // bottleneck — isolates claim_batch_size as the only limiting factor.
      originalMaxWorkers = systemConfig.maxWorkers;
      systemConfig.maxWorkers = 10;
    });

    afterEach(() => {
      systemConfig.maxWorkers = originalMaxWorkers;
      db.prepare("DELETE FROM system_settings WHERE key = 'claim_batch_size'").run();
    });

    function seedThreeIndependentGenericTasks(): { runId: string; taskIds: string[] } {
    const projectId = 'proj-batch';
    db.prepare('INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
      projectId, 'Batch Project', Date.now(),
    );
    const runId = crypto.randomUUID();
    const taskIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const dagLayout = { nodes: taskIds.map((id) => ({ id, dependencies: [], prompt: `independent step ${id}` })) };
    db.prepare(
      `INSERT INTO workflow_runs (id, project_id, dag_layout, status, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(runId, projectId, JSON.stringify(dagLayout), 'pending', Date.now());
    const insertTask = db.prepare(`INSERT INTO tasks (id, run_id, status) VALUES (?, ?, 'unclaimed')`);
    for (const id of taskIds) insertTask.run(id, runId);
    return { runId, taskIds };
  }

  it('dispatches all 3 independent eligible tasks concurrently when claim_batch_size is unset (default/unbounded)', async () => {
    let concurrent = 0;
    let maxConcurrentSeen = 0;
    injectCoreExecGenerateFn(async () => {
      concurrent++;
      maxConcurrentSeen = Math.max(maxConcurrentSeen, concurrent);
      await new Promise((r) => setTimeout(r, 30));
      concurrent--;
      return 'ok';
    });

    const { runId } = seedThreeIndependentGenericTasks();
    await executeRun(runId);

    // All 3 had no dependencies and ample worker headroom — with no batch
    // cap, they all landed in the same dispatch tick's Promise.all.
    expect(maxConcurrentSeen).toBe(3);
  });

  it('caps concurrent dispatch at 1 when claim_batch_size=1, serializing otherwise-parallel tasks', async () => {
    db.prepare(
      "INSERT INTO system_settings (key, value) VALUES ('claim_batch_size', '1') ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).run();

    let concurrent = 0;
    let maxConcurrentSeen = 0;
    injectCoreExecGenerateFn(async () => {
      concurrent++;
      maxConcurrentSeen = Math.max(maxConcurrentSeen, concurrent);
      await new Promise((r) => setTimeout(r, 30));
      concurrent--;
      return 'ok';
    });

    const { runId } = seedThreeIndependentGenericTasks();
    const ok = await executeRun(runId);

    expect(ok).toBe(true);
    // Same 3 independent tasks, same worker headroom — but claim_batch_size=1
    // means only 1 task is ever claimed+dispatched per tick.
    expect(maxConcurrentSeen).toBe(1);

    const tasks = db.prepare('SELECT status FROM tasks WHERE run_id = ?').all(runId) as any[];
    expect(tasks.every((t) => t.status === 'completed')).toBe(true);
  });
  });
});
