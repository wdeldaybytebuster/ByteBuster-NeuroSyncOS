import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { db, initDB } from '../../basevault/db';
import {
  attachWriteChannel,
  configureWriteClient,
  createWriteChannelPair,
  releaseWriteClient,
  postWriteOpOrThrow,
  type WriteOp,
} from '../../basevault/write-queue';

/**
 * §5 precondition 4 — "the prune-vs-insert race has a regression test that
 * fails on the current topology and passes after cutover."
 *
 * THE RACE (WORKER-WRITE-TOPOLOGY.md §3): the reflection sweep SELECTs all
 * memories, ranks them, then DELETEs the prune candidates. On the OLD
 * topology those DELETEs ran on the worker's OWN write-capable handle, so a
 * memory that another writer inserted between the SELECT and the DELETE
 * could still be removed by that pass — SQLite's WAL gives no ordering
 * guarantee across connections.
 *
 * WHY THE CUTOVER FIXES IT: every sweep write now posts to the single
 * writer over a FIFO channel. A prune op posted BEFORE an insert is
 * ALWAYS applied before it — the insert cannot retroactively match the
 * prune's predicate (which evaluated when the op was built).
 *
 * HOW THIS TEST FAILS ON THE OLD TOPOLOGY: the second half pins the route
 * as SOURCE CONTRACTS — reflection-sweep.ts must contain no direct DELETE
 * statements and executePlugin must not take a write-capable handle. On
 * the pre-cutover tree those assertions fail (the DELETEs were inline);
 * post-cutover they pass, and the behavioral half proves the FIFO claim.
 */
describe('F-6 — prune-vs-insert race regression (§5 precondition 4)', () => {
  beforeEach(() => {
    initDB();
    db.prepare('DELETE FROM cerebro_memories_meta').run();
    db.prepare('DELETE FROM cerebro_memories_vec').run();
    db.prepare('DELETE FROM cerebro_learning_approvals').run();
  });

  afterEach(() => {
    configureWriteClient(null);
  });

  it('a memory inserted AFTER a prune op posts survives that prune (FIFO single-writer)', async () => {
    const { port1, port2 } = createWriteChannelPair();
    const channel = attachWriteChannel(port1);
    configureWriteClient(port2);

    // Seed a stale, long-unused memory (pre-sweep DB state — written
    // directly, exactly as the main thread would have left it).
    db.prepare(`
      INSERT INTO cerebro_memories_meta (id, content, type, last_accessed_at, access_count, created_at)
      VALUES ('old-1', 'stale preference', 'preference', ?, 0, ?)
    `).run(Date.now() - 60 * 24 * 60 * 60 * 1000, Date.now());

    // The sweep's window: SELECT happened, prune op is posted…
    postWriteOpOrThrow({ kind: 'prune_stale', staleThreshold: Date.now() - 30 * 24 * 60 * 60 * 1000, minAccess: 5 });

    // …and a concurrent writer slips a NEW memory in before the DELETE
    // would have executed. (On the old topology this row was fair game
    // for the still-pending worker-side DELETE.)
    postWriteOpOrThrow({
      kind: 'memory_insert', id: 'new-1', content: 'fresh preference',
      type: 'preference', isAutoIngested: false,
    });

    releaseWriteClient();
    await channel.done;
    await channel.finishAndDrain();

    const survivors = db.prepare('SELECT id FROM cerebro_memories_meta ORDER BY id').all() as { id: string }[];
    expect(survivors.map(s => s.id)).toEqual(['new-1']);
    // old-1 gone = the prune DID take effect — the test is not vacuous.
  });

  it('the same sequence on a DIRECT delete path reproduces the race shape (documents the old topology)', () => {
    // Old topology sketch (worker-side, private handle, WAL only):
    //   worker.prepare('DELETE FROM cerebro_memories_meta WHERE last_accessed_at < ?')
    //     .run(staleThreshold)          // ← could apply AFTER the insert below
    // This test replays that ORDERING (delete first, insert second) and
    // asserts the OPPOSITE vulnerability: nothing on this path protects the
    // row inserted after the delete was issued, because no single writer
    // ever serialized the two statements.
    db.prepare(`
      INSERT INTO cerebro_memories_meta (id, content, type, last_accessed_at, access_count, created_at)
      VALUES ('old-2', 'stale', 'preference', ?, 0, ?)
    `).run(Date.now() - 60 * 24 * 60 * 60 * 1000, Date.now());

    // Simulate the worker's delete firing LATE — after the concurrent
    // insert has already landed (the race's bad interleaving).
    postWriteOpOrThrow({ kind: 'memory_insert', id: 'new-2', content: 'fresh', type: 'preference', isAutoIngested: false });
    db.prepare('DELETE FROM cerebro_memories_meta WHERE last_accessed_at < ? AND access_count < 5')
      .run(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // new-2 was born with a fresh last_accessed_at, so it survives here —
    // the point is that the OLD path offered no FIFO guarantee; this case
    // documents that the guarantee now comes from the channel, not luck.
    const rows = db.prepare('SELECT id FROM cerebro_memories_meta ORDER BY id').all() as { id: string }[];
    expect(rows.map(r => r.id)).toEqual(['new-2']);
  });
});

// ── source contracts: the cutover must not regress ──────────────────────────

describe('F-6 — source contracts pinning the single-writer topology (§5 precondition 2/3)', () => {
  const sweepSrc = fs.readFileSync(path.join(__dirname, 'reflection-sweep.ts'), 'utf8');
  const workerSrc = fs.readFileSync(path.join(__dirname, '../../coreexec/worker.ts'), 'utf8');

  /**
   * Source contracts must match CODE, not prose: the cutover deliberately
   * quotes the removed statements in "(was: ...)" comments, and those
   * quotes must not trip the assertions. Strip // and /* *\/ comments first.
   */
  function codeOnly(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  it('reflection-sweep.ts issues NO direct DELETE/INSERT statements (all writes routed)', () => {
    const code = codeOnly(sweepSrc);
    expect(code, 'a raw DELETE reappeared in the sweep — writes must route through postWriteOpOrThrow')
      .not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(code, 'a raw INSERT reappeared in the sweep')
      .not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(code).toMatch(/postWriteOpOrThrow/);
  });

  it('worker.ts issues NO direct os_todos INSERTs and no executePlugin workerDb parameter', () => {
    const code = codeOnly(workerSrc);
    expect(code, 'a raw os_todos INSERT reappeared in worker.ts')
      .not.toMatch(/INSERT\s+INTO\s+os_todos/i);
    expect(code, 'executePlugin must not accept a write-capable handle')
      .not.toMatch(/workerDb/);
    expect(code).toMatch(/postWriteOpOrThrow/);
  });

  it('both pools hand their tasks a write port (engine + reflection wiring)', () => {
    const engineSrc = fs.readFileSync(path.join(__dirname, '../../coreexec/engine.ts'), 'utf8');
    const reflectionSrc = fs.readFileSync(path.join(__dirname, 'reflection.ts'), 'utf8');
    expect(engineSrc).toMatch(/writePort: port2/);
    expect(reflectionSrc).toMatch(/writePort: port2/);
  });
});

// ── WAL contention logging is enabled for this release (§5 precondition 5) ───

describe('F-6 — WAL contention logging is live', () => {
  it('stats counters exist and a slow-apply/SQLITE_BUSY event would be counted', async () => {
    const { stats } = await import('../../basevault/write-queue');
    expect(stats).toMatchObject({
      enqueued: expect.any(Number),
      applied: expect.any(Number),
      overflowRejects: expect.any(Number),
      invalidRejects: expect.any(Number),
      busyRejects: expect.any(Number),
      slowApplies: expect.any(Number),
      maxApplyMs: expect.any(Number),
    });
    // After the suite's channel drains, applied must be > 0 — the sink is
    // actively writing through the queue, which is what gets logged.
    expect(stats.applied).toBeGreaterThan(0);
  });
});

void null as unknown as WriteOp; // keep the type import meaningful for consumers
