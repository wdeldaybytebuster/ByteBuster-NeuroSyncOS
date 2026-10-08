/**
 * §4.2 UI-side contract + behaviour (node-environment; mirrors
 * chat-backend-routing.test.ts because the repo's jsdom environment is broken).
 *
 * Two things are locked here:
 *  (a) SOURCE CONTRACT — the browser's `Authorization` header is injected in
 *      exactly ONE module (`src/ui/lib/api.ts`); no view/component sets it and
 *      no call site bypasses it with a bare `fetch` / `new EventSource` /
 *      `new WebSocket`. Removing `authFetch` from the 149 call sites makes the
 *      scan tests fail; deleting the header from `authFetch` fails the
 *      behavioural test below.
 *  (b) BEHAVIOUR — `authFetch` really attaches the session bearer, really
 *      signals "unauthorized" on a 401 (that is what opens AuthGate), never
 *      signals it for the auth endpoints themselves, and never leaks the
 *      bearer to a foreign origin.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

function readSource(relPath: string): string {
  // repo root cwd; no `import.meta` (CommonJS module target)
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8');
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const UI_ROOT = path.join(process.cwd(), 'src/ui');
const API_MODULE = path.join(UI_ROOT, 'lib', 'api.ts');

/** Every UI source file except the one module allowed to talk to the network. */
function uiSourcesExceptApiModule(): string[] {
  return walk(UI_ROOT).filter(
    (p) =>
      (p.endsWith('.ts') || p.endsWith('.tsx')) &&
      !p.endsWith('.test.ts') &&
      !p.endsWith('.test.tsx') &&
      p !== API_MODULE
  );
}

describe('src/ui/lib/api.ts — single Authorization injection point (§4.2)', () => {
  const src = readSource('src/ui/lib/api.ts');

  it('contains exactly ONE Authorization literal', () => {
    expect((src.match(/Authorization/g) ?? []).length).toBe(1);
  });

  it('ScopeLogicChat ships no Authorization literal (unchanged chat contract)', () => {
    const chat = readSource('src/ui/components/ScopeLogicChat.tsx');
    expect(chat).not.toMatch(/Authorization['"]?\s*:/);
  });

  it('CerebroChatbot ships no Authorization literal (unchanged chat contract)', () => {
    const chat = readSource('src/ui/components/CerebroChatbot.tsx');
    expect(chat).not.toMatch(/Authorization['"]?\s*:/);
  });
});

describe('no UI call site bypasses the auth wrapper', () => {
  it('no bare fetch( outside lib/api.ts', () => {
    const offenders = uiSourcesExceptApiModule()
      .filter((p) => /\bfetch\(/.test(fs.readFileSync(p, 'utf-8')))
      .map((p) => path.relative(process.cwd(), p));
    expect(offenders).toEqual([]);
  });

  it('no bare new EventSource( / new WebSocket( outside lib/api.ts', () => {
    const offenders = uiSourcesExceptApiModule()
      .filter((p) => /new\s+(EventSource|WebSocket)\s*\(/.test(fs.readFileSync(p, 'utf-8')))
      .map((p) => path.relative(process.cwd(), p));
    expect(offenders).toEqual([]);
  });
});

describe('authFetch behaviour (real header, real 401 signal)', () => {
  type Call = { url: string; init: any };
  let calls: Call[] = [];
  let nextStatus = 200;
  let api: typeof import('./api');

  const store = new Map<string, string>([['neurosync.session', 'session-token-abc']]);

  beforeAll(async () => {
    (globalThis as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    (globalThis as any).fetch = async (url: unknown, init: any) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, ticket: 'ticket-xyz' }), {
        status: nextStatus,
        headers: { 'content-type': 'application/json' },
      });
    };
    api = await import('./api.js');
  });

  afterAll(() => {
    delete (globalThis as any).fetch;
    delete (globalThis as any).localStorage;
  });

  it('attaches Authorization: Bearer <session> to an API request', async () => {
    calls = [];
    nextStatus = 200;
    await api.authFetch('/api/projects');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.init.headers.Authorization).toBe('Bearer session-token-abc');
  });

  it('NEVER leaks the bearer to a foreign origin', async () => {
    calls = [];
    nextStatus = 200;
    await api.authFetch('https://example.com/exfiltrate');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.init.headers?.Authorization).toBeUndefined();
  });

  it('signals unauthorized on a 401 from an API route (this is what opens AuthGate)', async () => {
    calls = [];
    nextStatus = 401;
    const seen: number[] = [];
    const off = api.onUnauthorized(() => seen.push(Date.now()));
    await api.authFetch('/api/cerebro/query', { method: 'POST', body: '{}' });
    expect(seen).toHaveLength(1);
    off();
  });

  it('does NOT signal unauthorized for the auth endpoints themselves (a wrong password is not a dead session)', async () => {
    calls = [];
    nextStatus = 401;
    const seen: number[] = [];
    const off = api.onUnauthorized(() => seen.push(Date.now()));
    await api.authFetch('/api/auth/login', { method: 'POST', body: '{"password":"x"}' });
    expect(seen).toHaveLength(0);
    off();
  });

  it('fetchTicket() POSTs /api/auth/ticket with the bearer and returns the ticket', async () => {
    calls = [];
    nextStatus = 200;
    const ticket = await api.fetchTicket();
    expect(ticket).toBe('ticket-xyz');
    const call = calls.find((c) => c.url.includes('/api/auth/ticket'));
    expect(call).toBeTruthy();
    expect(call!.init.method).toBe('POST');
    expect(call!.init.headers.Authorization).toBe('Bearer session-token-abc');
  });

  it('session token round-trips through localStorage (set / get / clear)', () => {
    expect(api.getSessionToken()).toBe('session-token-abc');
    api.setSessionToken('another-token');
    expect(api.getSessionToken()).toBe('another-token');
    api.clearSessionToken();
    expect(api.getSessionToken()).toBeNull();
  });
});

describe('P2-B2 — authFetch is bounded (COMBINE, not opt-out)', () => {
  type Call = { url: string; init: any };
  let calls: Call[] = [];
  let api: typeof import('./api');

  const store = new Map<string, string>([['neurosync.session', 'session-token-abc']]);

  beforeAll(async () => {
    (globalThis as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    (globalThis as any).fetch = async (url: unknown, init: any) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, ticket: 'ticket-xyz' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    api = await import('./api.js');
  });

  afterAll(() => {
    delete (globalThis as any).fetch;
    delete (globalThis as any).localStorage;
  });

  it('UI_FETCH_TIMEOUT_MS defaults to 30 s (no env in test)', () => {
    expect(api.UI_FETCH_TIMEOUT_MS).toBe(30_000);
  });

  it('attaches a REAL AbortSignal even when the caller passes no init', async () => {
    calls = [];
    await api.authFetch('/api/projects');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0]!.init.signal.aborted).toBe(false);
  });

  it('COMBINEs the caller signal with the budget (never replaces, never signal:undefined)', async () => {
    calls = [];
    const controller = new AbortController();
    await api.authFetch('/api/projects', { signal: controller.signal });
    const sent: AbortSignal = calls[0]!.init.signal;
    expect(sent).toBeInstanceOf(AbortSignal);
    expect(sent).not.toBe(controller.signal); // combined, not passed through raw
    expect(sent.aborted).toBe(false);
    controller.abort(); // caller abort propagates through the combination
    expect(sent.aborted).toBe(true);
  });

  it('propagates an already-aborted caller signal as aborted', async () => {
    calls = [];
    const controller = new AbortController();
    controller.abort();
    await api.authFetch('/api/projects', { signal: controller.signal });
    expect((calls[0]!.init.signal as AbortSignal).aborted).toBe(true);
  });

  it('a hung request fails with AbortError inside the explicit budget (not TimeoutError, not a hang)', async () => {
    const realFetch = (globalThis as any).fetch;
    // Signal-aware mock: models real fetch, which rejects with the signal's
    // reason on abort (the budget signal carries an AbortError reason).
    (globalThis as any).fetch = (_url: unknown, init: any) =>
      new Promise((_resolve, reject) => {
        const sig: AbortSignal | undefined = init?.signal;
        if (sig?.aborted) {
          reject(sig.reason);
          return;
        }
        sig?.addEventListener('abort', () => reject(sig.reason), { once: true });
      });
    try {
      const start = Date.now();
      await expect(api.authFetch('/api/projects', undefined, 30)).rejects.toMatchObject({ name: 'AbortError' });
      expect(Date.now() - start).toBeLessThan(5000);
    } finally {
      (globalThis as any).fetch = realFetch;
    }
  }, 10000);

  it('fetchTicket sends the same default budget signal', async () => {
    calls = [];
    await api.fetchTicket();
    const call = calls.find((c) => c.url.includes('/api/auth/ticket'));
    expect(call).toBeTruthy();
    expect(call!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('garbage timeoutMs falls back to the default (never unbounded, never 0)', async () => {
    calls = [];
    await api.authFetch('/api/projects', undefined, -5 as any);
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
    await api.authFetch('/api/projects', undefined, NaN as any);
    expect(calls[1]!.init.signal).toBeInstanceOf(AbortSignal);
  });
});
