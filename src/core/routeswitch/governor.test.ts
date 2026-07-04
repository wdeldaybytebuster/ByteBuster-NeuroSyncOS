import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { FreeModeGovernor, ESTIMATED_COST_PER_1K_TOKENS_USD, _resetFreeModeCache } from './governor';
import { db, initDB } from '../basevault/db';

describe('FreeModeGovernor() — §3.2 24h usage tracking + cost derivation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-25T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exports ESTIMATED_COST_PER_1K_TOKENS_USD constant for cost derivation', () => {
    expect(ESTIMATED_COST_PER_1K_TOKENS_USD).toBeTypeOf('number');
    expect(ESTIMATED_COST_PER_1K_TOKENS_USD).toBeGreaterThan(0);
  });

  it('recordUsage appends a UsageRecord with timestamp + tokens + provider', () => {
    const g = new FreeModeGovernor(100000);
    g.recordUsage(100, 'mock');
    g.recordUsage(200, 'openai-compatible');
    const usage = g.getUsage24h();
    expect(usage.requests).toBe(2);
    expect(usage.tokens).toBe(300);
    expect(usage.byProvider).toEqual({
      mock: { tokens: 100, requests: 1 },
      'openai-compatible': { tokens: 200, requests: 1 },
    });
  });

  it('getUsage24h returns CostUsd computed as (tokens / 1000) * ESTIMATED_COST_PER_1K_TOKENS_USD', () => {
    const g = new FreeModeGovernor(100000);
    g.recordUsage(1000, 'mock'); // 1k tokens * rate
    const usage = g.getUsage24h();
    expect(usage.costUsd).toBeCloseTo(ESTIMATED_COST_PER_1K_TOKENS_USD, 6);
  });

  it('getUsage24h excludes records older than 24h', () => {
    const g = new FreeModeGovernor(100000);
    // Within window
    g.recordUsage(100, 'mock'); // timestamp = 0
    vi.advanceTimersByTime(60 * 60 * 1000); // +1h
    g.recordUsage(200, 'mock'); // timestamp = 1h
    // Advance past 24h — first record should be dropped
    vi.advanceTimersByTime(23 * 60 * 60 * 1000); // total +24h
    // The first record is exactly 24h old now (boundary)
    const usage = g.getUsage24h();
    // At t=24h, the 0h entry should be just on the boundary. Stepping
    // 1ms further ensures strict exclusion.
    vi.advanceTimersByTime(1);
    const usage2 = g.getUsage24h();
    expect(usage2.requests).toBe(1);
    expect(usage2.tokens).toBe(200);
    void usage; // boundary tolerance varies
  });

  it('records older than the 24h cutoff are pruned', () => {
    const g = new FreeModeGovernor(100000);
    g.recordUsage(100, 'mock');
    vi.advanceTimersByTime(25 * 60 * 60 * 1000); // +25h
    g.recordUsage(50, 'mock');
    const usage = g.getUsage24h();
    expect(usage.requests).toBe(1);
    expect(usage.tokens).toBe(50);
  });

  it('respects custom windowMs', () => {
    const g = new FreeModeGovernor(100000);
    g.recordUsage(100, 'mock'); // t=0
    vi.advanceTimersByTime(5 * 60 * 1000); // +5m
    g.recordUsage(200, 'mock'); // t=5m
    // At t=5m, the 10-minute window includes BOTH records (5m-old + 0m-old).
    const usage10m = g.getUsage24h(10 * 60 * 1000);
    expect(usage10m.requests).toBe(2);
    expect(usage10m.tokens).toBe(300);
    // At t=5m, the 3-minute window prunes the t=0 record (5m old > 3m cutoff)
    // and keeps only the t=5m record (0m old < 3m cutoff).
    const usage3m = g.getUsage24h(3 * 60 * 1000);
    expect(usage3m.requests).toBe(1);
    expect(usage3m.tokens).toBe(200);
  });

  it('getUsage24h returns windowMs in the response so callers can show "since N hours ago"', () => {
    const g = new FreeModeGovernor(100000);
    const usage = g.getUsage24h();
    expect(usage.windowMs).toBe(24 * 60 * 60 * 1000);
    expect(usage.generatedAt).toBeTypeOf('number');
  });

  it('getStatus() keeps the legacy tokensUsed/maxTokens shape (no regression)', () => {
    const g = new FreeModeGovernor(100000);
    g.recordUsage(500, 'mock');
    const status = g.getStatus();
    expect(status.tokensUsed).toBe(500);
    expect(status.maxTokens).toBe(100000);
  });

  it('canProceed/recordUsage still gate-quota behaviour unchanged', () => {
    const g = new FreeModeGovernor(100);
    expect(g.canProceed(50)).toBe(true);
    g.recordUsage(50, 'mock');
    expect(g.canProceed(60)).toBe(false);
    expect(g.canProceed(50)).toBe(true);
  });

  it('records without a provider id default to provider="unknown"', () => {
    const g = new FreeModeGovernor(100000);
    g.recordUsage(100); // no provider
    const usage = g.getUsage24h();
    expect(usage.byProvider).toEqual({ unknown: { tokens: 100, requests: 1 } });
  });

  it('forecastDagTokens correctly estimates token burn', () => {
    const g = new FreeModeGovernor(100000);
    const nodes = [
      { prompt: 'a'.repeat(400) }, // 100 tokens + 1000 = 1100
      { prompt: 'a'.repeat(800) }, // 200 tokens + 1000 = 1200
      {} // 0 tokens + 1000 = 1000
    ];
    const estimated = g.forecastDagTokens(nodes);
    expect(estimated).toBe(3300);
  });

  it('assertCanProceedDAG throws error if forecast exceeds quota', () => {
    const g = new FreeModeGovernor(3000); // Only 3000 tokens available
    const nodes = [
      { prompt: 'a'.repeat(400) }, // 1100
      { prompt: 'a'.repeat(800) }, // 1200
      {} // 1000
    ]; // Total = 3300

    expect(() => g.assertCanProceedDAG(nodes)).toThrow(/Governor blocked execution: Estimated DAG tokens \(3300\)/);
  });
});

describe('FreeModeGovernor.isProviderAllowed() — paid-tier Free Mode lock', () => {
  beforeAll(() => {
    initDB();
  });

  // Set (or clear) the global lock and force the governor's cache to re-read.
  const setLock = (unlocked: boolean | null) => {
    if (unlocked === null) {
      db.prepare("DELETE FROM system_settings WHERE key = 'free_mode_unlocked'").run();
    } else {
      db.prepare(
        "INSERT INTO system_settings (key, value) VALUES ('free_mode_unlocked', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).run(unlocked ? 'true' : 'false');
    }
    _resetFreeModeCache();
  };

  afterAll(() => {
    setLock(null);
  });

  it('defaults to LOCKED when the setting is absent (safe default)', () => {
    setLock(null);
    const g = new FreeModeGovernor();
    expect(g.isUnlocked()).toBe(false);
    expect(g.isProviderAllowed(true)).toBe(false); // locked + paid → blocked
    expect(g.isProviderAllowed(false)).toBe(true); // locked + free → allowed
  });

  it('locked: paid provider blocked, free provider allowed', () => {
    setLock(false);
    const g = new FreeModeGovernor();
    expect(g.isUnlocked()).toBe(false);
    expect(g.isProviderAllowed(true)).toBe(false);
    expect(g.isProviderAllowed(false)).toBe(true);
  });

  it('unlocked: both paid and free providers allowed', () => {
    setLock(true);
    const g = new FreeModeGovernor();
    expect(g.isUnlocked()).toBe(true);
    expect(g.isProviderAllowed(true)).toBe(true);
    expect(g.isProviderAllowed(false)).toBe(true);
  });
});
