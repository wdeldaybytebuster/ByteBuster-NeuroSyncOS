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

/**
 * CORS allowlist — the known UI origins (verified in §2.1-C5(f)):
 * Vite dev on 3742, Hono static UI on 3743, tauri dev devUrl 5173
 * (currently broken, allow-listed so it works the moment §5-6 is fixed),
 * and both Tauri v3 shell origins.
 */
export const ALLOWED_ORIGINS = new Set([
  'http://localhost:3742', 'http://127.0.0.1:3742',   // Vite dev
  'http://localhost:3743', 'http://127.0.0.1:3743',   // Hono static UI
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
 * Note: the chunked-body (no content-length) gap is §5-11 — deferred by plan.
 */
export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength, 10) > 64 * 1024) {
    return c.json({ error: 'Payload Too Large' }, 413);
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
