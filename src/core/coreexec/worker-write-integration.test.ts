import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import { db, initDB } from '../basevault/db';
import { workerPool } from './worker-pool';
import { attachWriteChannel, createWriteChannelPair } from '../basevault/write-queue';

/**
 * §5 / Phase F-6 — END-TO-END proof of the transport assumption.
 *
 * Every other write-queue test exercises the channel directly; this one
 * drives the REAL path: engine.ts hands port2 to `workerPool.execute` via
 * poolifier's transferList, the bundled worker configures its write client
 * from `input.writePort`, the plugin's writes post across, and the main
 * thread's sink applies them to the main :memory: DB. If poolifier's
 * message spread drops the transferred port (or the worker never sees it),
 * the writes land on the worker's own handle and these assertions fail.
 */
describe('F-6 — worker→main write channel end-to-end (poolifier transferList)', () => {
  beforeAll(() => {
    initDB();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM memory_quarantine').run();
    db.prepare('DELETE FROM memory_quarantine_vec').run();
    db.prepare('DELETE FROM cerebro_memories_meta').run();
    db.prepare('DELETE FROM cerebro_memories_vec').run();
    db.prepare('DELETE FROM os_todos').run();
  });

  it('routes okf_indexer writes through the transferred port into the main-thread sink', async () => {
    const taskId = crypto.randomUUID();
    const payload = 'integration payload ' + crypto.randomUUID();

    const { port1, port2 } = createWriteChannelPair();
    const channel = attachWriteChannel(port1);

    let result: any;
    try {
      result = await workerPool.execute({
        taskId,
        prompt: 'index this content',
        plugin: 'okf_indexer',
        params: { url: 'https://example.com/int', mockContent: payload },
        writePort: port2,
      }, undefined, undefined, [port2]);
    } finally {
      await channel.finishAndDrain();
    }

    expect(result?.status).toBe('success');
    expect(channel.received).toBeGreaterThanOrEqual(2); // vector insert + os_todos write

    // The writes landed on the MAIN thread's database — not the worker's
    // private handle. That is the entire point of the cutover.
    const quarantine = db.prepare('SELECT COUNT(*) as n FROM memory_quarantine WHERE content = ?').get(payload) as { n: number };
    expect(quarantine.n).toBe(1);

    const todos = db.prepare("SELECT COUNT(*) as n FROM os_todos WHERE escalation_reason = 'Quarantined OKF Ingestion'").get() as { n: number };
    expect(todos.n).toBe(1);

    const todo = db.prepare("SELECT context_payload FROM os_todos WHERE escalation_reason = 'Quarantined OKF Ingestion'").get() as { context_payload: string };
    const ctx = JSON.parse(todo.context_payload);
    expect(ctx.action).toBe('REVIEW_QUARANTINE');
    expect(typeof ctx.memoryId).toBe('string'); // id minted in the worker, carried in the op
  });
});
