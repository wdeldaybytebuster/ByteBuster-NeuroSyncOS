import { describe, it, expect, vi } from 'vitest';
import { FreeModeGovernor } from './governor';
import { RouteSwitchEngine } from './engine';
import { OKFGraphQuery } from '../okf/graph-query';
import { LLMProvider } from './providers';

describe('RouteSwitch & Governor', () => {
  it('Governor should track usage correctly', () => {
    const gov = new FreeModeGovernor(100);
    expect(gov.canProceed(50)).toBe(true);
    gov.recordUsage(50);
    expect(gov.getStatus().tokensUsed).toBe(50);

    expect(gov.canProceed(60)).toBe(false); // 50 + 60 = 110 > 100
  });

  it('RouteSwitchEngine should return mock response and deduct tokens', async () => {
    const gov = new FreeModeGovernor(500);
    const engine = new RouteSwitchEngine(gov);

    const res = await engine.execute({ prompt: 'Hello world', estimatedTokens: 100 });

    expect(res.provider).toBe('mock');
    expect(res.content).toContain('[MOCK RESPONSE]');
    expect(gov.getStatus().tokensUsed).toBe(100);
  });

  it('skips automatic OKF injection for context-isolated harness requests', async () => {
    const contextSpy = vi.spyOn(OKFGraphQuery, 'resolveContext').mockReturnValue([]);
    const engine = new RouteSwitchEngine(new FreeModeGovernor(500));

    await engine.execute({
      prompt: 'This is a sufficiently long isolated single-turn generation prompt.',
      estimatedTokens: 100,
      useKnowledgeContext: false,
    });

    expect(contextSpy).not.toHaveBeenCalled();
    contextSpy.mockRestore();
  });

  it('RouteSwitchEngine should throw if quota exceeded', async () => {
    const gov = new FreeModeGovernor(50);
    const engine = new RouteSwitchEngine(gov);

    await expect(engine.execute({ prompt: 'Hello', estimatedTokens: 100 })).rejects.toThrow(/Governor blocked execution/);
  });

  // ── Acceptance Gate 3: Governor Intercepts When API Keys Are Missing ──────
  // Modelled as: quota pre-exhausted (0 tokens remain) simulating a locked-out
  // free-tier account. The governor must block BEFORE any outbound fetch fires.
  it('Governor blocks execution and throws before any network call when free-tier quota is 0', async () => {
    const gov = new FreeModeGovernor(0); // zero quota = no key scenario
    const engine = new RouteSwitchEngine(gov);

    // Spy to confirm fetch is never invoked
    const fetchSpy = vi.spyOn(global, 'fetch');

    await expect(
      engine.execute({ prompt: 'Any prompt', estimatedTokens: 1 })
    ).rejects.toThrow(/Governor blocked execution/);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  // ── Acceptance Gate 4: Core Execution Path Completes Without Network ──────
  // MockProvider must complete a full execute() round-trip — governor check,
  // generate(), recordUsage(), structured RouteResponse — with zero fetch calls.
  it('Core execution completes fully offline via MockProvider with no network requests', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');

    const gov = new FreeModeGovernor(10000);
    const engine = new RouteSwitchEngine(gov);
    // MockProvider is the default; no setProvider() needed

    const res = await engine.execute({ prompt: 'Offline test prompt', estimatedTokens: 50 });

    expect(res.provider).toBe('mock');
    expect(res.content).toBeDefined();
    expect(res.tokensUsed).toBe(50);
    expect(gov.getStatus().tokensUsed).toBe(50);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});

import { LlamaCppProvider } from './adapters/llama-cpp';
import { OpenAICompatibleProvider } from './adapters/openai-compatible';

describe('RouteSwitch Providers', () => {
  it('LlamaCppProvider should set id and surface a real error for a missing model file', async () => {
    const provider = new LlamaCppProvider({ modelPath: '/models/llama-3.gguf' });
    expect(provider.id).toBe('llama-cpp');
    // Real node-llama-cpp inference backs this provider now (no more fake
    // placeholder responses) — an invalid path must throw a real error so
    // RouteSwitch's fallback loop can move on to the next provider, instead
    // of silently returning a fabricated "successful" response.
    await expect(provider.generate('Test prompt', 10)).rejects.toThrow(/ENOENT|no such file/i);
  });

  it('OpenAICompatibleProvider should handle Auto for FreeLLMAPI', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '[OPENAI-COMPATIBLE RESPONSE via FreeLLMAPI Auto Routing]' } }] })
    } as any);

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', modelId: 'Auto' });
    const response = await provider.generate('Test prompt', 10);
    expect(provider.id).toBe('openai-compatible');
    expect(response).toContain('[OPENAI-COMPATIBLE RESPONSE via FreeLLMAPI Auto Routing]');
    
    vi.restoreAllMocks();
  });
});

/**
 * Phase A — Fusion usage accounting (A.6) and upstream routing-hint capture
 * (A.7). Per the documented rule (docs/architecture/FUSION.md) a Fusion request
 * is ONE provider call from RouteSwitch's point of view — the ensemble fan-out
 * happens behind the FreeLLMAPI router — so usage stays 1× unless an upstream
 * exposes a panel count, which `X-Routed-Via` does not.
 */
describe('RouteSwitch — Fusion accounting & routed-via', () => {
  it('records usage exactly 1× for a Fusion-style request carrying extraBody', async () => {
    const gov = new FreeModeGovernor(10_000);
    const engine = new RouteSwitchEngine(gov);
    const fusionProvider: LLMProvider = {
      id: 'freellmapi',
      async generate() {
        return 'fusion answer';
      },
    };
    engine.setProvider(fusionProvider);

    const res = await engine.execute({
      prompt: 'Fusion smoke prompt',
      estimatedTokens: 250,
      useKnowledgeContext: false,
      extraBody: { fusion: { panels: 3 } },
    });

    expect(res.content).toBe('fusion answer');
    expect(res.tokensUsed).toBe(250);
    expect(gov.getStatus().tokensUsed).toBe(250);
  });

  it('surfaces the provider-reported X-Routed-Via on RouteResponse', async () => {
    const engine = new RouteSwitchEngine(new FreeModeGovernor(10_000));
    engine.setProvider({
      id: 'freellmapi',
      async generate() {
        return 'plain';
      },
      async generateWithMeta() {
        return { content: 'routed answer', routedVia: 'chutes/deepseek-v3' };
      },
    });

    const res = await engine.execute({
      prompt: 'Header capture prompt',
      estimatedTokens: 50,
      useKnowledgeContext: false,
    });

    expect(res.content).toBe('routed answer');
    expect(res.routedVia).toBe('chutes/deepseek-v3');
  });

  it('leaves routedVia absent when the provider reports none', async () => {
    const engine = new RouteSwitchEngine(new FreeModeGovernor(10_000));
    engine.setProvider({
      id: 'freellmapi',
      async generate() {
        return 'plain';
      },
      async generateWithMeta() {
        return { content: 'plain' };
      },
    });

    const res = await engine.execute({
      prompt: 'No header prompt',
      estimatedTokens: 50,
      useKnowledgeContext: false,
    });

    expect(res.content).toBe('plain');
    expect('routedVia' in res).toBe(false);
  });
});

/**
 * Phase A — the `extraBody` seam is scoped to the SINGLE-PROVIDER path.
 *
 * Council Mode fans one prompt out to every eligible provider, so a per-request
 * body extension must NOT be propagated to the legs: doing so would multiply the
 * ensemble fan-out by the leg count and break the 1x accounting rule the Fusion
 * contract depends on. This test asserts the real behavioural fact — what each
 * leg actually received at its own `generate()` call — so it fails if anyone
 * later forwards `request.extraBody` into the council fan-out.
 */
describe('RouteSwitch — extraBody is inert in Council Mode (A.4 seam)', () => {
  it('does not propagate a per-request extraBody into any council leg', async () => {
    const gov = new FreeModeGovernor(10_000);
    // Records exactly what each provider was handed at its own generate() call.
    const seen: Array<{ id: string; extraBody: unknown }> = [];
    const recording = (id: string, response: string): LLMProvider => ({
      id,
      async generate(_prompt, _estimatedTokens, _schema, _streamHooks, extraBody) {
        seen.push({ id, extraBody });
        return response;
      },
    });

    const primary = recording('main', '{"nodes":[{"id":"1","prompt":"drop table"}]}');
    const c1 = recording('c1', '{"nodes":[{"id":"1","prompt":"drop table safely"}]}');
    const c2 = recording('c2', '{"nodes":[{"id":"1","prompt":"drop table very safely"}]}');

    const engine = new RouteSwitchEngine(gov, primary);
    engine.setCouncilProviders([c1, c2]);

    // 'Please delete the database' is the established high-risk prompt that
    // trips the triage classifier into Council Mode (see council.test.ts).
    const res = await engine.execute({
      prompt: 'Please delete the database',
      estimatedTokens: 10,
      useKnowledgeContext: false,
      extraBody: { fusion: { panels: 3 } },
    });

    expect(res.isCouncilMode).toBe(true);
    expect(res.provider).toBe('Council Consensus');
    expect(typeof res.content).toBe('string');
    expect(res.content.length).toBeGreaterThan(0);

    // Every eligible leg actually ran...
    expect(seen.map((s) => s.id).sort()).toEqual(['c1', 'c2', 'main']);
    // ...and NONE of them was handed the caller's per-request body extension.
    for (const leg of seen) {
      expect(leg.extraBody).toBeUndefined();
    }

    // Council accounting is untouched by this: tokens x legs, not the Fusion 1x.
    expect(res.tokensUsed).toBe(30);
    expect(gov.getStatus().tokensUsed).toBe(30);
  });
});
