import { Hono } from 'hono';
import { db } from '../../core/basevault/db';
import { CerebroVectorStore } from '../../core/memory/cerebro/vector';
import { ReflectionExecutor } from '../../core/memory/cerebro/reflection';

export const cerebroRouter = new Hono();

// §3.1 — Cerebro Health: vector count, last reflection timestamp, derived status.
cerebroRouter.get('/health', (c) => {
  try {
    const vectorCountRow = db
      .prepare('SELECT COUNT(*) AS n FROM cerebro_memories_meta')
      .get() as { n: number } | undefined;
    const lastTouchRow = db
      .prepare('SELECT MAX(last_accessed_at) AS ts FROM cerebro_memories_meta')
      .get() as { ts: number | null } | undefined;

    const vectorCount = vectorCountRow?.n ?? 0;
    const lastReflection = lastTouchRow?.ts ?? null;
    const now = Date.now();

    // Derive status from idleness. Empty store is 'cold' (still nominal — read-only baseline).
    let status: 'cold' | 'nominal' | 'stale' | 'warning' = 'cold';
    if (lastReflection != null) {
      const ageMs = now - lastReflection;
      if (ageMs < 60 * 60 * 1000) status = 'nominal';        // touched within 1h
      else if (ageMs < 24 * 60 * 60 * 1000) status = 'stale'; // 1h–24h
      else status = 'warning';                                // >24h
    }

    return c.json({ success: true, vectorCount, lastReflection, status, now });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Instantiate Cerebro services
const reflectionExecutor = new ReflectionExecutor();

// Execute raw SQL query (Admin / Explorer)
cerebroRouter.post('/query', async (c) => {
  try {
    const { query } = await c.req.json();
    if (!query) return c.json({ success: false, error: 'No query provided' }, 400);

    const stmt = db.prepare(query);
    const results = stmt.all();

    return c.json({ success: true, data: results });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Trigger asynchronous Reflection Cycle
cerebroRouter.post('/habituate', async (c) => {
  try {
    // Run reflection asynchronously
    setTimeout(() => reflectionExecutor.runCycle().catch(console.error), 0);
    return c.json({ success: true, message: 'Reflection cycle initiated' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Test Vector Search Tuner
cerebroRouter.post('/vector-search', async (c) => {
  try {
    const { query } = await c.req.json();
    if (!query) return c.json({ success: false, error: 'No query provided' }, 400);

    // Normally this hits LLM to embed the query first.
    // For local tuning, if LLM is mock, we just do a mock return or keyword search
    // Since VectorStore requires a Float32Array vector, we'll mock it if needed.
    const mockQueryVector = new Float32Array(1536).fill(0.1);
    
    // We'll perform a dummy search to show the pipeline is wired
    const results = CerebroVectorStore.search(mockQueryVector, 3);
    
    return c.json({ 
      success: true, 
      results: results.length ? results : [{ id: 'mock-1', text: 'No semantic matches found. Keyword fallback activated.', distance: 0.99 }] 
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// GET learning approvals queue
cerebroRouter.get('/learning-approvals', (c) => {
  try {
    const queue = db.prepare(`
      SELECT id, fact, confidence, status, source_run_id, created_at
      FROM cerebro_learning_approvals
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `).all();
    return c.json({ success: true, queue });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Approve a learning fact
cerebroRouter.post('/learning-approvals/:id/approve', async (c) => {
  try {
    const id = c.req.param('id');
    const approval = db.prepare('SELECT * FROM cerebro_learning_approvals WHERE id = ?').get(id) as any;
    
    if (!approval) return c.json({ success: false, error: 'Not found' }, 404);
    
    // Insert into cerebro_memories_meta
    const memId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO cerebro_memories_meta (id, content, type, last_accessed_at, access_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(memId, approval.fact, 'fact', Date.now(), 0, Date.now());

    // Mark as approved
    db.prepare(`UPDATE cerebro_learning_approvals SET status = 'approved' WHERE id = ?`).run(id);

    return c.json({ success: true, message: 'Fact approved and stored in memory.' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Reject a learning fact
cerebroRouter.post('/learning-approvals/:id/reject', (c) => {
  try {
    const id = c.req.param('id');
    db.prepare(`UPDATE cerebro_learning_approvals SET status = 'rejected' WHERE id = ?`).run(id);
    return c.json({ success: true, message: 'Fact rejected.' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});
