import { OpenAICompatibleProvider } from './openai-compatible';
import { OpenCodeDiscoveryService } from '../discovery';

export interface OpenCodeProviderConfig {
  apiKey?: string;
  /** Blank or 'auto' resolves to a live free model from OpenCode Zen's catalog. */
  modelId?: string;
}

const OPENCODE_ZEN_BASE_URL = 'https://opencode.ai/zen/v1';

/**
 * OpenCode Zen — a curated AI gateway (https://opencode.ai/zen). First-class
 * provider type: the user only supplies an API key (from
 * https://opencode.ai/auth); base URL and free-model selection are handled
 * internally, unlike the generic "OpenAI Compatible" type which requires the
 * user to know and enter a base URL themselves.
 */
export class OpenCodeProvider extends OpenAICompatibleProvider {
  constructor(config: OpenCodeProviderConfig, customId?: string) {
    super({
      baseUrl: OPENCODE_ZEN_BASE_URL,
      ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
      modelId: config.modelId || 'auto',
    }, customId || 'opencode');
  }

  override async generate(prompt: string, estimatedTokens: number, schema?: any): Promise<string> {
    const cfg = this.config;
    if (cfg.modelId && cfg.modelId.toLowerCase() !== 'auto') {
      return this._generateWithConfig(prompt, estimatedTokens, schema, cfg);
    }

    const freeModels = await OpenCodeDiscoveryService.getFreeModels();
    if (freeModels.length === 0) {
      throw new Error(
        'OpenCode Zen: no free models discovered from https://opencode.ai/zen/v1/models. ' +
        'Its free promo roster rotates — check https://opencode.ai/docs/zen/ for the current list, ' +
        'or set an explicit Model ID on this provider.'
      );
    }

    // Rotate through the other free candidates on rate-limit rather than
    // failing the whole platform because the one auto-picked model was busy
    // — same rationale as OpenRouterProvider.
    let lastErr: unknown;
    for (const model of freeModels) {
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
