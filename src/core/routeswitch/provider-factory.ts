import { LLMProvider, MockProvider } from './providers';
import { OpenAICompatibleProvider, sanitizeExtraBody, warnOnRejectedExtraBodyKeys } from './adapters/openai-compatible';
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
 * A4 — pull a durable per-provider `extraBody` default off a parsed provider
 * config, if one was persisted with the row.
 *
 * Runs the SAME `sanitizeExtraBody` denylist the adapter applies to a per-call
 * value, so a stored row can never smuggle `model`/`messages`/`response_format`
 * past construction. Malformed values (`null`, a string, an array) yield no
 * `extraBody` key at all rather than an invalid one, and the conditional spread
 * keeps the result compatible with `exactOptionalPropertyTypes`.
 *
 * A refused key is REPORTED here as well, not only on the request path. This is
 * the only route by which a stored row can add ARBITRARY body fields — the row's
 * own `modelId` legitimately becomes the request's `model`, but nothing else a
 * row carries reaches the body. The adapter cannot report a refusal here: by the
 * time the adapter sanitizes the config it receives, the factory has already
 * filtered it, so the adapter's own `rejected` list is empty and a stored row's
 * mistake would be invisible.
 *
 * `type` qualifies the reported source so a refusal is attributable to the
 * provider it came from — boot constructs rows in a loop, so two different
 * rows' refusals would otherwise be indistinguishable in the log. The wording
 * matches `warnUnsupportedExtraBody`'s, and still contains the substring
 * `provider row config` that the refusal test anchors on.
 */
function staticExtraBody(config: any, type: ProviderType): { extraBody?: Record<string, unknown> } {
  const { extra: safe, rejected } = sanitizeExtraBody(config?.extraBody);
  warnOnRejectedExtraBodyKeys(rejected, `provider row config for type '${type}'`);
  return Object.keys(safe).length > 0 ? { extraBody: safe } : {};
}

/**
 * A4 — a persisted `extraBody` on a provider type that builds no chat body.
 *
 * `llama-cpp` and `mock` do not extend `OpenAICompatibleProvider`, so there is
 * no request body for a static extra body to extend: a row that persists one is
 * a configuration mistake. Ignoring it silently would be the very defect class
 * (a value accepted and then dropped) that the rest of this seam removes, so the
 * type and the surviving key NAMES are reported — never the values.
 *
 * Deliberately NOT folded into `warnOnRejectedExtraBodyKeys`: that message is
 * about the denylist refusing a key, which is a different fact from this
 * provider type having nowhere to put one. Refused keys are still reported
 * through the shared helper, so a stored `model` is never swallowed here either.
 *
 * Deliberate precedence: when every key in the value was refused, only the
 * refusal line is emitted and the "this type cannot carry one" line below is
 * skipped, because the refusal is the more specific fact. One line, not two.
 */
function warnUnsupportedExtraBody(type: ProviderType, config: any): void {
  const { extra, rejected } = sanitizeExtraBody(config?.extraBody);
  // The source names the TYPE: for a `llama-cpp`/`mock` row whose every key was
  // refused, this is the only diagnostic emitted, and it has to be attributable
  // to the provider it came from. (`warnOnRejectedExtraBodyKeys` still renders
  // key names only, never values.)
  warnOnRejectedExtraBodyKeys(rejected, `provider row config for type '${type}'`);
  const keys = Object.keys(extra);
  if (keys.length === 0) return;
  console.warn(
    `[RouteSwitch] provider row config: type '${type}' does not support a persisted ` +
      `extraBody and the value is ignored (keys: ${keys.join(', ')}).`
  );
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
        {
          baseUrl: config.baseUrl,
          modelId: config.modelId || 'Auto',
          apiKey: apiKey || '',
          ...staticExtraBody(config, 'openai-compatible'),
        },
        customId
      );
    case 'freellmapi':
      return new FreeLLMProvider(
        {
          baseUrl: config.baseUrl || 'http://localhost:3001/v1',
          ...(apiKey !== undefined ? { apiKey } : {}),
          ...(config.modelId !== undefined ? { modelId: config.modelId } : {}),
          ...staticExtraBody(config, 'freellmapi'),
        },
        customId
      );
    case 'llama-cpp':
      // A4 — this type builds no chat body, so a persisted extraBody cannot be
      // applied. Reported rather than silently ignored.
      warnUnsupportedExtraBody('llama-cpp', config);
      return new LlamaCppProvider(
        { modelPath: config.modelPath, contextSize: config.contextSize, gpuLayers: config.gpuLayers },
        customId
      );
    case 'opencode': {
      // A4 — sanitize and REPORT before the retired-type gate below. That gate
      // throws, so a malformed persisted `extraBody` on a flag-off opencode row
      // would otherwise be the one durable value this seam reports nowhere.
      // The value computed here is exactly what the arm spread before.
      const opencodeExtra = staticExtraBody(config, 'opencode');
      // P3-S1 (option C — flag only, NO removal): retired by default. This
      // throw is intentional — callers that must survive it (boot registry,
      // HTTP routes) catch per-row/per-request and continue. See
      // bootProviderRegistry's continue-never-throw discipline. Condition,
      // message and behaviour are unchanged by the reorder above.
      if (!isOpencodeZenEnabled()) {
        throw new Error(OPENCODE_RETIRED_MESSAGE);
      }
      return new OpenCodeProvider(
        {
          modelId: config.modelId,
          ...(apiKey !== undefined ? { apiKey } : {}),
          // A4 — `OpenCodeProvider` extends `OpenAICompatibleProvider`, whose
          // `_generateWithConfig` already sanitizes and merges a config-level
          // `extraBody`; passing it keeps the contract uniform across every
          // OpenAI-compatible-derived type instead of dropping a durable value.
          ...opencodeExtra,
        },
        customId
      );
    }
    case 'openrouter':
      return new OpenRouterProvider(
        {
          modelId: config.modelId,
          ...(apiKey !== undefined ? { apiKey } : {}),
          // A4 — same reasoning as the opencode arm above: this provider
          // extends `OpenAICompatibleProvider`, so a config-level `extraBody`
          // is honoured by `_generateWithConfig` once it is passed through.
          ...staticExtraBody(config, 'openrouter'),
        },
        customId
      );
    case 'mock':
      // A4 — no chat body is built for the mock provider, so a persisted
      // extraBody cannot be applied. Reported rather than silently ignored.
      warnUnsupportedExtraBody('mock', config);
      return new MockProvider();
    default:
      // P3-S1: unknown types are an explicit error — they no longer silently
      // fall back to Mock (which masked registry typos as "working offline").
      throw new Error(
        `Unknown provider type '${type}' (expected one of: ${PROVIDER_TYPES.join(', ')}).`
      );
  }
}
