/**
 * §2.2 — the inbound perimeter: the replacement for the old server-main auth
 * block (which keyed off an orphaned LLM setting, never inspected the
 * Authorization value, and therefore let every route through anonymously).
 *
 * Mount order in server-main (matters):
 *   perimeterCors → rateLimitMiddleware → THIS → routes.
 * OPTIONS preflight short-circuits in cors() before any 401, and the rate
 * limiter runs first so a login brute force is bounded at 120 req/min/IP
 * before Argon2 is ever touched (§2.2(h)).
 *
 * Behaviour matrix (§2.2(i)) — fail-closed for the network, fail-open for the
 * local human:
 *   credential absent + loopback  → static UI + / + /api/auth/* , every other
 *                                   /api/* → 401 {error:'setup-required'}
 *   credential absent + non-loopback → 403 for EVERYTHING incl. /
 *   credential present            → Bearer session, or a 30 s ticket on the
 *                                   four allowlisted stream paths
 *
 * The `getIp` seam is C5's export from ../perimeter (reads
 * `c.env.incoming.socket.remoteAddress`), which is also what hono's
 * `app.request(path, init, env)` third argument injects in tests — and what
 * @hono/node-ws supplies during a WebSocket upgrade, so the PortGrid terminal
 * and /api/sync handshakes are classified by the real peer address too.
 */
import type { MiddlewareHandler } from 'hono';
import { getIp, isLoopbackAddress } from '../perimeter';
import { isSetupComplete } from './credentials';
import { verifySession, verifyTicket, isTicketPath } from './sessions';

export { isLoopbackAddress as isLoopbackIp } from '../perimeter';

/**
 * Paths reachable without a session:
 *  - `/` and anything outside /api/  → the static app shell MUST load before
 *    the operator can see AuthGate's login/setup screen;
 *  - `/api/auth/*`                   → setup/login/session/ticket/logout (they
 *    enforce their own guards: loopback, setup window, credential presence,
 *    and a Bearer check on every session-bearing endpoint);
 *  - `/api/sync`                     → Node↔Node WS upgrade, authenticated by
 *    the V1 HMAC challenge/response (§2.1-C3), not by a browser session.
 */
export function isPublicPath(path: string): boolean {
  if (path === '/') return true;
  if (!path.startsWith('/api/')) return true; // static assets
  if (path.startsWith('/api/auth/')) return true;
  if (path === '/api/sync') return true;
  return false;
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const path = c.req.path;

  // ── setup mode: no operator credential exists yet ─────────────────────────
  if (!isSetupComplete()) {
    if (!isLoopbackAddress(getIp(c))) {
      return c.json({ error: 'forbidden' }, 403); // §2.2(i): non-loopback → 403 for everything
    }
    if (isPublicPath(path)) return next();
    return c.json({ error: 'setup-required' }, 401);
  }

  // ── normal mode: app shell + auth routes, then Bearer or ticket ───────────
  if (isPublicPath(path)) return next();

  const auth = c.req.header('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    if (verifySession(auth.slice(7).trim())) return next();
    return c.json({ error: 'unauthorized' }, 401); // the actual bug: garbage bearer used to pass
  }

  // Query-string tickets are honoured ONLY on the allowlisted stream paths, so
  // a leaked stream URL can never become a general bearer (§2.2(c)).
  const ticket = c.req.query('ticket');
  if (ticket && isTicketPath(path)) {
    if (verifyTicket(ticket, path)) return next();
    return c.json({ error: 'unauthorized' }, 401);
  }

  return c.json({ error: 'unauthorized' }, 401);
};
