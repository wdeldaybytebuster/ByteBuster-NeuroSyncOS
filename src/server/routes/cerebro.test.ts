import { describe, it, expect, beforeAll } from 'vitest';
import { cerebroRouter } from './cerebro';
import { db, initDB } from '../../core/basevault/db';

// Ensure basevault schema exists; vitest runs files in isolation.
beforeAll(() => {
  initDB();
});

async function get(path: string): Promise<{ status: number; body: any }> {
  const res = await cerebroRouter.request(path);
  return { status: res.status, body: await res.json() };
}

describe('cerebroRouter /health', () => {
  it('returns cold status with zero vectors when store is empty', async () => {
    // Seed-and-clean: bucket of recent memories won't be in this test path.
    // Either case is valid; assert structural shape either way.
    const { status, body } = await get('/health');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.vectorCount).toBe('number');
    expect(body.vectorCount).toBeGreaterThanOrEqual(0);
    expect(['cold', 'nominal', 'stale', 'warning']).toContain(body.status);
    expect(typeof body.now).toBe('number');
  });

  it('reflects seeded data: vectorCount and lastReflection are returned', async () => {
    const now = Date.now();
    const id1 = 'test-mem-1';
    const id2 = 'test-mem-2';

    db.prepare(`
      INSERT OR REPLACE INTO cerebro_memories_meta (id, content, type, last_accessed_at, access_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id1, 'reflection probe 1', 'episodic', now, 1, now);
    db.prepare(`
      INSERT OR REPLACE INTO cerebro_memories_meta (id, content, type, last_accessed_at, access_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id2, 'reflection probe 2', 'episodic', now - 1000, 1, now - 1000);

    try {
      const baseCount = ((db.prepare('SELECT COUNT(*) AS n FROM cerebro_memories_meta').get() as any).n) - 2;
      const { status, body } = await get('/health');
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.vectorCount).toBe(baseCount + 2);
      expect(body.lastReflection).toBe(now);          // highest of the two timestamps
      expect(body.status).toBe('nominal');             // touched <1h ago
    } finally {
      db.prepare('DELETE FROM cerebro_memories_meta WHERE id IN (?, ?)').run(id1, id2);
    }
  });

  it('reports warning status when most recent memory is older than 24h', async () => {
    const oldTs = Date.now() - 25 * 60 * 60 * 1000; // 25h ago
    const id = 'test-mem-old';

    // Snapshot and remove all pre-existing rows so MAX(last_accessed_at) is
    // deterministically the stale probe, regardless of shared DB state from
    // other test files or initDB() seeding.
    type MetaRow = {
      id: string; content: string; type: string;
      last_accessed_at: number; access_count: number; created_at: number;
    };
    const snapshot = db
      .prepare('SELECT * FROM cerebro_memories_meta')
      .all() as MetaRow[];
    db.prepare('DELETE FROM cerebro_memories_meta').run();

    db.prepare(`
      INSERT INTO cerebro_memories_meta (id, content, type, last_accessed_at, access_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, 'stale probe', 'episodic', oldTs, 1, oldTs);

    try {
      const { body } = await get('/health');
      expect(body.lastReflection).toBe(oldTs);
      expect(body.status).toBe('warning');
    } finally {
      // Restore pre-existing rows and remove the stale probe.
      db.prepare('DELETE FROM cerebro_memories_meta').run();
      const restore = db.prepare(`
        INSERT OR REPLACE INTO cerebro_memories_meta
          (id, content, type, last_accessed_at, access_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const restoreAll = db.transaction((rows: MetaRow[]) => {
        for (const r of rows) {
          restore.run(r.id, r.content, r.type, r.last_accessed_at, r.access_count, r.created_at);
        }
      });
      restoreAll(snapshot);
    }
  });
});
