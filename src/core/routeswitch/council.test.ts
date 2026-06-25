import { describe, it, expect, vi } from 'vitest';
import { RouteSwitchEngine } from './engine';
import { LLMProvider } from './providers';

class DummyProvider implements LLMProvider {
  constructor(public id: string, private response: string) {}
  async generate() {
    return this.response;
  }
}

describe('Council Mode Triage & Consensus', () => {
  it('should trigger council mode on high-risk prompts', async () => {
    const mainProv = new DummyProvider('main', '{"nodes": [{"id":"1","prompt":"drop table"}]}');
    const c1 = new DummyProvider('c1', '{"nodes": [{"id":"1","prompt":"drop table safely"}]}');
    const c2 = new DummyProvider('c2', '{"nodes": [{"id":"1","prompt":"drop table very safely"}]}');

    const engine = new RouteSwitchEngine(undefined, mainProv);
    engine.setCouncilProviders([c1, c2]);

    const result = await engine.execute({ prompt: 'Please delete the database', estimatedTokens: 10 });
    
    expect(result.isCouncilMode).toBe(true);
    expect(result.provider).toBe('Council Consensus');
    // It should pick the longest response based on our current simple heuristic
    expect(result.content).toBe('{"nodes": [{"id":"1","prompt":"drop table very safely"}]}');
  });

  it('should not trigger council mode on low-risk prompts', async () => {
    const mainProv = new DummyProvider('main', '{"nodes": []}');
    const c1 = new DummyProvider('c1', 'test');
    const c2 = new DummyProvider('c2', 'test2');

    const engine = new RouteSwitchEngine(undefined, mainProv);
    engine.setCouncilProviders([c1, c2]);

    const result = await engine.execute({ prompt: 'Just say hi', estimatedTokens: 10 });
    
    expect(result.isCouncilMode).toBe(false);
    expect(result.provider).toBe('main');
  });
});
