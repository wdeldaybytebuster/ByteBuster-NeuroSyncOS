import { FreeModeGovernor } from './governor';
import { LLMProvider, MockProvider } from './providers';
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
   * Execute a single provider call with AgentStop post-evaluation.
   * Returns the response content or throws on error.
   */
  private async _executeWithProvider(provider: LLMProvider, request: RouteRequest): Promise<{ content: string; confidence: number }> {
    const abortController = new AbortController();
    this.agentStop.reset();

    const responseContent = await provider.generate(request.prompt, request.estimatedTokens, request.responseSchema);

    // Post-generation quality evaluation
    const responseTokens = responseContent.split(/\s+/).length;
    const qualityScore = responseTokens < 3 ? -2.0 : responseTokens < 10 ? -0.8 : 0.0;
    this.agentStop.evaluateToken(qualityScore, abortController);

    // Continuous confidence score, 0.0-1.0. Starts at 1.0 and is penalized for
    // low-quality generation and/or AgentStop-triggered termination.
    let confidence = 1.0;
    if (qualityScore < 0.0) confidence -= 0.3;
    if (abortController.signal.aborted) {
      log.warn('[RouteSwitch] AgentStop terminated response — low confidence detected.');
      confidence -= 0.6;
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

    // Check if Council Mode should be triggered
    const isCouncilTriggered = TriageClassifier.isHighRisk(request.prompt) && this.councilProviders.length >= 2;

    let responseContent: string;
    let finalProvider = primaryProvider.id;
    let confidence = 1.0;

    if (isCouncilTriggered) {
      log.info('High-risk prompt detected. Triggering Council Mode.');
      const allProviders = [primaryProvider, ...this.councilProviders];
      const consensus = await ConsensusSynthesizer.executeCouncilMode(enrichedPrompt, request.estimatedTokens, allProviders, request.responseSchema);
      responseContent = consensus.content;
      confidence = consensus.confidence;
      finalProvider = 'Council Consensus';
      this.governor.recordUsage(request.estimatedTokens * allProviders.length, 'council');
    } else {
      // Fallback loop: try each provider in the chain until one succeeds
      let lastError: Error | null = null;

      for (const provider of effectiveChain) {
        // Skip exhausted providers
        const health = ProviderHealthState.getState(provider.id);
        if (health.isExhausted) {
          log.info(`[RouteSwitch] Skipping exhausted provider: ${provider.id}`);
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

      // If we got through the loop without setting responseContent, all providers failed
      if (lastError !== null) {
        throw new Error(`[RouteSwitch] All providers in chain failed. Last error: ${lastError.message}`);
      }
    }

    const actualTokens = isCouncilTriggered ? request.estimatedTokens * (this.councilProviders.length + 1) : request.estimatedTokens;

    return {
      content: responseContent!,
      provider: finalProvider,
      tokensUsed: actualTokens,
      confidence,
      isCouncilMode: isCouncilTriggered
    };
  }
}
