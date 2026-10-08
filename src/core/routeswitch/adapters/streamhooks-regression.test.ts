import { describe, it, expect, vi } from 'vitest';
import { MockProvider } from './mock-provider';
import { OpenAICompatibleProvider, isTimeoutError } from './openai-compatible';
import { OpenRouterProvider } from './openrouter';
import { OpenCodeProvider } from './opencode';
import { GenerationStreamHooks, LLMProvider } from '../providers';

/**
 * Regression guard: the additive `streamHooks` parameter must leave every
 * non-llama-cpp adapter byte-identical. These providers do NOT expose real
 * per-token confidence, so they must (a) never invoke onTokenConfidence and
 * (b) not advertise supportsStreamingConfidence.
 */

describe('non-llama-cpp adapters are unaffected by streamHooks', () => {
  it('none advertise streaming confidence', () => {
    const providers: LLMProvider[] = [
      new MockProvider(),
      new OpenAICompatibleProvider({ baseUrl: '', modelId: 'x' }),
      new OpenRouterProvider({}),
      new OpenCodeProvider({}),
    ];
    for (const p of providers) {
      expect(p.supportsStreamingConfidence).toBeUndefined();
    }
  });

  it('MockProvider returns identical output with and without hooks, and never calls the hook', async () => {
    const p = new MockProvider();
    let hookCalls = 0;
    const hooks: GenerationStreamHooks = {
      onTokenConfidence: () => { hookCalls++; },
      signal: new AbortController().signal,
    };

    const without = await p.generate('Same prompt here', 20);
    const withHooks = await p.generate('Same prompt here', 20, undefined, hooks);

    expect(withHooks).toBe(without);
    expect(hookCalls).toBe(0);
  });

  it('MockProvider schema behaviour is unchanged when hooks are passed', async () => {
    const p = new MockProvider();
    let hookCalls = 0;
    const hooks: GenerationStreamHooks = { onTokenConfidence: () => { hookCalls++; } };

    const arr = await p.generate('x', 5, { type: 'array' }, hooks);
    expect(JSON.parse(arr)).toEqual([]);
    expect(hookCalls).toBe(0);
  });

  it('OpenAICompatibleProvider ignores hooks and returns the same content', async () => {
    const body = { choices: [{ message: { content: 'HTTP_RESPONSE_CONTENT' } }] };
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => body,
    } as any);

    const p = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'Auto' });
    let hookCalls = 0;
    const hooks: GenerationStreamHooks = {
      onTokenConfidence: () => { hookCalls++; },
      signal: new AbortController().signal,
    };

    const res = await p.generate('Test prompt', 10, undefined, hooks);
    expect(res).toBe('HTTP_RESPONSE_CONTENT');
    expect(hookCalls).toBe(0);

    fetchMock.mockRestore();
  });

  // ── P2-1: timeout contract ──────────────────────────────────────────
  it('P2-1: passes a combined abort signal (timeout + engine hooks) to fetch', async () => {
    let seenSignal: AbortSignal | null | undefined;
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation((async (_url: any, init?: any) => {
      seenSignal = init?.signal as AbortSignal | undefined;
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) } as any;
    }) as any);

    const p = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'auto' });
    const engineController = new AbortController();
    const res = await p.generate('Test prompt', 10, undefined, { signal: engineController.signal });
    expect(res).toBe('ok');
    // A real signal was sent (the adapter-owned timeout), and it tracks the
    // engine-owned parent via AbortSignal.any: aborting the parent aborts it.
    expect(seenSignal).toBeDefined();
    expect(seenSignal!.aborted).toBe(false);
    engineController.abort();
    expect(seenSignal!.aborted).toBe(true);

    fetchMock.mockRestore();
  });

  it('P2-1: works without hooks (connectivity path) — timeout signal still sent', async () => {
    let seenSignal: AbortSignal | null | undefined;
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation((async (_url: any, init?: any) => {
      seenSignal = init?.signal as AbortSignal | undefined;
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) } as any;
    }) as any);

    const p = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'auto' });
    await p.generate('Hello, respond with a single word to confirm connectivity.', 20);
    expect(seenSignal).toBeDefined();
    expect(seenSignal!.aborted).toBe(false);

    fetchMock.mockRestore();
  });

  it('P2-1: a fetch TimeoutError surfaces as a named TimeoutError (retriable)', async () => {
    const nativeTimeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const fetchMock = vi.spyOn(global, 'fetch').mockRejectedValue(nativeTimeout);

    const p = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'auto' });
    const err = await p.generate('Test prompt', 10).then(
      () => null,
      (e) => e as unknown,
    );
    expect(err).not.toBeNull();
    expect(isTimeoutError(err)).toBe(true);
    expect((err as Error).name).toBe('TimeoutError');

    fetchMock.mockRestore();
  });

  it('P2-1: isTimeoutError does not mistake AgentStop aborts for timeouts', () => {
    const abort = new DOMException('This operation was aborted', 'AbortError');
    expect(isTimeoutError(abort)).toBe(false);
    expect(isTimeoutError(new Error('boom'))).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
  });
});
