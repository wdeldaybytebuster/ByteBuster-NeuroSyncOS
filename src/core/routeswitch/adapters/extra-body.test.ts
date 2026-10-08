import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  EXTRA_BODY_DENYLIST,
  OpenAICompatibleProvider,
  sanitizeExtraBody,
} from './openai-compatible';
import { FreeLLMProvider } from './freellmapi';

/**
 * Phase A.4 / A.5 / A.7 — the `extraBody` passthrough seam.
 *
 * The seam lets a caller extend the outgoing OpenAI-compatible request body
 * (Fusion panel options, provider-specific knobs) without ever being able to
 * hijack routing identity (`model`) or the adapter-owned request contract
 * (`messages`, `response_format`). Verification here is a deterministic key
 * check with zero model calls involved (P8-2 intent).
 */

/** Spy fetch and capture the parsed request body it was handed. */
function captureFetch(content = 'ok') {
  const captured: { body?: any; signal?: AbortSignal | null; calls: number } = { calls: 0 };
  const fetchMock = vi.spyOn(global, 'fetch').mockImplementation((async (_url: any, init?: any) => {
    captured.calls += 1;
    captured.body = JSON.parse(init?.body as string);
    captured.signal = init?.signal ?? null;
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) } as any;
  }) as any);
  return { fetchMock, captured };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sanitizeExtraBody — deterministic guard (A.4)', () => {
  it('rejects model/messages/response_format and keeps every other key', () => {
    const result = sanitizeExtraBody({
      model: 'evil-model',
      messages: [{ role: 'user', content: 'hijack' }],
      response_format: { type: 'text' },
      fusion: { panels: 3 },
      temperature: 0.1,
    });

    expect(result.extra).toEqual({ fusion: { panels: 3 }, temperature: 0.1 });
    expect(result.rejected.sort()).toEqual(['messages', 'model', 'response_format']);
  });

  it('denies every reserved contract key (behavioural, never a literal list snapshot)', () => {
    // Asserted behaviourally so extending the denylist is a code change, not a
    // test edit: the constant and the sanitizer must agree on each key.
    for (const key of ['model', 'messages', 'response_format']) {
      expect(EXTRA_BODY_DENYLIST).toContain(key);
      expect(sanitizeExtraBody({ [key]: 'hostile' }).rejected).toContain(key);
    }
  });

  it('treats undefined, null, arrays and strings as empty without throwing', () => {
    for (const input of [undefined, null, [], 'nope', 42] as any[]) {
      const result = sanitizeExtraBody(input);
      expect(result.extra).toEqual({});
      expect(result.rejected).toEqual([]);
    }
  });

  it('returns an empty result for an empty object', () => {
    expect(sanitizeExtraBody({})).toEqual({ extra: {}, rejected: [] });
  });
});

describe('OpenAICompatibleProvider extraBody merge (A.4)', () => {
  it('merges caller-supplied keys into the outgoing request body', async () => {
    const { captured } = captureFetch();

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'gpt-oss-120b' });
    await provider.generate('Test prompt', 10, undefined, undefined, { fusion: { panels: 3 }, route: 'auto:fast' });

    expect(captured.body.fusion).toEqual({ panels: 3 });
    expect(captured.body.route).toBe('auto:fast');
  });

  it('pins model to the configured id even when extraBody tries to override it', async () => {
    const { captured } = captureFetch();

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'gpt-oss-120b' });
    await provider.generate('Test prompt', 10, undefined, undefined, { model: 'attacker/model' });

    expect(captured.body.model).toBe('gpt-oss-120b');
  });

  it('omits model entirely for an auto model even when extraBody supplies one', async () => {
    const { captured } = captureFetch();

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'Auto' });
    await provider.generate('Test prompt', 10, undefined, undefined, { model: 'attacker/model' });

    expect('model' in captured.body).toBe(false);
    expect(captured.body.model).toBeUndefined();
  });

  it('keeps messages and response_format when extraBody tries to replace them', async () => {
    const { captured } = captureFetch();
    const schema = { type: 'array', items: { type: 'string' } };

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'Auto' });
    await provider.generate('Original prompt', 10, schema, undefined, {
      messages: [{ role: 'user', content: 'hijacked prompt' }],
      response_format: { type: 'text' },
    });

    expect(captured.body.messages).toEqual([{ role: 'user', content: 'Original prompt' }]);
    expect(captured.body.response_format.type).toBe('json_schema');
    expect(captured.body.response_format.json_schema.schema).toEqual(schema);
  });

  it('applies the static config extraBody before per-call extraBody', async () => {
    const { captured } = captureFetch();

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'http://localhost:1234/v1',
      modelId: 'Auto',
      extraBody: { mode: 'config', preset: 'durable' },
    });
    await provider.generate('Test prompt', 10, undefined, undefined, { mode: 'call', extra: 'x' });

    expect(captured.body.mode).toBe('call');
    expect(captured.body.preset).toBe('durable');
    expect(captured.body.extra).toBe('x');
  });

  it('leaves the body unchanged when no extraBody is supplied', async () => {
    const { captured } = captureFetch();

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'Auto' });
    await provider.generate('Test prompt', 10);

    expect(Object.keys(captured.body).sort()).toEqual(
      ['enable_thinking', 'max_tokens', 'messages', 'temperature'].sort(),
    );
  });
});

describe('X-Routed-Via capture (A.7)', () => {
  const routedFetch = (routedVia: string | null) =>
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: { get: (k: string) => (k.toLowerCase() === 'x-routed-via' ? routedVia : null) },
      json: async () => ({ choices: [{ message: { content: 'pong' } }] }),
    } as any);

  it('exposes the upstream header through generateWithMeta', async () => {
    const fetchMock = routedFetch('chutes/deepseek-v3');

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'Auto' });
    const result = await provider.generateWithMeta('Test prompt', 10);

    expect(result.content).toBe('pong');
    expect(result.routedVia).toBe('chutes/deepseek-v3');
    fetchMock.mockRestore();
  });

  it('omits routedVia when the header is absent', async () => {
    const fetchMock = routedFetch(null);

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'Auto' });
    const result = await provider.generateWithMeta('Test prompt', 10);

    expect(result.content).toBe('pong');
    expect('routedVia' in result).toBe(false);
    fetchMock.mockRestore();
  });

  it('does not throw when the response exposes no headers object', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    } as any);

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'Auto' });
    const result = await provider.generateWithMeta('Test prompt', 10);

    expect(result.content).toBe('ok');
    expect('routedVia' in result).toBe(false);
    fetchMock.mockRestore();
  });

  it('keeps generate() returning a bare string (no metadata leak into the old contract)', async () => {
    const fetchMock = routedFetch('chutes/deepseek-v3');

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'Auto' });
    const result = await provider.generate('Test prompt', 10);

    expect(result).toBe('pong');
    fetchMock.mockRestore();
  });
});

describe('FreeLLMAPI extraBody + routedVia (A.4/A.7)', () => {
  it('forwards extraBody into the request body', async () => {
    const { captured } = captureFetch();

    const provider = new FreeLLMProvider({ modelId: 'fusion' });
    await provider.generate('Test prompt', 10, undefined, undefined, { fusion: { panels: 3 } });

    expect(captured.body.model).toBe('fusion');
    expect(captured.body.fusion).toEqual({ panels: 3 });
  });

  it('surfaces the upstream header through its own generateWithMeta', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: { get: (k: string) => (k.toLowerCase() === 'x-routed-via' ? 'chutes/qwen3-coder' : null) },
      json: async () => ({ choices: [{ message: { content: 'pong' } }] }),
    } as any);

    const provider = new FreeLLMProvider({ modelId: 'auto' });
    const result = await provider.generateWithMeta('Hello', 20);

    expect(result.content).toBe('pong');
    expect(result.routedVia).toBe('chutes/qwen3-coder');
    fetchMock.mockRestore();
  });

  it('carries the persisted static config extraBody onto the wire before per-call keys', async () => {
    const { captured } = captureFetch();

    const provider = new FreeLLMProvider({ modelId: 'fusion', extraBody: { fusion: { panels: 9 } } });
    await provider.generate('Test prompt', 10, undefined, undefined, { fusion: { panels: 1 } });

    // per-call wins over the durable static value; everything else is intact.
    expect(captured.body.fusion).toEqual({ panels: 1 });
    expect(captured.body.model).toBe('fusion');
    expect(captured.body.messages).toEqual([{ role: 'user', content: 'Test prompt' }]);
  });
});

/**
 * A.4 — the model pin, asserted as an observable invariant.
 *
 * NOTE (honest limitation, recorded rather than papered over): the merge in
 * `_generateWithConfig` sanitises the static AND per-call extraBody through
 * `sanitizeExtraBody` before merging, and the non-auto path sets `body.model`
 * before that merge. There is therefore no public-surface input that can put a
 * `model` key into the merge, which means the re-pin statement itself cannot be
 * isolated from the denylist by an end-to-end test — deleting only the pin
 * leaves these tests green. What IS provable, and is proven here, is the
 * invariant a caller depends on across every input the surface allows: no
 * supplied `model` from either source can displace the configured routing
 * identity, and an `auto` request keeps no model key at all.
 */
describe('model pin invariant across both extraBody sources (A.4)', () => {
  it('keeps the configured model when both the static config and the per-call extraBody supply one', async () => {
    const { captured } = captureFetch();

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'http://localhost:1234/v1',
      modelId: 'gpt-oss-120b',
      extraBody: { model: 'static-attacker/model', preset: 'durable' },
    });
    await provider.generate('Test prompt', 10, undefined, undefined, {
      model: 'call-attacker/model',
      fusion: { panels: 3 },
    });

    expect(captured.body.model).toBe('gpt-oss-120b');
    expect(captured.body.messages).toEqual([{ role: 'user', content: 'Test prompt' }]);
    // The pin must not discard the legitimate remainder of the merge.
    expect(captured.body.preset).toBe('durable');
    expect(captured.body.fusion).toEqual({ panels: 3 });
  });

  it('keeps an auto request modelless when both sources try to pin one', async () => {
    const { captured } = captureFetch();

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'http://localhost:1234/v1',
      modelId: 'AUTO',
      extraBody: { model: 'static-attacker/model' },
    });
    await provider.generate('Test prompt', 10, undefined, undefined, { model: 'call-attacker/model' });

    expect('model' in captured.body).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(captured.body, 'model')).toBe(false);
  });
});

/**
 * A.4 — the denylist is enforced end to end, not merely returned by the
 * sanitizer. Every key a hostile or typo'd caller would reach for must be
 * refused AND reported, so a dropped hint can never be mistaken for a key that
 * was never sent.
 */
describe('denylist enforced on the wire (A.4)', () => {
  const HOSTILE_KEYS = ['model', 'messages', 'response_format', '__proto__', 'constructor', 'prototype'] as const;

  for (const key of HOSTILE_KEYS) {
    it(`refuses a caller-supplied "${key}" and reports it instead of waving it through`, async () => {
      const { captured } = captureFetch();
      // Built through JSON.parse because an object literal would set the
      // prototype for `__proto__` instead of creating an own enumerable key —
      // JSON.parse is the shape a persisted row / JSON.stringify round-trip
      // actually produces, and the one that reaches this code in production.
      const hostile = JSON.parse(`{"${key}": {"hijack": true}, "legit": "kept"}`);

      const audit = sanitizeExtraBody(hostile);
      expect(audit.rejected).toContain(key);
      expect(audit.extra).toEqual({ legit: 'kept' });

      const provider = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'gpt-oss-120b' });
      await provider.generate('Original prompt', 10, undefined, undefined, hostile);

      // The hostile payload reached neither the body nor its prototype chain.
      expect(JSON.stringify(captured.body)).not.toContain('hijack');
      expect(captured.body[key]).not.toEqual({ hijack: true });
      expect(captured.body.legit).toBe('kept');
      // The routing identity is still the adapter's, never the caller's.
      if (key === 'model') expect(captured.body.model).toBe('gpt-oss-120b');
    });
  }
});

/**
 * A.4 — the seam is threaded through both retry paths. A regression that rebuilt
 * the request from the canonical body on either retry would silently drop every
 * caller-supplied field on exactly the requests most likely to need them.
 */
describe('extraBody survives the retry paths (A.4)', () => {
  it('the 400 response_format rescue keeps the caller-supplied extraBody and the pinned model', async () => {
    const schema = { type: 'array', items: { type: 'string' } };
    const seen: any[] = [];
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation((async (_url: any, init?: any) => {
      seen.push(JSON.parse(init?.body as string));
      if (seen.length === 1) {
        return {
          ok: false,
          status: 400,
          text: async () => 'This response_format type is unavailable now',
          json: async () => ({}),
        } as any;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'recovered' } }] }),
      } as any;
    }) as any);

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'gpt-oss-120b' });
    const res = await provider.generate('Test prompt', 10, schema, undefined, { fusion: { panels: 3 } });

    expect(res).toBe('recovered');
    expect(seen).toHaveLength(2);
    // The rescue drops exactly one field — the schema the backend refused.
    expect(seen[0]!.response_format).toBeDefined();
    expect('response_format' in seen[1]!).toBe(false);
    expect(seen[1]!.fusion).toEqual({ panels: 3 });
    expect(seen[1]!.model).toBe('gpt-oss-120b');
    expect(seen[1]!.messages).toEqual([{ role: 'user', content: 'Test prompt' }]);
    fetchMock.mockRestore();
  });

  it('the reasoning-exhaustion retry keeps the extraBody and reports the routing hint of the attempt that produced the content', async () => {
    const seen: any[] = [];
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation((async (_url: any, init?: any) => {
      seen.push(JSON.parse(init?.body as string));
      if (seen.length === 1) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'attempt-one/alpha' },
          json: async () => ({
            choices: [
              {
                message: { content: '', reasoning_content: 'thinking step by step'.repeat(50) },
                finish_reason: 'length',
              },
            ],
          }),
        } as any;
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'attempt-two/beta' },
        json: async () => ({ choices: [{ message: { content: 'ANSWER' }, finish_reason: 'stop' }] }),
      } as any;
    }) as any);

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'gpt-oss-120b' });
    const result = await provider.generateWithMeta('A long prompt', 300, undefined, undefined, { fusion: { panels: 3 } });

    expect(result.content).toBe('ANSWER');
    expect(seen).toHaveLength(2);
    expect(seen[1]!.max_tokens).toBeGreaterThan(seen[0]!.max_tokens);
    expect(seen[1]!.fusion).toEqual({ panels: 3 });
    expect(seen[1]!.model).toBe('gpt-oss-120b');
    // Metadata is per-call: the retry's own response is what gets reported.
    expect(result.routedVia).toBe('attempt-two/beta');
    fetchMock.mockRestore();
  });
});
