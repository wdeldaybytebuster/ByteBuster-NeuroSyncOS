import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, initDB } from './basevault/db';
import { executeRun, triggerDispatch } from './coreexec/engine';
import { workerPool } from './coreexec/worker-pool';

describe('Benchmark & Hardware Harness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    initDB();
    // Clear out old runs
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM workflow_runs').run();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('must strictly queue tasks according to UV_THREADPOOL_SIZE semaphore and keep heap < 1024MB', async () => {
    // 1. Create a dummy project and 50 concurrent DAG proposals
    const projectId = 'test-proj-1';
    db.prepare(`
      INSERT INTO projects (id, name, created_at) VALUES (?, 'Test', ?)
    `).run(projectId, Date.now());

    const runIds: string[] = [];
    for (let i = 0; i < 50; i++) {
      const runId = `run-${i}`;
      runIds.push(runId);
      
      const layout = {
        nodes: [
          { id: `task-${i}-1`, dependencies: [] }
        ]
      };

      db.prepare(`
        INSERT INTO workflow_runs (id, project_id, status, dag_layout, track, created_at) 
        VALUES (?, ?, 'pending', ?, 'track1', ?)
      `).run(runId, projectId, JSON.stringify(layout), Date.now());

      db.prepare(`
        INSERT INTO tasks (id, run_id, status)
        VALUES (?, ?, 'unclaimed')
      `).run(`task-${i}-1`, runId);
    }

    // 2. We will intercept the workerPool to simulate slow tasks
    // Since workerPool execution is async, let's spy on it
    let concurrentExecutions = 0;
    let maxConcurrentExecutions = 0;

    vi.spyOn(workerPool, 'execute').mockImplementation(async (opts: any) => {
      concurrentExecutions++;
      if (concurrentExecutions > maxConcurrentExecutions) {
        maxConcurrentExecutions = concurrentExecutions;
      }
      
      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 50));
      
      concurrentExecutions--;
      return { status: 'success', action: 'generic', taskId: opts.taskId } as any;
    });

    Object.defineProperty(workerPool, 'info', {
      get: () => ({ executingTasks: concurrentExecutions })
    });

    // Ensure we insert the rule
    const profileId = 'prof-1';
    db.prepare(`
      INSERT INTO hardware_profiles 
      (id, profiled_at, cpu_cores, cpu_physical_cores, ram_total_mb, os_platform, tier)
      VALUES (?, ?, 8, 8, 8000, 'linux', 'standard')
    `).run(profileId, Date.now());

    db.prepare(`INSERT INTO environment_rules (id, profile_id, rule_key, rule_value, created_at) VALUES ('rule-1', ?, 'max_workers', '3', ?)`)
      .run(profileId, Date.now());

    // 3. Fire all 50
    for (const runId of runIds) {
      executeRun(runId);
    }

    // Advance timers so tasks complete
    // We need to wait for all the queued tasks to finish
    for (let i = 0; i < 100; i++) {
      await vi.advanceTimersByTimeAsync(100);
      triggerDispatch();
    }

    // 4. Assert: Max concurrency never exceeds 3 (UV_THREADPOOL_SIZE semaphore)
    expect(maxConcurrentExecutions).toBeLessThanOrEqual(3);

    // 5. Assert: Memory heap usage doesn't spike above 1024 MB
    const memUsage = process.memoryUsage();
    expect(memUsage.heapUsed).toBeLessThan(1024 * 1024 * 1024);
  });
});
