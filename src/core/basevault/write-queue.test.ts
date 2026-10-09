import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initDB } from './db';
import {
  postWriteOp,
  postWriteOpOrThrow,
  applyWriteOp,
  validateWriteOp,
  configureWriteClient,
  attachWriteChannel,
  createWriteChannelPair,
  MAX_PENDING_WRITES,
  type WriteOp,
} from './write-queue';

/**
 * §5 / Phase F-6 — the single-writer write queue contract.
 *
 * Pins the three caller-visible statuses the topology doc demands (200 /
 * 400 / 429), the local-apply fallback (main thread + inline tests), and
 * the real transport round-trip over a MessageChannel — the exact seam the
 * engine uses to hand a write port to a poolifier worker.
 */
describe('write-queue — validation (400 path)', () => {
  it('rejects unknown kinds before any enqueue', () => {
    const res = postWriteOp({ kind: 'bogus' } as unknown as WriteOp);
    expect(res.status).toBe(400);
    expect(res.applied).toBe('dropped');
  });

  it('rejects a memory_insert missing content/type/flag', () => {
    const res = postWriteOp({ kind: 'memory_insert', id: 'x', content: 'c', isAutoIngested: false } as unknown as WriteOp);
    expect(res.status).toBe(400);
    expect(res.error).toContain('type');
  });

  it('rejects a todo_insert with a non-string contextPayload', () => {
    const res = postWriteOp({
      kind: 'todo_insert', id: 'x', severity: 'high', escalationReason: 'r',
      requiredActionType: 'REVIEW', contextPayload: { not: 'a string' },
    } as unknown as WriteOp);
    expect(res.status).toBe(400);
  });

  it('validateWriteOp returns null for every well-formed op kind', () => {
    expect(validateWriteOp({ kind: 'memory_insert', id: 'a', content: 'c', type: 't', isAutoIngested: true })).toBeNull();
    expect(validateWriteOp({ kind: 'learning_approval_insert', id: 'a', fact: 'f', confidence: 0.6 })).toBeNull();
    expect(validateWriteOp({ kind: 'todo_insert', id: 'a', severity: 's', escalationReason: 'r', requiredActionType: 'REVIEW', contextPayload: '{}' })).toBeNull();
    expect(validateWriteOp({ kind: 'memory_delete', id: 'a' })).toBeNull();
    expect(validateWriteOp({ kind: 'prune_stale', staleThreshold: 1, minAccess: 0 })).toBeNull();
    expect(validateWriteOp({ kind: 'vec_cleanup_orphans' })).toBeNull();
  });
});

describe('write-queue — local apply (no channel: main thread / inline tests)', () => {
  beforeEach(() => {
    initDB();
    configureWriteClient(null);
    db.prepare('DELETE FROM memory_quarantine').run();
    db.prepare('DELETE FROM memory_quarantine_vec').run();
    db.prepare('DELETE FROM cerebro_memories_meta').run();
    db.prepare('DELETE FROM cerebro_memories_vec').run();
    db.prepare('DELETE FROM cerebro_learning_approvals').run();
    db.prepare('DELETE FROM os_todos').run();
  });

  it('applies a quarantine memory_insert (200, row visible)', () => {
    const res = postWriteOp({
      kind: 'memory_insert', id: 'm1', content: 'tainted', type: 'external_document',
      isAutoIngested: true, embedding: Array.from({ length: 1536 }, () => 0.5),
    });
    expect(res.status).toBe(200);
    expect(res.applied).toBe('local');
    const row = db.prepare('SELECT * FROM memory_quarantine WHERE id = ?').get('m1') as any;
    expect(row.taint_flag).toBe(1);
    const vec = db.prepare('SELECT id FROM memory_quarantine_vec WHERE id = ?').get('m1');
    expect(vec).toBeDefined();
  });

  it('applies a plain memory_insert into cerebro_memories_meta', () => {
    postWriteOpOrThrow({ kind: 'memory_insert', id: 'm2', content: 'plain', type: 'preference', isAutoIngested: false });
    const row = db.prepare('SELECT * FROM cerebro_memories_meta WHERE id = ?').get('m2') as any;
    expect(row.content).toBe('plain');
  });

  it('applies a todo_insert with the CoreExec/module defaults', () => {
    postWriteOpOrThrow({
      kind: 'todo_insert', id: 't1', projectId: 'p1', severity: 'high',
      escalationReason: 'Schema Drift Circuit Breaker Tripped', requiredActionType: 'REVIEW',
      contextPayload: JSON.stringify({ action: 'REVIEW_SCHEMA_PATCH' }),
    });
    const row = db.prepare('SELECT * FROM os_todos WHERE id = ?').get('t1') as any;
    expect(row.source_module).toBe('CoreExec');
    expect(row.severity).toBe('high');
    expect(row.status).toBe('pending');
  });

  it('applies a learning_approval_insert with conflict fields', () => {
    postWriteOpOrThrow({
      kind: 'learning_approval_insert', id: 'a1', fact: 'dark mode', confidence: 0.6,
      conflictWithId: 'm2', conflictReasoning: 'contradiction',
    });
    const row = db.prepare('SELECT * FROM cerebro_learning_approvals WHERE id = ?').get('a1') as any;
    expect(row.status).toBe('pending');
    expect(row.conflict_with_id).toBe('m2');
  });

  it('applies memory_delete / prune_stale / vec_cleanup_orphans', () => {
    postWriteOpOrThrow({ kind: 'memory_insert', id: 'd1', content: 'old', type: 'preference', isAutoIngested: false });
    postWriteOpOrThrow({ kind: 'memory_delete', id: 'd1' });
    expect(db.prepare('SELECT * FROM cerebro_memories_meta WHERE id = ?').get('d1')).toBeUndefined();
    expect(db.prepare('SELECT * FROM cerebro_memories_vec WHERE id = ?').get('d1')).toBeUndefined();

    postWriteOpOrThrow({ kind: 'memory_insert', id: 'd2', content: 'stale', type: 'preference', isAutoIngested: false });
    postWriteOpOrThrow({ kind: 'prune_stale', staleThreshold: Date.now() + 10_000, minAccess: 5 });
    expect(db.prepare('SELECT * FROM cerebro_memories_meta WHERE id = ?').get('d2')).toBeUndefined();

    // orphan vec row (meta already deleted) swept by the cleanup op
    postWriteOpOrThrow({ kind: 'memory_insert', id: 'd3', content: 'gone', type: 'preference', isAutoIngested: false, embedding: Array.from({ length: 1536 }, (_, i) => i % 2) });
    db.prepare('DELETE FROM cerebro_memories_meta WHERE id = ?').run('d3');
    postWriteOpOrThrow({ kind: 'vec_cleanup_orphans' });
    expect(db.prepare('SELECT * FROM cerebro_memories_vec WHERE id = ?').get('d3')).toBeUndefined();
  });

  it('postWriteOpOrThrow surfaces a rejected op as a thrown error (pre-cutover parity with a failed .run())', () => {
    expect(() => postWriteOpOrThrow({ kind: 'nope' } as unknown as WriteOp)).toThrow(/400/);
  });
});

describe('write-queue — MessageChannel transport (the engine seam)', () => {
  beforeEach(() => {
    initDB();
    db.prepare('DELETE FROM cerebro_memories_meta').run();
    db.prepare('DELETE FROM cerebro_memories_vec').run();
    db.prepare('DELETE FROM os_todos').run();
  });

  afterEach(() => {
    configureWriteClient(null);
  });

  it('round-trips a worker-posted op to the main thread sink and drains', async () => {
    const { port1, port2 } = createWriteChannelPair();
    const channel = attachWriteChannel(port1);
    configureWriteClient(port2);

    const res = postWriteOp({ kind: 'memory_insert', id: 'rt1', content: 'routed', type: 'preference', isAutoIngested: false });
    expect(res.status).toBe(200);
    expect(res.applied).toBe('queued');
    // nothing applied synchronously — it crosses the port
    expect(db.prepare('SELECT * FROM cerebro_memories_meta WHERE id = ?').get('rt1')).toBeUndefined();

    // Worker side closes after its last post (exactly what the worker's
    // releaseWriteClient does); main side drains and settles.
    port2.close();
    configureWriteClient(null);
    await channel.done;
    await channel.finishAndDrain();

    expect(channel.received).toBe(1);
    expect(db.prepare('SELECT content FROM cerebro_memories_meta WHERE id = ?').get('rt1')).toEqual({ content: 'routed' });
  });

  it('applies FIFO order across a channel (prune-vs-insert ordering)', async () => {
    const { port1, port2 } = createWriteChannelPair();
    const channel = attachWriteChannel(port1);
    configureWriteClient(port2);

    for (let i = 0; i < 5; i++) {
      postWriteOpOrThrow({ kind: 'memory_insert', id: `f${i}`, content: `c${i}`, type: 'preference', isAutoIngested: false });
    }
    port2.close();
    configureWriteClient(null);
    await channel.done;
    await channel.finishAndDrain();

    const rows = db.prepare('SELECT id FROM cerebro_memories_meta ORDER BY rowid').all() as { id: string }[];
    expect(rows.map(r => r.id)).toEqual(['f0', 'f1', 'f2', 'f3', 'f4']);
  });

  it('returns 429 once MAX_PENDING_WRITES ops are in flight (bounded queue, caller-visible overflow)', async () => {
    const { port1, port2 } = createWriteChannelPair();
    attachWriteChannel(port1);
    configureWriteClient(port2);

    const results = [];
    for (let i = 0; i < MAX_PENDING_WRITES + 1; i++) {
      results.push(postWriteOp({ kind: 'memory_insert', id: `q${i}`, content: 'x', type: 'preference', isAutoIngested: false }).status);
    }
    // The loop is synchronous: no ack can be delivered mid-loop, so the
    // first MAX_PENDING_WRITES posts queue and the next one overflows.
    expect(results.slice(0, MAX_PENDING_WRITES).every(s => s === 200)).toBe(true);
    expect(results[MAX_PENDING_WRITES]).toBe(429);

    // After the sink drains and acks, posting succeeds again.
    port2.close();
    configureWriteClient(null);
    await new Promise(r => setTimeout(r, 20));
    configureWriteClient(null);
  });

  it('ignores foreign (non-write) messages on the drain port without crashing', async () => {
    const { port1, port2 } = createWriteChannelPair();
    const channel = attachWriteChannel(port1);
    port2.postMessage({ hello: 'not-an-op' });
    port2.close();
    await channel.done;
    await channel.finishAndDrain();
    expect(channel.received).toBe(0);
  });
});
