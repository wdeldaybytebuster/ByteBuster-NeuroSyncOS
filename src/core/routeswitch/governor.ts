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

import { db } from '../basevault/db';

export interface GovernorState {
  tokensUsed: number;
  maxTokens: number;
}

/**
 * Free Mode Governor paid-provider lock.
 *
 * The marketing claim ("blocks paid-provider calls unless explicitly
 * unlocked") is made real by this gate. The lock state lives in
 * system_settings under key 'free_mode_unlocked' ('true' = unlocked / paid
 * providers permitted; anything else or absent = LOCKED, the safe default).
 * It is re-read at most once per FREE_MODE_CACHE_TTL_MS so a toggle from the
 * UI takes effect within a couple of seconds without a DB read on every route
 * resolution — the same short-TTL cache pattern used for log_level in
 * observability/logger.ts.
 */
const FREE_MODE_CACHE_TTL_MS = 2000;
let cachedUnlocked = false;
let cachedUnlockedAt = 0;

export function isFreeModeUnlocked(): boolean {
  const now = Date.now();
  if (now - cachedUnlockedAt > FREE_MODE_CACHE_TTL_MS) {
    cachedUnlockedAt = now;
    try {
      const row = db
        .prepare("SELECT value FROM system_settings WHERE key = 'free_mode_unlocked'")
        .get() as { value: string } | undefined;
      cachedUnlocked = row?.value === 'true';
    } catch {
      // DB not initialized yet (very early boot) — default to LOCKED (safe).
      cachedUnlocked = false;
    }
  }
  return cachedUnlocked;
}

/** Test-only: force the lock cache to re-read on the next call. */
export function _resetFreeModeCache(): void {
  cachedUnlockedAt = 0;
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
   * Whether Free Mode is currently unlocked (paid-tier providers permitted).
   * Reads the short-TTL cache so callers don't hit the DB on every resolution.
   */
  public isUnlocked(): boolean {
    return isFreeModeUnlocked();
  }

  /**
   * Free Mode Governor gate: a paid-tier provider is only allowed to serve a
   * request when the global lock is unlocked. Free providers are always
   * allowed. Called per-candidate in RouteSwitchEngine's fallback chain so a
   * locked+paid provider is *skipped* (not a hard failure) exactly like an
   * exhausted one — a free provider further down the chain can still serve.
   */
  public isProviderAllowed(isPaidTier: boolean): boolean {
    return !isPaidTier || this.isUnlocked();
  }

  public forecastDagTokens(nodes: { prompt?: string }[]): number {
    return nodes.reduce((sum, n) => {
      const promptChars = n.prompt?.length || 0;
      return sum + Math.ceil(promptChars / 4) + 1000;
    }, 0);
  }

  public assertCanProceedDAG(nodes: { prompt?: string }[]): void {
    const estimated = this.forecastDagTokens(nodes);
    if (!this.canProceed(estimated)) {
      throw new Error(`Governor blocked execution: Estimated DAG tokens (${estimated}) combined with current usage exceeds available free tier quota.`);
    }
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

export const systemGovernor = new FreeModeGovernor(100000);
