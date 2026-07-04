import { db } from '../basevault/db';

export interface ModelInfo {
  id: string;
  name: string;
  context_length: number;
  pricing: any;
  /** OpenRouter's modality metadata, e.g. { output_modalities: ['text'] }. Absent for platforms that don't report it (e.g. OpenCode Zen). */
  architecture?: { modality?: string; input_modalities?: string[]; output_modalities?: string[] };
}

/**
 * Whether a model can be used with a plain text /chat/completions call.
 * OpenRouter's free-tier catalog includes non-chat models with zero pricing
 * (e.g. `google/lyria-3-pro-preview`, a music-generation model whose
 * architecture is `text+image->text+audio`) — live-discovered 2026-07-03
 * when auto-resolution picked it and the provider 502'd with "Internal
 * error". Models without architecture metadata are assumed compatible
 * (older/incomplete catalog entries), since excluding them by default would
 * be worse than an occasional bad pick.
 */
function isChatCompletionsCompatible(m: ModelInfo): boolean {
  const outputs = m.architecture?.output_modalities;
  if (!outputs) return true;
  return outputs.includes('text') && !outputs.includes('audio') && !outputs.includes('image');
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
        architecture: model.architecture,
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
      (m.id.endsWith(':free') ||
      (m.pricing && m.pricing.prompt === '0' && m.pricing.completion === '0')) &&
      isChatCompletionsCompatible(m)
    ).sort((a, b) => (b.context_length || 0) - (a.context_length || 0));
  }
}

/**
 * OpenCode Zen's `/v1/models` catalog (unlike OpenRouter's) carries no
 * pricing/free-tier field at all — just { id, object, created, owned_by } —
 * so free-vs-paid can't be derived from the response shape. Live-probed
 * 2026-07-02: free promotional model ids follow a `-free` suffix convention
 * (deepseek-v4-flash-free, mimo-v2.5-free, nemotron-3-ultra-free,
 * north-mini-code-free), with one documented exception that doesn't
 * (`big-pickle`) per https://opencode.ai/docs/zen/. The suffix check keeps
 * newly-added `-free` models auto-detected without a code change; the
 * exception set is the only part that can go stale if OpenCode ships another
 * non-suffixed free promo — cross-check https://opencode.ai/docs/zen/ if a
 * "free" model here stops working (may have rotated back to paid).
 */
const OPENCODE_ZEN_FREE_EXCEPTIONS = new Set(['big-pickle']);

export class OpenCodeDiscoveryService {
  private static cachedModelIds: string[] = [];

  public static async fetchModelIds(): Promise<void> {
    try {
      const response = await fetch('https://opencode.ai/zen/v1/models');
      if (!response.ok) {
        throw new Error(`Failed to fetch OpenCode Zen models: ${response.statusText}`);
      }
      const data = await response.json();
      this.cachedModelIds = (data.data || []).map((m: any) => m.id as string);
    } catch (error) {
      console.error('Error fetching OpenCode Zen models:', error);
    }
  }

  public static async getFreeModels(): Promise<ModelInfo[]> {
    if (this.cachedModelIds.length === 0) {
      await this.fetchModelIds();
    }
    return this.cachedModelIds
      .filter(id => id.endsWith('-free') || OPENCODE_ZEN_FREE_EXCEPTIONS.has(id))
      .map(id => ({ id, name: id, context_length: 0, pricing: null }));
  }
}
