import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db, initDB, dbPath } from '../basevault/db';
import { claimTask, createRunAndTasks } from './queue';
import fs from 'fs';

describe('CoreExec Queue - BEGIN IMMEDIATE Task Claims', () => {
  beforeAll(() => {
    initDB();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM workflow_runs').run();
    db.prepare('DELETE FROM projects').run();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
  });

  it('should successfully claim an unclaimed task', () => {
    // Setup
    const { runId, taskIds } = createRunAndTasks('proj-1', 1);
    const taskId = taskIds[0];

    // Act
    const leaseTime = Date.now() + 60000; // 1 minute lease
    const claimed = claimTask(taskId!, leaseTime);

    // Assert
    expect(claimed).toBe(true);
    
    // Verify DB
    const task = db.prepare('SELECT status, claim_lease FROM tasks WHERE id = ?').get(taskId) as any;
    expect(task.status).toBe('claimed');
    expect(task.claim_lease).toBe(leaseTime);
  });

  it('should not claim a task that is already claimed', () => {
    const { runId, taskIds } = createRunAndTasks('proj-2', 1);
    const taskId = taskIds[0];

    // First claim succeeds
    const leaseTime1 = Date.now() + 60000;
    expect(claimTask(taskId!, leaseTime1)).toBe(true);

    // Second claim fails
    const leaseTime2 = Date.now() + 60000;
    const claimedAgain = claimTask(taskId!, leaseTime2);
    
    expect(claimedAgain).toBe(false);

    // Lease should still be leaseTime1
    const task = db.prepare('SELECT status, claim_lease FROM tasks WHERE id = ?').get(taskId) as any;
    expect(task.claim_lease).toBe(leaseTime1);
  });

  it('should not claim a completed task', () => {
    const { runId, taskIds } = createRunAndTasks('proj-3', 1);
    const taskId = taskIds[0];

    // Manually complete
    db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(taskId);

    const claimed = claimTask(taskId!, Date.now() + 60000);
    expect(claimed).toBe(false);
  });

  // ── Acceptance Gate: Stale Leases Correctly Expired on Boot ──────────────
  it('re-claims a task whose lease timestamp is already in the past (stale lease expiry)', () => {
    const { taskIds } = createRunAndTasks('proj-stale', 1);
    const taskId = taskIds[0]!;

    // Claim with a lease that expired 1 ms ago
    const expiredLease = Date.now() - 1;
    expect(claimTask(taskId, expiredLease)).toBe(true);

    const before = db.prepare('SELECT status, claim_lease FROM tasks WHERE id = ?').get(taskId) as any;
    expect(before.status).toBe('claimed');
    expect(before.claim_lease).toBe(expiredLease);

    // Second call must detect the expired lease and grant a fresh claim
    const freshLease = Date.now() + 60000;
    expect(claimTask(taskId, freshLease)).toBe(true);

    const after = db.prepare('SELECT status, claim_lease FROM tasks WHERE id = ?').get(taskId) as any;
    expect(after.status).toBe('claimed');
    expect(after.claim_lease).toBe(freshLease);
  });

  // ── Acceptance Gate: Cross-Project Memory Namespace Isolation ────────────
  it('tasks from project-A are invisible in queries scoped to project-B (project_id FK isolation)', () => {
    const { runId: runA, taskIds: tasksA } = createRunAndTasks('proj-iso-A', 2);
    const { runId: runB, taskIds: tasksB } = createRunAndTasks('proj-iso-B', 2);

    // workflow_runs scoped to proj-iso-B must not expose proj-iso-A's run
    const runsForB = (db
      .prepare('SELECT id FROM workflow_runs WHERE project_id = ?')
      .all('proj-iso-B') as { id: string }[]).map((r) => r.id);
    expect(runsForB).toContain(runB);
    expect(runsForB).not.toContain(runA);

    // tasks scoped to runB must not include any task from runA
    const taskIdsForB = (db
      .prepare('SELECT id FROM tasks WHERE run_id = ?')
      .all(runB) as { id: string }[]).map((t) => t.id);
    for (const tid of tasksA) {
      expect(taskIdsForB).not.toContain(tid);
    }
    for (const tid of tasksB) {
      expect(taskIdsForB).toContain(tid);
    }
  });
});
