/**
 * §3.2 — 24h usage tracking + cost estimate derivation.
 *
 * `FreeModeGovernor` historically tracked only a cumulative `tokensUsed`
 * counter for quota-gate purposes. This round adds a per-call history so the
 * RouteSwitch dashboard can show actual usage over the last 24 hours and an
 * estimated API cost derived from a transparent per-1k-token rate.
 *
 * The legacy `recordUsage(tokens)` signature is preserved (default provider
 * `unknown`) so existing call sites in engine.ts / consensus.ts keep working
 * without changes; engine.ts is updated to pass `provider.id` when known so
 * the per-provider breakdown is meaningful.
 */

export interface GovernorState {
  tokensUsed: number;
  maxTokens: number;
}

export interface UsageRecord {
  timestamp: number;
  tokens: number;
  provider: string;
}

export interface UsageAggregate {
  tokens: number;
  costUsd: number;
  requests: number;
  byProvider: Record<string, { tokens: number; requests: number }>;
  /** Window size used for the aggregation, in milliseconds. */
  windowMs: number;
  /** Wall-clock at the moment aggregation was computed. */
  generatedAt: number;
}

/**
 * Estimated USD cost per 1,000 generated tokens, used by the dashboard to
 * render an estimated-API-cost figure. This is a deliberately conservative
 * provider-blended estimate (mid-tier OpenAI-class pricing). It is NOT
 * authoritative — for billing-grade accounting, swap the constant for a
 * per-provider lookup table keyed by `LLMProvider.id`.
 */
export const ESTIMATED_COST_PER_1K_TOKENS_USD = 0.002;

export class FreeModeGovernor {
  private state: GovernorState;
  private history: UsageRecord[] = [];

  constructor(maxTokens: number = 100000) {
    this.state = {
      tokensUsed: 0,
      maxTokens,
    };
  }

  public canProceed(estimatedTokens: number): boolean {
    return this.state.tokensUsed + estimatedTokens <= this.state.maxTokens;
  }

  public recordUsage(tokens: number, provider: string = 'unknown'): void {
    this.state.tokensUsed += tokens;
    if (this.state.tokensUsed > this.state.maxTokens) {
      console.warn('Governor Warning: Token usage exceeded the free tier maximum!');
    }
    this.history.push({ timestamp: Date.now(), tokens, provider });
  }

  public getStatus(): GovernorState {
    return { ...this.state };
  }

  /**
   * Aggregate history over the trailing `windowMs` (default 24h). Records
   * older than `now - windowMs` are pruned in-place on read so the buffer
   * stays bounded under long-running processes.
   */
  public getUsage24h(windowMs: number = 24 * 60 * 60 * 1000): UsageAggregate {
    const now = Date.now();
    const cutoff = now - windowMs;
    // Prune entries older than the window in-place to bound memory.
    const fresh = this.history.filter((r) => r.timestamp >= cutoff);

    let tokens = 0;
    let requests = 0;
    const byProvider: Record<string, { tokens: number; requests: number }> = {};
    for (const r of fresh) {
      tokens += r.tokens;
      requests += 1;
      // Inline-init pattern to satisfy `noUncheckedIndexedAccess` strict mode:
      // assign-then-read in two steps keeps TS narrowing across the lookup.
      if (!byProvider[r.provider]) {
        byProvider[r.provider] = { tokens: 0, requests: 0 };
      }
      const entry = byProvider[r.provider]!;
      entry.tokens += r.tokens;
      entry.requests += 1;
    }

    // Swap pruned history back in so the next call gets a smaller buffer.
    this.history = fresh;

    const costUsd = (tokens / 1000) * ESTIMATED_COST_PER_1K_TOKENS_USD;

    return {
      tokens,
      costUsd,
      requests,
      byProvider,
      windowMs,
      generatedAt: now,
    };
  }
}
