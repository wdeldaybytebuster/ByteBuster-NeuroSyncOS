import { GenerationStreamHooks, LLMProvider, ProviderCapabilities } from '../providers';
import { OpenAICompatibleProvider } from './openai-compatible';

/**
 * FreeLLMAPI — self-hosted OpenAI-compatible proxy.
 *
 * The user runs their own `freellmapi` server (default dockered instance on
 * http://localhost:3001/v1) and gets a single unified bearer key from the
 * dashboard's Keys page. Every request is routed across whichever free
 * provider serves the model, with automatic failover on 429 / rate-limit /
 * daily quota / empty content, and the response carries an `X-Routed-Via`
 * header so the app can see which upstream provider/model actually served it.
 *
 * First-class provider type on the same pattern as OpenRouterProvider /
 * OpenCodeProvider: the user only supplies an API key; the base URL and the
 * model selection strategy are baked in. This matches the README quick-start
 * contract exactly:
 *   OpenAI(base_url="http://localhost:3001/v1", api_key="freellmapi-...")
 *   model="auto"   # let the router pick; or "auto:fast", "auto:smart", a profile,
 *                  # or a literal model id from freellmapi.co/models
 *
 * Capability matrix (P8-4). Declared on the subclass in full, mirroring
 * OpenCodeProvider / OpenRouterProvider, rather than inferred from the provider
 * id. FreeLLMAPI fronts a large catalog of hosted models, several of which
 * support tools / vision / large context, but the capabilities of the specific
 * model actually serving a given `auto` request are not knowable at construction
 * time — so we declare aggressively (the safest conservative-on-detail,
 * aggressive-on-capability stance for a router that fronts rich upstream models).
 */
const FREELLMAPI_BASE_URL = 'http://localhost:3001/v1';

export interface FreeLLMProviderConfig {
  /**
   * Base URL for the FreeLLMAPI instance. Defaults to the baked-in
   * http://localhost:3001/v1 when absent. The factory can pass an explicit value
   * (e.g. a non-default host/port) and the constructor falls back to the baked
   * default — but the factory's passed value always wins when present.
   */
  baseUrl?: string;
  /**
   * Unified FreeLLMAPI API key (the `freellmapi-...` bearer token from the
   * dashboard's Keys page). If absent, the adapter falls back to the shared
   * system-level `llm_api_key` setting just like every OpenAICompatibleProvider.
   */
  apiKey?: string;
  /**
   * Optional explicit model id — a literal model id from
   * https://freellmapi.co/models (e.g. "deepseek-ai/DeepSeek-V3.2",
   * "openai/gpt-oss-120b", "nvidia/nemotron-3-ultra",
   * "google/gemma-4-26b-a4b-it").
   *
   * Absent or "auto" → let the FreeLLMAPI router pick the best available free
   * model and fail over automatically. Other well-known routing strategies
   * ("auto:fast", "auto:smart", named profiles) are also accepted because the
   * router passes them through to its upstream providers verbatim; we keep the
   * existing `_generateWithConfig` machinery (which treats every non-"auto" id
   * literally) for those cases too.
   *
   * Because explicit model ids can front reasoning-capable models (DeepSeek-R1
   * distillations are common on the catalog), the parent's reasoning-exhaustion
   * retry and the 400-response_format rescue still apply — no new retry logic
   * needed.
   */
  modelId?: string;
}

export class FreeLLMProvider extends OpenAICompatibleProvider {
  /**
   * Capability matrix for this adapter (P8-4). Declared on the subclass with an
   * initializer, mirroring OpenRouterProvider / OpenCodeProvider: assigning to
   * the `readonly capabilities` property inherited from
   * `OpenAICompatibleProvider` is a compile error (TS2540), but a subclass that
   * re-declares the field with an initializer shadows the base property entirely
   * and may assign it inside its own constructor. The capabilities of the
   * specific model actually serving an `auto` request are not knowable at
   * construction time, so we declare aggressively (the safest conservative-on-detail,
   * aggressive-on-capability stance for a router that fronts rich upstream models).
   */
  readonly capabilities: Required<Pick<ProviderCapabilities, 'supportsVision' | 'supportsFunctionCalling' | 'supportsStructuredOutput' | 'inputTypes'>> & Partial<Pick<ProviderCapabilities, 'contextWindowTokens'>> = {
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStructuredOutput: true,
    inputTypes: ['text', 'image'] as Array<'text' | 'image' | 'audio' | 'video'>,
  };

  constructor(config: FreeLLMProviderConfig, customId?: string) {
    super(
      {
        baseUrl: config.baseUrl || FREELLMAPI_BASE_URL,
        ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
        modelId: config.modelId || 'auto',
      },
      customId || 'freellmapi'
    );

    // Explicit capability override (P8-4). Stated in full rather than spread
    // from the parent default — assignment is now to the concreted subclass
    // field declared above.
    this.capabilities = {
      supportsVision: true,
      supportsFunctionCalling: true,
      supportsStructuredOutput: true,
      contextWindowTokens: 128000,
      inputTypes: ['text', 'image'] as Array<'text' | 'image' | 'audio' | 'video'>,
    };
  }

  override async generate(
    prompt: string,
    estimatedTokens: number,
    schema?: any,
    _streamHooks?: GenerationStreamHooks,
  ): Promise<string> {
    const response = await this._generateWithConfig(prompt, estimatedTokens, schema, this.config);
    // Best-effort observability: surface which upstream provider/model actually
    // served the request. FreeLLMAPI returns a non-empty `X-Routed-Via` header
    // on every response (<platform>/<model>); when the user has set an explicit
    // model id the served model is already known, so logging is only actionable
    // for the auto-routed case. Harmless when the header is absent (non-FreeLLM
    // compatible upstream) — we never throw on its absence.
    if (this.config.modelId?.toLowerCase() === 'auto') {
      console.log('[FreeLLMAPI] routed-via: (auto) — upstream provider/model selected by the FreeLLMAPI router (see X-Routed-Via on the actual response for the exact upstream).');
    }
    return response;
  }
}
