import { ExtraBody, GenerationMeta, GenerationStreamHooks, LLMProvider, ProviderGenerationResult } from '../providers';
import { db } from '../../basevault/db';
import { decrypt } from '../../basevault/crypto';

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey?: string;
  modelId: string;
  /**
   * B (F7) — the model id used for EMBEDDING requests only.
   *
   * Deliberately separate from `modelId`. A chat id is not an embedding id:
   * `modelId` is routinely `'auto'` (FreeLLMAPI's router picks) or `'fusion'`
   * (this app's server-side ensemble), and neither is a model an embeddings
   * endpoint can serve — sending one produced an opaque upstream 400/404.
   * When absent the request uses `DEFAULT_EMBEDDING_MODEL_ID` (see below), never
   * the chat id.
   */
  embeddingModelId?: string;
  /** Extra static headers merged into every request (e.g. OpenRouter's HTTP-Referer/X-Title). */
  extraHeaders?: Record<string, string>;
  /**
   * A4 — static body additions applied to every request from this provider
   * instance (e.g. a durable Fusion panel preference persisted with the
   * provider row). Merged BEFORE any per-call `extraBody`, and subject to the
   * same denylist.
   */
  extraBody?: ExtraBody;
}

/**
 * A4 — body keys a caller-supplied `extraBody` may never override.
 *
 * `model` is the routing identity (re-pinned after every merge). `messages` and
 * `response_format` are the request contract this adapter owns: letting a caller
 * replace either would allow a workflow to forge the prompt or silently drop the
 * structured-output schema the caller asked for.
 *
 * `__proto__` / `constructor` / `prototype` are denied as well: writing any of
 * them into the sanitized object would otherwise either be swallowed by an
 * inherited accessor (never reaching `rejected`, and vanishing from
 * `Object.keys`) or mutate the object's prototype instead of adding data.
 */
export const EXTRA_BODY_DENYLIST = [
  'model',
  'messages',
  'response_format',
  '__proto__',
  'constructor',
  'prototype',
] as const;

/**
 * A4 — deterministic, zero-LLM guard on a caller-supplied extraBody. Returns the
 * surviving own-enumerable keys plus the names it refused.
 *
 * P8-2 intent: verification is a key check, never another model call. (The
 * Phase A plan asked for a `§VERIFY: extraBody` node between body build and
 * fetch; that sentinel is a CoreExec DAG-node classifier — see
 * `coreexec/dispatch.ts` — with no representation inside a provider adapter, so
 * inserting one here would cross the CoreExec/RouteSwitch boundary. This guard
 * plus its unit tests provide the same deterministic guarantee.)
 *
 * Non-plain inputs (`undefined`, `null`, an array, a string, a number) are
 * treated as empty, and a key whose value cannot be READ (an accessor that
 * throws) is refused rather than propagated: this function never throws, so a
 * malformed hint can never fail a request.
 */
export function sanitizeExtraBody(extra?: ExtraBody): { extra: ExtraBody; rejected: string[] } {
  // Null-prototype target: `safe['__proto__'] = v` can therefore never reach an
  // inherited setter and can never retarget the object's prototype.
  const safe: ExtraBody = Object.create(null);
  const rejected: string[] = [];
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
    return { extra: safe, rejected };
  }
  const denied = new Set<string>(EXTRA_BODY_DENYLIST);
  for (const key of Object.keys(extra)) {
    let value: unknown;
    try {
      value = (extra as Record<string, unknown>)[key];
    } catch {
      // Reading the key threw (accessor/proxy). Drop it, but report it — a
      // silently swallowed key would contradict this function's contract.
      rejected.push(key);
      continue;
    }
    if (denied.has(key)) {
      rejected.push(key);
      continue;
    }
    safe[key] = value;
  }
  return { extra: safe, rejected };
}

/**
 * A4 — observability for the guard above. A refused key is a caller typo (e.g.
 * `messages` or `model`) or an attempt to hijack the request contract, and a
 * silent drop made that undiagnosable from the app. Key NAMES only — never the
 * values, which can carry prompt-adjacent content. Emits nothing when the list
 * is empty, so the untouched path stays silent.
 *
 * Exported so the provider factory can reuse this single implementation for a
 * durable provider row's stored value (`provider-factory.ts`) instead of
 * duplicating the message: the factory is the one caller that cannot report the
 * refusal itself, because the adapter re-sanitizes an object the factory has
 * already filtered and its own `rejected` list is empty by then.
 */
export function warnOnRejectedExtraBodyKeys(rejected: string[], source: string): void {
  if (rejected.length === 0) return;
  console.warn(
    `[RouteSwitch] extraBody keys refused by the adapter guard (${source}): ` +
      `${rejected.join(', ')} — 'model', 'messages' and 'response_format' are ` +
      `adapter-owned and cannot be overridden.`
  );
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
 * B (F7) — the embedding model used when a provider row supplies no
 * `embeddingModelId`.
 *
 * `text-embedding-3-small` is the conventional OpenAI-compatible embedding id
 * (1536 dims), which is also the width the Cerebro vector store is built around
 * (`src/core/memory/cerebro/vector.ts`), so an unconfigured provider produces a
 * usable embedding instead of an error. It is a DEFAULT, not a claim: a provider
 * that serves a different embedding model sets `embeddingModelId` on its row.
 *
 * Never a chat id: `auto` and `fusion` are the two values `modelId` actually
 * holds in practice, and both are refused here.
 */
export const DEFAULT_EMBEDDING_MODEL_ID = 'text-embedding-3-small';

/**
 * B (F7) — pure, deterministic embeddings-URL builder.
 *
 * The previous inline expression appended `/v1/embeddings` to whatever
 * `baseUrl` held, so the documented FreeLLMAPI/OpenAI-shaped base URL
 * `http://host:3001/v1` produced `http://host:3001/v1/v1/embeddings` — a 404
 * from every conforming server. Root cause was that the builder assumed
 * `baseUrl` never already carried an API version prefix.
 *
 * Rules, in order:
 *   1. trailing slashes are stripped;
 *   2. a URL already ending in `/embeddings` is returned unchanged (an
 *      operator who pasted the full endpoint gets it honoured, not doubled);
 *   3. a URL already ending in `/v1` gains only `/embeddings`;
 *   4. anything else gains `/v1/embeddings`.
 *
 * Exported so the rule is pinned by a unit test rather than inferred from a
 * request mock.
 */
export function buildEmbeddingsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (trimmed.endsWith('/embeddings')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/embeddings`;
  return `${trimmed}/v1/embeddings`;
}

/**
 * B (F7) — pure, deterministic embeddings REQUEST BODY builder.
 *
 * This is the deterministic guard the plan asks for as a `§VERIFY:` key check
 * on the embeddings body. The `§VERIFY:` sentinel itself is a CoreExec DAG-node
 * classifier (`coreexec/dispatch.ts`) with no representation inside a provider
 * adapter — inserting a node here would cross the CoreExec/RouteSwitch boundary
 * — so the same guarantee is provided the way Phase A provided its `extraBody`
 * guarantee: a pure function plus unit tests that assert the exact key set.
 *
 * Two properties are enforced, both deterministic and LLM-free:
 *   1. the body contains EXACTLY `input` and `model` — no caller-supplied field
 *      can add a chat-only parameter (`messages`, `response_format`) to an
 *      embeddings request;
 *   2. `model` is never a chat id. A blank, whitespace-only, `auto`, `fusion`,
 *      or otherwise absent id falls back to `DEFAULT_EMBEDDING_MODEL_ID`.
 *
 * Rule 2 is stated as an explicit refusal list rather than a "looks like an
 * embedding model" heuristic: the two values `modelId` actually holds here are
 * `auto` and `fusion`, and guessing at unfamiliar-but-valid embedding ids would
 * break a provider whose rows legitimately use one.
 */
export function buildEmbeddingRequestBody(
  input: string,
  embeddingModelId?: string,
): { input: string; model: string } {
  const requested = typeof embeddingModelId === 'string' ? embeddingModelId.trim() : '';
  const reserved = new Set(['auto', 'fusion']);
  const model =
    requested.length === 0 || reserved.has(requested.toLowerCase())
      ? DEFAULT_EMBEDDING_MODEL_ID
      : requested;
  return { input, model };
}

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
    extraBody?: ExtraBody,
  ): Promise<string> {
    const effectiveConfig = await this._resolveEffectiveConfig();
    // Additive single options bucket rather than removing the optional
    // positional `streamHooks`: the 4 other generate overrides and every
    // existing caller keep working untouched.
    const extra = extraBody !== undefined ? { extraBody } : {};
    return this._generateWithConfig(prompt, estimatedTokens, schema, effectiveConfig, streamHooks, false, extra);
  }

  /**
   * A4/A7 — the metadata-carrying variant. `generate()` is intentionally left
   * returning a bare string; callers that need per-call observability use this
   * instead and fall back when a provider does not implement it.
   *
   * A fresh `meta` object is created per call so concurrent generations never
   * share captured state (no mutable field on `this`).
   */
  async generateWithMeta(
    prompt: string,
    estimatedTokens: number,
    schema?: any,
    streamHooks?: GenerationStreamHooks,
    extraBody?: ExtraBody,
  ): Promise<ProviderGenerationResult> {
    const effectiveConfig = await this._resolveEffectiveConfig();
    const meta: GenerationMeta = {};
    const options: { extraBody?: ExtraBody; meta: GenerationMeta } = { meta };
    if (extraBody !== undefined) options.extraBody = extraBody;
    const content = await this._generateWithConfig(
      prompt,
      estimatedTokens,
      schema,
      effectiveConfig,
      streamHooks,
      false,
      options,
    );
    return meta.routedVia !== undefined ? { content, routedVia: meta.routedVia } : { content };
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
    /**
     * A4/A7 — additive options bucket. Deliberately a single appended optional
     * parameter rather than new positional ones: the four `generate` overrides
     * and the reasoning-exhaustion retry keep compiling untouched.
     *  - `extraBody`: per-call body additions, merged AFTER the canonical body.
     *  - `meta`:      per-call out-param the caller reads once this resolves.
     */
    extra?: { extraBody?: ExtraBody; meta?: GenerationMeta },
  ): Promise<string> {
    const { baseUrl, apiKey, modelId, extraHeaders, extraBody: configExtraBody } = effectiveConfig;

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

    // A4 — merge caller-supplied body additions LAST, then re-pin `model`.
    // Merge order is deliberate: static provider config → per-call request fields
    // → canonical model. A caller can therefore extend the request (e.g. Fusion
    // panel options) but can never hijack the routing identity. `messages` and
    // `response_format` never reach this merge at all — `sanitizeExtraBody`
    // drops them (and reports them, see the warnings below), so the request
    // contract stays adapter-owned.
    // A4 — for a provider built by `provider-factory.ts` this config-level pass
    // is a provable no-op: the factory already ran the row's `config_json`
    // `extraBody` through `sanitizeExtraBody`, so `staticExtra.rejected` is
    // always empty here and the `'provider config'` warning below can never fire
    // for those instances. It remains reachable only for a DIRECTLY constructed
    // adapter carrying a raw config-level `extraBody`.
    const staticExtra = sanitizeExtraBody(configExtraBody);
    const callExtra = sanitizeExtraBody(extra?.extraBody);
    // A4 — surface anything the guard refused. Without this a caller typo
    // (`messages`, `model`) is dropped in production with zero diagnostics.
    warnOnRejectedExtraBodyKeys(staticExtra.rejected, 'provider config');
    warnOnRejectedExtraBodyKeys(callExtra.rejected, 'request extraBody');
    const requestBody: Record<string, any> = { ...body, ...staticExtra.extra, ...callExtra.extra };
    if (isAuto) {
      // Pinned absent: even when extraBody tried to set one, an `auto` request
      // must stay auto so the router remains free to choose.
      delete requestBody.model;
    } else {
      requestBody.model = modelId;
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
        body: JSON.stringify(requestBody),
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
      if (response.status === 400 && requestBody.response_format && /response_format/i.test(errorText)) {
        const { response_format: _unused, ...bodyWithoutSchema } = requestBody;
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

    // A7 — capture the upstream routing hint. FreeLLMAPI sets a non-empty
    // `X-Routed-Via` (<platform>/<model>) on every response; other
    // OpenAI-compatible endpoints may omit it entirely. Best-effort
    // observability only: the access is defensive (mocked/foreign responses may
    // have no `headers` object at all), it never throws, and it never affects
    // the returned content.
    if (extra?.meta) {
      const routedVia = response.headers?.get?.('x-routed-via');
      if (routedVia) extra.meta.routedVia = routedVia;
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
        // A7: this retry is a fresh request — clear any routing hint captured
        // from the attempt that produced no visible content, so a reported
        // `routedVia` always describes the call whose content we return.
        if (extra?.meta) delete extra.meta.routedVia;
        return this._generateWithConfig(prompt, retryTokens, schema, retryConfig, streamHooks, true, extra);
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
  }  async generateEmbedding(text: string): Promise<Float32Array> {
    const effectiveConfig = await this._resolveEffectiveConfig();
    // B (F7) — both the URL and the model come from the pure builders above.
    // The model is the row's `embeddingModelId` when it set one, else the
    // default; the chat `modelId` is never consulted, so an `auto`/`fusion`
    // chat scope cannot make an embeddings call with a chat id.
    const url = buildEmbeddingsUrl(effectiveConfig.baseUrl);

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

    const body = buildEmbeddingRequestBody(text, effectiveConfig.embeddingModelId);

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
