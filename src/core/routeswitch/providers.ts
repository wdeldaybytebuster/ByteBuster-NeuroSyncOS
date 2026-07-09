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

export interface LLMProvider {
  id: string;
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
  ): Promise<string>;
}

export { MockProvider } from './adapters/mock-provider';
