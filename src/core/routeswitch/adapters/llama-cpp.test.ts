import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * There is no real GGUF model available in CI (see routeswitch.test.ts, which only
 * covers the missing-model-file error path), so the llama-cpp streaming-confidence
 * WIRING is verified here by mocking the `node-llama-cpp` module boundary. The
 * confidence→logprob math and abort/EOG loop control are additionally unit-tested
 * as pure functions in confidence.test.ts. A real end-to-end run against the local
 * gemma GGUF was performed manually during development (documented in the commit).
 */

// Shared, hoisted test state the mock module reads/writes.
const h = vi.hoisted(() => ({
  // Scripted tokens the fake decoder yields: [tokenId, probability].
  script: [] as Array<[number, number]>,
  // How many tokens the decoder actually produced (proves abort stops inference).
  yielded: 0,
  // The last options passed to evaluateWithMetadata (grammar wiring check).
  lastEvalOptions: undefined as any,
  EOG: 999,
  sessionPromptCalls: 0,
}));

vi.mock('node-llama-cpp', () => {
  const model = {
    tokenizer: {},
    isEogToken: (t: number) => t === h.EOG,
    detokenize: (tokens: number[]) => tokens.map((t) => `<${t}>`).join(''),
    async createContext() {
      return {
        getSequence() {
          return {
            async clearHistory() {},
            async *evaluateWithMetadata(_tokens: number[], _meta: any, options: any) {
              h.lastEvalOptions = options;
              for (const [token, confidence] of h.script) {
                h.yielded++;
                yield { token, confidence };
              }
            },
          };
        },
      };
    },
  };

  return {
    getLlama: async () => ({
      loadModel: async () => model,
      createGrammar: async () => ({ __grammar: true }),
    }),
    LlamaChatSession: class {
      async prompt() {
        h.sessionPromptCalls++;
        return 'SESSION_PROMPT_RESPONSE';
      }
    },
    resolveChatWrapper: () => ({
      generateContextState: () => ({
        contextText: { tokenize: () => [1, 2, 3] },
        stopGenerationTriggers: [],
      }),
    }),
    LlamaGrammarEvaluationState: class {
      constructor(public opts: any) {}
    },
  };
});

import { LlamaCppProvider } from './llama-cpp';

beforeEach(() => {
  h.script = [];
  h.yielded = 0;
  h.lastEvalOptions = undefined;
  h.sessionPromptCalls = 0;
});

describe('LlamaCppProvider streaming-confidence wiring', () => {
  it('advertises real streaming-confidence capability', () => {
    const provider = new LlamaCppProvider({ modelPath: '/fake.gguf' });
    expect(provider.supportsStreamingConfidence).toBe(true);
  });

  it('streams one logprob per token and returns the detokenized text', async () => {
    h.script = [
      [10, 0.9],
      [11, 0.8],
      [12, 0.5],
    ];
    const provider = new LlamaCppProvider({ modelPath: '/fake.gguf' });

    const logprobs: number[] = [];
    const text = await provider.generate('hello', 8, undefined, {
      onTokenConfidence: (lp) => logprobs.push(lp),
      signal: new AbortController().signal,
    });

    expect(logprobs).toHaveLength(3);
    expect(logprobs[0]).toBeCloseTo(Math.log(0.9), 6);
    expect(logprobs[2]).toBeCloseTo(Math.log(0.5), 6);
    // Detokenized from the generated (non-EOG) tokens.
    expect(text).toBe('<10><11><12>');
  });

  it('stops at an EOG token', async () => {
    h.script = [
      [10, 0.9],
      [h.EOG, 0.9],
      [11, 0.9],
    ];
    const provider = new LlamaCppProvider({ modelPath: '/fake.gguf' });
    const text = await provider.generate('hello', 8, undefined, {
      onTokenConfidence: () => {},
      signal: new AbortController().signal,
    });
    expect(text).toBe('<10>');
  });

  it('honours the abort signal and stops pulling tokens from the decoder', async () => {
    // 6 tokens scripted, but the consumer aborts after the 2nd is reported.
    h.script = [
      [1, 0.9],
      [2, 0.9],
      [3, 0.9],
      [4, 0.9],
      [5, 0.9],
      [6, 0.9],
    ];
    const provider = new LlamaCppProvider({ modelPath: '/fake.gguf' });
    const ac = new AbortController();
    let seen = 0;

    const text = await provider.generate('hello', 100, undefined, {
      onTokenConfidence: () => {
        seen++;
        if (seen === 2) ac.abort(new Error('stop'));
      },
      signal: ac.signal,
    });

    // Generation stopped early: far fewer than the 6 scripted tokens were pulled.
    expect(h.yielded).toBeLessThan(6);
    expect(text).toBe('<1><2>');
  });

  it('passes a grammar evaluation state when a schema is supplied', async () => {
    h.script = [[10, 0.9]];
    const provider = new LlamaCppProvider({ modelPath: '/fake.gguf' });
    await provider.generate('hello', 8, { type: 'array' }, {
      onTokenConfidence: () => {},
      signal: new AbortController().signal,
    });
    expect(h.lastEvalOptions?.grammarEvaluationState).toBeDefined();
  });

  it('falls back to the chat-session path when no stream hooks are provided', async () => {
    const provider = new LlamaCppProvider({ modelPath: '/fake.gguf' });
    const text = await provider.generate('hello', 8);
    expect(text).toBe('SESSION_PROMPT_RESPONSE');
    expect(h.sessionPromptCalls).toBe(1);
    expect(h.yielded).toBe(0); // streaming decoder never touched
  });
});
