import { describe, it, expect } from 'vitest';
import { RouteSwitchEngine } from './engine';
import { FreeModeGovernor } from './governor';
import { GenerationStreamHooks, LLMProvider } from './providers';

/**
 * Fake provider that streams real-shaped per-token confidence into `streamHooks`
 * exactly like the llama-cpp adapter does, and — critically — HONOURS the abort
 * signal by stopping generation mid-stream. This is the provider shape the
 * structural bug made impossible to exercise: before the fix, RouteSwitchEngine
 * awaited generate() to completion and called evaluateToken exactly ONCE on a
 * word-count guess, so the 3-consecutive-low-tokens abort path was permanently
 * dead code.
 */
class StreamingFakeProvider implements LLMProvider {
  id = 'fake-streaming';
  supportsStreamingConfidence = true;
  public tokensEmitted = 0;

  constructor(private confidences: number[]) {}

  async generate(
    _prompt: string,
    _estimatedTokens: number,
    _schema?: any,
    streamHooks?: GenerationStreamHooks,
  ): Promise<string> {
    const tokens: string[] = [];
    for (let i = 0; i < this.confidences.length; i++) {
      // A genuine local decoder stops the instant it's told to.
      if (streamHooks?.signal?.aborted) break;
      streamHooks?.onTokenConfidence?.(Math.log(this.confidences[i]!));
      this.tokensEmitted++;
      tokens.push(`t${i}`);
      if (streamHooks?.signal?.aborted) break;
    }
    return tokens.join(' ');
  }
}

describe('RouteSwitchEngine × AgentStop streaming integration', () => {
  it('preemptively aborts after 3 consecutive low-confidence tokens (the previously-dead abort path)', async () => {
    // ln(0.05) ≈ -3.0, well below thresholdH (-1.0). Five low tokens are queued,
    // but generation must stop after the 3rd triggers the abort.
    const provider = new StreamingFakeProvider([0.05, 0.05, 0.05, 0.05, 0.05]);
    const engine = new RouteSwitchEngine(new FreeModeGovernor(10000));
    engine.setProvider(provider);

    const res = await engine.execute({ prompt: 'hi', estimatedTokens: 10 });

    // Only 3 tokens were ever generated — the abort genuinely cut inference short.
    expect(provider.tokensEmitted).toBe(3);
    expect(res.content).toBe('t0 t1 t2');
    expect(res.provider).toBe('fake-streaming');
    // Preemptive termination is reflected as a genuinely low confidence.
    expect(res.confidence).toBeCloseTo(0.2, 6);
  });

  it('resets the supervisor between calls: a good token in the middle prevents abort', async () => {
    // low, low, GOOD (resets counter), low, low → never 3 consecutive lows.
    const provider = new StreamingFakeProvider([0.05, 0.05, 0.9, 0.05, 0.05]);
    const engine = new RouteSwitchEngine(new FreeModeGovernor(10000));
    engine.setProvider(provider);

    const res = await engine.execute({ prompt: 'hi', estimatedTokens: 10 });

    expect(provider.tokensEmitted).toBe(5); // full generation, no abort
    expect(res.content).toBe('t0 t1 t2 t3 t4');
    expect(res.confidence).toBe(1.0);
  });

  it('does not abort when confidence stays high', async () => {
    const provider = new StreamingFakeProvider([0.9, 0.95, 0.9, 0.99]);
    const engine = new RouteSwitchEngine(new FreeModeGovernor(10000));
    engine.setProvider(provider);

    const res = await engine.execute({ prompt: 'hi', estimatedTokens: 10 });

    expect(provider.tokensEmitted).toBe(4);
    expect(res.confidence).toBe(1.0);
  });

  it('reports the AgentStop mode from the active provider capability flag', () => {
    const engine = new RouteSwitchEngine(new FreeModeGovernor(10000));

    // Default active provider is MockProvider → heuristic fallback.
    expect(engine.getAgentStopMode().mode).toBe('heuristic');

    engine.setProvider(new StreamingFakeProvider([0.9]));
    const mode = engine.getAgentStopMode();
    expect(mode.mode).toBe('preemptive');
    expect(mode.activeProviderId).toBe('fake-streaming');
    expect(mode.supportsStreamingConfidence).toBe(true);
  });
});
