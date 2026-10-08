/**
 * §4.2 V2 — auth routes: setup / login / logout / session / ticket (C6 TDD).
 *
 * Same §4.2 constraint as auth-middleware.test.ts: never import
 * server-main.ts. Every test drives a scratch Hono app with the real
 * `authMiddleware` + `registerAuthRoutes` mounted, because the route guards
 * (loopback source, boot-time setup window, loopback bind, credential
 * presence) only mean anything together with the middleware in front.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from './middleware';
import { registerAuthRoutes } from './routes';
import { createSession, sessionCount, verifySession, __resetSessions } from './sessions';
import {
  openSetupWindow,
  closeSetupWindow,
  setBindAddress,
  invalidateCredentialCache,
  __resetAuthForTests,
} from './credentials';
import { resetRateLimits } from '../perimeter';
import { db, initDB, dbPath } from '../../core/basevault/db';

const LOOPBACK = { incoming: { socket: { remoteAddress: '127.0.0.1' } } };
const LAN = { incoming: { socket: { remoteAddress: '192.168.1.50' } } };

const PASSWORD = 'a-sufficiently-long-passphrase';

function app() {
  const a = new Hono();
  a.use('*', authMiddleware);
  registerAuthRoutes(a);
  a.get('/api/cerebro/query', (c) => c.json({ ok: true }));
  return a;
}

function clearCredential(): void {
  db.prepare("DELETE FROM system_settings WHERE key IN ('operator_credential', 'auth_setup_expires_at')").run();
  invalidateCredentialCache();
}

/** Put the routes into normal mode without paying for an Argon2 hash (the
 * real hash path is covered by the setup/login tests and argon2-budget). */
function seedCredential(hash = '$argon2id$v=19$m=65536,t=3,p=1$stand-in$hash'): void {
  db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('operator_credential', ?)").run(hash);
  invalidateCredentialCache();
}

async function post(target: string, body: unknown, env = LOOPBACK, headers: Record<string, string> = {}) {
  const res = await app().request(
    target,
    { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) },
    env
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

async function get(target: string, headers: Record<string, string> = {}, env = LOOPBACK) {
  const res = await app().request(target, { headers }, env);
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

describe('C6 auth routes (§4.2 auth-routes.test.ts)', () => {
  beforeAll(() => {
    initDB();
  });

  beforeEach(() => {
    __resetAuthForTests();
    __resetSessions();
    resetRateLimits();
    clearCredential();
    setBindAddress('127.0.0.1');
    openSetupWindow();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
  });

  // ── setup ─────────────────────────────────────────────────────────────────
  it('setup happy path: 200 + token, and the token authenticates a protected route', async () => {
    const setup = await post('/api/auth/setup', { password: PASSWORD });
    expect(setup.status).toBe(200);
    expect(setup.body.ok).toBe(true);
    expect(typeof setup.body.token).toBe('string');

    const protectedRes = await get('/api/cerebro/query', { Authorization: `Bearer ${setup.body.token}` });
    expect(protectedRes.status).toBe(200);
  });

  it('NEGATIVE: weak password (11 chars) → 400 weak-password and no credential written', async () => {
    const res = await post('/api/auth/setup', { password: 'abcdefghij1' }); // exactly 11 chars
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('weak-password');
    expect(db.prepare("SELECT value FROM system_settings WHERE key = 'operator_credential'").get()).toBeUndefined();
  });

  it('NEGATIVE: setup from a non-loopback source → 403 and no credential written', async () => {
    const res = await post('/api/auth/setup', { password: PASSWORD }, LAN);
    expect(res.status).toBe(403);
    expect(db.prepare("SELECT value FROM system_settings WHERE key = 'operator_credential'").get()).toBeUndefined();
  });

  it('NEGATIVE: setup refused when bind_address is not loopback (§2.2(a) condition 4)', async () => {
    setBindAddress('0.0.0.0');
    const res = await post('/api/auth/setup', { password: PASSWORD });
    expect(res.status).toBe(403);
    expect(db.prepare("SELECT value FROM system_settings WHERE key = 'operator_credential'").get()).toBeUndefined();
  });

  it('NEGATIVE: setup refused once the boot-time window closed (§2.2(a) condition 3)', async () => {
    closeSetupWindow();
    const res = await post('/api/auth/setup', { password: PASSWORD });
    expect(res.status).toBe(403);
    expect(db.prepare("SELECT value FROM system_settings WHERE key = 'operator_credential'").get()).toBeUndefined();
  });

  it('double setup: the second call → 404 forever, the first token stays valid', async () => {
    const first = await post('/api/auth/setup', { password: PASSWORD });
    expect(first.status).toBe(200);
    const second = await post('/api/auth/setup', { password: `${PASSWORD}-x` });
    expect(second.status).toBe(404);
    // still not configured a second credential: exactly one row
    const row = db.prepare("SELECT COUNT(*) AS n FROM system_settings WHERE key = 'operator_credential'").get() as {
      n: number;
    };
    expect(row.n).toBe(1);
    const stillValid = await get('/api/cerebro/query', { Authorization: `Bearer ${first.body.token}` });
    expect(stillValid.status).toBe(200);
  });

  // ── login ─────────────────────────────────────────────────────────────────
  it('login: correct password → 200 token', async () => {
    expect((await post('/api/auth/setup', { password: PASSWORD })).status).toBe(200);
    const login = await post('/api/auth/login', { password: PASSWORD });
    expect(login.status).toBe(200);
    expect(typeof login.body.token).toBe('string');
    expect(login.body.token).not.toBe('');
  });

  it('NEGATIVE login: wrong password → 401 invalid-credentials', async () => {
    expect((await post('/api/auth/setup', { password: PASSWORD })).status).toBe(200);
    const login = await post('/api/auth/login', { password: 'definitely-the-wrong-one' });
    expect(login.status).toBe(401);
    expect(login.body.error).toBe('invalid-credentials');
  });

  it('NEGATIVE login: before setup exists → 401 setup-required (no credential to check)', async () => {
    const login = await post('/api/auth/login', { password: PASSWORD });
    expect(login.status).toBe(401);
    expect(login.body.error).toBe('setup-required');
  });

  // ── session ───────────────────────────────────────────────────────────────
  it('session: GET with a valid token → 200 authenticated:true; without a token → 401', async () => {
    seedCredential();
    const withToken = await get('/api/auth/session', { Authorization: `Bearer ${createSession()}` });
    expect(withToken.status).toBe(200);
    expect(withToken.body.authenticated).toBe(true);

    const without = await get('/api/auth/session');
    expect(without.status).toBe(401);
  });

  // ── ticket ────────────────────────────────────────────────────────────────
  it('ticket: POST with a valid bearer → { ticket, expiresIn: 30 }', async () => {
    const res = await post('/api/auth/ticket', {}, LOOPBACK, {
      Authorization: `Bearer ${createSession()}`,
    });
    expect(res.status).toBe(200);
    expect(typeof res.body.ticket).toBe('string');
    expect(res.body.expiresIn).toBe(30);
  });

  it('NEGATIVE ticket: no bearer → 401 (the ticket endpoint is not a free mint)', async () => {
    const res = await post('/api/auth/ticket', {});
    expect(res.status).toBe(401);
  });

  it('NEGATIVE ticket: garbage bearer → 401', async () => {
    const res = await post('/api/auth/ticket', {}, LOOPBACK, {
      Authorization: 'Bearer not-a-session',
    });
    expect(res.status).toBe(401);
  });

  // ── logout ────────────────────────────────────────────────────────────────
  it('logout revokes the session: the token is rejected on the next request', async () => {
    seedCredential();
    const token = createSession();
    expect((await get('/api/cerebro/query', { Authorization: `Bearer ${token}` })).status).toBe(200);

    const out = await post('/api/auth/logout', {}, LOOPBACK, { Authorization: `Bearer ${token}` });
    expect(out.status).toBe(200);
    expect(verifySession(token)).toBe(false);

    const after = await get('/api/cerebro/query', { Authorization: `Bearer ${token}` });
    expect(after.status).toBe(401);
  });

  // ── session cap ───────────────────────────────────────────────────────────
  it('the 17th session evicts the oldest (hard cap 16)', async () => {
    expect((await post('/api/auth/setup', { password: PASSWORD })).status).toBe(200);
    // drop the setup-created session so the 16 seeded sessions are unambiguous
    __resetSessions();

    const seeded: string[] = [];
    for (let i = 0; i < 16; i++) {
      // stagger createdAt so "oldest" is deterministic
      seeded.push(createSession(Date.now() - (17 - i) * 1000));
    }
    expect(sessionCount()).toBe(16);

    const seventeenth = await post('/api/auth/login', { password: PASSWORD });
    expect(seventeenth.status).toBe(200);
    expect(sessionCount()).toBe(16);

    // the oldest (seeded[0]) was evicted; every other seed + the new login survive
    expect((await get('/api/cerebro/query', { Authorization: `Bearer ${seeded[0]}` })).status).toBe(401);
    expect((await get('/api/cerebro/query', { Authorization: `Bearer ${seeded[1]}` })).status).toBe(200);
    expect(
      (await get('/api/cerebro/query', { Authorization: `Bearer ${seventeenth.body.token}` })).status
    ).toBe(200);
  });
});
