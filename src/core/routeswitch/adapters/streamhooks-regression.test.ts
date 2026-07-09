import { describe, it, expect, vi } from 'vitest';
import { MockProvider } from './mock-provider';
import { OpenAICompatibleProvider } from './openai-compatible';
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
});
