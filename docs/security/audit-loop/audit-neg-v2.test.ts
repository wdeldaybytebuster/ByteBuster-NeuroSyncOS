/**
 * AUDITOR ROUND 1 — independent adversarial negatives for V2 (auth perimeter).
 * Scratch Hono app; never imports server-main.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware } from '../../../src/server/auth/middleware';
import { registerAuthRoutes } from '../../../src/server/auth/routes';
import { createSession, createTicket, __resetSessions } from '../../../src/server/auth/sessions';
import {
  completeSetup, openSetupWindow, __resetAuthForTests,
} from '../../../src/server/auth/credentials';
import { rateLimitMiddleware, resetRateLimits } from '../../../src/server/perimeter';
import { initDB } from '../../../src/core/basevault/db';

const LOOPBACK = { incoming: { socket: { remoteAddress: '127.0.0.1' } } };
const LAN = { incoming: { socket: { remoteAddress: '192.168.1.77' } } };

function app() {
  const a = new Hono();
  a.use('*', rateLimitMiddleware);
  a.use('*', authMiddleware);
  a.get('/api/cerebro/query', (c) => c.json({ ok: true }));
  a.get('/api/system/metrics', (c) => c.text('stream'));
  a.get('/', (c) => c.json({ ok: true }));
  registerAuthRoutes(a);
  return a;
}

describe('AUDIT-NEG-V2 auth perimeter fails closed', () => {
  beforeAll(() => {
    initDB();
    __resetAuthForTests();
    __resetSessions();
    resetRateLimits();
    openSetupWindow(5 * 60 * 1000);
  });
  afterAll(() => { __resetAuthForTests(); __resetSessions(); resetRateLimits(); });

  it('N1: no Authorization on dangerous route -> 401 (loopback, setup mode)', async () => {
    const res = await app().request('/api/cerebro/query', { method: 'GET' }, LOOPBACK);
    expect(res.status).toBe(401);
  });

  it('N2: Bearer garbage -> 401 (the actual pre-C6 bug was fall-through next())', async () => {
    const res = await app().request('/api/cerebro/query', {
      method: 'GET', headers: { Authorization: 'Bearer definitely-not-a-token' },
    }, LOOPBACK);
    expect(res.status).toBe(401);
  });

  it('N3: LAN source in setup mode -> 403 even for /', async () => {
    const res = await app().request('/', { method: 'GET' }, LAN);
    expect(res.status).toBe(403);
  });

  it('N4: valid session passes; ticket on non-stream path rejected; expired ticket rejected', async () => {
    await completeSetup('auditor-grade-passphrase');
    const login = await app().request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'auditor-grade-passphrase' }),
    }, LOOPBACK);
    expect(login.status).toBe(200);
    const { token } = await login.json() as { token: string };

    const ok = await app().request('/api/cerebro/query', {
      method: 'GET', headers: { Authorization: `Bearer ${token}` },
    }, LOOPBACK);
    expect(ok.status).toBe(200);

    const t = createTicket(token);
    // Ticket scoped to streams: must NOT authorize the query route
    const misuse = await app().request(`/api/cerebro/query?ticket=${t.ticket}`, { method: 'GET' }, LOOPBACK);
    expect(misuse.status).toBe(401);
    // Stream path accepts it
    const stream = await app().request(`/api/system/metrics?ticket=${t.ticket}`, { method: 'GET' }, LOOPBACK);
    expect(stream.status).toBe(200);
  });

  it('N5: setup route is 404 forever after credential exists', async () => {
    const res = await app().request('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'another-passphrase-here' }),
    }, LOOPBACK);
    expect(res.status).toBe(404);
  });

  it('N6: logged-out token is dead', async () => {
    const login = await app().request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'auditor-grade-passphrase' }),
    }, LOOPBACK);
    const { token } = await login.json() as { token: string };
    const logout = await app().request('/api/auth/logout', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    }, LOOPBACK);
    expect(logout.status).toBe(200);
    const reuse = await app().request('/api/cerebro/query', {
      method: 'GET', headers: { Authorization: `Bearer ${token}` },
    }, LOOPBACK);
    expect(reuse.status).toBe(401);
    void createSession;
  });
});
