import { db } from '../basevault/db';

export interface ModelInfo {
  id: string;
  name: string;
  context_length: number;
  pricing: any;
}

export class ModelDiscovery {
  private static cachedModels: ModelInfo[] = [];

  public static async fetchModels(): Promise<void> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models');
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      const models = data.data.map((model: any) => ({
        id: model.id,
        name: model.name,
        context_length: model.context_length,
        pricing: model.pricing,
      }));
      
      this.cachedModels = models;

      const insert = db.prepare(`
        INSERT OR REPLACE INTO discovered_models 
        (id, name, context_length, pricing_prompt, pricing_completion, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      db.exec('BEGIN IMMEDIATE');
      try {
        const now = Date.now();
        for (const model of models) {
          insert.run(
            model.id,
            model.name,
            model.context_length || 0,
            model.pricing?.prompt?.toString() || null,
            model.pricing?.completion?.toString() || null,
            now
          );
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        console.error('Error saving models to database, rolled back batch:', err);
      }
    } catch (error) {
      console.error('Error fetching OpenRouter models:', error);
    }
  }

  public static getAvailableModels(): ModelInfo[] {
    return this.cachedModels;
  }
}

export class ZenDiscoveryService {
  public static async getFreeModels(): Promise<ModelInfo[]> {
    if (ModelDiscovery.getAvailableModels().length === 0) {
      await ModelDiscovery.fetchModels();
    }
    const all = ModelDiscovery.getAvailableModels();
    return all.filter(m => 
      m.id.endsWith(':free') || 
      (m.pricing && m.pricing.prompt === '0' && m.pricing.completion === '0')
    ).sort((a, b) => (b.context_length || 0) - (a.context_length || 0));
  }
}
