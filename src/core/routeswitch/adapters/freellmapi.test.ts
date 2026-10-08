import { describe, it, expect, vi, afterEach } from 'vitest';
import { FreeLLMProvider } from './freellmapi';
import { instantiateProvider } from '../provider-factory';

/**
 * Factory rotation follow-up (iii): freellmapi column-key + chain-id fix.
 *
 * Root causes (Architect-specified):
 *  (a) the factory's freellmapi branch dropped the decrypted column `apiKey`
 *      param (read `config.apiKey` from config_json instead, which the server
 *      never populates — keys live in the encrypted column), so per-row keys
 *      fell through to the server env fallback;
 *  (b) the branch never forwarded `customId`, so every FreeLLMProvider
 *      registered under the literal 'freellmapi' key and chain entries
 *      holding the row id never resolved (chain-dead).
 *
 * IMPORTANT: mock-level only. `fetch` is stubbed, all keys are fake
 * placeholders (same convention as opencode-reasoning.test.ts), and under
 * VITEST the DB is :memory: — no live server, no live DB, no real network.
 */

function jsonResponse(body: any) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as any;
}

describe('freellmapi factory passthrough (rotation follow-up iii)', () => {
  const ORIG_ENV_KEY = process.env.OPENAI_API_KEY;
  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIG_ENV_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIG_ENV_KEY;
  });

  it('forwards customId as the registry key, defaulting to freellmapi when absent', () => {
    const chained = instantiateProvider('freellmapi', {}, 'fake-column-key', 'row-B-id');
    expect(chained).toBeInstanceOf(FreeLLMProvider);
    expect(chained.id).toBe('row-B-id');

    const unchained = instantiateProvider('freellmapi', {}, undefined);
    expect(unchained.id).toBe('freellmapi');
  });

  it('passes the column apiKey through to the effective config', () => {
    const p = instantiateProvider('freellmapi', { modelId: 'auto' }, 'fake-column-key', 'row-B-id');
    const cfg = (p as unknown as { config: { apiKey?: string; modelId?: string } }).config;
    expect(cfg.apiKey).toBe('fake-column-key');
    expect(cfg.modelId).toBe('auto');
  });

  it('per-row explicit key wins over the server env fallback on the wire', async () => {
    process.env.OPENAI_API_KEY = 'env-fallback-key';
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })
    );

    const p = instantiateProvider(
      'freellmapi',
      { baseUrl: 'http://localhost:3001/v1', modelId: 'auto' },
      'fake-column-key',
      'row-B-id'
    );
    await p.generate('hello', 20);

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer fake-column-key');
  });

  it('omitted column key still falls back to env (unchanged offline behavior)', async () => {
    process.env.OPENAI_API_KEY = 'env-fallback-key';
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })
    );

    const p = instantiateProvider('freellmapi', { modelId: 'auto' }, undefined);
    await p.generate('hello', 20);

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer env-fallback-key');
  });
});
