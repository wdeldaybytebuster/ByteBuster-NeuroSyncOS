import { OpenAICompatibleProvider, isTimeoutError } from './openai-compatible';
import { ExtraBody, GenerationStreamHooks, ProviderCapabilities, ProviderGenerationResult } from '../providers';
import { OpenCodeDiscoveryService } from '../discovery';

export interface OpenCodeProviderConfig {
  apiKey?: string;
  /** Blank or 'auto' resolves to a live free model from OpenCode Zen's catalog. */
  modelId?: string;
  /**
   * B (F7) — embedding model for `generateEmbedding` only. Zen's free chat
   * catalog and its embeddings availability are unrelated, so the chat
   * `modelId` is never reused for embeddings; absent falls back to
   * `DEFAULT_EMBEDDING_MODEL_ID`.
   */
  embeddingModelId?: string;
  /**
   * A4 — durable per-provider body default (e.g. a Fusion panel preference
   * persisted with the provider row). Subject to the SAME `sanitizeExtraBody`
   * denylist as a per-call value, so it may extend the request but can never
   * take over it. The authoritative list is `EXTRA_BODY_DENYLIST` in
   * `./openai-compatible` — six keys; the three named below are the contract
   * ones, not the whole list.
   *
   * `model` (routing identity), `messages` (the prompt) and `response_format`
   * (the structured-output schema) protect the request CONTRACT. The other
   * three — `__proto__`, `constructor`, `prototype` — are refused for a
   * different reason: writing one would be served by an inherited accessor
   * instead of becoming data, so it would retarget the prototype and vanish
   * from `Object.keys`, which is also why the sanitizer builds on
   * `Object.create(null)`.
   *
   * It is re-sanitized by `_generateWithConfig` before the merge — including for
   * every candidate in the free-model rotation below, which spreads
   * `{ ...cfg, modelId: model.id }` and therefore preserves this value.
   */
  extraBody?: ExtraBody;
}

const OPENCODE_ZEN_BASE_URL = 'https://opencode.ai/zen/v1';

/**
 * P2-1: hard cap on free-model rotation. Each candidate costs a full chat
 * timeout budget (30 s); without a cap a long catalog stalls the request
 * far past any reasonable latency.
 */
export const OPENCODE_MAX_CANDIDATES = 3;

/**
 * OpenCode Zen — a curated AI gateway (https://opencode.ai/zen). First-class
 * provider type: the user only supplies an API key (from
 * https://opencode.ai/auth); base URL and free-model selection are handled
 * internally, unlike the generic "OpenAI Compatible" type which requires the
 * user to know and enter a base URL themselves.
 */
export class OpenCodeProvider extends OpenAICompatibleProvider {
  /**
   * Capability matrix for OpenCode Zen's curated gateway (P8-4).
   *
   * Declared here, on the subclass, mirroring `LlamaCppProvider`: assigning to
   * the `readonly capabilities` property inherited from
   * `OpenAICompatibleProvider` is a compile error (TS2540), but a subclass that
   * re-declares the field may assign it inside its own constructor. Every field
   * is stated in full rather than inferred from the provider id — the resolved
   * values are the previous parent-default + override merge (vision, structured
   * output and a 128k context window).
   */
  readonly capabilities: Required<Pick<ProviderCapabilities, 'supportsVision' | 'supportsFunctionCalling' | 'supportsStructuredOutput' | 'inputTypes'>> & Partial<Pick<ProviderCapabilities, 'contextWindowTokens'>> = {
    supportsVision: true,
    supportsFunctionCalling: false,
    supportsStructuredOutput: true,
    inputTypes: ['text'] as Array<'text' | 'image' | 'audio' | 'video'>,
  };

  constructor(config: OpenCodeProviderConfig, customId?: string) {
    super({
      baseUrl: OPENCODE_ZEN_BASE_URL,
      ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
      modelId: config.modelId || 'auto',
      // B (F7) — forward the embeddings model override so a provider row that
      // sets one is not silently dropped for this type.
      ...(config.embeddingModelId !== undefined ? { embeddingModelId: config.embeddingModelId } : {}),
      // A4 — forward a config-level body default so a durable provider row is
      // not silently dropped for this type: `generate` below reads `this.config`
      // and hands it to `_generateWithConfig` (and to every candidate in the
      // rotation loop), which already sanitizes a config-level `extraBody`
      // before merging.
      ...(config.extraBody !== undefined ? { extraBody: config.extraBody } : {}),
    }, customId || 'opencode');

    // Explicit capability override (P8-4). Stated in full rather than spread
    // from the parent default — assignment is now to the concreted subclass
    // field declared above.
    this.capabilities = {
      supportsVision: true,
      supportsFunctionCalling: false,
      supportsStructuredOutput: true,
      contextWindowTokens: 128000,
      inputTypes: ['text'] as Array<'text' | 'image' | 'audio' | 'video'>,
    };
  }

  // HEURISTIC FALLBACK: `streamHooks` forwarded — see OpenAICompatibleProvider.generate.
  override async generate(
    prompt: string,
    estimatedTokens: number,
    schema?: any,
    streamHooks?: GenerationStreamHooks,
    extraBody?: ExtraBody,
  ): Promise<string> {
    const cfg = this.config;
    // A4: the per-request extraBody is threaded through EVERY call this override
    // makes — the explicit-model path and each candidate in the rotation loop
    // below — so a caller's body additions are never silently dropped just
    // because the platform had to fail over to a different free model.
    const extra = extraBody !== undefined ? { extraBody } : {};
    if (cfg.modelId && cfg.modelId.toLowerCase() !== 'auto') {
      return this._generateWithConfig(prompt, estimatedTokens, schema, cfg, streamHooks, false, extra);
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
    for (const model of freeModels.slice(0, OPENCODE_MAX_CANDIDATES)) {
      try {
        return await this._generateWithConfig(prompt, estimatedTokens, schema, { ...cfg, modelId: model.id }, streamHooks, false, extra);
      } catch (err: any) {
        lastErr = err;
        // Treat rate-limits, intermittent empty-content failures (a known issue
        // with some OpenCode Zen free models on longer prompts), and P2-1
        // transport timeouts as retriable so we advance to the next candidate
        // model. Anything else throws immediately.
        if (!/429|rate.?limit|no content|timeout|timed out/i.test(err?.message || '') && !isTimeoutError(err)) throw err;
      }
    }
    throw lastErr;
  }

  /**
   * A4/A7 — non-capturing metadata variant. OpenCode Zen does not return an
   * `X-Routed-Via` header, so this simply delegates to `generate` and returns the
   * content with no routing hint.
   *
   * Implementing it EXPLICITLY (rather than inheriting the base capture path) is
   * deliberate: the base implementation talks to `_generateWithConfig` directly
   * and would therefore bypass this override's free-model discovery/rotation
   * logic whenever the model id is `auto`.
   */
  override async generateWithMeta(
    prompt: string,
    estimatedTokens: number,
    schema?: any,
    streamHooks?: GenerationStreamHooks,
    extraBody?: ExtraBody,
  ): Promise<ProviderGenerationResult> {
    const content = await this.generate(prompt, estimatedTokens, schema, streamHooks, extraBody);
    return { content };
  }
}
