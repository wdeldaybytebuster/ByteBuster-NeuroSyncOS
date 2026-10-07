import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { promises as dnsPromises } from 'node:dns';
import fs from 'node:fs';
import { CerebroAssistPipeline } from './cerebro-assist';
import { ZenDiscoveryService, ModelDiscovery } from '../discovery';
import { db, initDB, dbPath } from '../../basevault/db';

// §2.3 C9 hermetic DNS: egress's address gate resolves openrouter.ai to a
// public address without touching the network (offline-safe, §4.2).
const mockDns = (): void => {
  vi.spyOn(dnsPromises, 'lookup').mockImplementation(
    async () => [{ address: '104.26.10.122', family: 4 }] as any,
  );
};

beforeAll(() => {
  initDB();
});

afterAll(() => {
  db.close();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
  if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
});

describe('CerebroAssistPipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    db.prepare("DELETE FROM system_settings WHERE key = 'external_calls_enabled'").run();
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

  // ── §2.3 C9 — the conversion proof: generateResponse goes through egress ──
  it("kill switch off → generateResponse blocked at the gate; zero HTTP, zero DNS", async () => {
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('external_calls_enabled', 'false')").run();
    // Keep getTargetModelId working so the assertion below proves CEREBO's own
    // gate fired — not the discovery layer returning an empty model list.
    vi.spyOn(ZenDiscoveryService, 'getFreeModels').mockResolvedValue([
      { id: 'free-model-1', name: 'Free Model 1', context_length: 1024, pricing: { prompt: '0', completion: '0' } },
    ]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    mockDns();

    const message = await CerebroAssistPipeline.generateResponse('hello nexus').then(
      () => null,
      (e: Error) => e.message,
    );

    expect(message).toMatch(/Egress blocked \(kill-switch\)/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dnsPromises.lookup).not.toHaveBeenCalled(); // kill switch is gate 3, DNS is gate 4
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
    db.prepare("DELETE FROM system_settings WHERE key = 'external_calls_enabled'").run();
  });

  it('should save models using BEGIN IMMEDIATE transaction', async () => {
    // We simulate fetchModels by calling it while mocking fetch.
    // §2.3 C9: fetchModels now goes through egressFetch — mock with a real
    // Response (egress reads res.headers + res.body.getReader()) and a
    // hermetic DNS answer so the address gate passes offline.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: 'test-1', name: 'Test 1', context_length: 2000, pricing: { prompt: "0", completion: "0" } },
            { id: 'test-2', name: 'Test 2', context_length: 1000, pricing: { prompt: "1", completion: "1" } }
          ]
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    mockDns();

    await ModelDiscovery.fetchModels();

    const stmt = db.prepare('SELECT count(*) as count FROM discovered_models');
    const row = stmt.get() as { count: number };
    expect(row.count).toBe(2);
  });
});
