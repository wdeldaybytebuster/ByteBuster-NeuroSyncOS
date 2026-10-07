import { describe, it, expect } from 'vitest';
import { parseDelta, SYNC_TABLES, SYNC_ACTIONS } from './sync-policy';

/**
 * §4.1 V1 tests — pure policy tests, no DB.
 *
 * Verified truth: the allowlist matches the ONLY tables the sync triggers in
 * db.ts:713-758 ever write, and every injection shape documented in
 * ARCHITECT §0-V1 (stacked queries, derived tables, column injection,
 * DELETE) is refused before any SQL is prepared.
 */

const NOW = Date.now();

/** Exact payload columns emitted by sync_projects_insert (db.ts:717). */
const projectsPayload = (id: string) =>
  JSON.stringify({ id, name: 'Test Project', created_at: NOW });

/** Exact payload columns emitted by sync_workflow_runs_insert (db.ts:733). */
const workflowRunsPayload = (id: string) =>
  JSON.stringify({
    id,
    project_id: 'proj-1',
    status: 'running',
    dag_layout: '{"nodes":[]}',
    track: 'track2',
    created_at: NOW,
    completed_at: null,
  });

/** Exact payload columns emitted by sync_tasks_insert (db.ts:749). */
const tasksPayload = (id: string) =>
  JSON.stringify({ id, run_id: 'run-1', status: 'unclaimed' });

function delta(over: Record<string, unknown>) {
  return {
    id: 1,
    table_name: 'projects',
    action: 'INSERT',
    timestamp: NOW,
    payload: projectsPayload('test-proj-1'),
    ...over,
  };
}

describe('sync-policy parseDelta — positive (allowlist matches reality)', () => {
  it('accepts a trigger-shaped delta for each of the 3 sync tables', () => {
    const p = parseDelta(delta({ table_name: 'projects', payload: projectsPayload('test-proj-1') }));
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.delta.table).toBe('projects');
      expect(p.delta.action).toBe('INSERT');
      expect(p.delta.columns).toEqual(['id', 'name', 'created_at']);
      expect(p.delta.id).toBe('test-proj-1');
      expect(p.delta.setSql).toBe('id = ?, name = ?, created_at = ?');
      expect(p.delta.insertSql).toBe('(id, name, created_at) VALUES (?, ?, ?)');
    }

    const w = parseDelta(
      delta({ table_name: 'workflow_runs', payload: workflowRunsPayload('run-uuid-1') }),
    );
    expect(w.ok).toBe(true);
    if (w.ok) {
      expect(w.delta.columns).toEqual([
        'id', 'project_id', 'status', 'dag_layout', 'track', 'created_at', 'completed_at',
      ]);
    }

    const t = parseDelta(delta({ table_name: 'tasks', payload: tasksPayload('task-uuid-1') }));
    expect(t.ok).toBe(true);
    if (t.ok) expect(t.delta.columns).toEqual(['id', 'run_id', 'status']);
  });

  it('accepts real-world id shapes (slugs and UUIDs)', () => {
    for (const id of [
      'system-maintenance',
      'test-proj-1',
      '46608ac6-97e3-4c9a-8e97-a616b3fc3742',
    ]) {
      const r = parseDelta(delta({ payload: projectsPayload(id) }));
      expect(r.ok, `id ${id} should be accepted`).toBe(true);
    }
  });

  it('accepts UPDATE deltas (no trigger ever emits DELETE)', () => {
    const r = parseDelta(delta({ action: 'UPDATE', payload: projectsPayload('test-proj-1') }));
    expect(r.ok).toBe(true);
    expect(SYNC_ACTIONS).toEqual(['INSERT', 'UPDATE']);
    expect(Object.keys(SYNC_TABLES).sort()).toEqual(['projects', 'tasks', 'workflow_runs']);
  });
});

describe('sync-policy parseDelta — NEGATIVE (the exploits)', () => {
  it('rejects system_settings (the §0-V1-4 table)', () => {
    const r = parseDelta(
      delta({
        table_name: 'system_settings',
        payload: JSON.stringify({ id: 'operator_credential', value: 'pwned' }),
      }),
    );
    expect(r).toEqual({ ok: false, reason: 'unknown-table' });
  });

  it('rejects stacked, derived-table and comment injection in table_name', () => {
    const hostile = [
      'projects; DROP TABLE tasks;--',
      '(SELECT key AS id, value FROM system_settings)',
      'tasks/**/WHERE/**/1=1',
      'os_todos',
      'llm_providers',
      'dag_proposals',
      'environment_rules',
    ];
    for (const table_name of hostile) {
      const r = parseDelta(delta({ table_name }));
      expect(r, `table_name ${table_name} must be refused`).toEqual({
        ok: false,
        reason: 'unknown-table',
      });
    }
  });

  it('rejects DELETE — no trigger in db.ts emits it', () => {
    const r = parseDelta(delta({ action: 'DELETE' }));
    expect(r).toEqual({ ok: false, reason: 'unsupported-action' });
  });

  it('rejects column injection via payload keys', () => {
    const payload = JSON.stringify({
      id: 'test-proj-1',
      'id = 1 WHERE 1=1; --': 'x',
    });
    const r = parseDelta(delta({ payload }));
    expect(r).toEqual({ ok: false, reason: 'unknown-column' });
  });

  it('rejects row-value violations with the specific reason', () => {
    expect(parseDelta(delta({
      payload: JSON.stringify({ id: 't-1', run_id: 'r-1', status: 'x' }),
      table_name: 'tasks',
    }))).toEqual({ ok: false, reason: 'bad-status' });

    expect(parseDelta(
      delta({
        table_name: 'projects',
        payload: JSON.stringify({ id: 'p-1', name: 'n', created_at: 1.5 }),
      }),
    )).toEqual({ ok: false, reason: 'bad-type' });

    expect(parseDelta(
      delta({
        table_name: 'workflow_runs',
        payload: JSON.stringify({
          id: 'r-1', project_id: 'p', status: 'running',
          dag_layout: { nodes: [] }, track: 'track2', created_at: NOW, completed_at: null,
        }),
      }),
    )).toEqual({ ok: false, reason: 'bad-type' });

    expect(parseDelta(delta({ timestamp: NOW + 5 * 60 * 1000 })))
      .toEqual({ ok: false, reason: 'bad-timestamp' });
    expect(parseDelta(delta({ timestamp: NOW - 31 * 24 * 3600 * 1000 })))
      .toEqual({ ok: false, reason: 'bad-timestamp' });
  });

  it('rejects non-string / malformed ids and non-object payloads', () => {
    expect(parseDelta(delta({ payload: JSON.stringify({ id: 1, name: 'n', created_at: NOW }) })))
      .toEqual({ ok: false, reason: 'bad-id' });
    expect(parseDelta(delta({ payload: 'not json' }))).toEqual({ ok: false, reason: 'bad-type' });
    expect(parseDelta(delta({ payload: JSON.stringify(['x']) })))
      .toEqual({ ok: false, reason: 'bad-type' });
    expect(parseDelta(null)).toEqual({ ok: false, reason: 'bad-type' });
  });

  it('rejects payloads over the 256 KiB cap', () => {
    const huge = JSON.stringify({
      id: 'p-1',
      name: 'x'.repeat(300 * 1024),
      created_at: NOW,
    });
    expect(parseDelta(delta({ payload: huge }))).toEqual({ ok: false, reason: 'payload-too-large' });
  });

  it('rejects an UPDATE that carries no id', () => {
    const r = parseDelta(delta({ action: 'UPDATE', payload: JSON.stringify({ name: 'only-name' }) }));
    expect(r).toEqual({ ok: false, reason: 'bad-id' });
  });
});
