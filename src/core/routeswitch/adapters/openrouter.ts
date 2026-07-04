import { OpenAICompatibleProvider } from './openai-compatible';
import { ZenDiscoveryService } from '../discovery';

export interface OpenRouterProviderConfig {
  apiKey?: string;
  /** Blank or 'auto' resolves to a live free (':free' suffix) model from OpenRouter's catalog. */
  modelId?: string;
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Attribution headers OpenRouter's docs recommend (not required for the API
// to function, but used for their public rankings/analytics).
const OPENROUTER_EXTRA_HEADERS = {
  'HTTP-Referer': 'https://github.com/wdeldaybytebuster/ByteBuster-NeuroSyncOS',
  'X-Title': 'NeuroSync Sovereign OS',
};

/**
 * OpenRouter — single-key access to hundreds of models
 * (https://openrouter.ai). First-class provider type: the user only
 * supplies an API key; base URL and free-model selection are handled
 * internally, unlike the generic "OpenAI Compatible" type.
 */
export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(config: OpenRouterProviderConfig, customId?: string) {
    super({
      baseUrl: OPENROUTER_BASE_URL,
      ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
      modelId: config.modelId || 'auto',
      extraHeaders: OPENROUTER_EXTRA_HEADERS,
    }, customId || 'openrouter');
  }

  override async generate(prompt: string, estimatedTokens: number, schema?: any): Promise<string> {
    const cfg = this.config;
    if (cfg.modelId && cfg.modelId.toLowerCase() !== 'auto') {
      return this._generateWithConfig(prompt, estimatedTokens, schema, cfg);
    }

    const freeModels = await ZenDiscoveryService.getFreeModels();
    if (freeModels.length === 0) {
      throw new Error(
        'OpenRouter: no free (":free") models discovered from https://openrouter.ai/api/v1/models. ' +
        'Set an explicit Model ID on this provider.'
      );
    }

    // Free-tier shared models are commonly rate-limited by other users —
    // live-observed 2026-07-03 ("qwen/qwen3-coder:free is temporarily
    // rate-limited upstream"). Rotate through a few other free candidates
    // before giving up, rather than failing the whole platform because the
    // one auto-picked model happened to be busy. Capped so a persistently
    // broken platform doesn't stall the request indefinitely.
    const MAX_CANDIDATES = 5;
    let lastErr: unknown;
    for (const model of freeModels.slice(0, MAX_CANDIDATES)) {
      try {
        return await this._generateWithConfig(prompt, estimatedTokens, schema, { ...cfg, modelId: model.id });
      } catch (err: any) {
        lastErr = err;
        if (!/429|rate.?limit/i.test(err?.message || '')) throw err;
      }
    }
    throw lastErr;
  }
}
