import { describe, it, expect } from 'vitest';
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
});

import { LlamaCppProvider } from './adapters/llama-cpp';
import { OpenAICompatibleProvider } from './adapters/openai-compatible';
import { vi } from 'vitest';

describe('RouteSwitch Providers', () => {
  it('LlamaCppProvider should format correctly', async () => {
    const provider = new LlamaCppProvider({ modelPath: '/models/llama-3.gguf' });
    const response = await provider.generate('Test prompt', 10);
    expect(provider.id).toBe('llama-cpp');
    expect(response).toContain('[LOCAL GGUF RESPONSE via /models/llama-3.gguf]');
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
