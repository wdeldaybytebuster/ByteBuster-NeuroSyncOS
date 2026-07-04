import { LLMProvider, MockProvider } from './providers';
import { OpenAICompatibleProvider } from './adapters/openai-compatible';
import { LlamaCppProvider } from './adapters/llama-cpp';
import { OpenCodeProvider } from './adapters/opencode';
import { OpenRouterProvider } from './adapters/openrouter';

/** Provider types selectable in the Set-up UI's Provider Registry. */
export const PROVIDER_TYPES = ['openai-compatible', 'llama-cpp', 'opencode', 'openrouter', 'mock'] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

/**
 * Single source of truth for turning a DB provider row (type + parsed
 * config_json + decrypted apiKey) into a live LLMProvider instance. Used by
 * the boot sequence, provider CRUD sync, and the connectivity test endpoint
 * so all call sites agree on how each provider type gets constructed instead
 * of duplicating the same if/else chain in five different places.
 */
export function instantiateProvider(
  type: string,
  config: any,
  apiKey: string | undefined,
  customId?: string
): LLMProvider {
  switch (type) {
    case 'openai-compatible':
      return new OpenAICompatibleProvider(
        { baseUrl: config.baseUrl, modelId: config.modelId || 'Auto', apiKey: apiKey || '' },
        customId
      );
    case 'llama-cpp':
      return new LlamaCppProvider(
        { modelPath: config.modelPath, contextSize: config.contextSize, gpuLayers: config.gpuLayers },
        customId
      );
    case 'opencode':
      return new OpenCodeProvider(
        { modelId: config.modelId, ...(apiKey !== undefined ? { apiKey } : {}) },
        customId
      );
    case 'openrouter':
      return new OpenRouterProvider(
        { modelId: config.modelId, ...(apiKey !== undefined ? { apiKey } : {}) },
        customId
      );
    case 'mock':
    default:
      return new MockProvider();
  }
}
