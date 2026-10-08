import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { promises as dnsPromises } from 'node:dns';
import fs from 'node:fs';
import { executeWithFallback } from './router.js';
import { ProviderHealthState } from './interceptor.js';

import { ZenDiscoveryService } from './discovery';
import { db, initDB, dbPath } from '../basevault/db';

describe('Fallback Router Integration Testing', () => {
  let fetchMock: any;
  let discoveryMock: any;
  let dnsSpy: any;

  beforeAll(() => {
    initDB();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    // @ts-ignore
    ProviderHealthState.states.clear();
    fetchMock = vi.spyOn(global, 'fetch');
    // §2.3 C9 hermetic DNS: egress's address gate resolves openrouter.ai to a
    // public address without touching the network (offline-safe, §4.2).
    dnsSpy = vi
      .spyOn(dnsPromises, 'lookup')
      .mockImplementation(async () => [{ address: '104.26.10.122', family: 4 }] as any);
    discoveryMock = vi.spyOn(ZenDiscoveryService, 'getFreeModels').mockResolvedValue([]);
    db.prepare("DELETE FROM system_settings WHERE key = 'external_calls_enabled'").run();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
  });

  it('routes to secondary model when primary model returns low rate limit', async () => {
    let requestCount = 0;

    // §2.3 C9: the router now speaks to egress, which reads `res.headers` and
    // `res.body.getReader()` — so the mock must be a real Response object.
    fetchMock.mockImplementation(async (url: string, options: any) => {
      const body = JSON.parse(options.body);
      const model = body.model;
      requestCount++;

      if (requestCount === 1) {
        expect(model).toBe('groq/llama3-8b-8192');
        return new Response(
          JSON.stringify({ choices: [{ message: { content: 'Primary response' } }] }),
          { status: 200, headers: { 'x-ratelimit-remaining-tokens': '500' } }, // < 1500 triggers exhaustion
        );
      } else if (requestCount === 2) {
        expect(model).toBe('google/gemini-1.5-pro');
        return new Response(
          JSON.stringify({ choices: [{ message: { content: 'Secondary response' } }] }),
          { status: 200, headers: { 'x-ratelimit-remaining-tokens': '50000' } },
        );
      }
      throw new Error(`unexpected fetch #${requestCount}`);
    });

    // First call: Should hit primary model and mark it as exhausted
    const fallbackChain = ['groq/llama3-8b-8192', 'google/gemini-1.5-pro'];
    const firstResult = await executeWithFallback('Test prompt 1', fallbackChain);
    expect(firstResult.choices[0].message.content).toBe('Primary response');

    const primaryState = ProviderHealthState.getState('groq/llama3-8b-8192');
    expect(primaryState.isExhausted).toBe(true);

    // Second call: Should route transparently to secondary model
    const secondResult = await executeWithFallback('Test prompt 2', fallbackChain);
    expect(secondResult.choices[0].message.content).toBe('Secondary response');

    // Verify exact calls
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // ── §2.3 C9 — the conversion proof: the router's HTTP goes through egress ─
  it("kill switch off → every model blocked at the gate; zero HTTP, zero DNS", async () => {
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('external_calls_enabled', 'false')").run();
    fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }));

    const message = await executeWithFallback('Test prompt', ['groq/llama3-8b-8192', 'google/gemini-1.5-pro']).then(
      () => null,
      (e: Error) => e.message,
    );

    expect(message).toMatch(/All models in the fallback chain failed/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dnsSpy).not.toHaveBeenCalled(); // kill switch is gate 3, DNS is gate 4
  });
});
