import { describe, it, expect, vi, afterEach } from 'vitest';
import { instantiateProvider } from './provider-factory';
import { FreeLLMProvider } from './adapters/freellmapi';
import { OpenAICompatibleProvider } from './adapters/openai-compatible';
import { OpenRouterProvider } from './adapters/openrouter';
import { OpenCodeProvider } from './adapters/opencode';

/**
 * A.4 — the DURABLE static `extraBody` path.
 *
 * A provider row persisted in BaseVault may carry a static body default (e.g. a
 * Fusion panel preference) in its `config_json`. `instantiateProvider` must run
 * that value through the same `sanitizeExtraBody` denylist as a per-call value
 * and forward it into the adapter config. `extraBody` is the only route by which
 * a stored row can add ARBITRARY body fields — the row's own `modelId`
 * legitimately becomes the request's `model` — so the FACTORY-DRIVEN PROPAGATION
 * cases below assert the value on the wire: hand-constructing the adapter config
 * would stay green even if the factory dropped the field, which is precisely the
 * defect these arms had. The other factory-driven cases assert something else on
 * purpose, case by case: the malformed-input case asserts `not.toThrow`; the
 * `mock` arm's case asserts only that its unsupported-type diagnostic fired; and
 * the `freellmapi` refused-key case asserts BOTH — the surviving keys still reach
 * the wire while the refused key is reported through the `console.warn` spy.
 *
 * ONE case is deliberately hand-constructed, and it is not a factory assertion.
 * The `opencode` arm cannot be driven from this file — it throws unless
 * `isOpencodeZenEnabled()`, a `system_settings` read this file never sets up
 * because it does not call `initDB`. So `opencode`'s propagation is checked here
 * at unit level by constructing the adapter directly, and the ARM itself (that
 * it spreads the value at all) is asserted on the wire in
 * `src/core/routeswitch/adapters/opencode-reasoning.test.ts`, which calls
 * `initDB()` and seeds the Zen flag before driving `instantiateProvider`. Do not
 * read the direct-construction case as proof that the arm spreads anything.
 *
 * IMPORTANT: mock-level only. `fetch` is stubbed, keys are fake placeholders
 * (same convention as freellmapi.test.ts), and no assertion here depends on a
 * live or in-memory database. This file deliberately never calls `initDB()`, and
 * the adapter's `llm_api_key` lookup only runs when no key was supplied — most
 * cases here pass a fake key, so that lookup is skipped entirely; where it does
 * run (the key-less direct-construction case) it fails against the missing table
 * and is swallowed by a `catch` that prints a `console.error`. No live server, no
 * real network.
 */

function captureFetch(content = 'ok') {
  const captured: { body?: any; calls: number } = { calls: 0 };
  const fetchMock = vi.spyOn(global, 'fetch').mockImplementation((async (_url: any, init?: any) => {
    captured.calls += 1;
    captured.body = JSON.parse(init?.body as string);
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
    } as any;
  }) as any);
  return { fetchMock, captured };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('instantiateProvider — durable static extraBody (A.4)', () => {
  it('carries a persisted extraBody from the provider row onto the wire, before per-call keys', async () => {
    const { captured } = captureFetch();

    const provider = instantiateProvider(
      'freellmapi',
      {
        baseUrl: 'http://localhost:3001/v1',
        modelId: 'fusion',
        extraBody: { fusion: { panels: 5 }, preset: 'durable' },
        note: 'a non-extraBody config field the factory must not promote',
      },
      'fake-key-not-real',
      'row-fusion',
    );

    expect(provider).toBeInstanceOf(FreeLLMProvider);
    expect(provider.id).toBe('row-fusion');

    await provider.generate('Test prompt', 10, undefined, undefined, { fusion: { panels: 1 }, callOnly: true });

    // Merge order on the wire: canonical body → static row value → per-call.
    expect(captured.body.preset).toBe('durable');
    expect(captured.body.fusion).toEqual({ panels: 1 });
    expect(captured.body.callOnly).toBe(true);
    expect(captured.body.model).toBe('fusion');
    expect(captured.body.messages).toEqual([{ role: 'user', content: 'Test prompt' }]);
    // The unrelated config field is not a body key.
    expect('note' in captured.body).toBe(false);
  });

  it('a row that persists no extraBody still instantiates and sends no extra keys', async () => {
    const { captured } = captureFetch();

    const provider = instantiateProvider('freellmapi', { modelId: 'auto' }, 'fake-key-not-real');

    expect(provider).toBeInstanceOf(FreeLLMProvider);
    await provider.generate('Test prompt', 10);

    expect('preset' in captured.body).toBe(false);
    expect('model' in captured.body).toBe(false);
    expect(Object.keys(captured.body).sort()).toEqual(
      ['enable_thinking', 'max_tokens', 'messages', 'temperature'].sort(),
    );
  });

  it('runs a persisted extraBody through the denylist, so a stored row cannot smuggle model/messages', async () => {
    // This row deliberately persists refused keys, so construction emits the
    // refusal warning; stub it so the suite output stays clean (restored by the
    // file-level `afterEach`).
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { captured } = captureFetch();

    const provider = instantiateProvider(
      'freellmapi',
      {
        modelId: 'fusion',
        extraBody: { model: 'attacker/model', messages: [{ role: 'user', content: 'hijack' }], preset: 'durable' },
      },
      'fake-key-not-real',
    );

    await provider.generate('Test prompt', 10);

    expect(captured.body.model).toBe('fusion');
    expect(captured.body.messages).toEqual([{ role: 'user', content: 'Test prompt' }]);
    expect(captured.body.preset).toBe('durable');
  });

  it('treats a malformed persisted extraBody as absent rather than throwing', () => {
    for (const malformed of ['nope', 42, null, [], true] as any[]) {
      expect(() => instantiateProvider('freellmapi', { extraBody: malformed }, 'fake-key-not-real')).not.toThrow();
    }
  });

  it('reports a refused key from a persisted row by NAME, never by value', () => {
    // Unlike the engine's Council-Mode warning — where the behaviour under test
    // is the non-propagation and it is asserted on the wire — here the
    // diagnostic IS the behaviour: the factory refuses the key at construction
    // and no other observable distinguishes "reported" from "dropped in
    // silence". The load-bearing assertion is therefore the presence of the
    // warning; if the factory stopped reporting, the lookup below yields
    // undefined and this fails.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const provider = instantiateProvider(
      'freellmapi',
      // `constructor` is refused by the denylist, and — unlike `model` — its
      // name appears NOWHERE in the warning's static suffix ("'model',
      // 'messages' and 'response_format' are adapter-owned"), so asserting on it
      // proves the refused-key list is genuinely rendered rather than passing on
      // boilerplate. `preset` is a legitimate extra key.
      { modelId: 'fusion', extraBody: { constructor: 'hostile', preset: 'durable' } },
      'fake-key-not-real',
    );
    expect(provider).toBeInstanceOf(FreeLLMProvider);

    const refusal = warn.mock.calls
      .map((call) => call.join(' '))
      .find((message) => message.includes('provider row config'));
    expect(refusal).toBeDefined();
    // Discriminating by construction: 'constructor' is not part of the message's
    // fixed text, so this can only pass if the refused key itself was rendered.
    expect(refusal).toContain('constructor');
    expect(refusal).not.toContain('preset'); // a legitimate key is not called refused
    expect(refusal).not.toContain('hostile'); // names only — never the value
    // Attribution: a refusal must name the provider it came from, so a row's
    // mistake stays traceable in a boot log that constructs many rows in a loop.
    expect(refusal).toContain("provider row config for type 'freellmapi'");
  });
});

/**
 * A.4 — four-arm parity for the DURABLE static extraBody.
 *
 * `openrouter` and `opencode` rows used to drop a persisted `config_json.extraBody`
 * with no warning, because only the `openai-compatible` and `freellmapi` arms
 * spread it into the adapter config. Both types extend
 * `OpenAICompatibleProvider`, whose `_generateWithConfig` already sanitizes and
 * merges a config-level `extraBody`, so the value works now that it is passed.
 *
 * `opencode` cannot be driven through `instantiateProvider` HERE: that arm
 * throws unless `isOpencodeZenEnabled()`, a `system_settings` read this file
 * never sets up because it does not call `initDB`. So this file asserts the
 * propagation at unit level by constructing the adapter directly — the same
 * construction the factory performs. The factory ARM itself (i.e. that it
 * spreads the value at all) IS asserted on the wire in
 * `src/core/routeswitch/adapters/opencode-reasoning.test.ts`, which calls
 * `initDB()` and seeds the Zen flag before driving the arm.
 */
describe('instantiateProvider — durable static extraBody, four-arm parity (A.4)', () => {
  it('carries a persisted extraBody on an openrouter row onto the wire', async () => {
    const { captured } = captureFetch();

    const provider = instantiateProvider(
      'openrouter',
      { modelId: 'named/model', extraBody: { fusion: { panels: 3 }, preset: 'durable' } },
      'fake-key-not-real',
    );

    expect(provider).toBeInstanceOf(OpenRouterProvider);
    await provider.generate('Test prompt', 10);

    expect(captured.body.fusion).toEqual({ panels: 3 });
    expect(captured.body.preset).toBe('durable');
    expect(captured.body.model).toBe('named/model');
  });

  it('carries a persisted extraBody on an openai-compatible row onto the wire', async () => {
    // This arm previously had NO test anywhere: `instantiateProvider` with
    // 'openai-compatible' is otherwise called only by the production boot path
    // (`src/server/server-main.ts`), so deleting its `staticExtraBody` spread
    // left the whole suite green.
    const { captured } = captureFetch();

    const provider = instantiateProvider(
      'openai-compatible',
      {
        baseUrl: 'http://localhost:1234/v1',
        modelId: 'named/model',
        extraBody: { fusion: { panels: 4 }, preset: 'durable' },
      },
      'fake-key-not-real',
    );

    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    await provider.generate('Test prompt', 10);

    expect(captured.body.fusion).toEqual({ panels: 4 });
    expect(captured.body.preset).toBe('durable');
    expect(captured.body.model).toBe('named/model');
    expect(captured.body.messages).toEqual([{ role: 'user', content: 'Test prompt' }]);
  });

  it('refuses a denylisted key on an openrouter row and keeps the configured model', async () => {
    // Deliberately persists a refused key — stub (and capture) the
    // construction-time warning so its attribution can be asserted below.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { captured } = captureFetch();

    const provider = instantiateProvider(
      'openrouter',
      { modelId: 'named/model', extraBody: { model: 'attacker/model', preset: 'durable' } },
      'fake-key-not-real',
    );

    await provider.generate('Test prompt', 10);

    expect(captured.body.model).toBe('named/model');
    expect(captured.body.preset).toBe('durable');

    // Attribution: this arm's refusal must name openrouter. Without this,
    // swapping two arms' type literals would leave the whole suite green.
    const refusal = warn.mock.calls
      .map((call) => call.join(' '))
      .find((message) => message.includes('provider row config'));
    expect(refusal).toBeDefined();
    expect(refusal).toContain("provider row config for type 'openrouter'");
  });

  it('names the provider type when it refuses a key on an openai-compatible row', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    instantiateProvider(
      'openai-compatible',
      {
        baseUrl: 'http://localhost:1234/v1',
        modelId: 'named/model',
        // `constructor` is denylisted and absent from the message's fixed text.
        extraBody: { constructor: 'hostile', preset: 'durable' },
      },
      'fake-key-not-real',
    );

    const refusal = warn.mock.calls
      .map((call) => call.join(' '))
      .find((message) => message.includes('provider row config'));
    expect(refusal).toBeDefined();
    expect(refusal).toContain("provider row config for type 'openai-compatible'");
    expect(refusal).not.toContain('hostile'); // names only — never the value
  });

  it('carries a config-level extraBody on a directly constructed OpenCodeProvider', async () => {
    const { captured } = captureFetch();

    const provider = new OpenCodeProvider({
      modelId: 'named/model',
      extraBody: { fusion: { panels: 2 }, preset: 'durable' },
    });

    await provider.generate('Test prompt', 10);

    expect(captured.body.fusion).toEqual({ panels: 2 });
    expect(captured.body.preset).toBe('durable');
    expect(captured.body.model).toBe('named/model');
  });

  it('warns and ignores a persisted extraBody on a type that builds no chat body', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() =>
      instantiateProvider('mock', { extraBody: { fusion: { panels: 3 } } }, undefined),
    ).not.toThrow();

    const unsupported = warn.mock.calls
      .map((call) => call.join(' '))
      .find((message) => message.includes("type 'mock' does not support a persisted extraBody"));
    expect(unsupported).toBeDefined();
    expect(unsupported).toContain('fusion'); // the ignored key is named
    expect(unsupported).not.toContain('panels'); // names only — never the value
  });
});
