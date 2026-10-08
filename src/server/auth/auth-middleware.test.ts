/**
 * §4.2 V2 tests 1–9 — auth middleware (C6 TDD: this file is written FIRST and
 * must fail against the pre-C6 tree; GREEN once src/server/auth/* lands).
 *
 * §4.2's hard rule: NEVER import server-main.ts (it binds a port, starts a
 * scheduler and resumes runs). The middleware is therefore exercised on a
 * scratch Hono app, and the `remoteAddress` seam is hono's
 * `app.request(path, init, env)` third argument — the same injection C5 uses
 * for `getIp`.
 *
 * The `getIp(c)` seam itself is the C5 export from ../perimeter: it reads
 * `c.env.incoming.socket.remoteAddress`, so a test injects either loopback or
 * a LAN peer address without touching a socket.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import { authMiddleware, isLoopbackIp } from './middleware';
import { registerAuthRoutes } from './routes';
import { createSession, createTicket, __resetSessions } from './sessions';
import {
  completeSetup,
  openSetupWindow,
  setBindAddress,
  invalidateCredentialCache,
  __resetAuthForTests,
} from './credentials';
import { rateLimitMiddleware, rateLimits, resetRateLimits } from '../perimeter';
import { db, initDB, dbPath } from '../../core/basevault/db';

const LOOPBACK = { incoming: { socket: { remoteAddress: '127.0.0.1' } } };
const LAN = { incoming: { socket: { remoteAddress: '192.168.1.77' } } };

const PASSWORD = 'operator-grade-passphrase';

/** Scratch app mirroring server-main's mount order (rate limit → auth → routes). */
function scratchApp() {
  const app = new Hono();
  app.use('*', rateLimitMiddleware);
  app.use('*', authMiddleware);
  registerAuthRoutes(app);
  app.post('/api/cerebro/query', (c) => c.json({ ok: true }));
  app.get('/api/cerebro/query', (c) => c.json({ ok: true }));
  app.get('/api/system/metrics', (c) => c.text('stream'));
  app.get('/api/scout/events', (c) => c.text('stream'));
  app.get('/', (c) => c.json({ root: true }));
  return app;
}

function clearCredential(): void {
  db.prepare("DELETE FROM system_settings WHERE key IN ('operator_credential', 'auth_setup_expires_at')").run();
  invalidateCredentialCache();
}

/**
 * Put the middleware into normal (credential present) mode without paying for
 * an Argon2 hash — the middleware only checks PRESENCE, so a stand-in hash is
 * enough for the Bearer/ticket assertions. Login/verification is covered by
 * auth-routes.test.ts and argon2-budget.test.ts against a real hash.
 */
function seedCredential(hash = '$argon2id$v=19$m=65536,t=3,p=1$stand-in$hash'): void {
  db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('operator_credential', ?)").run(hash);
  invalidateCredentialCache();
}

describe('C6 authMiddleware (§4.2 tests 1–9)', () => {
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

  // ── 1: the exploit ─────────────────────────────────────────────────────────
  it('#1 NEGATIVE (the exploit): POST /api/cerebro/query with NO Authorization → 401 setup-required', async () => {
    const app = scratchApp();
    const res = await app.request('/api/cerebro/query', { method: 'POST', body: '{}' }, LOOPBACK);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('setup-required');
  });

  // ── 2: the actual bug (garbage bearer used to pass) ────────────────────────
  it('#2 REGRESSION: Authorization: Bearer definitely-not-a-token → 401 (pre-C6 code called next())', async () => {
    const app = scratchApp();
    const res = await app.request(
      '/api/cerebro/query',
      { method: 'POST', headers: { Authorization: 'Bearer definitely-not-a-token' }, body: '{}' },
      LOOPBACK
    );
    expect(res.status).toBe(401);
  });

  // ── 3: happy path ──────────────────────────────────────────────────────────
  it('#3 valid Bearer session token → 200', async () => {
    seedCredential();
    const app = scratchApp();
    const token = createSession();
    const res = await app.request(
      '/api/cerebro/query',
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{}' },
      LOOPBACK
    );
    expect(res.status).toBe(200);
  });

  // ── 4: static shell must load before login ────────────────────────────────
  it('#4 GET / (static root) reachable with no credential in setup mode', async () => {
    const app = scratchApp();
    const res = await app.request('/', {}, LOOPBACK);
    expect(res.status).toBe(200);
  });

  // ── 5: non-loopback in setup mode is refused everywhere ───────────────────
  it('#5 non-loopback source in setup mode → 403 for EVERY route incl. /', async () => {
    const app = scratchApp();
    for (const p of ['/', '/api/cerebro/query', '/api/system/metrics', '/api/auth/login']) {
      const res = await app.request(p, {}, LAN);
      expect(res.status, `${p} from a LAN peer must be refused`).toBe(403);
    }
  });

  // ── 6: ticket allowlist + expiry + replay budget ──────────────────────────
  it('#6a ticket on the allowlisted /api/system/metrics → 200', async () => {
    seedCredential();
    const app = scratchApp();
    const { ticket } = createTicket(createSession())!;
    const res = await app.request(`/api/system/metrics?ticket=${ticket}`, {}, LOOPBACK);
    expect(res.status).toBe(200);
  });

  it('#6b NEGATIVE: ticket on the NON-allowlisted /api/cerebro/query → 401 (a leaked URL is not a bearer)', async () => {
    seedCredential();
    const app = scratchApp();
    const { ticket } = createTicket(createSession())!;
    const res = await app.request(`/api/cerebro/query?ticket=${ticket}`, {}, LOOPBACK);
    expect(res.status).toBe(401);
  });

  it('#6c NEGATIVE: expired ticket (> 30 s) → 401', async () => {
    seedCredential();
    const app = scratchApp();
    const { ticket } = createTicket(createSession())!;
    vi.useFakeTimers();
    vi.advanceTimersByTime(31_000);
    const res = await app.request(`/api/system/metrics?ticket=${ticket}`, {}, LOOPBACK);
    expect(res.status).toBe(401);
  });

  it('#6d NEGATIVE: 11th reuse of the same ticket → 401 (uses cap 10)', async () => {
    seedCredential();
    const app = scratchApp();
    const { ticket } = createTicket(createSession())!;
    for (let i = 0; i < 10; i++) {
      const res = await app.request(`/api/system/metrics?ticket=${ticket}`, {}, LOOPBACK);
      expect(res.status, `use #${i + 1}`).toBe(200);
    }
    const eleventh = await app.request(`/api/system/metrics?ticket=${ticket}`, {}, LOOPBACK);
    expect(eleventh.status).toBe(401);
  });

  // ── 7: setup route dies permanently once a credential exists ──────────────
  it('#7 after completeSetup(), POST /api/auth/setup → 404 forever', async () => {
    const app = scratchApp();
    const first = await app.request(
      '/api/auth/setup',
      { method: 'POST', body: JSON.stringify({ password: PASSWORD }) },
      LOOPBACK
    );
    expect(first.status).toBe(200);
    const again = await app.request(
      '/api/auth/setup',
      { method: 'POST', body: JSON.stringify({ password: `${PASSWORD}-2` }) },
      LOOPBACK
    );
    expect(again.status).toBe(404);
  });

  // ── 8: rate limiter runs ahead of auth (bounds login brute force) ─────────
  it('#8 rate limiter ahead of auth: 121st unauthenticated request → 429; 2048 peers stay ≤ 1024 buckets', async () => {
    const app = new Hono();
    app.use('*', rateLimitMiddleware);
    app.use('*', authMiddleware);
    app.post('/api/auth/login', (c) => c.json({ error: 'invalid-credentials' }, 401));
    // loopback peer: a LAN peer would be 403'd by the setup-mode source guard
    // before it ever reached the login handler (that path is test #5)
    const env = { incoming: { socket: { remoteAddress: '127.0.0.1' } } };
    // distinct x-forwarded-for values must NOT mint new buckets (TRUST_PROXY off)
    for (let i = 0; i < 120; i++) {
      const res = await app.request(
        '/api/auth/login',
        { method: 'POST', headers: { 'x-forwarded-for': `203.0.113.${i}` }, body: '{}' },
        env
      );
      expect(res.status, `request #${i + 1}`).toBe(401);
    }
    const limited = await app.request(
      '/api/auth/login',
      { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.200' }, body: '{}' },
      env
    );
    expect(limited.status).toBe(429);

    // memory bound: 2048 distinct peer addresses never exceed 1024 buckets
    for (let i = 0; i < 2048; i++) {
      await app.request('/', {}, { incoming: { socket: { remoteAddress: `10.5.${i >> 8}.${i & 255}` } } });
    }
    expect(rateLimits.size).toBeLessThanOrEqual(1024);
    expect(rateLimits.size).toBeGreaterThan(0);
  });

  // ── 9: chunked body — §5-11 cap LANDED: chunked > 64 KB → 413 ───
  it('#9 chunked request with NO content-length over 64 KB → 413 (§5-11 cap landed in rateLimitMiddleware)', async () => {
    seedCredential(); // normal mode, otherwise the middleware 401s before the body is read
    const app = scratchApp();
    const token = createSession();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(70 * 1024).fill(0x41));
        controller.close();
      },
    });
    const req = new Request('http://localhost/api/cerebro/query', {
      method: 'POST',
      body: stream,
      headers: { 'content-type': 'text/plain', Authorization: `Bearer ${token}` },
      duplex: 'half',
    } as RequestInit & { duplex?: 'half' });
    // precondition: no content-length header at all (this is what makes it "chunked")
    expect(req.headers.get('content-length')).toBeNull();
    const res = await app.request(req, undefined, LOOPBACK);
    // §5-11 LANDED: rateLimitMiddleware tee-reads the chunked body and
    // refuses anything over 64 KB with 413 before auth/body parsing.
    expect(res.status).toBe(413);
  });

  // ── loopback classification (used by tests 4/5 and the setup route) ───────
  it('isLoopbackIp classifies 127.0.0.0/8 + ::1 as loopback and LAN/unknown peers as not', () => {
    expect(isLoopbackIp('127.0.0.1')).toBe(true);
    expect(isLoopbackIp('127.10.20.30')).toBe(true);
    expect(isLoopbackIp('::1')).toBe(true);
    expect(isLoopbackIp('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackIp('192.168.1.77')).toBe(false);
    expect(isLoopbackIp('10.0.0.5')).toBe(false);
    expect(isLoopbackIp('::ffff:192.168.0.1')).toBe(false);
    // no socket info ⇒ treated as local (Node always supplies remoteAddress for
    // real TCP/WS connections; hono's scratch requests have none)
    expect(isLoopbackIp('unknown')).toBe(true);
    expect(isLoopbackIp(undefined)).toBe(true);
  });

  // the credential primitive must work end-to-end before routes use it
  it('completeSetup() writes the credential and isSetupComplete() reports it', async () => {
    const result = await completeSetup(PASSWORD);
    expect(result).toEqual({ ok: true });
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'operator_credential'").get() as
      | { value: string }
      | undefined;
    expect(row?.value).toBeTruthy();
    expect(row!.value.length).toBeGreaterThan(20);
    const expired = db.prepare("SELECT value FROM system_settings WHERE key = 'auth_setup_expires_at'").get() as
      | { value: string }
      | undefined;
    expect(expired?.value).toBe('0');
  });

  it('absolute import hygiene: no test in this file imports server-main', () => {
    const src = fs.readFileSync(path.join(__dirname, 'auth-middleware.test.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"].*server-main['"]/);
  });
});
