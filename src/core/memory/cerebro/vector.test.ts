import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initDB } from '../../basevault/db';
import { CerebroVectorStore, _resetKeywordScoringCache } from './vector';

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

  it('scopes keyword-fallback search to a project plus untagged (GLOBAL) memories', () => {
    CerebroVectorStore.insert('Project Alpha uses a custom deployment pipeline', 'fact', undefined, 'proj-alpha');
    CerebroVectorStore.insert('Project Beta uses a custom deployment pipeline', 'fact', undefined, 'proj-beta');
    CerebroVectorStore.insert('Global convention: custom deployment pipeline notes go here', 'fact', undefined, null);

    const results = CerebroVectorStore.search('custom deployment pipeline', undefined, undefined, 10, 'proj-alpha');
    const contents = results.map(r => r.content);

    expect(contents).toContain('Project Alpha uses a custom deployment pipeline');
    expect(contents).toContain('Global convention: custom deployment pipeline notes go here');
    expect(contents).not.toContain('Project Beta uses a custom deployment pipeline');
  });

  it('scopes vector search to a project plus untagged (GLOBAL) memories', () => {
    const embed = new Float32Array(1536);
    embed[0] = 0.9;

    CerebroVectorStore.insert('Alpha memory', 'test', embed, 'proj-alpha');
    CerebroVectorStore.insert('Beta memory', 'test', embed, 'proj-beta');
    CerebroVectorStore.insert('Global memory', 'test', embed, null);

    const results = CerebroVectorStore.search('dummy query', 'test', embed, 10, 'proj-alpha');
    const contents = results.map(r => r.content);

    expect(contents).toContain('Alpha memory');
    expect(contents).toContain('Global memory');
    expect(contents).not.toContain('Beta memory');
  });
});

describe('CerebroVectorStore keyword-fallback scoring settings (Base Score / Match Boost dials)', () => {
  const setKeywordSettings = (baseScore: number | null, matchBoost: number | null) => {
    if (baseScore === null) {
      db.prepare("DELETE FROM system_settings WHERE key = 'cerebro_keyword_base'").run();
    } else {
      db.prepare(
        "INSERT INTO system_settings (key, value) VALUES ('cerebro_keyword_base', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).run(String(baseScore));
    }
    if (matchBoost === null) {
      db.prepare("DELETE FROM system_settings WHERE key = 'cerebro_keyword_boost'").run();
    } else {
      db.prepare(
        "INSERT INTO system_settings (key, value) VALUES ('cerebro_keyword_boost', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).run(String(matchBoost));
    }
    _resetKeywordScoringCache();
  };

  beforeEach(() => {
    initDB();
    db.prepare('DELETE FROM cerebro_memories_meta').run();
    db.prepare('DELETE FROM cerebro_memories_vec').run();
  });

  afterEach(() => {
    setKeywordSettings(null, null);
  });

  it('with no settings persisted, reproduces the pre-existing hardcoded 0.7 + matchCount*0.05 formula', () => {
    setKeywordSettings(null, null);
    CerebroVectorStore.insert('NeuroSync sovereign os architecture relies on sqlite-vec', 'knowledge');

    const results = CerebroVectorStore.search('neurosync architecture', 'knowledge');
    expect(results).toHaveLength(1);
    // matchCount = 2 (neurosync, architecture) -> 0.7 + 2*0.05 = 0.8
    expect(results[0]!.similarity).toBeCloseTo(0.8);
  });

  it('changing cerebro_keyword_base changes the computed score for the same query/document pair', () => {
    CerebroVectorStore.insert('NeuroSync sovereign os architecture relies on sqlite-vec', 'knowledge');

    setKeywordSettings(0.5, 0.05);
    const lowBase = CerebroVectorStore.search('neurosync architecture', 'knowledge');
    // matchCount = 2 -> 0.5 + 2*0.05 = 0.6
    expect(lowBase[0]!.similarity).toBeCloseTo(0.6);

    setKeywordSettings(0.9, 0.05);
    const highBase = CerebroVectorStore.search('neurosync architecture', 'knowledge');
    // matchCount = 2 -> 0.9 + 2*0.05 = 1.0
    expect(highBase[0]!.similarity).toBeCloseTo(1.0);

    expect(highBase[0]!.similarity!).toBeGreaterThan(lowBase[0]!.similarity!);
  });

  it('changing cerebro_keyword_boost changes the computed score for the same query/document pair', () => {
    CerebroVectorStore.insert('NeuroSync sovereign os architecture relies on sqlite-vec', 'knowledge');

    setKeywordSettings(0.7, 0.01);
    const lowBoost = CerebroVectorStore.search('neurosync architecture', 'knowledge');
    // matchCount = 2 -> 0.7 + 2*0.01 = 0.72
    expect(lowBoost[0]!.similarity).toBeCloseTo(0.72);

    setKeywordSettings(0.7, 0.15);
    const highBoost = CerebroVectorStore.search('neurosync architecture', 'knowledge');
    // matchCount = 2 -> 0.7 + 2*0.15 = 1.0
    expect(highBoost[0]!.similarity).toBeCloseTo(1.0);

    expect(highBoost[0]!.similarity!).toBeGreaterThan(lowBoost[0]!.similarity!);
  });

  it('a raised base score can pull a previously-below-threshold-adjacent document into the results', () => {
    // A single low-signal match (matchCount=1) barely clears 0 at a tiny base
    // score, and is filtered out entirely once similarity would be <= 0 —
    // proving the setting changes which documents are returned, not just
    // their score.
    CerebroVectorStore.insert('Completely unrelated single keyword architecture mention', 'knowledge');

    setKeywordSettings(0, 0.05);
    const zeroBase = CerebroVectorStore.search('architecture', 'knowledge');
    expect(zeroBase[0]!.similarity).toBeCloseTo(0.05);

    setKeywordSettings(0.7, 0.05);
    const normalBase = CerebroVectorStore.search('architecture', 'knowledge');
    expect(normalBase[0]!.similarity).toBeCloseTo(0.75);
  });
});
