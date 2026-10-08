/**
 * §2.2(a)/(b)/(c) — /api/auth/{setup,login,logout,session,ticket}.
 *
 * Setup is the first-run claim of an unclaimed box: accepted only when the
 * credential is absent (otherwise 404 forever), the caller is loopback, the
 * boot-time window is still open, and the server is bound to loopback. That
 * combination closes the "LAN race to claim an unclaimed box" while never
 * locking the operator out — they are, by definition, on the box.
 *
 * No generated token on stdout: it would land in ui.log / server.log / journal.
 * No cookie: Bearer + query-string tickets only (§2.2(b)/(c)).
 *
 * These routes are reachable without a session (middleware allows
 * /api/auth/* through) — so each one re-checks what it needs itself:
 * setup re-checks loopback/window/bind, and login/logout/session/ticket all
 * require a valid session Bearer where one is used to mint or end state.
 */
import type { Hono } from 'hono';
import { getIp, isLoopbackAddress } from '../perimeter';
import {
  completeSetup,
  isBindLoopback,
  isSetupComplete,
  isSetupWindowOpen,
  verifyOperator,
} from './credentials';
import { createSession, createTicket, revokeSession, verifySession } from './sessions';

function bearer(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const header = c.req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

async function readJson(c: { req: { json: () => Promise<any> } }): Promise<any> {
  return c.req.json().catch(() => null);
}

export function registerAuthRoutes(app: Hono): void {
  /**
   * First-run setup. Returns `{ ok, token }` so the operator is logged in
   * immediately after choosing a password (the e2e globalSetup uses the same
   * route).
   */
  app.post('/api/auth/setup', async (c) => {
    if (isSetupComplete()) return c.json({ error: 'not-found' }, 404); // §2.2(a): 404 forever
    if (!isLoopbackAddress(getIp(c))) return c.json({ error: 'forbidden' }, 403);
    if (!isBindLoopback()) return c.json({ error: 'forbidden' }, 403);
    if (!isSetupWindowOpen()) return c.json({ error: 'forbidden' }, 403);

    const body = await readJson(c);
    const password = typeof body?.password === 'string' ? body.password : '';
    const result = await completeSetup(password);
    if (!result.ok) {
      return c.json(
        { error: result.error },
        result.error === 'already-configured' ? 404 : 400
      );
    }
    return c.json({ ok: true, token: createSession() });
  });

  /** Session login — only possible once a credential exists. */
  app.post('/api/auth/login', async (c) => {
    if (!isSetupComplete()) return c.json({ error: 'setup-required' }, 401);
    const body = await readJson(c);
    const password = typeof body?.password === 'string' ? body.password : '';
    const ok = await verifyOperator(password);
    if (!ok) return c.json({ error: 'invalid-credentials' }, 401);
    return c.json({ ok: true, token: createSession() });
  });

  /** Revokes the presented session (and any tickets bound to it). */
  app.post('/api/auth/logout', (c) => {
    const token = bearer(c);
    if (!token || !verifySession(token)) return c.json({ error: 'unauthorized' }, 401);
    revokeSession(token);
    return c.json({ ok: true });
  });

  /**
   * Boot probe for AuthGate: tells the UI whether it is looking at a setup
   * screen (credential absent) or a login screen, without ever exposing the
   * credential itself.
   */
  app.get('/api/auth/session', (c) => {
    if (!isSetupComplete()) return c.json({ error: 'setup-required', authenticated: false }, 401);
    const token = bearer(c);
    if (token && verifySession(token)) return c.json({ authenticated: true });
    return c.json({ error: 'unauthorized', authenticated: false }, 401);
  });

  /** Mints a 30 s stream ticket for the four allowlisted SSE/WS paths. */
  app.post('/api/auth/ticket', (c) => {
    const token = bearer(c);
    if (!token || !verifySession(token)) return c.json({ error: 'unauthorized' }, 401);
    const issued = createTicket(token);
    if (!issued) return c.json({ error: 'unauthorized' }, 401);
    return c.json({ ticket: issued.ticket, expiresIn: issued.expiresIn });
  });
}
