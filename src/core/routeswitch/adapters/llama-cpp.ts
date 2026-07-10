import type {
  Llama,
  LlamaModel,
  LlamaChatSession,
  LlamaContextSequence,
  LlamaGrammar,
  ChatWrapper,
  Token,
} from 'node-llama-cpp';
import { GenerationStreamHooks, LLMProvider } from '../providers';
import { OKF_CONCEPT_EXTRACTION_GBNF } from '../../okf/generator';
import { consumeConfidenceStream } from '../confidence';

export interface LlamaCppConfig {
  /** Path to the .gguf model file. Default discovery directory: ./local_models/ */
  modelPath: string;
  contextSize?: number;
  gpuLayers?: number;
  temperature?: number;
  grammar?: string; // Custom GBNF grammar for constrained decoding
}

/**
 * Local GGUF model provider via node-llama-cpp.
 *
 * CRITICAL: When a `schema` or `grammar` is provided, this provider MUST enforce
 * GBNF grammar-constrained decoding at the token level. This is NOT best-effort —
 * it guarantees the model output is syntactically valid JSON/YAML.
 *
 * The grammar is passed directly to node-llama-cpp's createGrammar() API which
 * zeros out logit probabilities for any token that would violate the grammar at
 * each generation step.
 *
 * PREEMPTIVE TERMINATION (real per-token confidence): this is the one adapter
 * where we have full local control over the decode loop, so it is the only one
 * that reports *real* per-token confidence. When `streamHooks` is supplied
 * (always, from RouteSwitchEngine), generation runs through the low-level
 * `LlamaContextSequence.evaluateWithMetadata({ confidence: true })` API — the
 * only node-llama-cpp v3 surface that exposes per-token probability. Each
 * token's probability is converted to a logprob and streamed to
 * `streamHooks.onTokenConfidence`, and `streamHooks.signal` genuinely stops
 * local inference mid-generation (breaking the generator halts llama.cpp, so an
 * AgentStop abort saves real compute). The high-level `LlamaChatSession.prompt`
 * API cannot do this: its `onToken`/`onTextChunk` callbacks expose token IDs
 * only, no confidence.
 */
export class LlamaCppProvider implements LLMProvider {
  id: string;

  /**
   * Real per-token confidence is available from this adapter, so the AgentStop
   * supervisor runs in genuine preemptive mode here (not the heuristic fallback
   * the HTTP/synthetic adapters are limited to). Surfaced to the UI.
   */
  readonly supportsStreamingConfidence = true;

  // The model/context/session are expensive to create (loading a multi-GB
  // GGUF file can take seconds to minutes), so they're loaded once and
  // reused across generate() calls for the lifetime of this instance.
  // `_sessionPromise` also de-dupes concurrent first-call races.
  private _modelPromise: Promise<{ llama: Llama; model: LlamaModel }> | null = null;
  private _sessionPromise: Promise<LlamaChatSession> | null = null;
  private _streamCtxPromise: Promise<{
    model: LlamaModel;
    sequence: LlamaContextSequence;
    wrapper: ChatWrapper;
  }> | null = null;
  private _llamaPromise: Promise<Llama> | null = null;
  private _grammarCache = new Map<string, Promise<LlamaGrammar>>();

  constructor(private config: LlamaCppConfig, customId?: string) {
    this.id = customId || 'llama-cpp';
  }

  async generate(
    prompt: string,
    estimatedTokens: number,
    schema?: any,
    streamHooks?: GenerationStreamHooks,
  ): Promise<string> {
    // Preemptive path: real per-token confidence + genuine mid-stream abort.
    // RouteSwitchEngine always passes streamHooks, so this is the normal path.
    if (streamHooks && (streamHooks.onTokenConfidence || streamHooks.signal)) {
      return this._generateStreaming(prompt, estimatedTokens, schema, streamHooks);
    }

    // Fallback path (no hooks — e.g. Council mode / direct callers): the proven
    // high-level chat-session API. No per-token confidence available here.
    return this._generateWithSession(prompt, estimatedTokens, schema);
  }

  /** High-level path: chat session with grammar-constrained decoding. */
  private async _generateWithSession(prompt: string, estimatedTokens: number, schema?: any): Promise<string> {
    const session = await this._getSession();

    const activeGrammar = this._resolveGrammar(schema);
    const grammarInstance = activeGrammar ? await this._getGrammar(activeGrammar) : undefined;

    const response = await session.prompt(prompt, {
      maxTokens: Math.max(estimatedTokens, 512),
      temperature: this.config.temperature ?? 0.7,
      // Forces syntactically valid output at the token level; omit the key
      // entirely (rather than passing `undefined`) under exactOptionalPropertyTypes.
      ...(grammarInstance ? { grammar: grammarInstance } : {}),
    });

    return response;
  }

  /**
   * Low-level path: drives the decode loop ourselves via `evaluateWithMetadata`
   * so we get real per-token confidence AND can genuinely stop generation the
   * instant AgentStop aborts.
   *
   * Uses a dedicated context sequence (separate from the chat session's) so the
   * manual evaluation never corrupts the session's internal history tracking.
   */
  private async _generateStreaming(
    prompt: string,
    estimatedTokens: number,
    schema: any,
    streamHooks: GenerationStreamHooks,
  ): Promise<string> {
    const { model, sequence, wrapper } = await this._getStreamCtx();

    // Fresh generation each call — clear any state from a previous prompt.
    await sequence.clearHistory();

    // Grammar-constrained decoding is preserved on this path too: the grammar
    // evaluation state is advanced by evaluateWithMetadata as tokens sample.
    const activeGrammar = this._resolveGrammar(schema);
    let grammarEvaluationState;
    if (activeGrammar) {
      const grammarInstance = await this._getGrammar(activeGrammar);
      const { LlamaGrammarEvaluationState } = await import('node-llama-cpp');
      grammarEvaluationState = new LlamaGrammarEvaluationState({ model, grammar: grammarInstance });
    }

    // Render the prompt through the model's chat template (system/user/assistant
    // turns) exactly like LlamaChatSession would, so generation quality matches
    // the high-level path — then tokenize the rendered context.
    //
    // The trailing empty `model` turn is REQUIRED: it makes the wrapper emit the
    // assistant-turn opener (e.g. gemma's `<start_of_turn>model\n`) so the model
    // generates a response. Without it the rendered context looks like a
    // completed user turn and the model immediately emits an end-of-turn token,
    // producing an empty result (verified against the local gemma GGUF). This
    // mirrors how node-llama-cpp's own LlamaChat primes generation.
    const contextState = wrapper.generateContextState({
      chatHistory: [
        { type: 'user', text: prompt },
        { type: 'model', response: [] },
      ],
    });
    const promptTokens = contextState.contextText.tokenize(model.tokenizer);

    const maxTokens = Math.max(estimatedTokens, 512);

    const generator = sequence.evaluateWithMetadata(
      promptTokens,
      { confidence: true },
      {
        temperature: this.config.temperature ?? 0.7,
        ...(grammarEvaluationState ? { grammarEvaluationState } : {}),
      },
    );

    const result = await consumeConfidenceStream<Token>(generator, {
      isEog: (token) => model.isEogToken(token),
      onLogprob: (logprob) => streamHooks.onTokenConfidence?.(logprob),
      isAborted: () => streamHooks.signal?.aborted ?? false,
      maxTokens,
    });

    // When aborted mid-stream we return the partial text generated so far rather
    // than throwing — the engine treats a terminated generation as a
    // low-confidence result, which is more useful than a hard error.
    return model.detokenize(result.tokens);
  }

  private async _getLlama(): Promise<Llama> {
    if (!this._llamaPromise) {
      this._llamaPromise = import('node-llama-cpp').then(({ getLlama }) => getLlama());
    }
    return this._llamaPromise;
  }

  /** Load the (expensive) GGUF model once, shared by both generation paths. */
  private async _getModel(): Promise<{ llama: Llama; model: LlamaModel }> {
    if (!this._modelPromise) {
      this._modelPromise = (async () => {
        const llama = await this._getLlama();
        const model = await llama.loadModel({
          modelPath: this.config.modelPath,
          ...(this.config.gpuLayers !== undefined ? { gpuLayers: this.config.gpuLayers } : {}),
        });
        return { llama, model };
      })();
    }
    return this._modelPromise;
  }

  private async _getSession(): Promise<LlamaChatSession> {
    if (!this._sessionPromise) {
      this._sessionPromise = (async () => {
        const { LlamaChatSession } = await import('node-llama-cpp');
        const { model } = await this._getModel();
        const context = await model.createContext({
          contextSize: this.config.contextSize || 4096,
        });
        return new LlamaChatSession({ contextSequence: context.getSequence() });
      })();
    }
    return this._sessionPromise;
  }

  /** Dedicated context + sequence + resolved chat wrapper for the streaming path. */
  private async _getStreamCtx(): Promise<{
    model: LlamaModel;
    sequence: LlamaContextSequence;
    wrapper: ChatWrapper;
  }> {
    if (!this._streamCtxPromise) {
      this._streamCtxPromise = (async () => {
        const { resolveChatWrapper } = await import('node-llama-cpp');
        const { model } = await this._getModel();
        const context = await model.createContext({
          contextSize: this.config.contextSize || 4096,
        });
        const sequence = context.getSequence();
        const wrapper = resolveChatWrapper(model);
        return { model, sequence, wrapper };
      })();
    }
    return this._streamCtxPromise;
  }

  private async _getGrammar(gbnf: string): Promise<LlamaGrammar> {
    let cached = this._grammarCache.get(gbnf);
    if (!cached) {
      cached = this._getLlama().then(llama => llama.createGrammar({ grammar: gbnf }));
      this._grammarCache.set(gbnf, cached);
    }
    return cached;
  }

  /**
   * Resolve which GBNF grammar to use for this request.
   * Priority: explicit config grammar > schema-derived OKF grammar > none
   */
  private _resolveGrammar(schema?: any): string | null {
    // 1. Explicit grammar from config (custom per-provider)
    if (this.config.grammar) {
      return this.config.grammar;
    }

    // 2. If a JSON schema is provided, use the OKF concept extraction grammar
    // This ensures all structured output requests get grammar enforcement
    if (schema) {
      return OKF_CONCEPT_EXTRACTION_GBNF;
    }

    // 3. No grammar — free-form text generation
    return null;
  }
}
