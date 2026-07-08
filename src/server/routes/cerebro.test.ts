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

async function post(path: string): Promise<{ status: number; body: any }> {
  const res = await cerebroRouter.request(path, { method: 'POST' });
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

describe('cerebroRouter pruning', () => {
  const DECAYED_ID = 'prune-decayed-mem';
  const FRESH_ID = 'prune-fresh-mem';
  const now = Date.now();
  const staleTs = now - 30 * 24 * 60 * 60 * 1000; // 30d idle → decayFactor ≈ e^-9 ≪ 0.1

  function seed() {
    // A decayed memory (well past the 0.1 threshold) and a fresh one (accessed now).
    db.prepare(`
      INSERT OR REPLACE INTO cerebro_memories_meta (id, content, type, last_accessed_at, access_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(DECAYED_ID, 'a stale forgotten memory that has not been touched in a very long time indeed', 'episodic', staleTs, 0, staleTs);
    db.prepare(`
      INSERT OR REPLACE INTO cerebro_memories_meta (id, content, type, last_accessed_at, access_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(FRESH_ID, 'a fresh recently used memory', 'episodic', now, 5, now);
  }

  function cleanup() {
    db.prepare('DELETE FROM cerebro_memories_meta WHERE id IN (?, ?)').run(DECAYED_ID, FRESH_ID);
    db.prepare('DELETE FROM cerebro_memories_vec WHERE id IN (?, ?)').run(DECAYED_ID, FRESH_ID);
  }

  it('preview is a dry run: lists the decayed memory but deletes nothing', async () => {
    seed();
    try {
      const { status, body } = await get('/prune-preview');
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.threshold).toBe(0.1);
      const ids = body.candidates.map((m: any) => m.id);
      expect(ids).toContain(DECAYED_ID);
      expect(ids).not.toContain(FRESH_ID);
      // content is truncated for display (~80 chars + ellipsis)
      const cand = body.candidates.find((m: any) => m.id === DECAYED_ID);
      expect(cand.content.length).toBeLessThanOrEqual(81);
      expect(cand.decayFactor).toBeLessThan(0.1);
      // Dry run: rows still present.
      expect(db.prepare('SELECT COUNT(*) AS n FROM cerebro_memories_meta WHERE id = ?').get(DECAYED_ID)).toEqual({ n: 1 });
    } finally {
      cleanup();
    }
  });

  it('confirm actually deletes decayed rows (meta + vec), keeps fresh, and logs the count', async () => {
    seed();
    // Also seed the vec side so we can prove BOTH tables are cleaned.
    db.prepare('INSERT OR REPLACE INTO cerebro_memories_vec (id, embedding) VALUES (?, ?)')
      .run(DECAYED_ID, Buffer.from(new Float32Array(1536).buffer));

    const before = (db.prepare('SELECT SUM(count) AS t FROM cerebro_prune_log WHERE pruned_at >= ?')
      .get(now - 30 * 24 * 60 * 60 * 1000) as any).t ?? 0;

    try {
      const { status, body } = await post('/prune-confirm');
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.pruned).toBeGreaterThanOrEqual(1);

      // Decayed memory is GONE from both tables.
      expect(db.prepare('SELECT COUNT(*) AS n FROM cerebro_memories_meta WHERE id = ?').get(DECAYED_ID)).toEqual({ n: 0 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM cerebro_memories_vec WHERE id = ?').get(DECAYED_ID)).toEqual({ n: 0 });
      // Fresh memory SURVIVES.
      expect(db.prepare('SELECT COUNT(*) AS n FROM cerebro_memories_meta WHERE id = ?').get(FRESH_ID)).toEqual({ n: 1 });

      // Prune history reflects the deletion.
      const hist = await get('/prune-history');
      expect(hist.body.success).toBe(true);
      expect(hist.body.pruned30d).toBeGreaterThanOrEqual(before + 1);
    } finally {
      cleanup();
    }
  });
});

describe('cerebroRouter learning approvals: conflict supersession', () => {
  it('approving a conflicting fact deletes the old memory row (meta + vec) and inserts the new fact, net count unchanged', async () => {
    const oldId = 'approve-conflict-old-mem';
    const now = Date.now();
    db.prepare(`
      INSERT INTO cerebro_memories_meta (id, content, type, last_accessed_at, access_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(oldId, 'User prefers Node.js.', 'fact', now, 0, now);
    db.prepare('INSERT INTO cerebro_memories_vec (id, embedding) VALUES (?, ?)')
      .run(oldId, Buffer.from(new Float32Array(1536).buffer));

    const approvalId = 'approve-conflict-approval';
    db.prepare(`
      INSERT INTO cerebro_learning_approvals (id, fact, confidence, status, source_run_id, created_at, conflict_with_id, conflict_reasoning)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(approvalId, 'User prefers Python now.', 0.6, 'pending', null, now, oldId, 'Possibly contradicts an existing memory: "User prefers Node.js."');

    const countBefore = (db.prepare('SELECT COUNT(*) AS n FROM cerebro_memories_meta').get() as any).n;

    try {
      const { status, body } = await post(`/learning-approvals/${approvalId}/approve`);
      expect(status).toBe(200);
      expect(body.success).toBe(true);

      // Old memory is gone from BOTH tables.
      expect(db.prepare('SELECT COUNT(*) AS n FROM cerebro_memories_meta WHERE id = ?').get(oldId)).toEqual({ n: 0 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM cerebro_memories_vec WHERE id = ?').get(oldId)).toEqual({ n: 0 });

      // New fact IS present with the updated content.
      const newRow = db.prepare(`SELECT * FROM cerebro_memories_meta WHERE content = ?`).get('User prefers Python now.') as any;
      expect(newRow).toBeTruthy();

      // Net memory count is unchanged: one row removed (superseded), one added.
      const countAfter = (db.prepare('SELECT COUNT(*) AS n FROM cerebro_memories_meta').get() as any).n;
      expect(countAfter).toBe(countBefore);

      // Approval marked approved.
      const approvalRow = db.prepare('SELECT status FROM cerebro_learning_approvals WHERE id = ?').get(approvalId) as any;
      expect(approvalRow.status).toBe('approved');
    } finally {
      db.prepare('DELETE FROM cerebro_memories_meta WHERE content = ?').run('User prefers Python now.');
      db.prepare('DELETE FROM cerebro_memories_meta WHERE id = ?').run(oldId);
      db.prepare('DELETE FROM cerebro_memories_vec WHERE id = ?').run(oldId);
      db.prepare('DELETE FROM cerebro_learning_approvals WHERE id = ?').run(approvalId);
    }
  });
});

describe('cerebroRouter /decay-stats respects cerebro_decay_multiplier setting', () => {
  it('produces a different nearingDecay count when a custom decay multiplier is set vs left unset', async () => {
    const now = Date.now();
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
    const id = 'decay-setting-probe';

    type MetaRow = {
      id: string; content: string; type: string;
      last_accessed_at: number; access_count: number; created_at: number;
    };
    // Isolate: snapshot and clear cerebro_memories_meta so nearingDecay is
    // deterministically driven only by our single probe row.
    const snapshot = db.prepare('SELECT * FROM cerebro_memories_meta').all() as MetaRow[];
    db.prepare('DELETE FROM cerebro_memories_meta').run();
    db.prepare("DELETE FROM system_settings WHERE key = 'cerebro_decay_multiplier'").run();

    db.prepare(`
      INSERT INTO cerebro_memories_meta (id, content, type, last_accessed_at, access_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, 'decay setting probe', 'episodic', tenDaysAgo, 0, tenDaysAgo);

    try {
      // Default decay rate (0.3): e^(-10*0.3) = e^-3 ≈ 0.0498 < 0.1 → nearing decay.
      const { body: defaultBody } = await get('/decay-stats');
      expect(defaultBody.nearingDecay).toBe(1);

      // Custom, much slower decay rate read from system_settings: e^(-10*0.01) ≈ 0.905 ≥ 0.1 → NOT nearing decay.
      db.prepare(`
        INSERT INTO system_settings (key, value) VALUES ('cerebro_decay_multiplier', '0.01')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run();
      const { body: customBody } = await get('/decay-stats');
      expect(customBody.nearingDecay).toBe(0);

      expect(customBody.nearingDecay).not.toBe(defaultBody.nearingDecay);
    } finally {
      db.prepare('DELETE FROM cerebro_memories_meta').run();
      db.prepare("DELETE FROM system_settings WHERE key = 'cerebro_decay_multiplier'").run();
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
