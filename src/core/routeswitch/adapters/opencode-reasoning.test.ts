import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { OpenAICompatibleProvider, isTimeoutError } from './openai-compatible';
import { OpenCodeProvider, OPENCODE_MAX_CANDIDATES } from './opencode';
import { OpenCodeDiscoveryService } from '../discovery';
import { instantiateProvider, isOpencodeZenEnabled, OPENCODE_ZEN_FLAG_KEY } from '../provider-factory';
import { db, initDB } from '../../basevault/db';

/**
 * Regression + repro suite for the live-testing finding documented in
 * docs/implementation-plan-and-progress-tracker.md ("OpenCode Zen" entries):
 * a short Cerebro chat prompt succeeded against OpenCode Zen's free catalog,
 * but a longer/more complex prompt consistently failed with "LLM API returned
 * no content in response" (3/3 reproductions), cascading through the full
 * RouteSwitch fallback chain instead of answering from OpenCode Zen.
 *
 * IMPORTANT: none of these tests hit a real network endpoint. `fetch` is
 * mocked with response shapes modeled on documented OpenAI-compatible /
 * DeepSeek-style reasoning-model conventions (`message.reasoning_content`,
 * `finish_reason: 'length'`). This proves the adapter's request-building and
 * response-parsing logic handles the failure mode correctly; it does NOT
 * constitute a live re-test against the real OpenCode Zen endpoint (no API
 * key is available in this environment) — that still needs a human with a
 * real key, consistent with how this project has flagged every other
 * unverifiable-without-keys finding.
 */

function jsonResponse(body: any, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as any;
}

describe('reasoning-model empty-content handling (openai-compatible adapters)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('regression: a normal short-prompt response is returned unchanged', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'A DAG is a Directed Acyclic Graph.' }, finish_reason: 'stop' }] })
    );

    const p = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'auto' });
    const res = await p.generate('what is a DAG?', 150);

    expect(res).toBe('A DAG is a Directed Acyclic Graph.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('raises the max_tokens floor from 512 to 1024 for low estimatedTokens call sites', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })
    );

    const p = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'auto' });
    // Cerebro reflection extractor's real value (index.ts): 150.
    await p.generate('extract preferences', 150);

    const [, init] = fetchMock.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.max_tokens).toBe(1024);
  });

  it('reproduces the failure mode: empty content + finish_reason length + reasoning_content -> retries with a larger budget and succeeds', async () => {
    const exhaustedResponse = jsonResponse({
      choices: [
        {
          message: {
            content: '',
            reasoning_content: 'Let me think step by step about DAGs and their applications in workflow engines...'.repeat(20),
          },
          finish_reason: 'length',
        },
      ],
    });
    const successResponse = jsonResponse({
      choices: [
        {
          message: { content: 'A DAG (Directed Acyclic Graph) models tasks with dependencies and no cycles.' },
          finish_reason: 'stop',
        },
      ],
    });

    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(exhaustedResponse)
      .mockResolvedValueOnce(successResponse);

    const p = new OpenCodeProvider({ apiKey: 'fake-key-not-real', modelId: 'deepseek-v4-flash-free' });
    const res = await p.generate(
      'Explain in detail how DAG-based workflow orchestration compares to imperative scripting, with examples.',
      300,
    );

    expect(res).toBe('A DAG (Directed Acyclic Graph) models tasks with dependencies and no cycles.');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Retry must request a materially larger budget than the first attempt.
    const firstBody = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const secondBody = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(secondBody.max_tokens).toBeGreaterThan(firstBody.max_tokens);
  });

  it('reasoning exhaustion that persists after the retry throws a clear, distinguishing error (not the generic one)', async () => {
    const exhaustedResponse = jsonResponse({
      choices: [
        {
          message: { content: '', reasoning: 'thinking forever...'.repeat(50) },
          finish_reason: 'length',
        },
      ],
    });

    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(exhaustedResponse);

    const p = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'some-reasoning-model' });
    await expect(p.generate('a very long complex prompt', 300)).rejects.toThrow(/hidden reasoning/i);

    // One original attempt + one bounded retry, then give up — never loops forever.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a genuinely empty response with no reasoning-field evidence still throws the original generic error (no false-positive budget diagnosis)', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] })
    );

    const p = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'auto' });
    await expect(p.generate('hello', 150)).rejects.toThrow('LLM API returned no content in response');

    // No retry: this isn't the reasoning-exhaustion signature, so only one call is made.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a real API error (non-2xx) still surfaces clearly and is not swallowed as a content issue', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ error: { message: 'invalid api key' } }, false)
    );

    const p = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'auto' });
    await expect(p.generate('hello', 150)).rejects.toThrow(/LLM API error 500/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // ── P2-1: timeout + rotation cap ─────────────────────────────────────
  it('P2-1: caps free-model rotation at OPENCODE_MAX_CANDIDATES (3), even with more models discovered', async () => {
    expect(OPENCODE_MAX_CANDIDATES).toBe(3);
    vi.spyOn(OpenCodeDiscoveryService, 'getFreeModels').mockResolvedValue(
      ['m1-free', 'm2-free', 'm3-free', 'm4-free', 'm5-free'].map((id) => ({ id, name: id, context_length: 0, pricing: null }))
    );
    const rateLimited = {
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'rate limited' } }),
      text: async () => 'rate limited',
    } as any;
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(rateLimited);

    const p = new OpenCodeProvider({ apiKey: 'fake-key-not-real' });
    await expect(p.generate('hello world, longer prompt here', 150)).rejects.toThrow(/429/);
    // 5 models discovered, 3 attempted — the loop is capped.
    expect(fetchMock).toHaveBeenCalledTimes(OPENCODE_MAX_CANDIDATES);
  });

  it('P2-1: a TimeoutError on one candidate advances to the next instead of failing', async () => {
    vi.spyOn(OpenCodeDiscoveryService, 'getFreeModels').mockResolvedValue(
      ['m1-free', 'm2-free'].map((id) => ({ id, name: id, context_length: 0, pricing: null }))
    );
    const nativeTimeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(nativeTimeout)
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: 'recovered on m2' }, finish_reason: 'stop' }] })
      );

    const p = new OpenCodeProvider({ apiKey: 'fake-key-not-real' });
    const res = await p.generate('hello world, longer prompt here', 150);
    expect(res).toBe('recovered on m2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('P2-1: a timed-out candidate surfaces a TimeoutError when every candidate times out', async () => {
    vi.spyOn(OpenCodeDiscoveryService, 'getFreeModels').mockResolvedValue(
      ['m1-free'].map((id) => ({ id, name: id, context_length: 0, pricing: null }))
    );
    const nativeTimeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    vi.spyOn(global, 'fetch').mockRejectedValue(nativeTimeout);

    const p = new OpenCodeProvider({ apiKey: 'fake-key-not-real' });
    const err = await p.generate('hello world, longer prompt here', 150).then(
      () => null,
      (e) => e as unknown,
    );
    expect(err).not.toBeNull();
    expect(isTimeoutError(err)).toBe(true);
  });
});

// ── P3-S1: Zen retired-type gate (flag off by default, NO removal) ─────────
// The adapter above stays directly constructible (spies above keep proving
// its generate/rotation logic); only the FACTORY gate is new.
describe('P3-S1: opencode factory gate — explicit retired-type error while disabled', () => {
  beforeAll(() => {
    initDB();
  });

  afterEach(() => {
    try {
      db.prepare('DELETE FROM system_settings WHERE key = ?').run(OPENCODE_ZEN_FLAG_KEY);
    } catch { /* uninitialized db — flag is trivially absent */ }
    vi.restoreAllMocks();
  });

  it('flag reads fail-closed: unset (and unparseable) ⇒ disabled', () => {
    expect(isOpencodeZenEnabled()).toBe(false);
    db.prepare(
      "INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).run(OPENCODE_ZEN_FLAG_KEY, 'maybe');
    expect(isOpencodeZenEnabled()).toBe(false);
  });

  it("factory throws the explicit retired-type error for 'opencode' while the flag is off", () => {
    expect(isOpencodeZenEnabled()).toBe(false);
    expect(() => instantiateProvider('opencode', {}, undefined)).toThrow(/retired/i);
  });

  it("factory constructs OpenCodeProvider for 'opencode' once the flag is explicitly enabled", () => {
    db.prepare(
      "INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).run(OPENCODE_ZEN_FLAG_KEY, 'true');
    expect(isOpencodeZenEnabled()).toBe(true);
    const p = instantiateProvider('opencode', { modelId: 'x' }, undefined);
    expect(p).toBeInstanceOf(OpenCodeProvider);
  });

  it('unknown types get an explicit error instead of a silent Mock fallback', () => {
    expect(() => instantiateProvider('nope-not-a-type', {}, undefined)).toThrow(/unknown provider type/i);
  });
});
