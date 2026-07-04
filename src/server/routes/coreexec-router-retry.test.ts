import { describe, it, expect, beforeAll, vi } from 'vitest';

// Mock executeRun so /retry's fire-and-forget kickoff can't asynchronously
// mutate the task rows we assert on below. We are testing the retry endpoint's
// WHERE-clause reset semantics, not the engine loop (covered in engine.test.ts).
const { executeRunMock } = vi.hoisted(() => ({
  executeRunMock: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../../core/coreexec/engine', () => ({
  executeRun: executeRunMock,
}));

import { db, initDB } from '../../core/basevault/db';
import { coreexecRouter } from './coreexec-router';
import crypto from 'crypto';

beforeAll(() => {
  initDB();
});

async function post(path: string, body: any): Promise<{ status: number; data: any }> {
  const res = await coreexecRouter.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

describe('coreexecRouter /retry — extended reset covers expired-lease claimed tasks', () => {
  it('resets failed/parked and expired-lease claimed tasks, but NEVER a claimed task with a live lease', async () => {
    const projectId = `retry-test-${crypto.randomUUID()}`;
    db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
      projectId, 'Retry Project', Date.now(),
    );

    const tFailed = crypto.randomUUID();
    const tParked = crypto.randomUUID();
    const tClaimedExpired = crypto.randomUUID();
    const tClaimedLive = crypto.randomUUID();
    const tCompleted = crypto.randomUUID();
    const tUnclaimed = crypto.randomUUID();

    // Every node needs a benign, validator-passing prompt so validateDAGTemplate
    // accepts the layout on the retry path.
    const nodes = [tFailed, tParked, tClaimedExpired, tClaimedLive, tCompleted, tUnclaimed].map(
      (id) => ({ id, dependencies: [] as string[], prompt: 'fetch the weather' }),
    );

    const runId = crypto.randomUUID();
    db.prepare(
      'INSERT INTO workflow_runs (id, project_id, dag_layout, status, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(runId, projectId, JSON.stringify({ nodes }), 'running', Date.now());

    const future = Date.now() + 5 * 60 * 1000; // lease still valid
    const past = Date.now() - 1000; // lease expired
    const insert = db.prepare(
      'INSERT INTO tasks (id, run_id, status, claim_lease, output_data) VALUES (?, ?, ?, ?, ?)',
    );
    insert.run(tFailed, runId, 'failed', null, null);
    insert.run(tParked, runId, 'parked', null, JSON.stringify({ error: 'x' }));
    insert.run(tClaimedExpired, runId, 'claimed', past, null);
    insert.run(tClaimedLive, runId, 'claimed', future, null);
    insert.run(tCompleted, runId, 'completed', null, JSON.stringify({ status: 'success' }));
    insert.run(tUnclaimed, runId, 'unclaimed', null, null);

    executeRunMock.mockClear();
    const res = await post(`/retry/${runId}`, {});
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(executeRunMock).toHaveBeenCalledWith(runId);

    const status = (id: string) =>
      (db.prepare('SELECT status, claim_lease FROM tasks WHERE id = ?').get(id) as any);

    // Reset to unclaimed with a cleared lease.
    expect(status(tFailed).status).toBe('unclaimed');
    expect(status(tParked).status).toBe('unclaimed');
    expect(status(tClaimedExpired).status).toBe('unclaimed');
    expect(status(tClaimedExpired).claim_lease).toBeNull();

    // The regression case that matters most: a claimed task whose lease is STILL
    // valid must be left exactly as it was — resetting it would break the lease's
    // mutual exclusion and allow a concurrent second attempt.
    expect(status(tClaimedLive).status).toBe('claimed');
    expect(status(tClaimedLive).claim_lease).toBe(future);

    // Completed work and already-unclaimed tasks are untouched.
    expect(status(tCompleted).status).toBe('completed');
    expect(status(tUnclaimed).status).toBe('unclaimed');
  });
});
