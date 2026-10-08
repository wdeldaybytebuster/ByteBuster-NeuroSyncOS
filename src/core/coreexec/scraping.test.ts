/**
 * §4.3 C9 — the functional scrape backend (plan §2.3 C8-d + C9).
 *
 * THE BUG UNDER TEST: `StealthScraper.scrape()` ALWAYS ran
 * `python3 scraper.py` inside CommandSandbox — whose `--unshare-net` bwrap
 * (the control that makes `shell` safe, sandbox.ts:143) has no network. Every
 * `scrape` therefore died inside the sandbox instead of returning content.
 *
 * Plan fix (C8-d decision, shipped in C9): two backends selected by
 * `system_settings.scrape_backend`, default `'http'`:
 *   - `'http'`   (default) → governed `egressFetch` (RouteSwitch owns egress —
 *     AGENTS.md boundary), returning the SAME object shape scraper.py prints
 *     (`{status,url,title?,content_length,preview}` — scraper.py:25-31) so
 *     worker.ts's `result?.markdown` handling and every consumer stay
 *     byte-compatible. The sandbox is never invoked.
 *   - `'browser'` → the existing python path, unchanged (documented in code as
 *     "expected to fail under --unshare-net; requires an operator-approved
 *     network-enabled sandbox, which is intentionally not offered today").
 *   Nothing is deleted (No Silent Stripping); scraper.py + python3 stay.
 *
 * Harness (§4.2 — never import server-main.ts):
 *  - A throwaway `http.createServer` on 127.0.0.1:0 is the local scrape
 *    target; an ephemeral port per run + a hit counter (blocked requests must
 *    never reach the wire).
 *  - `CommandSandbox` is mocked via `vi.hoisted` so the default backend can
 *    PROVE the sandbox is NOT invoked, and the browser backend can prove it IS.
 *  - Offline-safe: the kill-switch case gates a non-loopback URL before any
 *    DNS/fetch; the metadata case resolves 169.254.169.254 locally via
 *    getaddrinfo with no network (same trick as egress.test.ts case 3).
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import http from 'node:http';
import { promises as dnsPromises } from 'node:dns';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import { db, initDB, dbPath } from '../basevault/db';
import { StealthScraper } from './scraping';

// vi.hoisted: the vi.mock factory below is hoisted above imports, so the mock
// target must be hoisted with it.
const sandboxMock = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('../portgrid/sandbox', () => ({
  CommandSandbox: class {
    constructor(_projectId?: string) {}
    execute(command: string) {
      return sandboxMock.execute(command);
    }
  },
}));

describe('StealthScraper — two backends (§2.3 C8-d / C9)', () => {
  let server: http.Server;
  let port: number;
  let hits: number;

  const url = (p: string): string => `http://127.0.0.1:${port}${p}`;

  beforeAll(async () => {
    initDB();
    hits = 0;
    server = http.createServer((req, res) => {
      hits += 1;
      if (req.url === '/page') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(
          '<html><head><title>C9 Scrape Target</title></head><body><p>Hello from the local C9 test server.</p></body></html>',
        );
      } else if (req.url === '/missing') {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not here');
      } else {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not here');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  beforeEach(() => {
    sandboxMock.execute.mockReset();
    hits = 0;
    db.prepare(
      "DELETE FROM system_settings WHERE key IN ('scrape_backend', 'external_calls_enabled')",
    ).run();
  });

  afterEach(() => {
    vi.restoreAllMocks(); // drops the fetch/dns spies installed by the gated cases
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
  });

  // ── §4.3: absent scrape_backend → HTTP backend through the governed door ──
  it("default (absent scrape_backend) → HTTP backend returns {status,url,title,content_length,preview}; sandbox NOT invoked", async () => {
    const result = await new StealthScraper().scrape(url('/page'), true);

    expect(result.status).toBe('success');
    expect(result.url).toBe(url('/page'));
    expect(result.title).toBe('C9 Scrape Target');
    expect(result.content_length).toBeGreaterThan(0);
    expect(typeof result.preview).toBe('string');
    expect(result.preview).toContain('Hello from the local C9 test server');
    expect(sandboxMock.execute).not.toHaveBeenCalled();
    expect(hits).toBe(1);
  });

  // ── §4.3: scrape_backend='browser' → the existing python path, unchanged ──
  it("scrape_backend='browser' → invokes the sandbox path (python3 … scraper.py)", async () => {
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('scrape_backend', 'browser')").run();
    sandboxMock.execute.mockResolvedValue({
      stdout: JSON.stringify({
        status: 'success',
        url: 'https://example.invalid/x',
        title: 't',
        content_length: 3,
        preview: 'abc',
      }),
      stderr: '',
    });

    const result = await new StealthScraper().scrape('https://example.invalid/x', true);

    expect(sandboxMock.execute).toHaveBeenCalledTimes(1);
    const command = sandboxMock.execute.mock.calls[0]?.[0] as string;
    expect(command).toContain('python3');
    expect(command).toContain('--url https://example.invalid/x');
    expect(result.preview).toBe('abc');
    expect(hits).toBe(0); // the HTTP backend never touched the wire
  });

  // ── kill switch: gated BEFORE any DNS or HTTP (C9 conversion proof) ───────
  it("kill switch off → throws 'Egress blocked (kill-switch)'; 0 DNS, 0 fetch, 0 sandbox", async () => {
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('external_calls_enabled', 'false')").run();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const dnsSpy = vi
      .spyOn(dnsPromises, 'lookup')
      .mockImplementation(async () => [{ address: '104.26.10.122', family: 4 }] as any);

    await expect(new StealthScraper().scrape('https://example.invalid/page', false)).rejects.toThrow(
      /Egress blocked \(kill-switch\)/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dnsSpy).not.toHaveBeenCalled();
    expect(sandboxMock.execute).not.toHaveBeenCalled();
    expect(hits).toBe(0);
  });

  // ── the §0-V2 SSRF target: cloud metadata can never be scraped ────────────
  it("scrape('http://169.254.169.254/…') → throws 'Egress blocked (private-address)'; 0 fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(new StealthScraper().scrape('http://169.254.169.254/latest/meta-data/', true)).rejects.toThrow(
      /Egress blocked \(private-address\)/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sandboxMock.execute).not.toHaveBeenCalled();
  });

  // ── a non-blocked HTTP failure stays a FAILURE, not a block ───────────────
  it("HTTP 404 → throws 'Scraping failed: HTTP 404' (no blocked reason)", async () => {
    await expect(new StealthScraper().scrape(url('/missing'), true)).rejects.toThrow(
      /Scraping failed: HTTP 404/,
    );
    expect(hits).toBe(1);
  });
});
