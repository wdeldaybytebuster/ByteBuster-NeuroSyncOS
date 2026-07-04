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
