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
});
