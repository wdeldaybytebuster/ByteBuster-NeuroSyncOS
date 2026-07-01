import { describe, it, expect, vi } from 'vitest';
import { FreeModeGovernor } from './governor';
import { RouteSwitchEngine } from './engine';

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
  it('LlamaCppProvider should format correctly', async () => {
    const provider = new LlamaCppProvider({ modelPath: '/models/llama-3.gguf' });
    const response = await provider.generate('Test prompt', 10);
    expect(provider.id).toBe('llama-cpp');
    // Dev-mode fallback response format, matching the real GBNF-aware stub in llama-cpp.ts
    expect(response).toContain('[LOCAL GGUF] /models/llama-3.gguf:');
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
