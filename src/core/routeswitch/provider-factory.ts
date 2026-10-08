import { LLMProvider, MockProvider } from './providers';
import { OpenAICompatibleProvider } from './adapters/openai-compatible';
import { LlamaCppProvider } from './adapters/llama-cpp';
import { OpenCodeProvider } from './adapters/opencode';
import { OpenRouterProvider } from './adapters/openrouter';
import { FreeLLMProvider } from './adapters/freellmapi';
import { db } from '../basevault/db';

/** Provider types selectable in the Set-up UI's Provider Registry. */
export const PROVIDER_TYPES = ['openai-compatible', 'llama-cpp', 'opencode', 'openrouter', 'freellmapi', 'mock'] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

/**
 * P3-S1 (Zen option C — flag only, NO removal): system_settings key for the
 * disable-by-default Zen flag. Absent ⇒ disabled (fail-closed).
 */
export const OPENCODE_ZEN_FLAG_KEY = 'opencode_zen_enabled';

/** Explicit retired-type error surfaced whenever Zen is requested while disabled. */
export const OPENCODE_RETIRED_MESSAGE =
  "Provider type 'opencode' (OpenCode Zen) is retired and disabled by default " +
  `(flag '${OPENCODE_ZEN_FLAG_KEY}' is not enabled). Existing rows keep working ` +
  `only after an operator explicitly enables the flag via system settings. ` +
  `AGENTS.md Directive 3 stands: the adapter is NOT removed.`;

/**
 * P3-S1 — disable-by-default flag read. Fail-closed: absent, unparseable, or
 * DB-unavailable ⇒ false, so Zen can never activate by accident.
 */
export function isOpencodeZenEnabled(): boolean {
  try {
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(OPENCODE_ZEN_FLAG_KEY) as
      | { value: string }
      | undefined;
    if (!row) return false;
    return row.value === 'true' || row.value === '1';
  } catch {
    return false;
  }
}

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
    case 'freellmapi':
      return new FreeLLMProvider(
        {
          baseUrl: config.baseUrl || 'http://localhost:3001/v1',
          ...(apiKey !== undefined ? { apiKey } : {}),
          ...(config.modelId !== undefined ? { modelId: config.modelId } : {}),
        },
        customId
      );
    case 'llama-cpp':
      return new LlamaCppProvider(
        { modelPath: config.modelPath, contextSize: config.contextSize, gpuLayers: config.gpuLayers },
        customId
      );
    case 'opencode':
      // P3-S1 (option C — flag only, NO removal): retired by default. This
      // throw is intentional — callers that must survive it (boot registry,
      // HTTP routes) catch per-row/per-request and continue. See
      // bootProviderRegistry's continue-never-throw discipline.
      if (!isOpencodeZenEnabled()) {
        throw new Error(OPENCODE_RETIRED_MESSAGE);
      }
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
      return new MockProvider();
    default:
      // P3-S1: unknown types are an explicit error — they no longer silently
      // fall back to Mock (which masked registry typos as "working offline").
      throw new Error(
        `Unknown provider type '${type}' (expected one of: ${PROVIDER_TYPES.join(', ')}).`
      );
  }
}
