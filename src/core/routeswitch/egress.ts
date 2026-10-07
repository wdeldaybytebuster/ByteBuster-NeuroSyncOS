/**
 * §2.3 C8-a — governed egress: THE single door for outbound HTTP (V2).
 *
 * THE BUG UNDER TEST (§0-V2): every outbound call in the system used raw
 * `fetch` with zero address vetting — `file://`, RFC-1918 loopback, link-local
 * cloud metadata (`169.254.169.254`), unbounded response bodies, no timeout and
 * no redirect accounting. Per AGENTS.md, RouteSwitch is the module that owns
 * Connection/Abstraction (egress); CoreExec/ScoutDaemon must go through here.
 *
 * Check order (each returns a `blocked` reason — a SECURITY verdict, distinct
 * from a mere transport failure):
 *   1. parse            → 'bad-url'
 *   2. scheme http/https → 'scheme'   (MUST precede the empty-host guard so
 *                                      `file:///…` reports 'scheme', not
 *                                      'bad-url')
 *      empty hostname    → 'bad-url'
 *      internal opt-in   → loopback literal/`localhost` only, else
 *                          'internal-not-loopback' (no DNS, no I/O)
 *   3. kill switch       → 'kill-switch'  (system_settings.external_calls_enabled;
 *                          absent = allowed, 'false'/'0' = blocked; DB error
 *                          fails OPEN with a log — permission-gate's contract)
 *                          Skipped for `internal` (local services stay up).
 *   4. DNS + address     → 'dns-failure' (fail-closed) / 'private-address'
 *                          Skipped for `internal`/`allowPrivate`.
 *   5. project policy    → 'policy'  (checkActionPermission — the same Phase-5
 *                          archetype/tool-registry gate CoreExec uses for
 *                          shell/scrape, now covering 'fetch')
 *   6. fetch loop        → 'too-large' / 'timeout' / 'redirect-loop',
 *                          plus per-hop re-runs of 1/2/4 on every redirect.
 *
 * NOT blocks (returned as `ok:false` with no `blocked` field): non-2xx status,
 * connection refused/DNS-host-unreachable at the socket layer, mid-body stream
 * errors. Conflating "the network said no" with "the gate said no" would make
 * PortGrid show policy verdicts where there are only transport errors.
 *
 * Hardening notes:
 *  - ONE `AbortSignal.timeout(timeoutMs)` covers the whole operation (initial
 *    request + every hop) so redirect chains can't multiply the budget.
 *  - `redirect: 'manual'` + an explicit hop budget (5): the redirect target is
 *    re-validated (parse/scheme/address) BEFORE it is ever requested, so a
 *    `302 → file://` or `302 → 169.254.169.254` never leaves the process.
 *  - Byte-counting reader: reading past `maxBytes` cancels the stream at
 *    ~maxBytes + one chunk, never the full body (Axiom 6: byte-capped bodies).
 *  - The kill-switch read uses a lazy dynamic `import()` of BaseVault, exactly
 *    like permission-gate, so the esbuild-bundled worker thread never opens a
 *    second better-sqlite3 connection at bundle-load time.
 */
import { promises as dnsPromises } from 'node:dns';
import { checkActionPermission } from '../coreexec/permission-gate';
import type { GateAction } from '../coreexec/permission-gate';

export type EgressBlockedReason =
  | 'bad-url'
  | 'scheme'
  | 'internal-not-loopback'
  | 'kill-switch'
  | 'private-address'
  | 'dns-failure'
  | 'policy'
  | 'too-large'
  | 'timeout'
  | 'redirect-loop';

/** Plan §2.3 C8-a — re-exported from permission-gate ('fetch' | 'scrape' | 'shell'). */
export type EgressAction = GateAction;

export interface EgressResult {
  /** True only when nothing was blocked AND the final status is 2xx. */
  ok: boolean;
  /** HTTP status of the final response (0 when the request never completed). */
  status: number;
  /** UTF-8 body — empty for blocked results and non-2xx responses. */
  text: string;
  /** Bytes actually read off the wire (0 for blocked-before-fetch). */
  bytes: number;
  /**
   * Final response headers (lowercased keys; `{}` for blocked results and
   * requests that never completed). Surfaced so converted callers keep their
   * rate-limit / telemetry reads (§2.3 C9 — router.ts:48).
   */
  headers: Record<string, string>;
  /** Present iff the request was stopped by a security/limit gate. */
  blocked?: EgressBlockedReason;
}

export interface EgressOptions {
  /** Whole-operation budget in ms (initial request + all redirect hops). */
  timeoutMs?: number;
  /** Response byte cap; reading past it aborts the body as 'too-large'. */
  maxBytes?: number;
  /** Opt in to LOOPBACK-ONLY targets (local services). Non-loopback → block. */
  internal?: boolean;
  /** Opt in to private addresses (RFC-1918/metadata). Address gate only. */
  allowPrivate?: boolean;
  /**
   * HTTP method (default `'GET'`, case-insensitive). POST/PUT JSON bodies are
   * a first-class passthrough (§2.3 C9) — the chat routers converted to egress
   * would otherwise silently degrade to bodiless GETs. Bodies are never sent
   * with GET/HEAD (spec behaviour is a throw; we drop, because egress never
   * throws). See the redirect hop rules in the fetch loop for how method/body
   * survive (or don't) a 3xx.
   */
  method?: string;
  /** Extra request headers. Forwarded cross-origin on redirects NEVER (see loop). */
  headers?: Record<string, string>;
  /** Request body (string payloads only — every converted caller sends JSON). */
  body?: string;
}

export interface EgressContext {
  /** Plan types this `string | null` (worker's projectId is `string | null`). */
  projectId?: string | null;
  action: EgressAction;
  owner: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;

// ── Address classification ─────────────────────────────────────────────────

/** RFC-1918 + loopback + link-local (incl. the 169.254.169.254 metadata IP) + 0/8. */
function isPrivateV4(dotted: string): boolean {
  const parts = dotted.split('.');
  if (parts.length !== 4) return false;
  const octets: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    if (n > 255) return false;
    octets.push(n);
  }
  const x = octets[0] as number;
  const y = octets[1] as number;
  if (x === 0) return true; // 0.0.0.0/8 — "this host"
  if (x === 10) return true; // 10.0.0.0/8
  if (x === 127) return true; // 127.0.0.0/8 loopback
  if (x === 169 && y === 254) return true; // 169.254.0.0/16 link-local/metadata
  if (x === 172 && y >= 16 && y <= 31) return true; // 172.16.0.0/12
  if (x === 192 && y === 168) return true; // 192.168.0.0/16
  return false;
}

/** Private/special ranges for IPv4, IPv6, and `::ffff:` IPv4-mapped literals. */
function isPrivateAddress(addr: string): boolean {
  const a = addr.trim().toLowerCase().replace(/[[\]]/g, '');
  if (a === '::1' || a === '::') return true;
  if (a.startsWith('::ffff:')) {
    const rest = a.slice('::ffff:'.length);
    if (rest.includes('.')) return isPrivateV4(rest); // ::ffff:127.0.0.1
    const hex = rest.split(':');
    if (hex.length === 2) {
      // ::ffff:7f00:1 — dotted-quad encoded as two hex hextets
      const hi = Number.parseInt(hex[0] as string, 16);
      const lo = Number.parseInt(hex[1] as string, 16);
      if (!Number.isFinite(hi) || !Number.isFinite(lo)) return false;
      return isPrivateV4(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`);
    }
    return false;
  }
  if (a.includes(':')) {
    const first = a.split(':')[0] ?? '';
    const hextet = Number.parseInt(first, 16);
    if (!Number.isFinite(hextet)) return false;
    if ((hextet & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
    if ((hextet & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    return false;
  }
  return isPrivateV4(a);
}

/** Literal loopback only — `localhost` or 127.0.0.0/8 or `::1`. No DNS here. */
function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/[[\]]/g, '');
  if (h === 'localhost') return true;
  if (h === '::1') return true;
  if (h.includes(':')) return false;
  return /^127(\.\d{1,3}){3}$/.test(h);
}

// ── Gates 1 + 2 (pure, no I/O) ─────────────────────────────────────────────

/**
 * Parse + scheme + host gates shared by the initial URL and every redirect
 * hop. Returns the blocking reason, or null to continue.
 */
function validateSchemeAndHost(u: URL, opts: EgressOptions): EgressBlockedReason | null {
  // Order matters: scheme precedes the empty-host check so `file:///etc/passwd`
  // (protocol 'file:', hostname '') is reported as 'scheme', not 'bad-url'.
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'scheme';
  if (!u.hostname) return 'bad-url';
  if (opts.internal && !isLoopbackHost(u.hostname)) return 'internal-not-loopback';
  return null;
}

/** Gate 4 — DNS resolution + private-range check. Fail-closed. */
async function validateAddress(hostname: string, opts: EgressOptions): Promise<EgressBlockedReason | null> {
  if (opts.internal || opts.allowPrivate) return null; // explicit opt-in
  let addrs: { address: string }[];
  try {
    addrs = await dnsPromises.lookup(hostname, { all: true });
  } catch {
    // NXDOMAIN / EINVAL / EAI_AGAIN — a name we can't verify is a name we
    // don't talk to. Fail closed rather than letting fetch resolve it itself.
    return 'dns-failure';
  }
  if (!addrs || addrs.length === 0) return 'dns-failure';
  if (addrs.some((e) => isPrivateAddress(e.address))) return 'private-address';
  return null;
}

// ── Gate 3 — kill switch ───────────────────────────────────────────────────

/** True when external calls are DISABLED (i.e. the request must be blocked). */
async function killSwitchBlocks(): Promise<boolean> {
  try {
    // Lazy dynamic import — see permission-gate.ts's header for why: a static
    // top-level import would open basevault/db.ts at bundle-load time inside
    // the worker thread (the native-addon timing bug).
    const { db } = await import('../basevault/db.js');
    const row = db
      .prepare("SELECT value FROM system_settings WHERE key = 'external_calls_enabled'")
      .get() as { value: string } | undefined;
    if (!row) return false; // never written → default: external calls allowed
    const v = row.value.trim().toLowerCase();
    return v === 'false' || v === '0';
  } catch (err) {
    // Fail OPEN (logged) — mirrors checkActionPermission's non-negotiable
    // permissive default; a broken settings read must never break a live run.
    console.error('[egress] kill-switch read failed; allowing (fail-open):', err);
    return false;
  }
}

/**
 * §2.3 C9 — public kill-switch predicate. TRUE = external calls currently
 * ALLOWED. Callers that would otherwise initiate egress *unconditionally*
 * (boot-time model discovery, server-main.ts:630) use this to skip the whole
 * operation: zero DNS, zero socket, zero boot-time cost on eMMC (Axiom 6),
 * instead of paying the full gate chain just to be blocked.
 */
export async function externalCallsAllowed(): Promise<boolean> {
  return !(await killSwitchBlocks());
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isAbortError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: unknown; code?: unknown; cause?: unknown };
  const names: unknown[] = [e.name, e.code];
  const cause = e.cause;
  if (typeof cause === 'object' && cause !== null) {
    const c = cause as { name?: unknown; code?: unknown };
    names.push(c.name, c.code);
  }
  return names.some((n) => n === 'TimeoutError' || n === 'AbortError' || n === 'ABORT_ERR');
}

async function discardBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // already errored/aborted — nothing to release
  }
}

/**
 * The governed fetch. Never throws: every failure mode is either a `blocked`
 * verdict (security gate) or `ok:false` (transport/HTTP failure).
 */
export async function egressFetch(
  rawUrl: string,
  opts: EgressOptions = {},
  ctx?: EgressContext,
): Promise<EgressResult> {
  const owner = ctx?.owner ?? 'unknown';

  const fail = (
    reason: EgressBlockedReason,
    extra: { status?: number; bytes?: number } = {},
  ): EgressResult => {
    console.warn(`[egress] blocked(${reason}) — owner: ${owner}: ${rawUrl}`);
    return {
      ok: false,
      status: extra.status ?? 0,
      text: '',
      bytes: extra.bytes ?? 0,
      headers: {},
      blocked: reason,
    };
  };

  // ── Gates 1 + 2 on the initial URL ───────────────────────────────────────
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return fail('bad-url');
  }
  const hostGate = validateSchemeAndHost(current, opts);
  if (hostGate) return fail(hostGate);

  // ── Gate 3 — kill switch (non-internal only) ─────────────────────────────
  if (!opts.internal && (await killSwitchBlocks())) return fail('kill-switch');

  // ── Gate 4 — DNS + private ranges ────────────────────────────────────────
  const addrGate = await validateAddress(current.hostname, opts);
  if (addrGate) return fail(addrGate);

  // ── Gate 5 — project policy (Phase-5 archetype + tool registry) ─────────
  if (ctx) {
    const perm = await checkActionPermission(ctx.projectId ?? undefined, ctx.action);
    if (perm.blocked) return fail('policy');
  }

  // ── Gate 6 — the fetch loop ──────────────────────────────────────────────
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  // ONE budget for the whole operation — redirect chains can't multiply it.
  const signal = AbortSignal.timeout(timeoutMs);
  let redirects = 0;
  // §2.3 C9 request passthrough — mutable across redirect hops (see below).
  let reqMethod = (opts.method ?? 'GET').toUpperCase();
  let reqHeaders = opts.headers;
  let reqBody = opts.body;

  /** Final response headers as a plain record (lowercased keys). */
  const captureHeaders = (res: Response): Record<string, string> =>
    Object.fromEntries(res.headers.entries());

  for (;;) {
    let res: Response;
    try {
      const init: RequestInit = { redirect: 'manual', signal, method: reqMethod };
      if (reqHeaders) init.headers = reqHeaders;
      // Bodies never ride GET/HEAD (the spec throws; egress never does — drop).
      if (reqBody !== undefined && reqMethod !== 'GET' && reqMethod !== 'HEAD') init.body = reqBody;
      res = await fetch(current.toString(), init);
    } catch (err) {
      if (isAbortError(err) || signal.aborted) return fail('timeout');
      // Connection refused / reset / TLS failure — a transport failure, not a
      // security verdict. status 0 = "the request never completed".
      return { ok: false, status: 0, text: '', bytes: 0, headers: {} };
    }

    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await discardBody(res);
      // Budget check BEFORE following, then re-validate the hop: the redirect
      // target is vetted before any request is issued to it.
      if (redirects >= MAX_REDIRECTS) return fail('redirect-loop');
      redirects += 1;
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return fail('bad-url');
      }
      const hopHostGate = validateSchemeAndHost(next, opts);
      if (hopHostGate) return fail(hopHostGate);
      const hopAddrGate = await validateAddress(next.hostname, opts);
      if (hopAddrGate) return fail(hopAddrGate);
      // §2.3 C9 redirect semantics (mirrors fetch's own): preserve method+body
      // ONLY for 307/308 same-origin; every other status downgrades to GET,
      // and custom headers (Authorization!) are never forwarded cross-origin.
      const sameOrigin = next.origin === current.origin;
      const preserveMethod = (res.status === 307 || res.status === 308) && sameOrigin;
      if (!preserveMethod) {
        reqMethod = 'GET';
        reqBody = undefined;
      } else if (reqMethod === 'GET' || reqMethod === 'HEAD') {
        reqBody = undefined;
      }
      if (!sameOrigin) reqHeaders = undefined;
      current = next;
      continue;
    }

    const headers = captureHeaders(res);
    if (res.status < 200 || res.status >= 300) {
      // Transport/HTTP failure — NOT a block. Body discarded (never needed for
      // a failure verdict, and capped reads are the whole point). Headers are
      // still surfaced: a 429's rate-limit state is exactly what router.ts
      // needs to read off a failed response.
      await discardBody(res);
      return { ok: false, status: res.status, text: '', bytes: 0, headers };
    }

    const body = res.body;
    if (!body) return { ok: true, status: res.status, text: '', bytes: 0, headers };

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          // Cap hit: cancel at ~maxBytes + the chunk that crossed the line —
          // the remaining megabytes are never read (Axiom 6 byte cap).
          await reader.cancel().catch(() => undefined);
          return fail('too-large', { status: res.status, bytes });
        }
        chunks.push(value);
      }
    } catch (err) {
      if (isAbortError(err) || signal.aborted) return fail('timeout', { bytes });
      return { ok: false, status: res.status, text: '', bytes, headers };
    }

    return {
      ok: true,
      status: res.status,
      text: Buffer.concat(chunks).toString('utf8'),
      bytes,
      headers,
    };
  }
}
