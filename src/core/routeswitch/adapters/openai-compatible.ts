import { GenerationStreamHooks, LLMProvider } from '../providers';
import { db } from '../../basevault/db';
import { decrypt } from '../../basevault/crypto';

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey?: string;
  modelId: string;
  /** Extra static headers merged into every request (e.g. OpenRouter's HTTP-Referer/X-Title). */
  extraHeaders?: Record<string, string>;
}

/**
 * Floor applied to every request's `max_tokens` regardless of the caller's
 * `estimatedTokens`. Raised from 512 → 1024 (2026-07-10): live testing against
 * OpenCode Zen's free catalog (see docs/implementation-plan-and-progress-tracker.md,
 * "OpenCode Zen" entries) found a longer/complex chat prompt consistently
 * failing with "LLM API returned no content in response" while a trivial
 * prompt succeeded. Root cause is a combination of (a) several call sites
 * requesting well under the old 512 floor (Cerebro chat: 300, Cerebro
 * reflection: 150) and (b) many "free" routed models on these gateways being
 * reasoning models that spend hidden chain-of-thought tokens before any
 * visible answer — so a small budget can be entirely consumed by invisible
 * reasoning, leaving zero content for anything beyond a trivial prompt. 1024
 * gives meaningfully more headroom without materially changing cost for
 * scopes that already request more (CoreExec: 1000, ScopeLogic DAG: 2000, OKF:
 * 8000 all still dominate this floor). See also the reasoning-exhaustion
 * retry in `_generateWithConfig` below, which is the primary defense for
 * prompts that still blow through this floor.
 */
const DEFAULT_MAX_TOKENS_FLOOR = 1024;

/**
 * Once, if a response comes back with empty/missing `content` AND clear
 * evidence the model burned its entire budget on hidden reasoning (rather
 * than a genuine API problem), retry with this multiplier applied to the
 * original max_tokens, capped at `REASONING_RETRY_CAP`. Bounded and
 * self-limiting: only fires when the specific failure signature is present,
 * and only once per call.
 */
const REASONING_RETRY_MULTIPLIER = 4;
const REASONING_RETRY_CAP = 8000;

/**
 * P2-1 — raw AbortSignal.timeout budgets (NOT egressFetch: LLM traffic to
 * user-configured/public gateways must not pass the kill-switch, the
 * private-address block, or the auth-stripping redirect rules — those are
 * the governed-egress door for agent fetch/scrape, not for provider calls).
 * Chat (completions) gets 30 s; embeddings get 15 s.
 *
 * P3-S4 (D12) — this is the PERMANENT provider contract, not a deferral: KEEP
 * raw-with-timeout. Per-attempt `errorText` diagnostics (chat + embeddings
 * error paths below), per-attempt budgets with AgentStop-vs-TimeoutError
 * semantics, and public-gateway compat outweigh uniformity — no `egressFetch`
 * provider lane is planned. The check-7 allowlist entry for `adapters/` is
 * retained as permanent for the same reason.
 */
export const OPENAI_COMPAT_TIMEOUT_MS =
  Number(process.env.OPENAI_COMPAT_TIMEOUT_MS) || 30_000;
export const OPENAI_COMPAT_EMBEDDING_TIMEOUT_MS =
  Number(process.env.OPENAI_COMPAT_EMBEDDING_TIMEOUT_MS) || 15_000;

/**
 * P2-1 — TimeoutError classifier. True for native timeout aborts
 * (AbortSignal.timeout rejects with a DOMException named 'TimeoutError'),
 * for the normalized timeout errors this adapter throws, and for anything
 * carrying such a failure as its cause. AgentStop/operator aborts surface
 * as 'AbortError' and are deliberately NOT timeouts.
 */
export function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if ((err as { name?: unknown }).name === 'TimeoutError') return true;
  const code = (err as { code?: unknown }).code;
  if (code === 'TimeoutError' || code === 23) return true;
  const message = (err as { message?: unknown }).message;
  if (typeof message === 'string' && /timed out after \d+ms|TimeoutError/i.test(message)) return true;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && cause !== err) return isTimeoutError(cause);
  return false;
}

/**
 * P2-1 — combine the adapter-owned timeout signal with the engine-owned
 * streamHooks.signal (AgentStop cancellation). The engine keeps
 * AbortController ownership; this adapter never creates a controller of its
 * own, it only derives a linked signal. Falls back to a manual link when
 * AbortSignal.any is unavailable on the runtime.
 */
function combineSignals(timeoutSignal: AbortSignal, parent?: AbortSignal): AbortSignal {
  if (!parent) return timeoutSignal;
  const anyFn = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === 'function') return anyFn.call(AbortSignal, [timeoutSignal, parent]);
  const controller = new AbortController();
  const forward = (): void => {
    try {
      controller.abort(parent.aborted ? parent.reason : timeoutSignal.reason);
    } catch { /* already aborted */ }
  };
  if (timeoutSignal.aborted || parent.aborted) forward();
  else {
    timeoutSignal.addEventListener('abort', forward, { once: true });
    parent.addEventListener('abort', forward, { once: true });
  }
  return controller.signal;
}

/**
 * P2-1 — normalize a fetch rejection into a named TimeoutError when the
 * timeout signal fired (or the rejection already is one); otherwise rethrow
 * untouched. Declared `: never` — it always throws.
 */
function rethrowAsTimeoutIfTimedOut(err: unknown, timeoutSignal: AbortSignal, budgetMs: number, label: string): never {
  if (timeoutSignal.aborted || isTimeoutError(err)) {
    const timeoutErr = new Error(`LLM request timed out after ${budgetMs}ms (${label})`);
    timeoutErr.name = 'TimeoutError';
    throw timeoutErr;
  }
  throw err;
}

export class OpenAICompatibleProvider implements LLMProvider {
  id: string;

  /**
   * Capability matrix for this adapter.
   * Text-only by default; subclasses (e.g. OpenRouterProvider) may override
   * with model-specific values once they resolve the active model.
   * Structured output is supported via the `response_format` field in the
   * OpenAI-compatible request schema.
   */
  readonly capabilities = {
    supportsVision: false,
    supportsFunctionCalling: false,
    supportsStructuredOutput: true,
    inputTypes: ['text'] as Array<'text' | 'image' | 'audio' | 'video'>,
  };

  constructor(protected config: OpenAICompatibleConfig, customId?: string) {
    this.id = customId || 'openai-compatible';
  }

  /**
   * Hook for subclasses that front a fixed platform (e.g. OpenCode Zen,
   * OpenRouter) to resolve a placeholder modelId ('auto'/blank) into a real
   * model id before the request goes out — those platforms don't understand
   * a literal "auto" the way a smart local proxy does. Default: no-op.
   */
  protected async _resolveEffectiveConfig(): Promise<OpenAICompatibleConfig> {
    return this.config;
  }

  /**
   * HEURISTIC FALLBACK, not real per-token confidence: this HTTP path does not
   * (yet) request streaming logprobs, so `streamHooks` is intentionally ignored.
   * The OpenAI Chat Completions API *does* define `"stream": true` + `"logprobs":
   * true` returning `choices[].logprobs.content[].logprob` per SSE chunk, but
   * whether a given self-hosted / free-tier endpoint behind `baseUrl` actually
   * honours it cannot be verified here without a live key, so we do not claim it
   * works. RouteSwitchEngine falls back to its post-hoc heuristic for this
   * provider (see engine.ts). `supportsStreamingConfidence` is left unset (false).
   */
  async generate(
    prompt: string,
    estimatedTokens: number,
    schema?: any,
    streamHooks?: GenerationStreamHooks,
  ): Promise<string> {
    const effectiveConfig = await this._resolveEffectiveConfig();
    return this._generateWithConfig(prompt, estimatedTokens, schema, effectiveConfig, streamHooks);
  }

  /**
   * The actual request logic, parameterized on an explicit resolved config
   * rather than reading `this.config`/`_resolveEffectiveConfig()` directly.
   * Lets subclasses (OpenCodeProvider, OpenRouterProvider) retry against a
   * *different* candidate model on rate-limit without any shared mutable
   * state or re-triggering discovery.
   *
   * P2-1: `streamHooks` (engine-owned AbortController signal) is threaded
   * through — including into the reasoning-exhaustion retry — and combined
   * with the adapter-owned AbortSignal.timeout via AbortSignal.any.
   */
  protected async _generateWithConfig(
    prompt: string,
    estimatedTokens: number,
    schema: any,
    effectiveConfig: OpenAICompatibleConfig,
    streamHooks?: GenerationStreamHooks,
    /**
     * Internal-only: set when this call is the one-shot retry after a
     * reasoning-exhaustion detection, so we don't retry a retry. Not part of
     * the public LLMProvider contract; every existing call site omits it and
     * gets identical behaviour to before this parameter existed.
     */
    _isReasoningRetry = false,
  ): Promise<string> {
    const { baseUrl, apiKey, modelId, extraHeaders } = effectiveConfig;

    // Graceful offline fallback if no baseUrl is configured
    if (!baseUrl) {
      return `[MOCK OFFLINE] No provider configured. Prompt received: "${prompt.substring(0, 40)}..."`;
    }

    const isAuto = modelId.toLowerCase() === 'auto';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    let finalApiKey = apiKey || process.env.OPENAI_API_KEY;
    if (!finalApiKey) {
      try {
        const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('llm_api_key') as {value: string} | undefined;
        if (row) {
          finalApiKey = decrypt(row.value);
        }
      } catch (e) {
        console.error('Failed to get llm_api_key from db', e);
      }
    }

    if (finalApiKey) {
      headers['Authorization'] = `Bearer ${finalApiKey}`;
    }

    if (extraHeaders) {
      Object.assign(headers, extraHeaders);
    }

    const maxTokens = Math.max(estimatedTokens, DEFAULT_MAX_TOKENS_FLOOR);
    const body: Record<string, any> = {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      // Lower temperature for schema-constrained requests: not every
      // OpenAI-compatible backend actually enforces json_schema/strict at
      // the token level, so a high temperature on those still risks
      // malformed JSON (unescaped quotes, trailing commas, truncated
      // structure). Free-form prompts keep the more creative default.
      temperature: schema ? 0.2 : 0.7,
      enable_thinking: false, // Prevent syntax crashes
    };

    if (schema) {
      // Support for structured outputs
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'dag_response',
          strict: true,
          schema: schema
        }
      };
    }

    // When modelId is 'auto', omit the field — FreeLLMAPI/proxy will choose
    if (!isAuto) {
      body.model = modelId;
    }

    let url = baseUrl.replace(/\/$/, '');
    if (!url.endsWith('/v1/chat/completions')) {
      if (url.endsWith('/v1')) {
        url += '/chat/completions';
      } else {
        url += '/v1/chat/completions';
      }
    }

    // P2-1: raw AbortSignal.timeout for the whole chat attempt, combined
    // with the engine-owned streamHooks.signal (AgentStop) via AbortSignal.any.
    const timeoutSignal = AbortSignal.timeout(OPENAI_COMPAT_TIMEOUT_MS);
    const signal = combineSignals(timeoutSignal, streamHooks?.signal);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      rethrowAsTimeoutIfTimedOut(err, timeoutSignal, OPENAI_COMPAT_TIMEOUT_MS, 'chat completions');
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');

      // Some backends 400 specifically on the response_format/json_schema
      // parameter even though the rest of the request is fine — live-observed
      // on OpenCode Zen's 'big-pickle' free model (proxies to DeepSeek):
      // "This response_format type is unavailable now". Retry once without
      // it rather than failing outright; the prompt already instructs
      // "output ONLY a valid JSON array" and OKFGenerator's parser strips
      // markdown fences/preamble, so best-effort JSON still usually works.
      if (response.status === 400 && body.response_format && /response_format/i.test(errorText)) {
        const { response_format: _unused, ...bodyWithoutSchema } = body;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(bodyWithoutSchema),
            signal,
          });
        } catch (err) {
          rethrowAsTimeoutIfTimedOut(err, timeoutSignal, OPENAI_COMPAT_TIMEOUT_MS, 'chat completions');
        }
        if (!response.ok) {
          const retryErrorText = await response.text().catch(() => 'unknown error');
          throw new Error(`LLM API error ${response.status}: ${retryErrorText}`);
        }
      } else {
        throw new Error(`LLM API error ${response.status}: ${errorText}`);
      }
    }

    const data = await response.json() as any;
    const choice = data?.choices?.[0];
    const content = choice?.message?.content;

    if (!content) {
      // Some OpenAI-compatible backends front reasoning models (DeepSeek-R1
      // style distillations are common on free routed catalogs like OpenCode
      // Zen / OpenRouter) that stream hidden chain-of-thought into a
      // provider-specific field — `message.reasoning_content` (DeepSeek's own
      // convention) or `message.reasoning` / a top-level `choice.reasoning`
      // (OpenRouter's normalized shape) — separate from `message.content`.
      // If the model hits `max_tokens` while still "thinking", `content`
      // comes back empty/undefined even though the request nominally
      // succeeded (HTTP 200): finish_reason is 'length' and one of those
      // reasoning fields is non-empty. That is a token-budget problem, not a
      // real API failure, so it deserves a different response than the
      // generic "no content" error below (which must still fire for an
      // actually-empty, non-reasoning response so a genuine provider problem
      // is never silently misreported as a budget issue).
      const reasoningText: string | undefined =
        choice?.message?.reasoning_content || choice?.message?.reasoning || choice?.reasoning;
      const finishReason = choice?.finish_reason;
      const isReasoningExhaustion = finishReason === 'length' && !!reasoningText;

      if (isReasoningExhaustion && !_isReasoningRetry) {
        // One bounded retry with a much larger budget before giving up.
        // P2-1: streamHooks threads through so the retry gets a fresh timeout
        // budget combined with the same engine-owned abort signal.
        const retryConfig: OpenAICompatibleConfig = { ...effectiveConfig };
        const retryTokens = Math.min(maxTokens * REASONING_RETRY_MULTIPLIER, REASONING_RETRY_CAP);
        return this._generateWithConfig(prompt, retryTokens, schema, retryConfig, streamHooks, true);
      }

      if (isReasoningExhaustion) {
        const retriedNote = _isReasoningRetry ? ' (already retried once with a larger budget)' : '';
        throw new Error(
          `LLM API returned no visible content: the model spent its entire token budget ` +
          `(max_tokens=${maxTokens}) on hidden reasoning (finish_reason=length) before producing ` +
          `any visible answer${retriedNote}. This scope's estimatedTokens is likely too low for a ` +
          `reasoning-capable model on this prompt.`
        );
      }

      throw new Error('LLM API returned no content in response');
    }

    return content;
  }

  async generateEmbedding(text: string): Promise<Float32Array> {
    const effectiveConfig = await this._resolveEffectiveConfig();
    const url = effectiveConfig.baseUrl.endsWith('/')
      ? `${effectiveConfig.baseUrl}v1/embeddings`
      : `${effectiveConfig.baseUrl}/v1/embeddings`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...effectiveConfig.extraHeaders,
    };
    if (effectiveConfig.apiKey) {
      const apiKey = effectiveConfig.apiKey.startsWith('enc:') 
        ? decrypt(effectiveConfig.apiKey) 
        : effectiveConfig.apiKey;
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const body = {
      input: text,
      model: effectiveConfig.modelId, // or a specific embedding model if configured, but for now we use modelId
    };

    // P2-1: raw AbortSignal.timeout for embeddings (15 s budget).
    const embeddingTimeout = AbortSignal.timeout(OPENAI_COMPAT_EMBEDDING_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: embeddingTimeout,
      });
    } catch (err) {
      rethrowAsTimeoutIfTimedOut(err, embeddingTimeout, OPENAI_COMPAT_EMBEDDING_TIMEOUT_MS, 'embeddings');
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');
      throw new Error(`Embedding API error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as any;
    const embedding = data?.data?.[0]?.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      throw new Error('Embedding API returned invalid or no embedding data');
    }

    return new Float32Array(embedding);
  }
}
