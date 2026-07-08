import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { db, initDB } from '../../core/basevault/db';
import { llmRouter } from './llm';

beforeAll(() => {
  initDB();
});

// Clean provider slate per test so paid-tier persistence assertions are
// deterministic regardless of ordering.
beforeEach(() => {
  db.prepare('DELETE FROM llm_routing_rules').run();
  db.prepare('DELETE FROM llm_providers').run();
  db.prepare('DELETE FROM council_decisions').run();
});

async function post(path: string, body: any): Promise<{ status: number; data: any }> {
  const res = await llmRouter.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function put(path: string, body: any): Promise<{ status: number; data: any }> {
  const res = await llmRouter.request(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function get(path: string): Promise<{ status: number; data: any }> {
  const res = await llmRouter.request(path);
  return { status: res.status, data: await res.json() };
}

describe('POST /providers — isPaidTier persistence', () => {
  it('defaults to free (is_paid_tier = 0) when isPaidTier is omitted', async () => {
    const res = await post('/providers', { name: 'Free Proxy', type: 'openai-compatible', config: { baseUrl: 'http://x/v1' } });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.provider.isPaidTier).toBe(false);

    const row = db.prepare('SELECT is_paid_tier FROM llm_providers WHERE id = ?').get(res.data.provider.id) as any;
    expect(row.is_paid_tier).toBe(0);
  });

  it('persists is_paid_tier = 1 when isPaidTier: true is supplied', async () => {
    const res = await post('/providers', { name: 'Paid Cloud', type: 'openrouter', config: {}, isPaidTier: true });
    expect(res.status).toBe(200);
    expect(res.data.provider.isPaidTier).toBe(true);

    const row = db.prepare('SELECT is_paid_tier FROM llm_providers WHERE id = ?').get(res.data.provider.id) as any;
    expect(row.is_paid_tier).toBe(1);
  });

  it('GET /providers reflects isPaidTier as a boolean', async () => {
    await post('/providers', { name: 'Paid Cloud', type: 'openrouter', config: {}, isPaidTier: true });
    await post('/providers', { name: 'Free Proxy', type: 'openai-compatible', config: { baseUrl: 'http://x/v1' } });
    const res = await get('/providers');
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.data.providers.map((p: any) => [p.name, p.isPaidTier]));
    expect(byName['Paid Cloud']).toBe(true);
    expect(byName['Free Proxy']).toBe(false);
  });
});

describe('PUT /providers/:id — isPaidTier update', () => {
  it('flips is_paid_tier from 0 to 1 and back', async () => {
    const created = await post('/providers', { name: 'Toggle Me', type: 'openrouter', config: {} });
    const id = created.data.provider.id;
    expect(created.data.provider.isPaidTier).toBe(false);

    const up = await put(`/providers/${id}`, { isPaidTier: true });
    expect(up.status).toBe(200);
    let row = db.prepare('SELECT is_paid_tier FROM llm_providers WHERE id = ?').get(id) as any;
    expect(row.is_paid_tier).toBe(1);

    const down = await put(`/providers/${id}`, { isPaidTier: false });
    expect(down.status).toBe(200);
    row = db.prepare('SELECT is_paid_tier FROM llm_providers WHERE id = ?').get(id) as any;
    expect(row.is_paid_tier).toBe(0);
  });

  it('leaves is_paid_tier untouched when isPaidTier is omitted from an update', async () => {
    const created = await post('/providers', { name: 'Keep Paid', type: 'openrouter', config: {}, isPaidTier: true });
    const id = created.data.provider.id;

    // Update an unrelated field only.
    await put(`/providers/${id}`, { name: 'Keep Paid Renamed' });
    const row = db.prepare('SELECT is_paid_tier FROM llm_providers WHERE id = ?').get(id) as any;
    expect(row.is_paid_tier).toBe(1);
  });
});

describe('GET /council-log', () => {
  function seedDecision(overrides: Partial<{ id: string; scope: string | null; scopeId: string | null; providerCount: number; confidence: number; disagreementScore: number; chosenResponseLength: number; createdAt: number }> = {}) {
    const row = {
      id: overrides.id ?? `dec_${Math.random().toString(36).slice(2)}`,
      scope: overrides.scope ?? 'cerebro',
      scopeId: overrides.scopeId ?? null,
      providerCount: overrides.providerCount ?? 3,
      confidence: overrides.confidence ?? 0.8,
      disagreementScore: overrides.disagreementScore ?? 0.2,
      chosenResponseLength: overrides.chosenResponseLength ?? 42,
      createdAt: overrides.createdAt ?? Date.now(),
    };
    db.prepare(`
      INSERT INTO council_decisions (id, scope, scope_id, provider_count, confidence, disagreement_score, chosen_response_length, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.id, row.scope, row.scopeId, row.providerCount, row.confidence, row.disagreementScore, row.chosenResponseLength, row.createdAt);
    return row;
  }

  it('returns an empty list when there are no decisions', async () => {
    const res = await get('/council-log');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.decisions).toEqual([]);
  });

  it('returns inserted rows ordered by created_at DESC', async () => {
    const now = Date.now();
    const oldest = seedDecision({ id: 'dec-oldest', createdAt: now - 3000, confidence: 0.5 });
    const middle = seedDecision({ id: 'dec-middle', createdAt: now - 2000, confidence: 0.6 });
    const newest = seedDecision({ id: 'dec-newest', createdAt: now - 1000, confidence: 0.7 });

    const res = await get('/council-log');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.decisions.map((d: any) => d.id)).toEqual([newest.id, middle.id, oldest.id]);

    const top = res.data.decisions[0];
    expect(top.providerCount).toBe(newest.providerCount);
    expect(top.confidence).toBe(newest.confidence);
    expect(top.disagreementScore).toBe(newest.disagreementScore);
    expect(top.scope).toBe(newest.scope);
  });

  it('respects the ?limit= query param and caps it at 100', async () => {
    for (let i = 0; i < 5; i++) {
      seedDecision({ id: `dec-limit-${i}`, createdAt: Date.now() - i * 10 });
    }

    const limited = await get('/council-log?limit=2');
    expect(limited.status).toBe(200);
    expect(limited.data.decisions.length).toBe(2);

    // Requesting more than the cap should never exceed 100 rows returned
    // (we only seeded 5 here, so this also confirms no error / clamping crash).
    const overCap = await get('/council-log?limit=500');
    expect(overCap.status).toBe(200);
    expect(overCap.data.decisions.length).toBeLessThanOrEqual(100);
  });

  it('defaults to 20 when ?limit= is omitted', async () => {
    for (let i = 0; i < 25; i++) {
      seedDecision({ id: `dec-default-${i}`, createdAt: Date.now() - i * 10 });
    }

    const res = await get('/council-log');
    expect(res.status).toBe(200);
    expect(res.data.decisions.length).toBe(20);
  });
});
