/**
 * §2.3 C9 — boot model discovery must respect the kill switch and go through
 * the governed egress door.
 *
 * THE BUG UNDER TEST: `ModelDiscovery.fetchModels()` (issued unconditionally
 * at boot — server-main.ts:630) and `OpenCodeDiscoveryService.fetchModelIds()`
 * used raw `fetch()` — unconditional network egress on every boot, ignoring
 * `system_settings.external_calls_enabled` entirely (§0-V2 "ungated raw
 * fetch"; also burns eMMC boot time on constrained hardware, Axiom 6).
 *
 * Plan fix (C9 table row 1): both sites route through `egressFetch`
 * (`{timeoutMs:5000, maxBytes:1_000_000}`, owner 'boot-discovery') AND return
 * early — zero DNS, zero wire — when the kill switch is off. (The plan's
 * `server-main.ts:547-552` line refs were stale; the gate lives inside
 * `fetchModels` so boot AND every other caller are covered by one change.)
 *
 * Harness (§4.2 — never import server-main.ts): real BaseVault `:memory:` DB
 * (same initDB/unlink pattern as egress.test.ts), DNS spied to a public
 * address and `fetch` mocked with real `Response` objects (egress reads
 * `res.headers` + `res.body.getReader()`) — offline-safe either way.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { promises as dnsPromises } from 'node:dns';
import fs from 'node:fs';
import { db, initDB, dbPath } from '../basevault/db';
import { ModelDiscovery, OpenCodeDiscoveryService } from './discovery';

describe('ModelDiscovery / OpenCodeDiscoveryService — kill switch (§2.3 C9)', () => {
  beforeAll(() => {
    initDB();
    // Defensive: same DDL discovery.ts inserts into (CREATE IF NOT EXISTS is a
    // no-op when initDB already created it).
    db.exec(`
      CREATE TABLE IF NOT EXISTS discovered_models (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        context_length INTEGER,
        pricing_prompt TEXT,
        pricing_completion TEXT,
        fetched_at INTEGER NOT NULL
      );
    `);
  });

  beforeEach(() => {
    vi.restoreAllMocks(); // drop spies from the previous test first
    db.prepare("DELETE FROM system_settings WHERE key = 'external_calls_enabled'").run();
    db.prepare('DELETE FROM discovered_models').run();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
  });

  it("kill switch off → fetchModels exits with ZERO DNS and ZERO fetch (boot egress skipped)", async () => {
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('external_calls_enabled', 'false')").run();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const dnsSpy = vi
      .spyOn(dnsPromises, 'lookup')
      .mockImplementation(async () => [{ address: '104.26.10.122', family: 4 }] as any);

    await ModelDiscovery.fetchModels();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dnsSpy).not.toHaveBeenCalled();
    const row = db.prepare('SELECT count(*) as c FROM discovered_models').get() as { c: number };
    expect(row.c).toBe(0);
  });

  it("kill switch off → fetchModelIds (OpenCode Zen site) also exits with ZERO fetch", async () => {
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('external_calls_enabled', 'false')").run();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    vi.spyOn(dnsPromises, 'lookup').mockImplementation(
      async () => [{ address: '104.26.10.122', family: 4 }] as any,
    );

    await OpenCodeDiscoveryService.fetchModelIds();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await OpenCodeDiscoveryService.getFreeModels()).toEqual([]); // cache untouched
  });

  it('kill switch absent → fetchModels goes through egress and inserts 2 rows', async () => {
    const dnsSpy = vi
      .spyOn(dnsPromises, 'lookup')
      .mockImplementation(async () => [{ address: '104.26.10.122', family: 4 }] as any);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              { id: 't/one', name: 'One', context_length: 100, pricing: { prompt: '0', completion: '0' } },
              { id: 't/two', name: 'Two', context_length: 200, pricing: { prompt: '1', completion: '1' } },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    await ModelDiscovery.fetchModels();

    const row = db.prepare('SELECT count(*) as c FROM discovered_models').get() as { c: number };
    expect(row.c).toBe(2);
    expect(ModelDiscovery.getAvailableModels().map((m) => m.id)).toEqual(['t/one', 't/two']);
    expect(dnsSpy).toHaveBeenCalledTimes(1); // the address gate runs per request
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('kill switch absent → fetchModelIds parses the Zen catalog through egress', async () => {
    vi.spyOn(dnsPromises, 'lookup').mockImplementation(
      async () => [{ address: '104.26.10.122', family: 4 }] as any,
    );
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ id: 'deepseek-v4-flash-free' }, { id: 'big-pickle' }, { id: 'paid-model' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    await OpenCodeDiscoveryService.fetchModelIds();
    const free = await OpenCodeDiscoveryService.getFreeModels();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // -free suffix convention + the documented big-pickle exception; paid-model filtered.
    expect(free.map((m) => m.id)).toEqual(['deepseek-v4-flash-free', 'big-pickle']);
  });
});
