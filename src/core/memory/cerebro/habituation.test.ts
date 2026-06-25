import { describe, it, expect } from 'vitest';
import { HabituationScorer } from './habituation';
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
});
