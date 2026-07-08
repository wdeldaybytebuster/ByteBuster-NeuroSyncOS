import { describe, it, expect } from 'vitest';
import { HabituationScorer, DEFAULT_DECAY_RATE, DEFAULT_ACCESS_BOOST } from './habituation';
import { MemoryRecord } from './vector';

describe('HabituationScorer', () => {
  it('should rank frequently accessed recent items higher', () => {
    const now = Date.now();
    const records: MemoryRecord[] = [
      {
        id: '1', content: 'Old and forgotten', type: 'test',
        last_accessed_at: now - (30 * 24 * 60 * 60 * 1000), // 30 days ago
        access_count: 1,
        created_at: 0,
        similarity: 0.9
      },
      {
        id: '2', content: 'Recent and used', type: 'test',
        last_accessed_at: now, // today
        access_count: 10,
        created_at: 0,
        similarity: 0.9
      }
    ];

    const ranked = HabituationScorer.rank(records, now) as any[];
    
    expect(ranked[0].id).toBe('2');
    expect(ranked[1].id).toBe('1');
    
    // Check math roughly
    // 30 days decay: e^(-30 * 0.3) = e^-9 = ~0.00012
    expect(ranked[1].r_final).toBeLessThan(0.01);
    
    // 0 days decay, 10 access count: 0.9 * (10 * 1.5) * 1 = 13.5
    expect(ranked[0].r_final).toBeCloseTo(13.5);
  });

  it('produces different results with custom decayRate/boostMultiplier, and matches default-constants behavior with no extra args', () => {
    const now = Date.now();
    const records: MemoryRecord[] = [
      {
        id: '1', content: 'Idle a bit', type: 'test',
        last_accessed_at: now - (10 * 24 * 60 * 60 * 1000), // 10 days ago
        access_count: 2,
        created_at: 0,
        similarity: 0.9
      }
    ];

    // Backward compatibility: no extra args must match calling explicitly with
    // the exported default constants, and match the current hardcoded-literal math.
    const rankedDefaultImplicit = HabituationScorer.rank(records, now) as any[];
    const rankedDefaultExplicit = HabituationScorer.rank(records, now, DEFAULT_DECAY_RATE, DEFAULT_ACCESS_BOOST) as any[];
    expect(rankedDefaultImplicit[0].r_final).toBeCloseTo(rankedDefaultExplicit[0].r_final);
    // Hardcoded reference: 0.9 * (2 * 1.5) * e^(-10 * 0.3)
    const expectedDefault = 0.9 * (2 * 1.5) * Math.exp(-10 * 0.3);
    expect(rankedDefaultImplicit[0].r_final).toBeCloseTo(expectedDefault);

    // Custom decayRate/boostMultiplier must verifiably change the result.
    const customDecayRate = 0.05; // slower decay → higher r_final
    const customBoost = 3.0;      // stronger boost → higher r_final
    const rankedCustom = HabituationScorer.rank(records, now, customDecayRate, customBoost) as any[];
    const expectedCustom = 0.9 * (2 * customBoost) * Math.exp(-10 * customDecayRate);
    expect(rankedCustom[0].r_final).toBeCloseTo(expectedCustom);
    expect(rankedCustom[0].r_final).toBeGreaterThan(rankedDefaultImplicit[0].r_final);
  });
});
