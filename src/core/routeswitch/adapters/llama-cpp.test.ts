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
  // C.4b — proves the GGUF model is never loaded when the gate is closed.
  loadModelCalls: 0,
}));

// C.4b — a fresh install has no local_llm_enabled rule (closed default), so the
// association is read from the real BaseVault tables rather than stubbed. The
// in-memory VITEST database is seeded with the rule the gate consults.

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
      loadModel: async () => {
        h.loadModelCalls++;
        return model;
      },
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
import { db, initDB } from '../../basevault/db';
import { randomUUID } from 'crypto';

const PROFILE_ID = 'prof-c4b-local-on';

/**
 * C.4b — seeds the hardware profile + environment_rules pair the gate reads.
 * `environment_rules.profile_id` is NOT NULL REFERENCES hardware_profiles(id)
 * (db.ts:718), so the two must be written in that order or the insert throws.
 */
function seedProfileWithLocalLlm(value: string | null): void {
  // OR REPLACE so the helper is idempotent against the beforeEach seed.
  db.prepare(`
    INSERT OR REPLACE INTO hardware_profiles
      (id, profiled_at, cpu_cores, cpu_physical_cores, ram_total_mb, os_platform, tier)
    VALUES (?, ?, 16, 16, 32000, 'linux', 'high-performance')
  `).run(PROFILE_ID, Date.now());
  if (value !== null) {
    db.prepare(
      "INSERT INTO environment_rules (id, profile_id, rule_key, rule_value, created_at) VALUES (?, ?, 'local_llm_enabled', ?, ?)"
    ).run(randomUUID(), PROFILE_ID, value, Date.now());
  }
}

beforeEach(() => {
  h.script = [];
  h.yielded = 0;
  h.lastEvalOptions = undefined;
  h.sessionPromptCalls = 0;
  h.loadModelCalls = 0;

  // C.4b — reset the rule state, then enable local inference by default so
  // the pre-existing wiring tests below run with the gate open. The gate's
  // own cases override this.
  initDB();
  db.prepare('DELETE FROM environment_rules').run();
  db.prepare('DELETE FROM hardware_profiles').run();
  seedProfileWithLocalLlm('true');
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
    await provider.generate('hello', 8, { title: 'OKF_CONCEPT_EXTRACTION_SCHEMA', type: 'array' }, {
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

// ─────────────────────────────────────────────────────────────────────────────
// C.4b — local-SLM gate. RouteSwitch reads 'local_llm_enabled' from the active
// hardware profile before attempting local inference (AXIOM 6 / P8-5); on a
// 'constrained' tier all local model execution is banned. Default CLOSED: an
// absent rule — genesis never ran, or the row was dropped — must refuse.
//
// The decisive assertion in every closed case is h.loadModelCalls === 0 (plus
// h.yielded === 0 and h.sessionPromptCalls === 0): proving no GGUF was ever
// loaded is what makes this a gate rather than a log line.
// ─────────────────────────────────────────────────────────────────────────────
describe('LlamaCppProvider local_llm_enabled gate (C.4b)', () => {
  it('refuses when the rule is absent entirely (closed default — genesis never ran)', async () => {
    db.prepare('DELETE FROM environment_rules').run();
    const provider = new LlamaCppProvider({ modelPath: '/fake.gguf' });

    await expect(provider.generate('hello', 8)).rejects.toThrow(/local_llm_enabled/);

    expect(h.loadModelCalls).toBe(0);
    expect(h.yielded).toBe(0);
    expect(h.sessionPromptCalls).toBe(0);
  });

  it("refuses when no hardware profile exists at all (genesis never ran)", async () => {
    db.prepare('DELETE FROM environment_rules').run();
    db.prepare('DELETE FROM hardware_profiles').run();
    const provider = new LlamaCppProvider({ modelPath: '/fake.gguf' });

    await expect(provider.generate('hello', 8)).rejects.toThrow(/local_llm_enabled/);

    expect(h.loadModelCalls).toBe(0);
    expect(h.yielded).toBe(0);
    expect(h.sessionPromptCalls).toBe(0);
  });

  it("refuses when the rule is explicitly 'false' (constrained / standard tier)", async () => {
    db.prepare('DELETE FROM environment_rules').run();
    seedProfileWithLocalLlm('false');
    const provider = new LlamaCppProvider({ modelPath: '/fake.gguf' });

    // Guard BOTH paths: with and without stream hooks.
    await expect(provider.generate('hello', 8)).rejects.toThrow(/local_llm_enabled/);
    h.script = [[10, 0.9]];
    await expect(
      provider.generate('hello', 8, undefined, {
        onTokenConfidence: () => {},
        signal: new AbortController().signal,
      })
    ).rejects.toThrow(/local_llm_enabled/);

    expect(h.loadModelCalls).toBe(0);
    expect(h.yielded).toBe(0);
    expect(h.sessionPromptCalls).toBe(0);
  });

  it('refuses every near-miss value that is not the literal true', async () => {
    // A gate that only understands 'true' cannot be talked open by a typo, a
    // truthy-but-wrong value, or whitespace padding.
    for (const nearMiss of ['1', '0', 'TRUE_', 'tru', 'yes', 'on', 'enabled', '']) {
      db.prepare('DELETE FROM environment_rules').run();
      seedProfileWithLocalLlm(nearMiss);
      const provider = new LlamaCppProvider({ modelPath: '/fake.gguf' });
      await expect(provider.generate('hello', 8)).rejects.toThrow(/local_llm_enabled/);
    }

    expect(h.loadModelCalls).toBe(0);
    expect(h.yielded).toBe(0);
    expect(h.sessionPromptCalls).toBe(0);
  });

  it("opens on 'true', including case and surrounding-whitespace variants", async () => {
    for (const accepted of ['true', 'TRUE', ' True ']) {
      db.prepare('DELETE FROM environment_rules').run();
      seedProfileWithLocalLlm(accepted);
      const provider = new LlamaCppProvider({ modelPath: '/fake.gguf' });
      h.script = [[10, 0.9]];

      await expect(
        provider.generate('hello', 8, undefined, {
          onTokenConfidence: () => {},
          signal: new AbortController().signal,
        })
      ).resolves.toBe('<10>');
    }
    expect(h.loadModelCalls).toBe(3);
  });

  it('the chat-session path also opens when the rule is true', async () => {
    db.prepare('DELETE FROM environment_rules').run();
    seedProfileWithLocalLlm('true');
    const provider = new LlamaCppProvider({ modelPath: '/fake.gguf' });

    // No stream hooks -> chat-session path; must not be gated when enabled.
    await expect(provider.generate('hello', 8)).resolves.toBe('SESSION_PROMPT_RESPONSE');
    expect(h.sessionPromptCalls).toBe(1);
    expect(h.loadModelCalls).toBe(1);
  });

  it('refuses before any model load even when a schema is supplied', async () => {
    db.prepare('DELETE FROM environment_rules').run();
    seedProfileWithLocalLlm('false');
    const provider = new LlamaCppProvider({ modelPath: '/fake.gguf' });

    await expect(
      provider.generate('hello', 8, { title: 'OKF_CONCEPT_EXTRACTION_SCHEMA', type: 'array' })
    ).rejects.toThrow(/local_llm_enabled/);

    expect(h.loadModelCalls).toBe(0);
    expect(h.yielded).toBe(0);
    expect(h.sessionPromptCalls).toBe(0);
  });
});
