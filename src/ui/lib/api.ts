/**
 * §2.2 (V2) — the browser's single network chokepoint.
 *
 * Invariant enforced by `src/ui/lib/api.test.ts`:
 *   - exactly ONE credential-header literal lives in this file; no view or
 *     component may set it, and no call site may bypass `authFetch` with a
 *     bare `fetch(` / `new EventSource(` / `new WebSocket(`.
 *
 * Behaviours locked by tests:
 *   - `authFetch` attaches the session bearer to API requests (relative URLs,
 *     the local API origin, and the page's own origin) and NEVER to a foreign
 *     origin — a bearer in a cross-origin request would be exfiltration.
 *   - a 401 from an API route emits the "unauthorized" signal (that is what
 *     opens AuthGate); a 401 from the auth endpoints themselves does not
 *     (a wrong password is not a dead session).
 *   - SSE/WS cannot set request headers from the browser, so those
 *     connections authenticate with a short-lived, path-restricted ticket
 *     minted by `fetchTicket()` and appended as `?ticket=`.
 */

/** Compiled default API origin (node/tests, or a browser without a location). */
const DEFAULT_API = 'http://localhost:3743';

/**
 * P2-3 — Local API origin: the page's own origin in the browser (so a custom
 * NEUROSYNC_PORT Just Works — the UI is served by the API itself in prod,
 * and vite proxies /api in dev), compiled default otherwise.
 */
function resolveApiOrigin(): string {
  try {
    if (
      typeof window !== 'undefined' &&
      typeof window.location?.origin === 'string' &&
      window.location.origin.startsWith('http')
    ) {
      return window.location.origin;
    }
  } catch {
    /* no DOM — fall through to the compiled default */
  }
  return DEFAULT_API;
}

/** Local API origin (dev + prod are the same host: the UI is served by it). */
export const API = resolveApiOrigin();

const SESSION_KEY = 'neurosync.session';
const AUTH_HEADER = 'Authorization';
const API_HOST = new URL(API).host;
// P3-S3: the compiled default stays bearer-eligible even when API resolved to
// the page origin — App.tsx absolute :3743 call sites remain until the Phase 4
// D-14 sweep lands (Settings/RunHistory/Statusline now use the API chokepoint).
const DEFAULT_API_HOST = new URL(DEFAULT_API).host;

// ── session token (localStorage) ─────────────────────────────────────────────

function storage(): Storage | null {
  try {
    // duck-typed on purpose: private-mode / disabled storage throws on access
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch {
    /* storage unavailable — callers degrade to "logged out" */
  }
  return null;
}

export function getSessionToken(): string | null {
  return storage()?.getItem(SESSION_KEY) ?? null;
}

export function setSessionToken(token: string): void {
  storage()?.setItem(SESSION_KEY, token);
}

export function clearSessionToken(): void {
  storage()?.removeItem(SESSION_KEY);
}

// ── unauthorized signal (opens AuthGate) ─────────────────────────────────────

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Subscribe to "the server says the session is dead". Returns an unsubscribe. */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function emitUnauthorized(): void {
  for (const listener of [...unauthorizedListeners]) {
    try {
      listener();
    } catch {
      /* one bad listener must not swallow the signal for the others */
    }
  }
}

// ── URL helpers ──────────────────────────────────────────────────────────────

function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url; // Request
}

function pageHref(): string | undefined {
  return typeof location !== 'undefined' && location.href ? location.href : undefined;
}

function parseUrl(url: string): URL | null {
  try {
    // node (tests) has no location — the placeholder base is never used for
    // absolute URLs and relative URLs are handled before parsing
    return new URL(url, pageHref() ?? 'http://localhost:3742');
  } catch {
    return null;
  }
}

/** True for URLs the bearer may be attached to: relative, local API, same origin. */
function isApiUrl(url: string): boolean {
  if (url.startsWith('/')) return true;
  const parsed = parseUrl(url);
  if (!parsed) return false;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.host === API_HOST || parsed.host === DEFAULT_API_HOST) return true;
  const href = pageHref();
  return !!href && parsed.origin === new URL(href).origin;
}

function pathOf(url: string): string {
  if (url.startsWith('/')) return url.split('#')[0]!.split('?')[0] ?? '/';
  const parsed = parseUrl(url);
  return parsed ? parsed.pathname : '/';
}

/** The auth endpoints own their own 401s (wrong password ≠ dead session). */
function isAuthEndpoint(url: string): boolean {
  return pathOf(url).startsWith('/api/auth/');
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (Array.isArray(headers)) {
    const record: Record<string, string> = {};
    for (const pair of headers) record[pair[0]!] = pair[1]!;
    return record;
  }
  if (headers instanceof Headers) {
    const record: Record<string, string> = {};
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }
  return { ...headers };
}

// ── fetch budgets (P2-B2) ────────────────────────────────────────────────────

function readUiEnv(name: string): string | undefined {
  try {
    const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })?.process?.env;
    const v = env?.[name];
    return typeof v === 'string' ? v : undefined;
  } catch {
    return undefined; // browser bundle — no env, compiled default applies
  }
}

/**
 * P2-B2 — default budget for every authFetch/fetchTicket call (30 s,
 * `UI_FETCH_TIMEOUT_MS` override). Derivation: the single-leg provider
 * budget is 30 s (OPENAI_COMPAT_TIMEOUT_MS, openai-compatible.ts:51-52),
 * so a dashboard poll that outlives it is by definition hung — bound it to
 * the same horizon. Browser bundles have no env (compiled default); node /
 * tests honour the override.
 */
export const UI_FETCH_TIMEOUT_MS: number = (() => {
  const n = Number(readUiEnv('UI_FETCH_TIMEOUT_MS'));
  return Number.isInteger(n) && (n as number) > 0 ? (n as number) : 30_000;
})();

/**
 * P2-B2 — named extended budgets for the long-running sites that would
 * otherwise trip the 30 s default. Passed as authFetch's 3rd arg with a
 * justification comment at each call site — never a silent opt-out.
 *  - LONG_TASK_BUDGET_MS (5 min): full-DB restore / schema migrate / OKF
 *    project scans — bulk I/O + embedding passes over the whole corpus.
 *  - LLM_TASK_BUDGET_MS (2 min): single LLM-inference-backed prompts
 *    (ScopeLogic interview, vector search, provider self-test) — covers a
 *    60 s council (council.ts) plus provider retry headroom.
 */
export const LONG_TASK_BUDGET_MS = 300_000;
export const LLM_TASK_BUDGET_MS = 120_000;

/**
 * A timeout signal that aborts with a DOMException named 'AbortError' (NOT
 * 'TimeoutError'), so every existing `err.name === 'AbortError'` branch
 * across the 122 authFetch call sites keeps classifying correctly — the
 * ONLY behaviour change is that hung requests now fail instead of hanging
 * forever. The timer is unref'd where supported so node/test processes are
 * never held open by an in-flight budget (browser: unref absent, no-op).
 */
function budgetSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort(new DOMException(`fetch timed out after ${ms}ms`, 'AbortError'));
    } catch { /* already settled */ }
  }, ms);
  try {
    (timer as unknown as { unref?: () => void }).unref?.();
  } catch { /* browser — no unref */ }
  return controller.signal;
}

/**
 * Combine the caller's signal (when present) with the budget signal.
 * COMBINE, not opt-out: an explicit per-call controller (chatbot :50,
 * ScopeLogicChat :55, App.tsx polls) keeps working AND gains the default
 * bound — whichever fires first wins, reasons propagate unchanged.
 * exactOptionalPropertyTypes discipline: presence-checked, never
 * `signal: undefined` written into the init.
 */
function combinedSignal(callerSignal: AbortSignal | null | undefined, ms: number): AbortSignal {
  const parts = callerSignal ? [callerSignal, budgetSignal(ms)] : [budgetSignal(ms)];
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === 'function') return anyFn.call(AbortSignal, parts);
  const controller = new AbortController();
  const forward = (): void => {
    try {
      const culprit = parts.find((s) => s.aborted);
      controller.abort(culprit ? culprit.reason : undefined);
    } catch { /* already aborted */ }
  };
  if (parts.some((s) => s.aborted)) forward();
  else for (const s of parts) s.addEventListener('abort', forward, { once: true });
  return controller.signal;
}

function resolveBudgetMs(timeoutMs: number | undefined): number {
  return typeof timeoutMs === 'number' && Number.isInteger(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : UI_FETCH_TIMEOUT_MS;
}

// ── authFetch ────────────────────────────────────────────────────────────────

/**
 * `fetch` with the session bearer attached (API URLs only) and a 401 signal
 * that opens AuthGate (except for the auth endpoints themselves).
 *
 * P2-B2 — every call is bounded: the signal sent is
 * `AbortSignal.any([init?.signal, budget])` (COMBINE, not opt-out), default
 * 30 s (`UI_FETCH_TIMEOUT_MS`), overridable per call via `timeoutMs` for the
 * named long-running sites (restore/migrate, OKF scans, ScopeLogic prompt,
 * vector search, provider self-test — each carries a justification comment).
 */
export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  const url = toUrlString(input);
  const next: RequestInit = { ...(init ?? {}) };

  if (isApiUrl(url)) {
    const token = getSessionToken();
    if (token) {
      next.headers = { ...headersToRecord(init?.headers), [AUTH_HEADER]: `Bearer ${token}` };
    }
  }

  // Presence discipline under exactOptionalPropertyTypes: init?.signal is
  // only forwarded when actually present — never `signal: undefined` — and
  // the combined signal is always a REAL AbortSignal.
  const callerSignal = init?.signal ?? null;
  next.signal = combinedSignal(callerSignal, resolveBudgetMs(timeoutMs));

  const response = await fetch(url, next);
  if (response.status === 401 && !isAuthEndpoint(url)) emitUnauthorized();
  return response;
}

// ── tickets (SSE/WS cannot set headers) ──────────────────────────────────────

/**
 * Mint a 30-second, path-restricted, single-use-budget ticket for EventSource
 * and WebSocket URLs. Returns null when logged out or on any failure —
 * callers must then NOT reconnect (no ticket ⇒ no stream ⇒ no retry loop).
 */
export async function fetchTicket(): Promise<string | null> {
  const token = getSessionToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API}/api/auth/ticket`, {
      method: 'POST',
      headers: { [AUTH_HEADER]: `Bearer ${token}` },
      // P2-B2 — same default budget as authFetch: minting is a quick POST,
      // never a stream, so a hung ticket call must fail instead of hanging.
      signal: budgetSignal(UI_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { ticket?: string };
    return typeof body.ticket === 'string' && body.ticket.length > 0 ? body.ticket : null;
  } catch {
    return null;
  }
}

function withTicket(url: string, ticket: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}ticket=${encodeURIComponent(ticket)}`;
}

// ── ticketed EventSource proxy ───────────────────────────────────────────────

const SSE_RECONNECT_MIN_MS = 1000;
const SSE_RECONNECT_MAX_MS = 15000;

/**
 * Drop-in EventSource replacement: fetches a ticket, opens the stream with
 * `?ticket=`, replays listeners across reconnects, and backs off — but stops
 * for good when the ticket can no longer be minted (logged out / 401), so a
 * dead session cannot spin a retry loop.
 */
export class TicketedEventSource {
  private readonly url: string;
  private source: EventSource | null = null;
  private disposed = false;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onopen: ((event: Event) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    void this.connect();
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    this.source?.addEventListener(type, listener as EventListener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
    this.source?.removeEventListener(type, listener as EventListener);
  }

  close(): void {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.source?.close();
    this.source = null;
  }

  private async connect(): Promise<void> {
    if (this.disposed) return;
    const ticket = await fetchTicket();
    if (this.disposed) return;
    if (ticket === null) {
      // no ticket ⇒ the session is gone; fail quiet instead of hot-looping
      this.onerror?.(new Event('error'));
      return;
    }

    const source = new EventSource(withTicket(this.url, ticket));
    this.source = source;
    this.attempts = 0;

    for (const [type, set] of this.listeners) {
      for (const listener of set) source.addEventListener(type, listener as EventListener);
    }
    source.onmessage = (event) => this.onmessage?.(event);
    source.onopen = (event) => this.onopen?.(event);
    source.onerror = (event) => {
      this.onerror?.(event);
      if (this.disposed) return;
      if (source.readyState === EventSource.CLOSED) {
        source.close();
        this.source = null;
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;
    this.attempts += 1;
    const delay = Math.min(SSE_RECONNECT_MAX_MS, SSE_RECONNECT_MIN_MS * 2 ** (this.attempts - 1));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }
}

export function openEventSource(url: string): TicketedEventSource {
  return new TicketedEventSource(url);
}

// ── ticketed WebSocket proxy ─────────────────────────────────────────────────

/**
 * Drop-in WebSocket replacement: mirrors readyState from the first tick
 * (0 = CONNECTING while the ticket is minted), queues `send()` until the real
 * socket opens, and never auto-reconnects (a dropped terminal session must
 * stay dropped — silence is the signal).
 */
export class TicketedWebSocket {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  private readonly url: string;
  private socket: WebSocket | null = null;
  private disposed = false;
  private state: number = TicketedWebSocket.CONNECTING;
  private readonly queue: string[] = [];

  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    void this.connect();
  }

  get readyState(): number {
    return this.state;
  }

  send(data: string): void {
    if (this.state === TicketedWebSocket.OPEN && this.socket) {
      this.socket.send(data);
      return;
    }
    if (this.state === TicketedWebSocket.CONNECTING) this.queue.push(data);
    // CLOSED: drop silently — the xterm input path already guards on readyState
  }

  close(): void {
    if (this.state === TicketedWebSocket.CLOSED) return;
    this.disposed = true;
    if (this.socket) {
      this.socket.close();
      return;
    }
    // socket never got created (close() during ticket minting)
    this.state = TicketedWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }

  private async connect(): Promise<void> {
    const ticket = await fetchTicket();
    if (this.disposed) return;
    if (ticket === null) {
      // no ticket ⇒ session dead; surface the failure and stop
      this.state = TicketedWebSocket.CLOSED;
      this.onerror?.(new Event('error'));
      this.onclose?.(new CloseEvent('close'));
      return;
    }

    const socket = new WebSocket(withTicket(this.url, ticket));
    this.socket = socket;

    socket.onopen = (event) => {
      this.state = TicketedWebSocket.OPEN;
      for (const queued of this.queue.splice(0)) socket.send(queued);
      this.onopen?.(event);
    };
    socket.onmessage = (event) => this.onmessage?.(event);
    socket.onerror = (event) => this.onerror?.(event);
    socket.onclose = (event) => {
      this.state = TicketedWebSocket.CLOSED;
      this.onclose?.(event);
    };
    if (this.disposed) socket.close();
  }
}

export function openWebSocket(url: string): TicketedWebSocket {
  return new TicketedWebSocket(url);
}
