/**
 * §2.3-P1-1 — WebSocket upgrade routes must FAIL CLOSED (HTTP 401) when the
 * request carries no socket (`c.env.incoming` undefined), and §2.3-P1-3 —
 * incoming-peer labels must be crypto-strong UUIDs, not `Math.random()`
 * base-36 scraps.
 *
 * ─── AUDITOR ARTIFACT (TDD RED phase) — TESTS ONLY, NO SRC EDITS ───────────
 *
 * This file NEVER imports server-main.ts (it binds port 3743, starts the
 * scheduler, and boots the provider registry — §4.2's rule, same as
 * perimeter.test.ts). Instead it works on two tracks:
 *
 *   TRACK 1 (behavioral): scratch Hono apps whose wiring MIRRORS the two
 *   `upgradeWebSocket` routes in server-main.ts (:231 terminal, :297 sync).
 *   The guard middleware is looked up from ./perimeter — the port-free
 *   extraction module §2.1-C5 established for exactly this kind of perimeter
 *   logic. While the export is missing, the scratch apps are wired exactly as
 *   server-main.ts is TODAY (unguarded), so the 401 assertions fail — and
 *   that failure IS the RED proof of the fail-open.
 *
 *   TRACK 2 (source contract): server-main.ts is read as TEXT (never
 *   executed) and pinned with the same style of assertions as
 *   perimeter.test.ts:200-213, so RED→GREEN flips when the Engineer wires
 *   the real gate — no edits to this file required.
 *
 * ─── ENGINEER CONTRACT (how RED → GREEN, no test edits) ────────────────────
 *
 * P1-1 (fail-closed gate):
 *   1. Export `wsUpgradeGuard: MiddlewareHandler` from src/server/perimeter.ts:
 *        - If the request is a WS upgrade attempt
 *          (`c.req.header('upgrade')?.toLowerCase() === 'websocket'`)
 *          AND `c.env?.incoming` is undefined
 *          → `return c.json({ error: 'Unauthorized' }, 401)`.
 *        - Otherwise `await next()` — non-upgrade requests keep today's
 *          fall-through behavior; env-bearing requests proceed to the
 *          upgrade path.
 *   2. Wire it ahead of BOTH upgradeWebSocket handlers in server-main.ts:
 *        app.get('/api/portgrid/terminal/:projectId', wsUpgradeGuard, upgradeWebSocket(...))
 *        app.get('/api/sync',                        wsUpgradeGuard, upgradeWebSocket(...))
 *   3. Scope discipline: the guard mounts ONLY on these two WS routes.
 *      HTTP scratch behavior elsewhere is untouched — authMiddleware and
 *      isLoopbackAddress keep `unknown ⇒ loopback` (perimeter.ts:81-87),
 *      and auth-middleware.test.ts is unaffected.
 *
 * P1-3 (peer label entropy):
 *   Replace `Math.random().toString(36).substring(7)` at server-main.ts:299
 *   with `crypto.randomUUID()` (Node ≥ 19 global, no import needed — see
 *   src/core/memory/cerebro/vector.ts:82 for established in-repo usage).
 *
 * ─── CURRENT FAIL-OPEN BASELINE (measured on this commit, Node 24) ─────────
 *
 *   socketless upgrade, NO env  → HTTP 500: an INCIDENTAL
 *     `TypeError: Cannot set properties of undefined (setting
 *     'Symbol(CONNECTION_SYMBOL_KEY)')` inside @hono/node-ws, surfaced by
 *     Hono's default onError. That is a crash, not a security decision —
 *     and on any code path where c.env exists but carries no socket the
 *     request would sail straight into the upgrade machinery instead.
 *   upgrade WITH env.incoming   → HTTP 200 (upgrade path entered).
 *   no upgrade header           → HTTP 404 (helper falls through to next()).
 *
 * ─── P1-4 DOCUMENTATION NOTE (NOT this file's tests) ───────────────────────
 *
 * When the §5-11 chunked-body cap lands in rateLimitMiddleware
 * (perimeter.ts:122-147 → 413 for chunked bodies over 64 KB), the EXISTING
 * test at src/server/auth/auth-middleware.test.ts:230-254 must flip from
 *   expect(res.status).not.toBe(413); expect(res.status).toBe(200);
 * to
 *   expect(res.status).toBe(413);
 * The Auditor does not touch that file; the flip is the Engineer's GREEN.
 *
 * P1-2 (30 s WS heartbeat ping/terminate sweep) is Engineer's scope and is
 * intentionally not covered here.
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { createNodeWebSocket } from '@hono/node-ws';
import fs from 'fs';
import path from 'path';
import * as perimeter from './perimeter';

/**
 * The Engineer's gate, resolved defensively so this file still collects when
 * the export does not exist yet. Missing ⇒ the scratch apps below wire the
 * routes UNGUARDED (today's server-main.ts shape) and the 401 assertions
 * fail — the RED proof. Present ⇒ wired ahead of upgradeWebSocket, exactly
 * as the contract above requires server-main.ts to do.
 */
const wsUpgradeGuard = (perimeter as unknown as Record<string, unknown>)
  .wsUpgradeGuard as MiddlewareHandler | undefined;

/** Realistic RFC 6455 upgrade headers (the helper keys on `upgrade` only). */
const WS_UPGRADE_HEADERS = {
  upgrade: 'websocket',
  connection: 'upgrade',
  'sec-websocket-version': '13',
  'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
};

const LOOPBACK_ENV = { incoming: { socket: { remoteAddress: '127.0.0.1' } } };

/**
 * Faithful mirror of server-main.ts:295-298 MINUS the port binding and the
 * NodeTransport singletons. The peerId line is kept verbatim from :299 so
 * the mirror cannot drift ahead of the source it shadows; label entropy
 * itself is pinned by the P1-3 source-contract tests below.
 */
function buildSyncMirror(): Hono {
  const app = new Hono();
  const { upgradeWebSocket } = createNodeWebSocket({ app });
  // Wired exactly as server-main.ts:295-298: the guard sits ahead of the
  // upgrade handler when exported, otherwise the bare handler (today's
  // unguarded shape — the RED proof). Direct calls (no spread) because
  // Hono 4.12.27's fixed-tuple HandlerInterface overloads do not resolve
  // a spread gate; see T3 deviation note.
  const syncHandler = upgradeWebSocket(() => {
    // verbatim from server-main.ts:299 — asserted by the source contracts
    const peerId = `incoming-${Math.random().toString(36).substring(7)}`;
    return {
      onOpen() { void peerId; },
      onMessage() { /* transport.handleIncomingMessage lives in server-main */ },
      onClose() {},
      onError() {},
    };
  });
  if (wsUpgradeGuard) app.get('/api/sync', wsUpgradeGuard, syncHandler);
  else app.get('/api/sync', syncHandler);
  return app;
}

/**
 * Faithful mirror of server-main.ts:229-232 MINUS the port binding and the
 * bwrap terminal session. createTerminalSession is deliberately NOT imported:
 * the gate decision precedes any session spawn, and pulling the pty/bwrap
 * machinery into a unit test would violate hermeticity (and Axiom 6).
 */
function buildTerminalMirror(): Hono {
  const app = new Hono();
  const { upgradeWebSocket } = createNodeWebSocket({ app });
  // Same wiring discipline as buildSyncMirror: direct calls mirroring
  // server-main.ts:229-232 (see T3 deviation note — no spread gate).
  const terminalHandler = upgradeWebSocket((c) => {
    const projectId = c.req.param('projectId'); // server-main.ts:233
    return {
      onOpen() { void projectId; },
      onMessage() {},
      onClose() {},
      onError() {},
    };
  });
  if (wsUpgradeGuard) app.get('/api/portgrid/terminal/:projectId', wsUpgradeGuard, terminalHandler);
  else app.get('/api/portgrid/terminal/:projectId', terminalHandler);
  return app;
}

// ─── TRACK 1: behavioral — the fail-closed gate ─────────────────────────────

describe('P1-1 WS upgrade gate — fail-closed when c.env.incoming is undefined', () => {
  it('(a) RED: socketless WS upgrade to /api/sync with NO env must yield 401 — today it passes through into the upgrade machinery (incidental 500 TypeError)', async () => {
    const app = buildSyncMirror();
    const res = await app.request('/api/sync', { headers: WS_UPGRADE_HEADERS });
    expect(
      res.status,
      'fail-open: a socketless WS upgrade must be REFUSED with a deliberate 401, ' +
        'not admitted into @hono/node-ws (currently an incidental 500 TypeError ' +
        "setting Symbol(CONNECTION_SYMBOL_KEY) on undefined c.env). " +
        'Engineer: export wsUpgradeGuard from ./perimeter and wire it ahead of the /api/sync upgradeWebSocket handler.',
    ).toBe(401);
  });

  it('(b) RED: socketless WS upgrade to /api/portgrid/terminal/:projectId with NO env must yield 401 — today it passes through into the upgrade machinery', async () => {
    const app = buildTerminalMirror();
    const res = await app.request('/api/portgrid/terminal/proj-123', { headers: WS_UPGRADE_HEADERS });
    expect(
      res.status,
      'fail-open: the embedded terminal is a REAL shell — a socketless upgrade must be ' +
        'REFUSED with a deliberate 401 before any TerminalSession can spawn. ' +
        'Engineer: wire wsUpgradeGuard ahead of the /api/portgrid/terminal/:projectId upgradeWebSocket handler.',
    ).toBe(401);
  });

  it('(c) INVARIANT (stays green before AND after the fix): WS upgrade WITH env.incoming.socket proceeds to the upgrade path — never 401 for a real connection', async () => {
    const syncApp = buildSyncMirror();
    const res = await syncApp.request('/api/sync', { headers: WS_UPGRADE_HEADERS }, LOOPBACK_ENV);
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200); // node-ws helper's empty upgrade acknowledgement

    const terminalApp = buildTerminalMirror();
    const res2 = await terminalApp.request(
      '/api/portgrid/terminal/proj-123',
      { headers: WS_UPGRADE_HEADERS },
      LOOPBACK_ENV,
    );
    expect(res2.status).not.toBe(401);
    expect(res2.status).toBe(200);
  });
});

// ─── TRACK 2: source contracts on server-main.ts (perimeter.test.ts style) ──

describe('P1-1 source contract — server-main.ts wires the fail-closed gate', () => {
  const src = fs.readFileSync(path.join(__dirname, 'server-main.ts'), 'utf8');

  it('RED: ./perimeter exports a wsUpgradeGuard middleware (Engineer must implement it)', () => {
    expect(
      wsUpgradeGuard,
      'wsUpgradeGuard is not exported from src/server/perimeter.ts yet — ' +
        'Engineer must implement it (401 when a WS upgrade attempt has no c.env.incoming) ' +
        'and wire it ahead of both upgradeWebSocket handlers in server-main.ts.',
    ).toBeTypeOf('function');
  });

  it('RED: server-main.ts references wsUpgradeGuard (wired at :231 terminal and :297 sync)', () => {
    expect(
      src,
      'server-main.ts does not wire wsUpgradeGuard — both upgradeWebSocket routes are still ungated.',
    ).toMatch(/wsUpgradeGuard/);
  });
});

describe('P1-3 source contract — crypto-strong incoming-peer labels (server-main.ts:299)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'server-main.ts'), 'utf8');

  it('RED: /api/sync peerId is minted with crypto.randomUUID() (RFC 4122 UUID, 122 bits of entropy)', () => {
    expect(
      src,
      'server-main.ts has no crypto.randomUUID() call — the incoming-peer label is still guessable.',
    ).toMatch(/crypto\.randomUUID\(\)/);
  });

  it('RED: the Math.random().toString(36) label mint is gone (7 base-36 chars ≈ 36 bits, brute-forceable over a long-lived socket)', () => {
    expect(
      src,
      'server-main.ts:299 still mints peerId from Math.random().toString(36).substring(7).',
    ).not.toMatch(/Math\.random\(\)\.toString\(36\)/);
  });

  it('reference: the UUID shape the fixed peerId must carry', () => {
    // Not executable against the live route (server-main binds a port), so the
    // shape is pinned here as the review checklist for the Engineer's fix.
    expect('incoming-3b241101-e2bb-4255-8caf-4136c566a962').toMatch(
      /^incoming-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    // and the current mint can NEVER satisfy it
    expect(/^incoming-[0-9a-f]{8}-[0-9a-f]{4}-/.test(`incoming-${Math.random().toString(36).substring(7)}`)).toBe(false);
  });
});
