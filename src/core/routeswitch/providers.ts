/**
 * Optional per-generation streaming hooks.
 *
 * Passed as the 4th (optional) argument to {@link LLMProvider.generate}. Existing
 * call sites that omit it get byte-identical behaviour to before this interface
 * existed. Only providers that expose real per-token confidence (currently the
 * local `llama-cpp` adapter) invoke {@link onTokenConfidence}; every other
 * adapter simply ignores the hooks.
 */
export interface GenerationStreamHooks {
  /**
   * Called once per generated token with that token's confidence expressed as a
   * **logprob** (the natural log of the token's probability).
   *
   * - `0`   → the model was certain (p = 1.0)
   * - `-1`  → p ≈ 0.37
   * - `-2`  → p ≈ 0.14
   *
   * This is the scale {@link AgentStopSupervisor} thresholds on
   * (`thresholdH: -1.0`), so the value can be fed straight into
   * `evaluateToken(logprob, abortController)`.
   */
  onTokenConfidence?: (logprob: number) => void;
  /**
   * Abort signal for the generation. Providers that support genuine mid-stream
   * cancellation (llama-cpp) stop local inference as soon as this is aborted,
   * so an AgentStop-triggered abort actually saves compute instead of only
   * discarding an already-completed response.
   */
  signal?: AbortSignal;
}

/**
 * Standardized capability matrix.
 * Providers self-declare what they support. All fields are optional;
 * absence means unsupported. ScopeLogic queries this before constructing
 * DAGs so it can pick the right provider for vision/tool-calling tasks
 * without guessing (Axiom 2 — Complete Technological Agnosticism).
 *
 * Never infer from provider ID — adapters must explicitly declare.
 */
export interface ProviderCapabilities {
  /** Provider can process image inputs in prompts. */
  supportsVision?: boolean;
  /** Provider can call externally-defined tools/functions. */
  supportsFunctionCalling?: boolean;
  /** Provider can return guaranteed-valid JSON via structured output. */
  supportsStructuredOutput?: boolean;
  /** Maximum context window in tokens. */
  contextWindowTokens?: number;
  /** Accepted input modalities. */
  inputTypes?: Array<'text' | 'image' | 'audio' | 'video'>;
}

/**
 * A4 (Fusion) — optional per-request body additions merged into the outgoing
 * OpenAI-compatible chat request.
 *
 * RouteSwitchEngine carries this on `RouteRequest`; the adapter merges it AFTER
 * building the canonical body and then re-pins `model`. `model`, `messages` and
 * `response_format` are refused by the adapter's denylist (see
 * `sanitizeExtraBody` in `adapters/openai-compatible.ts`), so a caller can
 * extend a request but can never hijack routing identity or the
 * structured-output contract.
 */
export type ExtraBody = Record<string, unknown>;

/**
 * Out-of-band metadata reported by a provider for a single generation call.
 * Today it only carries the upstream `X-Routed-Via` value the FreeLLMAPI router
 * returns; it stays absent for providers that expose no such header.
 */
export interface GenerationMeta {
  routedVia?: string;
}

/**
 * Richer result for callers that need observability data alongside the
 * generated text (currently PortGrid's provider self-test). Additive:
 * `generate()` keeps returning a bare string so every existing caller is
 * untouched.
 */
export interface ProviderGenerationResult {
  content: string;
  routedVia?: string;
}

export interface LLMProvider {
  id: string;
  /**
   * Declarative capability matrix. ScopeLogic reads this before DAG
   * construction to select the right provider for the task.
   * All fields optional; absence = feature unsupported.
   */
  capabilities?: ProviderCapabilities;
  /**
   * Capability flag. `true` only when {@link generate} emits real per-token
   * confidence through {@link GenerationStreamHooks.onTokenConfidence} and
   * honours {@link GenerationStreamHooks.signal} for genuine mid-stream abort.
   * Absent/`false` = the provider runs on the heuristic post-hoc fallback
   * (no real logprobs). Surfaced to the UI so the AgentStop widget can tell the
   * truth about which mode the active provider is in.
   */
  supportsStreamingConfidence?: boolean;
  generate(
    prompt: string,
    estimatedTokens: number,
    schema?: any,
    streamHooks?: GenerationStreamHooks,
    /**
     * Optional per-request body additions (A4 Fusion seam). Additive and
     * optional, exactly like `streamHooks` before it: every existing call site
     * keeps compiling and behaving unchanged.
     */
    extraBody?: ExtraBody,
  ): Promise<string>;
  /**
   * Optional richer variant of {@link generate}. Providers that can report
   * per-call observability (e.g. FreeLLMAPI's `X-Routed-Via` header) implement
   * this; callers MUST fall back to `generate()` when it is absent.
   */
  generateWithMeta?(
    prompt: string,
    estimatedTokens: number,
    schema?: any,
    streamHooks?: GenerationStreamHooks,
    extraBody?: ExtraBody,
  ): Promise<ProviderGenerationResult>;
  generateEmbedding?(text: string): Promise<Float32Array>;
}

export { MockProvider } from './adapters/mock-provider';
export { FreeLLMProvider, type FreeLLMProviderConfig } from './adapters/freellmapi';

