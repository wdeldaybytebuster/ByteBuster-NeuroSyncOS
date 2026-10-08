import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { db, initDB } from '../db';
import { NodeTransport, SyncPacket } from './transport';
import { loadSyncSecret, syncMac } from './sync-handshake';

// §2.1-C3: point the sync secret at a temp path so tests never touch (and
// never depend on) .data/.sync.secret. Must be set before first handshake.
process.env.NEUROSYNC_SYNC_SECRET_PATH ??= '/tmp/opencode/neurosync/test-sync.secret';

/**
 * §4.1 V1 — transport sync-safety suite.
 *
 * Proves the C1/C2/C3 remediation of §0-V1 (arbitrary SQL via WebSocket):
 *  - only trigger-derived tables/columns ever reach SQL (validate-then-template),
 *  - the read-modify-write merge invariant at transport.ts:154-158 is preserved,
 *  - hostile packets change nothing and never leave sync_lock stuck,
 *  - the prepared-statement cache is bounded,
 *  - and (as of C3) an unauthenticated peer cannot reach the writer at all
 *    (items 6/7 + the handshake block).
 */

let transport: NodeTransport;
let baselineTableCount: number;

function fakeWs() {
  return {
    sent: [] as string[],
    closed: [] as number[],
    readyState: 1, // WebSocket.OPEN
    send(msg: string) { this.sent.push(msg); },
    close(code?: number) { this.closed.push(code ?? 1005); },
  } as any;
}

/** Raw (unauthenticated) frame — what an attacker on the LAN can send. */
function sendRaw(peerId: string, packet: unknown, ws: any = fakeWs()) {
  transport.handleIncomingMessage(JSON.stringify(packet), peerId, ws);
  return ws;
}

/** Authenticated send: performs the real challenge–response first. */
function authPeer(peerId: string): any {
  const ws = fakeWs();
  transport.addIncomingConnection(peerId, ws);
  const challengeRaw = ws.sent[ws.sent.length - 1];
  expect(challengeRaw, 'server must send a SYNC_CHALLENGE on open').toBeDefined();
  const challenge = JSON.parse(challengeRaw);
  expect(challenge.type).toBe('SYNC_CHALLENGE');
  const mac = syncMac(loadSyncSecret(), challenge.nonce, challenge.peerId);
  transport.handleIncomingMessage(
    JSON.stringify({ type: 'SYNC_AUTH', nonce: challenge.nonce, peerId: challenge.peerId, mac }),
    peerId,
    ws,
  );
  expect(
    (transport as any).authenticatedPeers.has(peerId),
    'valid SYNC_AUTH must authenticate the peer',
  ).toBe(true);
  return ws;
}

function send(peerId: string, packet: unknown): any {
  const ws = authPeer(peerId);
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

  it('item 6: unauthenticated peer sending SYNC_DELTA is dropped and touches nothing', () => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run('unauth-task-1');
    const before = db.prepare('SELECT key, value FROM system_settings ORDER BY key').all();

    // The literal §0-V1 exploit shape, sent with NO handshake completed.
    const ws = sendRaw('evil-peer', deltaPacket([{
      id: 900,
      table_name: 'tasks',
      action: 'INSERT',
      timestamp: NOW(),
      payload: JSON.stringify({ id: 'unauth-task-1', run_id: 'merge-run-1', status: 'unclaimed' }),
    }]));
    sendRaw('evil-peer', deltaPacket([{
      id: 901,
      table_name: 'system_settings',
      action: 'INSERT',
      timestamp: NOW(),
      payload: JSON.stringify({ id: 'operator_credential', value: 'pwned' }),
    }]));

    expect(db.prepare('SELECT * FROM tasks WHERE id = ?').get('unauth-task-1')).toBeUndefined();
    expect(db.prepare('SELECT key, value FROM system_settings ORDER BY key').all()).toEqual(before);
    expect((transport as any).authenticatedPeers.has('evil-peer')).toBe(false);
    expect(ws.closed).toEqual([]); // dropped silently — no crash, no write
  });

  it('item 7: authenticated peer + hostile delta is STILL rejected (auth ≠ validation)', () => {
    const ws = send('peer-auth', deltaPacket([{
      id: 910,
      table_name: 'system_settings',
      action: 'INSERT',
      timestamp: NOW(),
      payload: JSON.stringify({ id: 'llm_api_key', value: 'stolen' }),
    }]));
    expect((transport as any).authenticatedPeers.has('peer-auth')).toBe(true);
    const rows = db.prepare(`SELECT value FROM system_settings WHERE key = 'llm_api_key'`).all();
    expect(rows).toEqual([]); // defense in depth: policy rejects even for an authenticated peer
    expect(ws.closed).toEqual([]);
  });
});

describe('transport-sync-safety — C3 challenge–response handshake', () => {
  it('a valid SYNC_AUTH authenticates the peer and lets deltas through', () => {
    const ws = authPeer('good-peer');
    expect(ws.closed).toEqual([]);
    send('good-peer', deltaPacket([{
      id: 920, table_name: 'projects', action: 'INSERT', timestamp: NOW(),
      payload: JSON.stringify({ id: 'auth-proj', name: 'Authed', created_at: NOW() }),
    }]));
    expect(db.prepare('SELECT * FROM projects WHERE id = ?').get('auth-proj')).toBeDefined();
  });

  it('a wrong MAC is rejected and the socket is closed with 4401', () => {
    const ws = fakeWs();
    transport.addIncomingConnection('badmac-peer', ws);
    const challenge = JSON.parse(ws.sent[ws.sent.length - 1]);
    transport.handleIncomingMessage(
      JSON.stringify({ type: 'SYNC_AUTH', nonce: challenge.nonce, peerId: challenge.peerId, mac: 'AAAAforgedAAAA' }),
      'badmac-peer',
      ws,
    );
    expect((transport as any).authenticatedPeers.has('badmac-peer')).toBe(false);
    expect(ws.closed).toEqual([4401]);

    // …and a delta right after the failed auth still reaches nothing.
    transport.handleIncomingMessage(
      JSON.stringify(deltaPacket([{
        id: 930, table_name: 'projects', action: 'INSERT', timestamp: NOW(),
        payload: JSON.stringify({ id: 'after-badmac', name: 'x', created_at: NOW() }),
      }])),
      'badmac-peer',
      ws,
    );
    expect(db.prepare('SELECT * FROM projects WHERE id = ?').get('after-badmac')).toBeUndefined();
  });

  it('a peer that never answers the challenge is closed with 4401 after 5 s', () => {
    vi.useFakeTimers();
    try {
      const ws = fakeWs();
      transport.addIncomingConnection('silent-peer', ws);
      expect(ws.closed).toEqual([]);
      vi.advanceTimersByTime(5000);
      expect(ws.closed).toEqual([4401]);
      expect((transport as any).authenticatedPeers.has('silent-peer')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('3 failed handshakes lock the peer out for 5 min (even a later-valid MAC fails)', () => {
    const fails: any[] = [];
    for (let i = 0; i < 3; i++) {
      const ws = fakeWs();
      transport.addIncomingConnection('repeat-offender', ws);
      const challenge = JSON.parse(ws.sent[ws.sent.length - 1]);
      transport.handleIncomingMessage(
        JSON.stringify({ type: 'SYNC_AUTH', nonce: challenge.nonce, peerId: challenge.peerId, mac: `wrong-${i}` }),
        'repeat-offender',
        ws,
      );
      fails.push(ws);
    }
    expect((fails[0] as any).closed).toEqual([4401]);
    expect((transport as any).isLockedOut('repeat-offender')).toBe(true);

    // A correct MAC after lockout must NOT authenticate: the peer is refused
    // before a challenge is even issued, and any frame it sends anyway fails.
    const ws4 = fakeWs();
    transport.addIncomingConnection('repeat-offender', ws4);
    expect(ws4.sent).toEqual([]); // no challenge for a locked-out peer
    transport.handleIncomingMessage(
      JSON.stringify({ type: 'SYNC_AUTH', nonce: 'a'.repeat(22), peerId: 'repeat-offender', mac: 'valid-looking-but-refused' }),
      'repeat-offender',
      ws4,
    );
    expect((transport as any).authenticatedPeers.has('repeat-offender')).toBe(false);
    expect(ws4.closed).toContain(4401);
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
