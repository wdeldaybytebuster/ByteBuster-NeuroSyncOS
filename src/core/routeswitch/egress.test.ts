/**
 * §4.3 V2 — governed egress tests (plan §2.3 C8-a / §4.3 cases 1-7).
 *
 * THE BUG UNDER TEST (§0-V2): every outbound HTTP call in the system used raw
 * `fetch` with zero address vetting — `file://`, RFC-1918 loopback, link-local
 * metadata (`169.254.169.254`), and unbounded response bodies all sailed
 * through. RouteSwitch (the module that owns egress — AGENTS.md boundary)
 * now exposes `egressFetch`, the single governed door.
 *
 * Harness notes (§4.2 — never import server-main.ts):
 *  - A throwaway `http.createServer` on 127.0.0.1:0 stands in for the "local
 *    service" and for the loopback/metadata/redirect targets; every port is
 *    ephemeral so suites can't collide, and a hit counter proves blocked
 *    requests never reach the wire (0 bytes egress).
 *  - DNS checks are offline-safe: numeric hosts resolve via getaddrinfo with
 *    no network, and the oversized-hostname case fails locally with EINVAL.
 *  - Real BaseVault DB for the kill-switch + policy rows (same initDB/unlink
 *    pattern as permission-gate.test.ts).
 *
 * Cases 1-7 are the plan's §4.3 spec verbatim; 8-16 pin the additional
 * guarantees the plan's prose requires (bad-url, internal-not-loopback,
 * policy, dns-failure, HTTP error/network error remain non-block "failures",
 * and per-hop re-validation of redirects — see egress.ts).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import { db, initDB, dbPath } from '../basevault/db';
import { egressFetch } from './egress';

const HELLO = 'hello-egress'; // 12 bytes
const BIG_TARGET = 10 * 1024 * 1024; // 10 MB
const CHUNK = 65_536; // one write() worth

describe('egressFetch (§2.3 C8-a / §4.3 governed egress)', () => {
  let server: http.Server;
  let port: number;
  let hits: number;

  const url = (p: string): string => `http://127.0.0.1:${port}${p}`;

  beforeAll(async () => {
    initDB();
    hits = 0;
    server = http.createServer((req, res) => {
      hits += 1;
      const p = req.url ?? '/';
      if (p === '/') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end(HELLO);
      } else if (p === '/missing') {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not here');
      } else if (p === '/big') {
        // Deterministic 10 MB pump. `res.on('error')` + the destroyed checks
        // keep the server from crashing when egress aborts mid-body (the
        // client-destroyed path fires ECONNRESET on the write otherwise).
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        const chunk = Buffer.alloc(CHUNK, 0x61);
        let sent = 0;
        const pump = (): void => {
          while (sent < BIG_TARGET) {
            if (res.destroyed || res.writableEnded) return;
            sent += chunk.length;
            if (!res.write(chunk)) {
              res.once('drain', pump);
              return;
            }
          }
          if (!res.destroyed) res.end();
        };
        res.on('error', () => {});
        pump();
      } else if (p === '/hang') {
        // Intentionally never responds — egress must time out on its own.
      } else if (p === '/redirect-loop') {
        res.writeHead(302, { location: url('/redirect-loop') });
        res.end();
      } else if (p === '/redirect-file') {
        res.writeHead(302, { location: 'file:///etc/passwd' });
        res.end();
      } else if (p === '/redirect-metadata') {
        res.writeHead(302, { location: 'http://169.254.169.254/latest/' });
        res.end();
      } else {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not here');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  beforeEach(() => {
    hits = 0;
    db.prepare('DELETE FROM projects').run();
    db.prepare(
      "DELETE FROM system_settings WHERE key IN ('tool_registry','agent_permissions','external_calls_enabled')",
    ).run();
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
  });

  // ── §4.3 case 1 — scheme gate ─────────────────────────────────────────────
  it("1: file:///etc/passwd -> blocked:'scheme', zero bytes read", async () => {
    const res = await egressFetch('file:///etc/passwd', {}, { action: 'fetch', owner: 'test' });
    expect(res.ok).toBe(false);
    expect(res.blocked).toBe('scheme');
    expect(res.bytes).toBe(0);
    expect(hits).toBe(0);
  });

  // ── §4.3 case 2 — loopback without internal/allowPrivate ──────────────────
  it("2: loopback without internal/allowPrivate -> blocked:'private-address', 0 hits", async () => {
    const res = await egressFetch(url('/'), {}, { action: 'fetch', owner: 'test' });
    expect(res.ok).toBe(false);
    expect(res.blocked).toBe('private-address');
    expect(hits).toBe(0);
  });

  // ── §4.3 case 3 — cloud metadata endpoint ─────────────────────────────────
  it("3: 169.254.169.254 metadata -> blocked:'private-address'", async () => {
    const res = await egressFetch('http://169.254.169.254/latest/meta-data/', {}, { action: 'fetch', owner: 'test' });
    expect(res.ok).toBe(false);
    expect(res.blocked).toBe('private-address');
    expect(hits).toBe(0);
  });

  // ── §4.3 case 4 — kill switch ─────────────────────────────────────────────
  it("4: kill switch 'false'/'0' -> blocked:'kill-switch' (0 hits); absent -> allowed", async () => {
    const setKillSwitch = (v: string): void => {
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('external_calls_enabled', ?)").run(v);
    };

    for (const value of ['false', '0']) {
      setKillSwitch(value);
      const res = await egressFetch(url('/'), { allowPrivate: true }, { action: 'fetch', owner: 'test' });
      expect(res.ok).toBe(false);
      expect(res.blocked).toBe('kill-switch');
      expect(hits).toBe(0);
    }

    db.prepare("DELETE FROM system_settings WHERE key = 'external_calls_enabled'").run();
    const allowed = await egressFetch(url('/'), { allowPrivate: true }, { action: 'fetch', owner: 'test' });
    expect(allowed.ok).toBe(true);
    expect(allowed.blocked).toBeUndefined();
    expect(allowed.text).toBe(HELLO);
    expect(hits).toBe(1);
  });

  // ── §4.3 case 5 — byte cap ────────────────────────────────────────────────
  it('5: 10 MB body vs maxBytes 1_000_000 -> too-large, bytes bounded', async () => {
    const res = await egressFetch(
      url('/big'),
      { maxBytes: 1_000_000, internal: true, timeoutMs: 20_000 },
      { action: 'fetch', owner: 'test' },
    );
    expect(res.ok).toBe(false);
    expect(res.blocked).toBe('too-large');
    // Bounded by the cap plus at most the chunk that crossed it — never the
    // full 10 MB (the plan's invariant: "bytes <= maxBytes + chunk").
    expect(res.bytes).toBeLessThanOrEqual(1_000_000 + CHUNK);
    expect(res.bytes).toBeGreaterThan(0);
  });

  // ── §4.3 case 6 — timeout ─────────────────────────────────────────────────
  it('6: /hang with timeoutMs 200 -> fails fast (ok:false), whole test < 1s', async () => {
    const started = Date.now();
    const res = await egressFetch(url('/hang'), { timeoutMs: 200, internal: true }, { action: 'fetch', owner: 'test' });
    const elapsed = Date.now() - started;
    expect(res.ok).toBe(false);
    // Design superset of the plan's ok:false — an abort is reported as the
    // 'timeout' block reason (status 0, no partial body).
    expect(res.blocked).toBe('timeout');
    expect(res.status).toBe(0);
    expect(elapsed).toBeLessThan(1000);
  });

  // ── §4.3 case 7 — explicit loopback opt-in ────────────────────────────────
  it('7: internal:true + loopback -> allowed (ok:true, body read)', async () => {
    const res = await egressFetch(url('/'), { internal: true }, { action: 'fetch', owner: 'test' });
    expect(res.ok).toBe(true);
    expect(res.blocked).toBeUndefined();
    expect(res.status).toBe(200);
    expect(res.text).toBe(HELLO);
    expect(res.bytes).toBe(HELLO.length);
  });

  // ── bad URL never reaches the wire ────────────────────────────────────────
  it("8: unparseable URL -> blocked:'bad-url'", async () => {
    const res = await egressFetch('not-a-valid-url', {}, { action: 'fetch', owner: 'test' });
    expect(res.ok).toBe(false);
    expect(res.blocked).toBe('bad-url');
    expect(res.bytes).toBe(0);
  });

  // ── internal:true does NOT mean "any address" ─────────────────────────────
  it("9: internal:true to a non-loopback address -> blocked:'internal-not-loopback' (no DNS)", async () => {
    const res = await egressFetch('http://169.254.169.254/latest/meta-data/', { internal: true }, { action: 'fetch', owner: 'test' });
    expect(res.ok).toBe(false);
    expect(res.blocked).toBe('internal-not-loopback');
    expect(hits).toBe(0);
  });

  // ── project policy still applies even when the address is opted in ───────
  it("10: seeded network:false + allowPrivate loopback -> blocked:'policy', 0 hits", async () => {
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('agent_permissions', ?)").run(
      JSON.stringify({
        archetypes: [{ id: 'research_only', read: true, write: false, exec: false, git: true, network: false }],
      }),
    );
    db.prepare(
      'INSERT OR REPLACE INTO projects (id, name, permission_archetype, created_at) VALUES (?, ?, ?, ?)',
    ).run('proj-egress-policy', 'Egress Policy Project', 'research_only', Date.now());

    const res = await egressFetch(
      url('/'),
      { allowPrivate: true },
      { projectId: 'proj-egress-policy', action: 'fetch', owner: 'test' },
    );
    expect(res.ok).toBe(false);
    expect(res.blocked).toBe('policy');
    expect(hits).toBe(0);
  });

  // ── DNS failure is fail-closed (blocked), never a silent pass-through ─────
  it("11: unresolvable oversized hostname -> blocked:'dns-failure'", async () => {
    // 373-char hostname: parses as a URL, then getaddrinfo fails locally (EINVAL)
    // — no network round-trip, so the assertion is offline-deterministic.
    const host = ['a', 'b', 'c', 'd', 'e', 'f'].map((l) => l.repeat(60)).join('.') + '.invalid';
    const res = await egressFetch(`http://${host}/`, {}, { action: 'fetch', owner: 'test' });
    expect(res.ok).toBe(false);
    expect(res.blocked).toBe('dns-failure');
    expect(hits).toBe(0);
  });

  // ── non-2xx is a FAILURE, not a block (don't conflate the two in PortGrid)
  it('12: HTTP 404 -> ok:false, status 404, no blocked reason', async () => {
    const res = await egressFetch(url('/missing'), { internal: true }, { action: 'fetch', owner: 'test' });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
    expect(res.blocked).toBeUndefined();
  });

  // ── connection refused is a FAILURE, not a block ──────────────────────────
  it('13: connection refused -> ok:false, status 0, no blocked reason', async () => {
    const probe = http.createServer((_req, res) => res.end());
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const probePort = (probe.address() as AddressInfo).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));

    const res = await egressFetch(`http://127.0.0.1:${probePort}/`, { internal: true }, { action: 'fetch', owner: 'test' });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(0);
    expect(res.blocked).toBeUndefined();
  });

  // ── per-hop re-validation: redirects re-run the address gates ─────────────
  it("14: self-redirect loop -> blocked:'redirect-loop' (hop budget enforced)", async () => {
    const res = await egressFetch(url('/redirect-loop'), { internal: true, timeoutMs: 5_000 }, { action: 'fetch', owner: 'test' });
    expect(res.ok).toBe(false);
    expect(res.blocked).toBe('redirect-loop');
    // max 5 hops: 5 accepted redirects + the 6th that trips the budget.
    expect(hits).toBe(6);
  });

  it("15: redirect to file:// -> blocked:'scheme' on the follow-up hop", async () => {
    const res = await egressFetch(url('/redirect-file'), { internal: true }, { action: 'fetch', owner: 'test' });
    expect(res.ok).toBe(false);
    expect(res.blocked).toBe('scheme');
    expect(hits).toBe(1); // vetted BEFORE following — the bad target is never requested
  });

  it("16: redirect to link-local metadata -> blocked:'internal-not-loopback'", async () => {
    const res = await egressFetch(url('/redirect-metadata'), { internal: true }, { action: 'fetch', owner: 'test' });
    expect(res.ok).toBe(false);
    expect(res.blocked).toBe('internal-not-loopback');
    expect(hits).toBe(1); // vetted BEFORE following — metadata host never contacted
  });
});
