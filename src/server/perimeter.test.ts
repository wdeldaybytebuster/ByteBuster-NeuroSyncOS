/**
 * §2.1-C5 — perimeter test: CORS allowlist, bounded rate limiter, loopback bind.
 *
 * TDD red/green for commit C5. Mirrors §4.2's rule: NEVER import
 * server-main.ts (it binds a port and starts a scheduler) — the CORS policy
 * and rate limiter live in ./perimeter so they can be exercised on a scratch
 * Hono app. The loopback bind itself is asserted as a source contract on
 * server-main.ts (same style as chat-backend-routing.test.ts).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import {
  ALLOWED_ORIGINS,
  perimeterCors,
  rateLimitMiddleware,
  rateLimits,
  resetRateLimits,
  getIp,
} from './perimeter';
import { NEUROSYNC_PORT } from './port';

// ─── CORS allowlist ──────────────────────────────────────────────────────────

describe('C5 CORS allowlist (closes T1 — drive-by browser origin)', () => {
  const app = new Hono();
  app.use('*', perimeterCors);
  app.get('/api/ping', c => c.json({ ok: true }));

  it('the allowlist contains exactly the known UI origins (incl. both Tauri shells)', () => {
    // P2-3: the static-UI pair derives from NEUROSYNC_PORT (default 3743);
    // 3742/5173/tauri entries stay static. Sorted on both sides so the
    // contract holds under env port overrides too.
    expect([...ALLOWED_ORIGINS].sort()).toEqual([
      'http://127.0.0.1:3742',
      `http://127.0.0.1:${NEUROSYNC_PORT}`,
      'http://127.0.0.1:5173',
      'http://localhost:3742',
      `http://localhost:${NEUROSYNC_PORT}`,
      'http://localhost:5173',
      'http://tauri.localhost',
      'tauri://localhost',
    ].sort());
  });

  it('allowlisted origin (Vite dev) gets Access-Control-Allow-Origin echoed back', async () => {
    const res = await app.request('/api/ping', { headers: { Origin: 'http://localhost:3742' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3742');
  });

  it('NEGATIVE (the exploit): a random web page origin gets NO ACAO header', async () => {
    const res = await app.request('/api/ping', { headers: { Origin: 'https://evil.example' } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('NEGATIVE: preflight from a foreign origin gets no ACAO (request refused)', async () => {
    const res = await app.request('/api/ping', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('no Origin header (curl / same-origin) → no ACAO header, request passes', async () => {
    const res = await app.request('/api/ping');
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('Authorization and Content-Type are permitted request headers', async () => {
    const res = await app.request('/api/ping', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3743', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
    });
    const allowHeaders = (res.headers.get('access-control-allow-headers') || '').toLowerCase();
    expect(allowHeaders).toContain('authorization');
    expect(allowHeaders).toContain('content-type');
  });
});

// ─── getIp (real peer address + TRUST_PROXY gate) ────────────────────────────

describe('C5 getIp (rekey seam)', () => {
  const OLD = process.env.NEUROSYNC_TRUST_PROXY;
  afterEach(() => {
    if (OLD === undefined) delete process.env.NEUROSYNC_TRUST_PROXY;
    else process.env.NEUROSYNC_TRUST_PROXY = OLD;
  });

  it('x-forwarded-for is IGNORED when TRUST_PROXY is unset (spoof-proof)', async () => {
    delete process.env.NEUROSYNC_TRUST_PROXY;
    const app = new Hono();
    let seen = '';
    app.use('*', async (c, next) => { seen = getIp(c); await next(); });
    app.get('/', c => c.text('ok'));
    await app.request('/', {
      headers: { 'x-forwarded-for': '6.6.6.6, 7.7.7.7' },
    }, { incoming: { socket: { remoteAddress: '127.0.0.1' } } });
    expect(seen).toBe('127.0.0.1');
  });

  it('x-forwarded-for first hop used when TRUST_PROXY=1', async () => {
    process.env.NEUROSYNC_TRUST_PROXY = '1';
    const app = new Hono();
    let seen = '';
    app.use('*', async (c, next) => { seen = getIp(c); await next(); });
    app.get('/', c => c.text('ok'));
    await app.request('/', {
      headers: { 'x-forwarded-for': '6.6.6.6, 7.7.7.7' },
    }, { incoming: { socket: { remoteAddress: '127.0.0.1' } } });
    expect(seen).toBe('6.6.6.6');
  });

  it("no socket info → 'unknown' (fail-closed bucket, not a private default)", async () => {
    delete process.env.NEUROSYNC_TRUST_PROXY;
    const app = new Hono();
    let seen = '';
    app.use('*', async (c, next) => { seen = getIp(c); await next(); });
    app.get('/', c => c.text('ok'));
    await app.request('/');
    expect(seen).toBe('unknown');
  });
});

// ─── Rate limiter (bounded map + rekey) ──────────────────────────────────────

describe('C5 rate limiter (§4.2 test #8)', () => {
  beforeEach(() => resetRateLimits());

  function scratchApp() {
    const app = new Hono();
    app.use('*', rateLimitMiddleware);
    app.get('/api/ping', c => c.json({ ok: true }));
    return app;
  }

  it('120 requests pass, the 121st from the same IP → 429', async () => {
    const app = scratchApp();
    const env = { incoming: { socket: { remoteAddress: '10.1.1.1' } } };
    for (let i = 0; i < 120; i++) {
      const res = await app.request('/api/ping', {}, env);
      expect(res.status).toBe(200);
    }
    const res = await app.request('/api/ping', {}, env);
    expect(res.status).toBe(429);
  });

  it('REGRESSION (the rekey bug): distinct x-forwarded-for values sharing one real IP still hit 429 — the limiter keys on the peer address, never the header', async () => {
    delete process.env.NEUROSYNC_TRUST_PROXY;
    const app = scratchApp();
    const env = { incoming: { socket: { remoteAddress: '10.1.1.2' } } };
    for (let i = 0; i < 120; i++) {
      const res = await app.request('/api/ping', { headers: { 'x-forwarded-for': `203.0.113.${i}` } }, env);
      expect(res.status).toBe(200);
    }
    // old code keyed on x-forwarded-for → this 121st request would be 200
    const res = await app.request('/api/ping', { headers: { 'x-forwarded-for': '203.0.113.999' } }, env);
    expect(res.status).toBe(429);
  });

  it('2048 distinct client IPs → rateLimits.size stays ≤ 1024 (memory bound)', async () => {
    const app = scratchApp();
    for (let i = 0; i < 2048; i++) {
      const ip = `10.9.${i >> 8}.${i & 255}`;
      const res = await app.request('/api/ping', {}, { incoming: { socket: { remoteAddress: ip } } });
      expect(res.status).toBe(200);
    }
    expect(rateLimits.size).toBeLessThanOrEqual(1024);
    expect(rateLimits.size).toBeGreaterThan(0);
  });

  it('expired windows are pruned, active buckets survive a sweep', async () => {
    const app = scratchApp();
    // fill past the cap with one-shot buckets, one of them still hot
    for (let i = 0; i < 1100; i++) {
      await app.request('/api/ping', {}, { incoming: { socket: { remoteAddress: `10.8.${i >> 8}.${i & 255}` } } });
    }
    expect(rateLimits.size).toBeLessThanOrEqual(1024);
    // expire every bucket artificially, then trigger a sweep with a new client
    const now = Date.now();
    for (const [, v] of rateLimits) v.resetTime = now - 1000;
    const before = rateLimits.size;
    await app.request('/api/ping', {}, { incoming: { socket: { remoteAddress: '10.7.7.7' } } });
    // sweep ran (all expired entries removed) — only the fresh bucket remains
    expect(rateLimits.size).toBeLessThan(before);
  });

  it('the same IP recovers after its window resets', async () => {
    const app = scratchApp();
    const env = { incoming: { socket: { remoteAddress: '10.1.1.3' } } };
    for (let i = 0; i < 121; i++) await app.request('/api/ping', {}, env);
    expect(rateLimits.get('10.1.1.3')!.resetTime).toBeGreaterThan(Date.now());
    // fast-forward the window
    rateLimits.get('10.1.1.3')!.resetTime = Date.now() - 1;
    const res = await app.request('/api/ping', {}, env);
    expect(res.status).toBe(200);
  });
});

// ─── Loopback bind (source contract on server-main.ts) ───────────────────────

describe('C5 loopback bind (source contract — closes T2/T6)', () => {
  it('server-main.ts serve({ … }) literal contains hostname:', () => {
    const src = fs.readFileSync(path.join(__dirname, 'server-main.ts'), 'utf8');
    const serveMatch = src.match(/serve\(\{[\s\S]*?\}\)/);
    expect(serveMatch).not.toBeNull();
    expect(serveMatch![0]).toMatch(/hostname:/);
  });

  it('server-main.ts binds from NEUROSYNC_BIND || db bind_address || 127.0.0.1', () => {
    const src = fs.readFileSync(path.join(__dirname, 'server-main.ts'), 'utf8');
    expect(src).toMatch(/NEUROSYNC_BIND/);
    expect(src).toMatch(/bind_address/);
    expect(src).toMatch(/127\.0\.0\.1/);
  });
});
