/**
 * §2.2(b)/(c) — opaque session tokens + short-lived stream tickets.
 *
 * Everything here is RAM-only by design (no DB migration, §3): losing sessions
 * on restart just means one re-login, and a heap dump / log line never
 * contains a usable token because the Map is keyed on sha256(token).
 *
 * Session  : 32 random bytes, base64url, 12 h sliding TTL, hard cap 16 (oldest
 *            evicted), transported as `Authorization: Bearer <token>`.
 * Ticket   : 30 s TTL, max 64 entries, uses cap 10, valid ONLY on the four
 *            allowlisted stream paths (EventSource and browser WebSocket cannot
 *            set headers; SameSite cookies cannot cross the Tauri origin). A
 *            leaked ticket URL is therefore not a general bearer.
 * Pruning  : on access, never on a timer — 0 new timers, 0 new threads.
 *
 * /api/sync (Node↔Node) deliberately does NOT use tickets: it authenticates
 * with the V1 HMAC sync secret (§2.1-C3). Two credentials for two trust
 * relationships — operator's browser vs peer machine.
 */
import crypto from 'node:crypto';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 h sliding
export const MAX_SESSIONS = 16;
export const TICKET_TTL_MS = 30_000;
export const MAX_TICKETS = 64;
export const TICKET_MAX_USES = 10;
export const TICKET_EXPIRES_IN_S = 30;

/** §2.2(c) — the only paths a query-string ticket may open. */
export const TICKET_PATHS: readonly string[] = [
  '/api/system/metrics',
  '/api/system/backup',
  '/api/scout/events',
  '/api/portgrid/terminal/',
];

interface SessionRecord {
  createdAt: number;
  lastSeen: number;
}

interface TicketRecord {
  sessionHash: string;
  expiresAt: number;
  uses: number;
}

const sessions = new Map<string, SessionRecord>(); // key = sha256(token)
const tickets = new Map<string, TicketRecord>(); // key = sha256(ticket)

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function randomToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Sweep expired sessions + tickets. Called on access — no timer, ever. */
function prune(now: number): void {
  for (const [key, rec] of sessions) {
    if (now - rec.lastSeen > SESSION_TTL_MS) sessions.delete(key);
  }
  for (const [key, rec] of tickets) {
    if (rec.expiresAt <= now) tickets.delete(key);
  }
}

export function isTicketPath(path: string): boolean {
  return TICKET_PATHS.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p));
}

// ─── sessions ────────────────────────────────────────────────────────────────

export function createSession(now: number = Date.now()): string {
  prune(now);
  const token = randomToken();
  sessions.set(sha256(token), { createdAt: now, lastSeen: now });
  while (sessions.size > MAX_SESSIONS) {
    // oldest by createdAt; first-inserted wins a tie (Map order + strict <)
    let oldestKey: string | undefined;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [key, rec] of sessions) {
      if (rec.createdAt < oldestAt) {
        oldestAt = rec.createdAt;
        oldestKey = key;
      }
    }
    if (oldestKey === undefined) break;
    sessions.delete(oldestKey);
  }
  return token;
}

export function verifySession(token: string, now: number = Date.now()): boolean {
  if (!token) return false;
  prune(now);
  const key = sha256(token);
  const rec = sessions.get(key);
  if (!rec) return false;
  if (now - rec.lastSeen > SESSION_TTL_MS) {
    sessions.delete(key);
    return false;
  }
  rec.lastSeen = now; // sliding window
  return true;
}

export function revokeSession(token: string): boolean {
  if (!token) return false;
  return sessions.delete(sha256(token));
}

export function revokeAllSessions(): void {
  sessions.clear();
  tickets.clear(); // tickets are bound to sessions — kill both
}

export function sessionCount(): number {
  return sessions.size;
}

// ─── tickets ─────────────────────────────────────────────────────────────────

/** Issues a ticket for a VALID session; returns null when the session is not. */
export function createTicket(
  sessionToken: string,
  now: number = Date.now()
): { ticket: string; expiresIn: number } | null {
  if (!verifySession(sessionToken, now)) return null;
  prune(now);
  const ticket = randomToken();
  tickets.set(sha256(ticket), {
    sessionHash: sha256(sessionToken),
    expiresAt: now + TICKET_TTL_MS,
    uses: 0,
  });
  while (tickets.size > MAX_TICKETS) {
    const oldest = tickets.keys().next().value; // insertion order
    if (oldest === undefined) break;
    tickets.delete(oldest);
  }
  return { ticket, expiresIn: TICKET_EXPIRES_IN_S };
}

/**
 * §2.2(c): valid only on an allowlisted stream path, only inside its 30 s TTL,
 * only for a still-live session, and at most TICKET_MAX_USES times. Each
 * verify consumes one unit of the budget (a replayed URL dies after 10 opens).
 */
export function verifyTicket(ticket: string, path: string, now: number = Date.now()): boolean {
  if (!ticket || !isTicketPath(path)) return false;
  prune(now);
  const key = sha256(ticket);
  const rec = tickets.get(key);
  if (!rec) return false;
  if (rec.expiresAt <= now || rec.uses >= TICKET_MAX_USES) {
    tickets.delete(key);
    return false;
  }
  if (!sessions.has(rec.sessionHash)) {
    tickets.delete(key); // session logged out / expired → its tickets die too
    return false;
  }
  rec.uses++;
  return true;
}

export function ticketCount(): number {
  return tickets.size;
}

/** Test seam. */
export function __resetSessions(): void {
  sessions.clear();
  tickets.clear();
}
