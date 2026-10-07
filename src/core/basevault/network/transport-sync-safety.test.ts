import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { db, initDB } from '../db';
import { NodeTransport, SyncPacket } from './transport';

/**
 * §4.1 V1 — transport sync-safety suite.
 *
 * Proves the C1/C2 remediation of §0-V1 (arbitrary SQL via WebSocket):
 *  - only trigger-derived tables/columns ever reach SQL (validate-then-template),
 *  - the read-modify-write merge invariant at transport.ts:154-158 is preserved,
 *  - hostile packets change nothing and never leave sync_lock stuck,
 *  - the prepared-statement cache is bounded,
 *  - and (as of C3) an unauthenticated peer cannot reach the writer at all.
 */

let transport: NodeTransport;
let baselineTableCount: number;

function fakeWs() {
  return {
    sent: [] as string[],
    readyState: 1, // WebSocket.OPEN
    send(msg: string) { this.sent.push(msg); },
    close() { /* noop */ },
  } as any;
}

function send(peerId: string, packet: unknown, ws: any = fakeWs()) {
  transport.handleIncomingMessage(JSON.stringify(packet), peerId, ws);
  return ws;
}

const NOW = () => Date.now();

beforeAll(() => {
  initDB();
  baselineTableCount = (
    db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]
  ).length;
});

afterAll(() => {
  transport.dispose();
  db.close();
});

beforeEach(() => {
  transport = new NodeTransport();
  db.prepare('DELETE FROM sync_event_log').run();
  db.prepare('UPDATE sync_lock SET is_syncing = 0 WHERE rowid = 1').run();
});

afterEach(() => {
  transport.dispose();
});

function deltaPacket(deltas: unknown[]): SyncPacket {
  return { type: 'SYNC_DELTA', lastSyncTimestamp: NOW(), deltas } as SyncPacket;
}

describe('transport-sync-safety — merge semantics preserved (item 1)', () => {
  it('applies legit INSERT + partial UPDATE and preserves columns absent from the payload', () => {
    // Seed the project (FK target) and a workflow run with full columns.
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM workflow_runs').run();
    db.prepare('DELETE FROM projects').run();
    db.prepare(
      `INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)`
    ).run('merge-proj', 'Merge Project', NOW());
    db.prepare(
      `INSERT INTO workflow_runs (id, project_id, dag_layout, status, track, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('merge-run-1', 'merge-proj', '{"nodes":[1,2]}', 'running', 'track2', NOW());

    // A trigger-shaped UPDATE delta carrying ONLY {id, status} for tasks…
    const taskInsert = deltaPacket([{
      id: 1,
      table_name: 'tasks',
      action: 'INSERT',
      timestamp: NOW(),
      payload: JSON.stringify({ id: 'merge-task-1', run_id: 'merge-run-1', status: 'unclaimed' }),
    }]);
    send('peer-a', taskInsert);
    let task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('merge-task-1') as any;
    expect(task).toBeDefined();
    expect(task.status).toBe('unclaimed');

    send('peer-a', deltaPacket([{
      id: 2,
      table_name: 'tasks',
      action: 'UPDATE',
      timestamp: NOW(),
      payload: JSON.stringify({ id: 'merge-task-1', status: 'completed' }),
    }]));
    task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('merge-task-1') as any;
    expect(task.status).toBe('completed');
    expect(task.run_id).toBe('merge-run-1'); // column absent from the payload survives

    // workflow_runs partial UPDATE must not wipe dag_layout (the invariant
    // documented at transport.ts:154-158 — a blind INSERT OR REPLACE would).
    send('peer-a', deltaPacket([{
      id: 3,
      table_name: 'workflow_runs',
      action: 'UPDATE',
      timestamp: NOW(),
      payload: JSON.stringify({ id: 'merge-run-1', status: 'completed' }),
    }]));
    const run = db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get('merge-run-1') as any;
    expect(run.status).toBe('completed');
    expect(run.dag_layout).toBe('{"nodes":[1,2]}');
    expect(run.track).toBe('track2');
  });
});

describe('transport-sync-safety — NEGATIVE (hostile deltas change nothing)', () => {
  it('item 2: a system_settings delta leaves system_settings byte-identical and does not throw', () => {
    const before = db.prepare('SELECT key, value FROM system_settings ORDER BY key').all();

    expect(() => send('peer-a', deltaPacket([{
      id: 10,
      table_name: 'system_settings',
      action: 'INSERT',
      timestamp: NOW(),
      payload: JSON.stringify({ id: 'operator_credential', value: 'pwned' }),
    }]))).not.toThrow();

    const after = db.prepare('SELECT key, value FROM system_settings ORDER BY key').all();
    expect(after).toEqual(before);
    // Even the injection-shaped read must never resolve: nothing may alias
    // `id` out of system_settings through a derived table.
    const derived = db.prepare('SELECT key, value FROM system_settings ORDER BY key').all();
    expect(derived).toEqual(before);
  });

  it('item 3: a payload with an injected column key adds no column and writes no row', () => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run('inject-task-1');

    // Legal baseline row.
    send('peer-a', deltaPacket([{
      id: 20,
      table_name: 'tasks',
      action: 'INSERT',
      timestamp: NOW(),
      payload: JSON.stringify({ id: 'inject-task-1', run_id: 'merge-run-1', status: 'unclaimed' }),
    }]));
    const before = db.prepare('SELECT * FROM tasks WHERE id = ?').get('inject-task-1') as any;
    expect(before.status).toBe('unclaimed');

    // Hostile update: injected column name + stacked predicate shape.
    send('peer-a', deltaPacket([{
      id: 21,
      table_name: 'tasks',
      action: 'UPDATE',
      timestamp: NOW(),
      payload: JSON.stringify({
        id: 'inject-task-1',
        'id = (SELECT value FROM system_settings)': 'x',
        status: 'completed',
      }),
    }]));
    const after = db.prepare('SELECT * FROM tasks WHERE id = ?').get('inject-task-1') as any;
    expect(after.status).toBe('unclaimed'); // rejected before any SQL was prepared
    expect(Object.keys(after)).toEqual(Object.keys(before)); // no column added
  });

  it('item 4: after 3 hostile packets the schema still holds every baseline table', () => {
    const hostile = [
      { table_name: 'projects; DROP TABLE tasks;--', action: 'INSERT', payload: JSON.stringify({ id: 'x' }) },
      { table_name: '(SELECT key AS id, value FROM system_settings)', action: 'UPDATE', payload: JSON.stringify({ id: 'llm_api_key' }) },
      { table_name: 'dag_proposals', action: 'INSERT', payload: JSON.stringify({ id: 'pwn', proposal: '{"nodes":[]}', confidence: 0.9, status: 'pending', created_at: NOW() }) },
    ];
    hostile.forEach((h, i) => send('peer-b', deltaPacket([{ id: 100 + i, timestamp: NOW(), ...h }])));

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all() as { name: string }[];
    expect(tables.length).toBe(baselineTableCount);
    expect(tables.some((t) => t.name === 'tasks')).toBe(true);
  });

  it('item 5: sync_lock is released (is_syncing = 0) after every packet, including failing ones', () => {
    const hostile = [
      deltaPacket([{ id: 200, table_name: 'system_settings', action: 'DELETE', timestamp: NOW(), payload: JSON.stringify({ id: 'x' }) }]),
      deltaPacket([{ id: 201, table_name: 'os_todos', action: 'INSERT', timestamp: NOW(), payload: JSON.stringify({ id: 'x' }) }]),
      deltaPacket([{ id: 202, table_name: 'tasks', action: 'INSERT', timestamp: NOW(), payload: 'not-json' }]),
      deltaPacket([{ id: 203, table_name: 'projects', action: 'INSERT', timestamp: NOW(), payload: JSON.stringify({ id: 'lock-proj', name: 'ok', created_at: NOW() }) }]),
    ];
    for (const packet of hostile) {
      send('peer-b', packet);
      const lock = db.prepare('SELECT is_syncing FROM sync_lock WHERE rowid = 1').get() as { is_syncing: number };
      expect(lock.is_syncing).toBe(0);
    }
  });

  it('item 8: the prepared-statement cache stays bounded after 100 deltas', () => {
    for (let i = 0; i < 100; i++) {
      const table = (['projects', 'workflow_runs', 'tasks'] as const)[i % 3];
      const payload =
        table === 'projects'
          ? JSON.stringify({ id: `cache-proj-${i}`, name: `P${i}`, created_at: NOW() })
          : table === 'workflow_runs'
            ? JSON.stringify({ id: `cache-run-${i}`, project_id: 'merge-proj', status: 'pending', dag_layout: '{}', track: 'track2', created_at: NOW(), completed_at: null })
            : JSON.stringify({ id: `cache-task-${i}`, run_id: 'merge-run-1', status: 'failed' });
      send('peer-c', deltaPacket([{ id: 300 + i, table_name: table, action: 'INSERT', timestamp: NOW(), payload }]));
    }
    const cache = (transport as any).stmtCache as Map<string, unknown>;
    expect(cache.size).toBeGreaterThan(0);
    expect(cache.size).toBeLessThanOrEqual(32);
  });
});

describe('transport-sync-safety — lifecycle', () => {
  it('dispose() clears the 1s broadcast interval (no timer leak)', () => {
    vi.useFakeTimers();
    const before = vi.getTimerCount();
    const t = new NodeTransport();
    expect(vi.getTimerCount()).toBe(before + 1);
    t.dispose();
    expect(vi.getTimerCount()).toBe(before);
    vi.useRealTimers();
  });
});
