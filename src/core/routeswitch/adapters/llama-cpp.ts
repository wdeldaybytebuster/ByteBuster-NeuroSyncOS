import type { Llama, LlamaChatSession, LlamaGrammar } from 'node-llama-cpp';
import { LLMProvider } from '../providers';
import { OKF_CONCEPT_EXTRACTION_GBNF } from '../../okf/generator';

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
 */
export class LlamaCppProvider implements LLMProvider {
  id: string;

  // The model/context/session are expensive to create (loading a multi-GB
  // GGUF file can take seconds to minutes), so they're loaded once and
  // reused across generate() calls for the lifetime of this instance.
  // `_sessionPromise` also de-dupes concurrent first-call races.
  private _sessionPromise: Promise<LlamaChatSession> | null = null;
  private _llamaPromise: Promise<Llama> | null = null;
  private _grammarCache = new Map<string, Promise<LlamaGrammar>>();

  constructor(private config: LlamaCppConfig, customId?: string) {
    this.id = customId || 'llama-cpp';
  }

  async generate(prompt: string, estimatedTokens: number, schema?: any): Promise<string> {
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

  private async _getLlama(): Promise<Llama> {
    if (!this._llamaPromise) {
      this._llamaPromise = import('node-llama-cpp').then(({ getLlama }) => getLlama());
    }
    return this._llamaPromise;
  }

  private async _getSession(): Promise<LlamaChatSession> {
    if (!this._sessionPromise) {
      this._sessionPromise = (async () => {
        const { LlamaChatSession } = await import('node-llama-cpp');
        const llama = await this._getLlama();
        const model = await llama.loadModel({
          modelPath: this.config.modelPath,
          ...(this.config.gpuLayers !== undefined ? { gpuLayers: this.config.gpuLayers } : {}),
        });
        const context = await model.createContext({
          contextSize: this.config.contextSize || 4096,
        });
        return new LlamaChatSession({ contextSequence: context.getSequence() });
      })();
    }
    return this._sessionPromise;
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
