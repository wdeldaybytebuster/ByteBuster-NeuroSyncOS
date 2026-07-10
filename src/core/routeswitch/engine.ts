import crypto from 'crypto';
import { FreeModeGovernor } from './governor';
import { GenerationStreamHooks, LLMProvider, MockProvider } from './providers';
import { TriageClassifier } from './triage';
import { ConsensusSynthesizer } from './council';
import { AgentStopSupervisor } from './agent-stop';
import { selectOptimalModel, Benchmark, Model } from './model-selector/dynamic-router';
import { db } from '../basevault/db';
import { ProviderHealthState } from './interceptor';
import { OKFGraphQuery } from '../okf/graph-query';
import { log } from '../observability/logger';

export interface RouteRequest {
  prompt: string;
  estimatedTokens: number;
  responseSchema?: any;
  /**
   * OQ-001: Optional model-selection hints. When both are provided, RouteSwitchEngine
   * will call selectOptimalModel() to pick the best available model before routing.
   */
  complexity?: 'trivial' | 'logical' | 'complex';
  userPriority?: 'speed' | 'cost' | 'intelligence';
  /**
   * Scope-aware routing context. Used by resolveProviderChain() to look up
   * the correct fallback chain from llm_routing_rules.
   * Hierarchy: agent > project > cerebro > global
   */
  scope?: 'cerebro' | 'agent';
  scopeId?: string;
  projectId?: string;
}

export interface RouteResponse {
  content: string;
  provider: string;
  tokensUsed: number;
  /** Numeric confidence, 0.0-1.0. */
  confidence?: number;
  isCouncilMode?: boolean;
}

export class RouteSwitchEngine {
  private governor: FreeModeGovernor;
  private provider: LLMProvider;
  private councilProviders: LLMProvider[] = [];
  private agentStop: AgentStopSupervisor;

  constructor(governor?: FreeModeGovernor, provider?: LLMProvider) {
    this.governor = governor || new FreeModeGovernor();
    this.provider = provider || new MockProvider();
    this.agentStop = new AgentStopSupervisor({ thresholdH: -1.0, consecutiveTokens: 3 });
  }

  /** Registered providers keyed by id for model selection and fallback resolution. */
  private providerRegistry: Map<string, LLMProvider> = new Map();

  public setProvider(provider: LLMProvider) {
    this.provider = provider;
    this.providerRegistry.set(provider.id, provider);
  }

  public setCouncilProviders(providers: LLMProvider[]) {
    this.councilProviders = providers;
    for (const p of providers) this.providerRegistry.set(p.id, p);
  }

  /** Register a provider into the registry without making it the active primary. */
  public registerProvider(provider: LLMProvider) {
    this.providerRegistry.set(provider.id, provider);
  }

  /** Get a snapshot of all registered provider IDs (for diagnostics / UI). */
  public getRegisteredProviderIds(): string[] {
    return Array.from(this.providerRegistry.keys());
  }

  /**
   * Resolve the fallback provider chain for a request based on scope hierarchy.
   * Queries llm_routing_rules: agent > project > cerebro > global.
   * Returns an ordered array of LLMProvider instances (position 0 = primary).
   * Falls back to [this.provider] if no rules are configured.
   */
  public resolveProviderChain(request: RouteRequest): LLMProvider[] {
    try {
      // Try scopes in priority order: agent → project → cerebro → global
      const scopeChecks: { scope: string; scopeId: string | null }[] = [];

      if (request.scope === 'agent' && request.scopeId) {
        scopeChecks.push({ scope: 'agent', scopeId: request.scopeId });
      }
      if (request.projectId) {
        scopeChecks.push({ scope: 'project', scopeId: request.projectId });
      }
      if (request.scope === 'cerebro') {
        scopeChecks.push({ scope: 'cerebro', scopeId: null });
      }
      scopeChecks.push({ scope: 'global', scopeId: null });

      for (const check of scopeChecks) {
        const rule = db.prepare(
          'SELECT provider_chain FROM llm_routing_rules WHERE scope = ? AND (scope_id = ? OR (scope_id IS NULL AND ? IS NULL))'
        ).get(check.scope, check.scopeId, check.scopeId) as { provider_chain: string } | undefined;

        if (rule) {
          const chainIds: string[] = JSON.parse(rule.provider_chain);
          const chain: LLMProvider[] = [];
          for (const id of chainIds) {
            const p = this.providerRegistry.get(id);
            if (p) chain.push(p);
          }
          if (chain.length > 0) {
            return chain;
          }
        }
      }
    } catch (err) {
      log.warn('[RouteSwitch] resolveProviderChain failed; using default provider:', err);
    }

    // Fallback: just the current active provider
    return [this.provider];
  }

  /**
   * OQ-001: Resolve the best provider for this request using the model selector.
   * Reads live benchmarks from `model_benchmarks` table. Returns the current
   * provider unchanged if the model selector cannot improve on it (no benchmarks, no
   * matching registered provider, or no hints supplied).
   */
  private _resolveProviderViaModelSelector(req: RouteRequest, primary: LLMProvider): LLMProvider {
    if (!req.complexity || !req.userPriority) return primary;
    try {
      const rawBenchmarks = db
        .prepare('SELECT model_id, avg_latency_ms, avg_tps, failure_rate FROM model_benchmarks')
        .all() as Benchmark[];
      const availableModels: Model[] = Array.from(this.providerRegistry.values()).map((p) => ({
        id: p.id,
      }));
      if (availableModels.length === 0) return primary;
      const bestId = selectOptimalModel(
        req.complexity,
        req.userPriority,
        availableModels,
        rawBenchmarks,
      );
      const bestProvider = this.providerRegistry.get(bestId);
      if (bestProvider && bestProvider.id !== primary.id) {
        log.info(`[RouteSwitch] Model selector chose ${bestId} (complexity=${req.complexity}, priority=${req.userPriority})`);
        return bestProvider;
      }
    } catch (err) {
      log.warn('[RouteSwitch] selectOptimalModel failed; using primary provider:', err);
    }
    return primary;
  }

  /**
   * Look up whether a registered provider is flagged as paid-tier in the DB.
   * Providers not present in llm_providers (MockProvider, env-configured
   * providers) are treated as free (returns false) — nothing is silently
   * reclassified; the flag is purely opt-in per the provider registry.
   */
  private _isProviderPaidTier(providerId: string): boolean {
    try {
      const row = db
        .prepare('SELECT is_paid_tier FROM llm_providers WHERE id = ?')
        .get(providerId) as { is_paid_tier: number } | undefined;
      return row?.is_paid_tier === 1;
    } catch {
      return false;
    }
  }

  /**
   * Whether the active provider drives the AgentStop supervisor with REAL
   * per-token confidence (preemptive early termination) or only the post-hoc
   * heuristic fallback. Surfaced to the UI so the AgentStop widget can tell the
   * truth about the currently-active provider instead of hardcoding a claim.
   */
  public getAgentStopMode(): { mode: 'preemptive' | 'heuristic'; activeProviderId: string; supportsStreamingConfidence: boolean } {
    const supports = this.provider.supportsStreamingConfidence === true;
    return {
      mode: supports ? 'preemptive' : 'heuristic',
      activeProviderId: this.provider.id,
      supportsStreamingConfidence: supports,
    };
  }

  /**
   * Execute a single provider call, streaming real per-token confidence into the
   * AgentStop supervisor when the provider exposes it.
   *
   * For providers with real streaming confidence (llama-cpp), each generated
   * token's logprob is fed to `agentStop.evaluateToken()` AS IT STREAMS, so the
   * already-correct 3-consecutive-low-tokens abort logic is finally reachable and
   * an abort genuinely cuts local inference short (via `streamHooks.signal`),
   * saving real compute rather than discarding an already-complete response.
   *
   * For providers without it, we fall back to a clearly-labelled post-hoc
   * heuristic that only estimates confidence — it is NOT preemptive and NOT a
   * real logprob.
   *
   * Returns the response content or throws on error.
   */
  private async _executeWithProvider(provider: LLMProvider, request: RouteRequest): Promise<{ content: string; confidence: number }> {
    const abortController = new AbortController();
    this.agentStop.reset();

    // Real per-token confidence path: providers that support it call
    // onTokenConfidence per streamed token; the supervisor may abort mid-stream.
    let streamedTokenCount = 0;
    const streamHooks: GenerationStreamHooks = {
      signal: abortController.signal,
      onTokenConfidence: (logprob: number) => {
        streamedTokenCount++;
        this.agentStop.evaluateToken(logprob, abortController);
      },
    };

    const responseContent = await provider.generate(
      request.prompt,
      request.estimatedTokens,
      request.responseSchema,
      streamHooks,
    );

    const usedRealConfidence = streamedTokenCount > 0;

    // Continuous confidence score, 0.0-1.0.
    let confidence = 1.0;
    if (usedRealConfidence) {
      // Preemptive path. If AgentStop fired, real model confidence dropped below
      // threshold for enough consecutive tokens and we terminated the generation
      // early — reflect that as a genuinely low-confidence result.
      if (abortController.signal.aborted) {
        log.warn('[RouteSwitch] AgentStop preemptively terminated generation (real per-token confidence dropped below threshold H).');
        confidence = 0.2;
      }
    } else {
      // HEURISTIC FALLBACK (non-llama-cpp providers): no real per-token
      // confidence is available from HTTP/synthetic providers, so we keep the
      // original post-hoc word-count quality estimate ONLY as a rough confidence
      // signal. This is explicitly NOT preemptive (the full response already
      // exists) and NOT equivalent to real logprobs — see provider adapters.
      const responseTokens = responseContent.split(/\s+/).length;
      const qualityScore = responseTokens < 3 ? -2.0 : responseTokens < 10 ? -0.8 : 0.0;
      if (qualityScore < 0.0) confidence -= 0.3;
    }
    confidence = Math.max(0, Math.min(1, confidence));

    return { content: responseContent, confidence };
  }

  public async execute(request: RouteRequest): Promise<RouteResponse> {
    if (!this.governor.canProceed(request.estimatedTokens)) {
      throw new Error(`Governor blocked execution: Estimated tokens (${request.estimatedTokens}) exceeds available free tier quota.`);
    }

    // Resolve the provider chain for this request's scope
    const chain = this.resolveProviderChain(request);

    // OQ-001: If model-selection hints are provided, let the model selector refine the primary choice
    const primaryProvider = this._resolveProviderViaModelSelector(request, chain[0]!);

    // Build the effective fallback chain: model selector's pick first, then remaining chain members
    const effectiveChain = [primaryProvider, ...chain.filter(p => p.id !== primaryProvider.id)];

    // OKF Context Injection: resolve relevant knowledge from the graph and prepend to prompt
    let enrichedPrompt = request.prompt;
    if (request.prompt.length > 20) { // Skip trivial/test prompts
      try {
        const contextChunks = OKFGraphQuery.resolveContext(request.prompt, request.projectId);
        if (contextChunks.length > 0) {
          const contextBlock = OKFGraphQuery.formatContextForPrompt(contextChunks);
          enrichedPrompt = contextBlock + request.prompt;
        }
      } catch (err) {
        // OKF context is best-effort — never block execution
        log.warn('[RouteSwitch] OKF context injection failed (non-fatal):', err);
      }
    }

    // Council Mode candidate pool: primary + the configured council providers,
    // de-duplicated by id (the primary is often also a council member).
    const councilCandidates = [primaryProvider, ...this.councilProviders.filter(p => p.id !== primaryProvider.id)];

    // Free Mode Governor: apply the SAME paid-provider lock the sequential
    // fallback chain applies (see the `isProviderAllowed` skip below). Council
    // Mode queries every provider in PARALLEL, so unlike the sequential chain it
    // can't "fall through" one provider at a time — instead we pre-filter the
    // pool so a paid+locked provider is simply never called, exactly as it would
    // be skipped in the sequential chain. This closes the gap flagged in
    // docs/base-knowledge-integration-tracker.md ("Council Mode does not filter
    // paid providers").
    const eligibleCouncilProviders = councilCandidates.filter(
      p => this.governor.isProviderAllowed(this._isProviderPaidTier(p.id))
    );

    // JUDGMENT CALL (documented, not silent): a meaningful consensus needs >= 2
    // providers. If the paid-provider lock drops the eligible pool below 2, we do
    // NOT run a degenerate 1-provider "council" (which would return the existing
    // confidence:0 / disagreement:1.0 degenerate signal). Instead we fall back to
    // the normal sequential fallback chain for this request. That chain ALREADY
    // skips paid+locked providers the same way and degrades gracefully to a free
    // provider — or errors only if nothing is eligible. This matches how the
    // sequential chain already treats a locked paid provider (like an exhausted
    // one) rather than inventing a new refuse/error path, and it keeps the
    // request served by a free provider whenever one exists.
    const councilFilteredOut = TriageClassifier.isHighRisk(request.prompt)
      && this.councilProviders.length >= 2
      && eligibleCouncilProviders.length < 2;
    if (councilFilteredOut) {
      log.info(`[RouteSwitch] High-risk prompt, but Free Mode lock left only ${eligibleCouncilProviders.length} eligible council provider(s) (need >= 2). Falling back to the sequential single-provider chain.`);
    }

    // Check if Council Mode should be triggered
    const isCouncilTriggered = TriageClassifier.isHighRisk(request.prompt) && eligibleCouncilProviders.length >= 2;

    let responseContent: string;
    let finalProvider = primaryProvider.id;
    let confidence = 1.0;

    if (isCouncilTriggered) {
      log.info('High-risk prompt detected. Triggering Council Mode.');
      const allProviders = eligibleCouncilProviders;
      const consensus = await ConsensusSynthesizer.executeCouncilMode(enrichedPrompt, request.estimatedTokens, allProviders, request.responseSchema);
      responseContent = consensus.content;
      confidence = consensus.confidence;
      finalProvider = 'Council Consensus';
      this.governor.recordUsage(request.estimatedTokens * allProviders.length, 'council');

      // Council Decision Logging: the confidence/disagreement signal Council Mode
      // computes (at real cost — parallel provider calls) was previously discarded
      // by every caller of execute(). Persist + log it so it's observable, without
      // gating or altering the response path. Best-effort — a DB hiccup here must
      // never break the actual response being returned to the caller.
      try {
        db.prepare(`
          INSERT INTO council_decisions (id, scope, scope_id, provider_count, confidence, disagreement_score, chosen_response_length, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          request.scope ?? null,
          request.scopeId ?? null,
          allProviders.length,
          consensus.confidence,
          consensus.disagreementScore,
          consensus.content.length,
          Date.now()
        );
      } catch (err) {
        log.warn('[RouteSwitch] Failed to persist council decision (non-fatal):', err);
      }

      log.info(`[RouteSwitch] Council Mode decision: confidence=${(consensus.confidence * 100).toFixed(1)}%, disagreement=${consensus.disagreementScore.toFixed(3)}, providers=${allProviders.length}`);
    } else {
      // Fallback loop: try each provider in the chain until one succeeds
      let lastError: Error | null = null;
      let succeeded = false;

      for (const provider of effectiveChain) {
        // Skip exhausted providers
        const health = ProviderHealthState.getState(provider.id);
        if (health.isExhausted) {
          log.info(`[RouteSwitch] Skipping exhausted provider: ${provider.id}`);
          continue;
        }

        // Free Mode Governor: skip paid-tier providers while the global lock is
        // engaged, exactly like an exhausted provider — a free provider later
        // in the chain can still serve the request. This is what makes the
        // "blocks paid-provider calls unless explicitly unlocked" claim real.
        if (!this.governor.isProviderAllowed(this._isProviderPaidTier(provider.id))) {
          log.info(`[RouteSwitch] Skipping paid provider (Free Mode locked): ${provider.id}`);
          continue;
        }

        try {
          const result = await this._executeWithProvider(provider, { ...request, prompt: enrichedPrompt });
          responseContent = result.content;
          confidence = result.confidence;
          finalProvider = provider.id;
          this.governor.recordUsage(request.estimatedTokens, provider.id);
          // Success — break out of fallback loop
          lastError = null;
          succeeded = true;
          break;
        } catch (err: any) {
          lastError = err;
          log.warn(`[RouteSwitch] Provider ${provider.id} failed: ${err.message}. Trying next in chain...`);
          // Mark as potentially exhausted if it looks like a rate limit
          if (err.message && (err.message.includes('429') || err.message.includes('rate limit') || err.message.includes('Too Many Requests'))) {
            const fakeHeaders = new Headers();
            fakeHeaders.set('x-ratelimit-remaining-tokens', '0');
            ProviderHealthState.parseRateLimitHeaders(provider.id, fakeHeaders);
          }
          continue;
        }
      }

      // If no provider succeeded, surface a clear error. This also covers the
      // case where every candidate was skipped (all exhausted, and/or all
      // paid-tier while Free Mode is locked) — previously that fell through and
      // returned an undefined response.
      if (!succeeded) {
        if (lastError !== null) {
          throw new Error(`[RouteSwitch] All providers in chain failed. Last error: ${lastError.message}`);
        }
        throw new Error('[RouteSwitch] No eligible provider available: every provider in the chain was exhausted or blocked by the Free Mode Governor (paid providers are locked). Unlock Free Mode or add a free provider to the chain.');
      }
    }

    const actualTokens = isCouncilTriggered ? request.estimatedTokens * eligibleCouncilProviders.length : request.estimatedTokens;

    return {
      content: responseContent!,
      provider: finalProvider,
      tokensUsed: actualTokens,
      confidence,
      isCouncilMode: isCouncilTriggered
    };
  }
}
