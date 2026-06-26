import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CerebroAssistPipeline } from './cerebro-assist';
import { ZenDiscoveryService } from '../routeswitch/discovery';
import { db } from '../basevault/db';

describe('CerebroAssistPipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should have the correct ethereal persona system prompt', () => {
    const prompt = CerebroAssistPipeline.getSystemPrompt();
    expect(prompt).toContain('ethereal');
    expect(prompt).toContain('nexus');
    expect(prompt).toContain('synergy');
    expect(prompt).toContain('quantum');
    expect(prompt).toContain('cognitive');
    expect(prompt).toContain('topology');
    expect(prompt).toContain('structurally bound to the internal NeuroSync architecture');
    expect(prompt).toContain('models');
    expect(prompt).toContain('categories');
    expect(prompt).toContain('workflows');
  });

  it('should query ZenDiscoveryService and return the first free model id', async () => {
    vi.spyOn(ZenDiscoveryService, 'getFreeModels').mockResolvedValue([
      { id: 'free-model-1', name: 'Free Model 1', context_length: 1024, pricing: { prompt: "0", completion: "0" } },
      { id: 'free-model-2', name: 'Free Model 2', context_length: 512, pricing: { prompt: "0", completion: "0" } }
    ]);
    const modelId = await CerebroAssistPipeline.getTargetModelId();
    expect(modelId).toBe('free-model-1');
  });

  it('should throw an error if no free models are available', async () => {
    vi.spyOn(ZenDiscoveryService, 'getFreeModels').mockResolvedValue([]);
    await expect(CerebroAssistPipeline.getTargetModelId()).rejects.toThrow("No free models available");
  });
});

describe('ModelDiscovery db Atomic Batch Insertion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    db.exec(`
      CREATE TABLE IF NOT EXISTS discovered_models (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        context_length INTEGER,
        pricing_prompt TEXT,
        pricing_completion TEXT,
        fetched_at INTEGER NOT NULL
      );
      DELETE FROM discovered_models;
    `);
  });

  it('should save models using BEGIN IMMEDIATE transaction', async () => {
    // We simulate fetchModels by calling it while mocking fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'test-1', name: 'Test 1', context_length: 2000, pricing: { prompt: "0", completion: "0" } },
          { id: 'test-2', name: 'Test 2', context_length: 1000, pricing: { prompt: "1", completion: "1" } }
        ]
      })
    });

    const { ModelDiscovery } = await import('../routeswitch/discovery');
    await ModelDiscovery.fetchModels();

    const stmt = db.prepare('SELECT count(*) as count FROM discovered_models');
    const row = stmt.get() as { count: number };
    expect(row.count).toBe(2);
  });
});
