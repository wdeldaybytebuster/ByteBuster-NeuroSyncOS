import { describe, it, expect, vi } from 'vitest';
import { RouteSwitchEngine } from './engine';
import { LLMProvider } from './providers';
import { ConsensusSynthesizer } from './council';

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

describe('ConsensusSynthesizer.executeCouncilMode — numeric confidence', () => {
  it('returns confidence close to 1.0 when responses are near-identical in length', async () => {
    const providers: LLMProvider[] = [
      new DummyProvider('a', 'the quick brown fox jumps'),
      new DummyProvider('b', 'the quick brown fox leaps'),
      new DummyProvider('c', 'the quick brown fox hops!'),
    ];

    const result = await ConsensusSynthesizer.executeCouncilMode('test prompt', 10, providers);

    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('returns confidence below 0.5 when response lengths vary wildly', async () => {
    const providers: LLMProvider[] = [
      new DummyProvider('a', 'ok'),
      new DummyProvider('b', 'This is a much, much longer response than the other two by a wide margin, deliberately so.'),
      new DummyProvider('c', 'ok'),
    ];

    const result = await ConsensusSynthesizer.executeCouncilMode('test prompt', 10, providers);

    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeLessThan(0.5);
  });
});
