import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeWithFallback } from './router.js';
import { ProviderHealthState } from './interceptor.js';

describe('Fallback Router Integration Testing', () => {
  let fetchMock: any;

  beforeEach(() => {
    vi.useFakeTimers();
    // @ts-ignore
    ProviderHealthState.states.clear();
    fetchMock = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('routes to secondary model when primary model returns low rate limit', async () => {
    let requestCount = 0;
    
    fetchMock.mockImplementation(async (url: string, options: any) => {
      const body = JSON.parse(options.body);
      const model = body.model;
      requestCount++;

      if (requestCount === 1) {
        expect(model).toBe('groq/llama3-8b-8192');
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'Primary response' } }] }),
          headers: new Headers({
            'x-ratelimit-remaining-tokens': '500' // < 1500 triggers exhaustion
          })
        } as any;
      } else if (requestCount === 2) {
        expect(model).toBe('google/gemini-1.5-pro');
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'Secondary response' } }] }),
          headers: new Headers({
            'x-ratelimit-remaining-tokens': '50000'
          })
        } as any;
      }
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
});
