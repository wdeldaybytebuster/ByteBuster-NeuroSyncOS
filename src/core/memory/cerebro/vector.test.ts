import { describe, it, expect, beforeEach } from 'vitest';
import { db, initDB } from '../../basevault/db';
import { CerebroVectorStore } from './vector';

describe('CerebroVectorStore (sqlite-vec & Fallback)', () => {
  beforeEach(() => {
    initDB();
    // Clear out testing tables
    db.prepare('DELETE FROM cerebro_memories_meta').run();
    db.prepare('DELETE FROM cerebro_memories_vec').run();
  });

  it('should insert and search using Keyword Fallback Engine', () => {
    CerebroVectorStore.insert('The quick brown fox jumps over the lazy dog', 'knowledge');
    CerebroVectorStore.insert('NeuroSync sovereign os architecture relies on sqlite-vec', 'knowledge');
    CerebroVectorStore.insert('Irrelevant data point about cooking', 'other');

    // Searching with words > 3 chars: "neurosync", "architecture"
    const results = CerebroVectorStore.search('neurosync architecture', 'knowledge');
    
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toContain('NeuroSync sovereign os');
    // matchCount = 2 (neurosync, architecture)
    // 0.7 + (2 * 0.05) = 0.8
    expect(results[0]!.similarity).toBeCloseTo(0.8);
  });

  it('should insert and search using Vector Embeddings', () => {
    // Mock 1536 dim embeddings
    const embed1 = new Float32Array(1536);
    embed1[0] = 0.9;
    
    const embed2 = new Float32Array(1536);
    embed2[0] = 0.1;

    CerebroVectorStore.insert('Memory A', 'test', embed1);
    CerebroVectorStore.insert('Memory B', 'test', embed2);

    // Search with an embedding close to embed1
    const queryEmbed = new Float32Array(1536);
    queryEmbed[0] = 0.8;

    const results = CerebroVectorStore.search('dummy query', 'test', queryEmbed);
    
    expect(results.length).toBeGreaterThan(0);
    // embed1 should be closer than embed2
    expect(results[0]!.content).toBe('Memory A');
  });
});
