/**
 * §2.1-C5 — network perimeter: CORS allowlist, peer-address rate limiter.
 *
 * Extracted from server-main.ts so the perimeter is testable on a scratch
 * Hono app WITHOUT importing server-main (it binds a port and starts a
 * scheduler — §4.2's rule). server-main wires these three exports only.
 *
 * CORS (closes T1 — drive-by browser): a random page's origin is not in
 * ALLOWED_ORIGINS → no Access-Control-Allow-Origin → its preflighted JSON
 * POST is refused and simple requests cannot read the response. Same-origin
 * (production static UI, curl, no Origin header) gets no ACAO header at all.
 *
 * Rate limiter (§0-V2): keyed on the REAL peer address — x-forwarded-for is
 * consulted only when NEUROSYNC_TRUST_PROXY === '1' (nothing here sits behind
 * a proxy by default, so the header is attacker-controlled otherwise). The
 * Map is hard-bounded at 1024 entries: expired windows are swept whenever
 * the cap is hit, then the oldest bucket is evicted so memory can never grow
 * past ~100 KB regardless of client diversity. No timers, one O(n) sweep at
 * most once per new key past the cap.
 */
import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { NEUROSYNC_PORT } from './port';

/**
 * CORS allowlist — the known UI origins (verified in §2.1-C5(f)):
 * Vite dev on 3742, Hono static UI on NEUROSYNC_PORT (default 3743,
 * derived — follows env overrides), tauri dev devUrl 5173
 * (currently broken, allow-listed so it works the moment §5-6 is fixed),
 * and both Tauri v3 shell origins. 3742/5173/tauri entries stay static.
 */
export const ALLOWED_ORIGINS = new Set([
  'http://localhost:3742', 'http://127.0.0.1:3742',   // Vite dev
  `http://localhost:${NEUROSYNC_PORT}`, `http://127.0.0.1:${NEUROSYNC_PORT}`,   // Hono static UI (P2-3 derived)
  'http://localhost:5173', 'http://127.0.0.1:5173',   // tauri dev devUrl (currently broken)
  'tauri://localhost',                                 // Tauri v3 Linux/macOS shell
  'http://tauri.localhost',                            // Tauri v3 Windows shell
]);

/**
 * Explicit allowlist CORS. `origin` returning null ⇒ no ACAO header.
 * credentials:false — auth is Bearer/ticket, never cookies, so no credentialed
 * CORS. Registered BEFORE auth middleware so OPTIONS preflight short-circuits.
 */
export const perimeterCors = cors({
  origin: (o) => (ALLOWED_ORIGINS.has(o) ? o : null),
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: false,
  maxAge: 600,
});

/**
 * Resolve the real client IP. x-forwarded-for is honored only behind an
 * explicit TRUST_PROXY opt-in (default off — nothing here sits behind a
 * proxy); otherwise the header is spoofable and would let an attacker
 * mint unlimited rate-limit buckets. 'unknown' = no socket info (fail-closed
 * shared bucket, NOT a private default).
 */
export function getIp(c: { req: { header: (n: string) => string | undefined }; env?: any }): string {
  if (process.env.NEUROSYNC_TRUST_PROXY === '1') {
    const xff = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (xff) return xff;
  }
  return c.env?.incoming?.socket?.remoteAddress ?? 'unknown';
}

export const RATE_LIMIT_MAX = 120;          // requests per window
export const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
export const RATE_LIMIT_MAX_KEYS = 1024;    // hard memory bound (~100 KB)

/**
 * Loopback classification — one definition shared by the auth middleware
 * (source check), the setup route (bind-address check, §2.2(a) condition 4)
 * and C5's bind policy. `127.0.0.0/8`, `::1` and IPv4-mapped `::ffff:127.x`
 * are local; everything else is not.
 *
 * `unknown` / absent is treated as LOCAL on purpose: hono's scratch test
 * requests carry no socket, whereas @hono/node-server and @hono/node-ws always
 * supply `c.env.incoming.socket.remoteAddress` for a real TCP/WS connection —
 * so in production this branch is unreachable and never widens the perimeter.
 */
export function isLoopbackAddress(addr: string | undefined | null): boolean {
  if (addr === undefined || addr === null || addr === '' || addr === 'unknown') return true;
  const ip = addr.startsWith('::ffff:') ? addr.slice(7) : addr;
  if (ip === '::1' || ip === 'localhost') return true;
  if (ip === '0.0.0.0' || ip === '::') return false; // wildcard binds are NOT loopback
  return /^127(\.\d{1,3}){3}$/.test(ip) || ip === '127.0.0.1';
}


/** Bounded rate-limit store: ip → { count, resetTime }. Never exceeds 1024. */
export const rateLimits = new Map<string, { count: number; resetTime: number }>();

/** Test seam: clear all buckets (production never needs this). */
export function resetRateLimits(): void {
  rateLimits.clear();
}

/**
 * Sweep expired windows, then hard-evict oldest entries until the map fits
 * the cap. Called whenever size crosses RATE_LIMIT_MAX_KEYS so memory is
 * bounded no matter how many distinct client IPs appear inside one window.
 */
function boundRateLimits(now: number): void {
  for (const [k, v] of rateLimits) {
    if (v.resetTime < now) rateLimits.delete(k);
  }
  // Still over cap → evict oldest first (Map preserves insertion order of
  // surviving keys; re-inserted keys were removed and re-added, so the head
  // is the least-recently-renewed bucket).
  while (rateLimits.size > RATE_LIMIT_MAX_KEYS) {
    const oldest = rateLimits.keys().next().value;
    if (oldest === undefined) break;
    rateLimits.delete(oldest);
  }
}

/**
 * Payload cap (64 KB) + rate limit (120/min per real peer address), in that
 * order: a giant body is refused before any per-IP bookkeeping.
 * §5-11 LANDED: bodies without content-length (chunked/streamed) are measured
 * by tee-reading a clone of the request body up to 64 KB + 1 byte; anything
 * larger is refused with 413. The clone preserves the original body for
 * downstream handlers (c.req.json() etc.).
 */
export const PAYLOAD_MAX_BYTES = 64 * 1024;

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength, 10) > PAYLOAD_MAX_BYTES) {
    return c.json({ error: 'Payload Too Large' }, 413);
  }

  // §5-11: no content-length + a streaming body (chunked transfer) → measure
  // the stream. Read the CLONE so the original body stays intact for the
  // route handler. Fail-open to next() if the body cannot be cloned/read
  // (no body at all, already-disturbed stream) — today's behavior preserved.
  if (!contentLength) {
    try {
      const raw = c.req.raw as Request | undefined;
      if (raw?.body) {
        const clone = raw.clone();
        const reader = clone.body!.getReader();
        let total = 0;
        let over = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > PAYLOAD_MAX_BYTES) {
            over = true;
            break;
          }
        }
        try { await reader.cancel(); } catch { /* already closed */ }
        if (over) {
          return c.json({ error: 'Payload Too Large' }, 413);
        }
      }
    } catch { /* unmeasurable body — fall through to rate limiting */ }
  }

  const ip = getIp(c);
  const now = Date.now();

  let limit = rateLimits.get(ip);
  if (!limit || limit.resetTime < now) {
    limit = { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  }
  if (limit.count >= RATE_LIMIT_MAX) {
    return c.json({ error: 'Too Many Requests' }, 429);
  }
  limit.count++;
  rateLimits.set(ip, limit);

  // Bound AFTER insert so size can never exceed the cap (a pre-insert check
  // lets the newly-added key push it one past). The just-inserted key is the
  // newest, so eviction from the head never removes it.
  if (rateLimits.size > RATE_LIMIT_MAX_KEYS) boundRateLimits(now);

  await next();
};

/**
 * §2.3-P1-1 — fail-closed WebSocket upgrade gate. Mounts ONLY ahead of the
 * two upgradeWebSocket routes in server-main.ts (terminal :178, sync :236).
 *
 * If the request is a WS upgrade attempt
 * (`upgrade: websocket`) AND there is no live socket backing the context
 * (`c.env?.incoming` undefined — @hono/node-server and @hono/node-ws always
 * supply `c.env.incoming.socket` for a real TCP/WS connection) → refuse with
 * a deliberate HTTP 401 instead of sailing into the upgrade machinery (which
 * today surfaces as an incidental 500 TypeError inside @hono/node-ws).
 * Everything else falls through: non-upgrade requests keep today's behavior,
 * env-bearing requests proceed to the upgrade path.
 */
export const wsUpgradeGuard: MiddlewareHandler = async (c, next) => {
  const upgrade = c.req.header('upgrade')?.toLowerCase();
  const incoming = (c.env as unknown as { incoming?: unknown } | undefined)?.incoming;
  if (upgrade === 'websocket' && incoming === undefined) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};
