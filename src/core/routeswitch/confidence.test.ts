import { describe, it, expect } from 'vitest';
import { probabilityToLogprob, consumeConfidenceStream } from './confidence';

describe('probabilityToLogprob', () => {
  it('maps p=1 to 0 (fully confident)', () => {
    expect(probabilityToLogprob(1)).toBe(0);
  });

  it('maps mid probabilities to the AgentStop logprob scale', () => {
    // AgentStop thresholdH is -1.0 → p ≈ 0.368. Anything less likely is "low".
    expect(probabilityToLogprob(Math.exp(-1))).toBeCloseTo(-1.0, 6);
    expect(probabilityToLogprob(0.5)).toBeCloseTo(-0.6931, 3);
    // A very unlikely token lands well below threshold.
    expect(probabilityToLogprob(0.1)).toBeLessThan(-1.0);
  });

  it('clamps p=0 to a finite floor instead of -Infinity', () => {
    const lp = probabilityToLogprob(0);
    expect(Number.isFinite(lp)).toBe(true);
    expect(lp).toBeLessThan(-20);
  });

  it('clamps out-of-range inputs to [epsilon, 1]', () => {
    expect(probabilityToLogprob(5)).toBe(0);
    expect(Number.isFinite(probabilityToLogprob(-3))).toBe(true);
  });
});

/** Build a fake evaluateWithMetadata-style generator over a fixed script. */
async function* fakeStream(
  items: Array<{ token: number; confidence?: number }>,
): AsyncGenerator<{ token: number; confidence?: number }, void, unknown> {
  for (const item of items) {
    yield item;
  }
}

describe('consumeConfidenceStream', () => {
  it('reports one logprob per token and returns all tokens when the stream ends', async () => {
    const logprobs: number[] = [];
    const res = await consumeConfidenceStream(
      fakeStream([
        { token: 10, confidence: 0.9 },
        { token: 11, confidence: 0.8 },
        { token: 12, confidence: 0.7 },
      ]),
      {
        isEog: () => false,
        onLogprob: (lp) => logprobs.push(lp),
        isAborted: () => false,
        maxTokens: 100,
      },
    );

    expect(res.tokens).toEqual([10, 11, 12]);
    expect(res.aborted).toBe(false);
    expect(res.stopReason).toBe('end');
    expect(logprobs).toHaveLength(3);
    expect(logprobs[0]).toBeCloseTo(Math.log(0.9), 6);
  });

  it('stops at an EOG token without emitting it', async () => {
    const res = await consumeConfidenceStream(
      fakeStream([
        { token: 1, confidence: 0.9 },
        { token: 999, confidence: 0.9 }, // EOG
        { token: 2, confidence: 0.9 },
      ]),
      {
        isEog: (t) => t === 999,
        onLogprob: () => {},
        isAborted: () => false,
        maxTokens: 100,
      },
    );

    expect(res.tokens).toEqual([1]);
    expect(res.stopReason).toBe('eog');
  });

  it('honours mid-stream abort triggered synchronously inside onLogprob', async () => {
    // Simulate AgentStop: abort as soon as the 3rd low-confidence token is seen.
    let aborted = false;
    let lowCount = 0;
    const res = await consumeConfidenceStream(
      fakeStream([
        { token: 1, confidence: 0.05 },
        { token: 2, confidence: 0.05 },
        { token: 3, confidence: 0.05 },
        { token: 4, confidence: 0.05 }, // must never be generated
        { token: 5, confidence: 0.05 },
      ]),
      {
        isEog: () => false,
        onLogprob: (lp) => {
          if (lp < -1.0) {
            lowCount++;
            if (lowCount >= 3) aborted = true;
          }
        },
        isAborted: () => aborted,
        maxTokens: 100,
      },
    );

    // The token that tripped the abort is kept; nothing after it is generated.
    expect(res.tokens).toEqual([1, 2, 3]);
    expect(res.aborted).toBe(true);
    expect(res.stopReason).toBe('aborted');
  });

  it('caps generation at maxTokens', async () => {
    const res = await consumeConfidenceStream(
      fakeStream(Array.from({ length: 10 }, (_, i) => ({ token: i, confidence: 0.9 }))),
      {
        isEog: () => false,
        onLogprob: () => {},
        isAborted: () => false,
        maxTokens: 4,
      },
    );

    expect(res.tokens).toEqual([0, 1, 2, 3]);
    expect(res.stopReason).toBe('maxTokens');
  });

  it('returns immediately if aborted before the first token', async () => {
    const res = await consumeConfidenceStream(
      fakeStream([{ token: 1, confidence: 0.9 }]),
      {
        isEog: () => false,
        onLogprob: () => {},
        isAborted: () => true,
        maxTokens: 100,
      },
    );
    expect(res.tokens).toEqual([]);
    expect(res.aborted).toBe(true);
  });
});
