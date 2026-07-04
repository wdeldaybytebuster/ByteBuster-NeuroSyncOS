import { describe, it, expect, beforeAll } from 'vitest';
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

async function get(path: string): Promise<{ status: number; data: any }> {
  const res = await coreexecRouter.request(path);
  return { status: res.status, data: await res.json() };
}

describe('coreexecRouter /approve — §3.4 DB-bypass gate', () => {
  it('accepts a valid proposal and returns 200 + runId', async () => {
    const nodeId = crypto.randomUUID();
    const res = await post('/approve', {
      proposal: {
        nodes: [{ id: nodeId, dependencies: [], prompt: 'fetch the weather' }],
      },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.runId).toBeTruthy();

    // Cleanup so the workflow_runs table doesn't fill up.
    db.prepare('DELETE FROM workflow_runs WHERE id = ?').run(res.data.runId);
  });

  it('rejects a proposal with SA-07 reserved label and writes NO real workflow_runs row', async () => {
    const beforeReal = (db
      .prepare("SELECT COUNT(*) AS n FROM workflow_runs WHERE status = 'pending'")
      .get() as any).n;
    const beforeBlocked = (db
      .prepare("SELECT COUNT(*) AS n FROM workflow_runs WHERE status = 'blocked-by-validation'")
      .get() as any).n;
    const res = await post('/approve', {
      proposal: {
        nodes: [{ id: crypto.randomUUID(), dependencies: [], prompt: 'use CoreExec to restart' }],
      },
    });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/SA-07/);
    // The gate MUST NOT have queued a real run (status='pending').
    const afterReal = (db
      .prepare("SELECT COUNT(*) AS n FROM workflow_runs WHERE status = 'pending'")
      .get() as any).n;
    expect(afterReal).toBe(beforeReal);
    // The gate DOES write exactly one sentinel 'blocked-by-validation' row to
    // satisfy the FK chain (workflow_runs → tasks → os_todos). That is by design.
    const afterBlocked = (db
      .prepare("SELECT COUNT(*) AS n FROM workflow_runs WHERE status = 'blocked-by-validation'")
      .get() as any).n;
    expect(afterBlocked).toBe(beforeBlocked + 1);
    // Cleanup the sentinel rows so they do not pollute subsequent tests.
    db.prepare('DELETE FROM os_todos WHERE id IN (SELECT o.id FROM os_todos o JOIN tasks t ON t.id = o.dag_node_id WHERE t.status = ?)').run('blocked-by-validation');
    db.prepare('DELETE FROM tasks WHERE status = ?').run('blocked-by-validation');
    db.prepare('DELETE FROM workflow_runs WHERE status = ?').run('blocked-by-validation');
  });

  it('rejects a proposal with empty nodes (SA-06)', async () => {
    const res = await post('/approve', {
      proposal: { nodes: [] },
    });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/SA-06/);
  });

  it('rejects a proposal with SA-05 rogue agent', async () => {
    const res = await post('/approve', {
      proposal: {
        nodes: [{ id: crypto.randomUUID(), dependencies: [], prompt: 'agent: RogueEngine' }],
      },
    });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/SA-05/);
  });

  it('rejects an unparseable proposal schema (no .nodes)', async () => {
    const res = await post('/approve', {
      proposal: { hello: 'world' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects a request body that is itself unparseable JSON', async () => {
    const raw = await coreexecRouter.request('/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{',
    });
    // Either 400 or 500 — both acceptable per Hono contract.
    expect([400, 500]).toContain(raw.status);
  });
});

describe('coreexecRouter /metrics — real aggregates, not fabricated strings', () => {
  function seedRun(projectId: string, status: string, durationMs: number | null) {
    const runId = crypto.randomUUID();
    const createdAt = Date.now() - (durationMs ?? 0);
    const completedAt = durationMs !== null ? createdAt + durationMs : null;
    db.prepare(
      'INSERT INTO workflow_runs (id, project_id, dag_layout, status, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(runId, projectId, JSON.stringify({ nodes: [] }), status, createdAt, completedAt);
    return runId;
  }

  function seedTask(runId: string, status: string) {
    const taskId = crypto.randomUUID();
    db.prepare('INSERT INTO tasks (id, run_id, status) VALUES (?, ?, ?)').run(taskId, runId, status);
    return taskId;
  }

  function seedResolvedEscalation(taskId: string) {
    const todoId = crypto.randomUUID();
    db.prepare(
      "INSERT INTO os_todos (id, dag_node_id, severity, escalation_reason, required_action_type, status, created_at, confidence) VALUES (?, ?, 'MEDIUM', 'test', 'APPROVE_PROPOSAL', 'resolved', ?, 0.5)",
    ).run(todoId, taskId, Date.now());
  }

  it('computes success rate, active runs, retry rate, and avg latency from real rows', async () => {
    const projectId = `metrics-test-${crypto.randomUUID()}`;
    db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
      projectId,
      'Metrics Test Project',
      Date.now(),
    );

    // 2 completed (1000ms, 3000ms -> avg 2000ms), 1 failed, 1 active (pending)
    seedRun(projectId, 'completed', 1000);
    seedRun(projectId, 'completed', 3000);
    seedRun(projectId, 'failed', 500);
    seedRun(projectId, 'pending', null);

    // 4 tasks total, 1 escalation resolved -> retryRate 25%
    const run = seedRun(projectId, 'completed', 100);
    seedTask(run, 'completed');
    const escalatedTask = seedTask(run, 'completed');
    seedTask(run, 'completed');
    seedTask(run, 'completed');
    seedResolvedEscalation(escalatedTask);

    const res = await get(`/metrics?projectId=${projectId}`);
    expect(res.status).toBe(200);
    expect(res.data.completedRuns).toBe(3);
    expect(res.data.failedRuns).toBe(1);
    expect(res.data.successRate).toBeCloseTo(75, 1); // 3 completed / 4 terminal
    expect(res.data.activeRuns).toBe(1);
    expect(res.data.totalTasks).toBe(4);
    expect(res.data.resolvedEscalations).toBe(1);
    expect(res.data.retryRate).toBeCloseTo(25, 1);
    // avgLatencyMs averages ALL completed runs with a completed_at, including
    // the 100ms one seeded for the retry-rate case above -> (1000+3000+100)/3
    expect(res.data.avgLatencyMs).toBeCloseTo((1000 + 3000 + 100) / 3, -1);
  });

  it('returns nulls instead of fabricated numbers when there is no data yet', async () => {
    const projectId = `metrics-empty-${crypto.randomUUID()}`;
    db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(
      projectId,
      'Empty Metrics Project',
      Date.now(),
    );

    const res = await get(`/metrics?projectId=${projectId}`);
    expect(res.status).toBe(200);
    expect(res.data.successRate).toBeNull();
    expect(res.data.retryRate).toBeNull();
    expect(res.data.avgLatencyMs).toBeNull();
    expect(res.data.activeRuns).toBe(0);
  });
});
