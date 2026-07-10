import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { RouteSwitchEngine } from './engine';
import { LLMProvider } from './providers';
import { ConsensusSynthesizer } from './council';
import { _resetFreeModeCache } from './governor';
import { db, initDB } from '../basevault/db';

// Ensure basevault schema (including council_decisions) exists; vitest runs
// files in isolation against a private :memory: DB (see db.ts).
beforeAll(() => {
  initDB();
});

class DummyProvider implements LLMProvider {
  /** Number of times generate() was invoked — used to prove a provider was (not) called. */
  public calls = 0;
  constructor(public id: string, private response: string) {}
  async generate() {
    this.calls++;
    return this.response;
  }
}

describe('Council Mode Triage & Consensus', () => {
  it('should trigger council mode on high-risk prompts', async () => {
    const mainProv = new DummyProvider('main', '{"nodes": [{"id":"1","prompt":"drop table"}]}');
    const c1 = new DummyProvider('c1', '{"nodes": [{"id":"1","prompt":"drop table safely"}]}');
    const c2 = new DummyProvider('c2', '{"nodes": [{"id":"1","prompt":"drop table very safely"}]}');

    const engine = new RouteSwitchEngine(undefined, mainProv);
    engine.setCouncilProviders([c1, c2]);

    const result = await engine.execute({ prompt: 'Please delete the database', estimatedTokens: 10 });

    expect(result.isCouncilMode).toBe(true);
    expect(result.provider).toBe('Council Consensus');
    // Medoid selection: the synthesizer now returns the response the council most
    // agrees with (highest total cosine similarity to the others), NOT simply the
    // longest. Here c1 ("drop table safely") is the token-overlap centroid of the
    // three near-identical DAGs, so it's the chosen consensus content.
    expect(result.content).toBe('{"nodes": [{"id":"1","prompt":"drop table safely"}]}');
  });

  it('persists a council_decisions row when Council Mode triggers', async () => {
    const mainProv = new DummyProvider('main', '{"nodes": [{"id":"1","prompt":"drop table"}]}');
    const c1 = new DummyProvider('c1', '{"nodes": [{"id":"1","prompt":"drop table safely"}]}');
    const c2 = new DummyProvider('c2', '{"nodes": [{"id":"1","prompt":"drop table very safely"}]}');

    const engine = new RouteSwitchEngine(undefined, mainProv);
    engine.setCouncilProviders([c1, c2]);

    const before = (db.prepare('SELECT COUNT(*) AS n FROM council_decisions').get() as any).n;

    const result = await engine.execute({
      prompt: 'Please delete the database',
      estimatedTokens: 10,
      scope: 'cerebro',
      scopeId: 'test-scope-id',
    });

    expect(result.isCouncilMode).toBe(true);

    const after = (db.prepare('SELECT COUNT(*) AS n FROM council_decisions').get() as any).n;
    expect(after).toBe(before + 1);

    const row = db.prepare('SELECT * FROM council_decisions ORDER BY created_at DESC LIMIT 1').get() as any;
    expect(row.scope).toBe('cerebro');
    expect(row.scope_id).toBe('test-scope-id');
    expect(row.provider_count).toBe(3); // main + c1 + c2
    expect(row.confidence).toBeCloseTo(result.confidence!, 5);
    expect(typeof row.disagreement_score).toBe('number');
    expect(row.chosen_response_length).toBe(result.content.length);
  });

  it('should not trigger council mode on low-risk prompts', async () => {
    const mainProv = new DummyProvider('main', '{"nodes": []}');
    const c1 = new DummyProvider('c1', 'test');
    const c2 = new DummyProvider('c2', 'test2');

    const engine = new RouteSwitchEngine(undefined, mainProv);
    engine.setCouncilProviders([c1, c2]);

    const result = await engine.execute({ prompt: 'Just say hi', estimatedTokens: 10 });
    
    expect(result.isCouncilMode).toBe(false);
    expect(result.provider).toBe('main');
  });
});

describe('ConsensusSynthesizer.executeCouncilMode — semantic agreement scoring', () => {
  // These tests exercise the NEW cosine-over-term-frequency synthesis. They are
  // written against response CONTENT (agreement), not response LENGTH — the old
  // length/keyword heuristic would have scored some of these very differently,
  // which is exactly why it was flagged as weak across three audit passes.

  it('high confidence when responses AGREE in content (not merely in length)', async () => {
    const providers: LLMProvider[] = [
      new DummyProvider('a', 'the quick brown fox jumps over the lazy dog'),
      new DummyProvider('b', 'the quick brown fox jumps over the lazy dog today'),
      new DummyProvider('c', 'the quick brown fox jumps over the lazy dog now'),
    ];

    const result = await ConsensusSynthesizer.executeCouncilMode('test prompt', 10, providers);

    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.disagreementScore).toBeLessThan(0.1);
  });

  it('low confidence when responses DISAGREE in content, even at similar length', async () => {
    // All three are similar LENGTH — the old length heuristic would have called
    // this high-confidence agreement. Semantically they share almost no tokens.
    const providers: LLMProvider[] = [
      new DummyProvider('a', 'yes absolutely proceed with deleting the production database immediately'),
      new DummyProvider('b', 'no never do that it is extremely dangerous and irreversible'),
      new DummyProvider('c', 'please snapshot a full backup before any schema migration runs'),
    ];

    const result = await ConsensusSynthesizer.executeCouncilMode('test prompt', 10, providers);

    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.disagreementScore).toBeGreaterThan(0.5);
  });

  it('confidence is ~1.0 for identical responses and near-0 for fully disjoint ones', async () => {
    const identical = await ConsensusSynthesizer.executeCouncilMode('p', 10, [
      new DummyProvider('a', 'apply the database migration in a transaction'),
      new DummyProvider('b', 'apply the database migration in a transaction'),
    ]);
    expect(identical.confidence).toBeCloseTo(1.0, 5);
    expect(identical.disagreementScore).toBeCloseTo(0.0, 5);

    const disjoint = await ConsensusSynthesizer.executeCouncilMode('p', 10, [
      new DummyProvider('a', 'alpha bravo charlie delta'),
      new DummyProvider('b', 'echo foxtrot golf hotel'),
    ]);
    expect(disjoint.confidence).toBeCloseTo(0.0, 5);
    expect(disjoint.disagreementScore).toBeCloseTo(1.0, 5);
  });

  it('selects the medoid (most-agreed-with response), not the longest', async () => {
    const respA = 'deploy the payment service to production now';
    const respB = 'deploy the payment service to production now please immediately'; // longer AND agrees with A
    const outlier = 'abort everything and roll back the release right away';

    const result = await ConsensusSynthesizer.executeCouncilMode('p', 10, [
      new DummyProvider('a', respA),
      new DummyProvider('b', respB),
      new DummyProvider('c', outlier),
    ]);

    // The two agreeing responses form the consensus; the divergent outlier must
    // never win, regardless of its length.
    expect([respA, respB]).toContain(result.content);
    expect(result.content).not.toBe(outlier);
  });
});

describe('Council Mode — Free Mode Governor paid-provider lock', () => {
  const HIGH_RISK = 'Please delete the production database'; // matches TriageClassifier.isHighRisk

  // Register a provider id as paid-tier (is_paid_tier=1). Providers absent from
  // llm_providers are treated as free by _isProviderPaidTier.
  const markPaid = (id: string) => {
    const now = Date.now();
    db.prepare(`
      INSERT INTO llm_providers (id, name, type, config_json, is_enabled, created_at, updated_at, is_paid_tier)
      VALUES (?, ?, 'openai-compatible', '{}', 1, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET is_paid_tier = 1
    `).run(id, id, now, now);
  };

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
    db.prepare("DELETE FROM llm_providers WHERE id LIKE 'paid-%' OR id LIKE 'free-%'").run();
  });

  it('LOCKED: excludes a paid council provider but still runs council on the >=2 free ones', async () => {
    setLock(false);
    markPaid('paid-c2');

    const main = new DummyProvider('free-main', '{"nodes":[{"id":"1","prompt":"drop safely"}]}');
    const c1 = new DummyProvider('free-c1', '{"nodes":[{"id":"1","prompt":"drop safely too"}]}');
    const paid = new DummyProvider('paid-c2', '{"nodes":[{"id":"1","prompt":"drop safely paid"}]}');

    const engine = new RouteSwitchEngine(undefined, main);
    engine.setCouncilProviders([c1, paid]);

    const before = (db.prepare('SELECT COUNT(*) AS n FROM council_decisions').get() as any).n;
    const result = await engine.execute({ prompt: HIGH_RISK, estimatedTokens: 10 });

    expect(result.isCouncilMode).toBe(true);
    expect(result.provider).toBe('Council Consensus');
    // The paid provider must never have been called under the lock...
    expect(paid.calls).toBe(0);
    // ...but the two free providers did participate.
    expect(main.calls).toBe(1);
    expect(c1.calls).toBe(1);

    // council_decisions provider_count reflects the FILTERED pool (2, not 3).
    const after = (db.prepare('SELECT COUNT(*) AS n FROM council_decisions').get() as any).n;
    expect(after).toBe(before + 1);
    const row = db.prepare('SELECT * FROM council_decisions ORDER BY created_at DESC LIMIT 1').get() as any;
    expect(row.provider_count).toBe(2);
  });

  it('UNLOCKED: includes the paid council provider (all 3 participate)', async () => {
    setLock(true);
    markPaid('paid-c2');

    const main = new DummyProvider('free-main', '{"nodes":[{"id":"1","prompt":"drop safely"}]}');
    const c1 = new DummyProvider('free-c1', '{"nodes":[{"id":"1","prompt":"drop safely too"}]}');
    const paid = new DummyProvider('paid-c2', '{"nodes":[{"id":"1","prompt":"drop safely paid"}]}');

    const engine = new RouteSwitchEngine(undefined, main);
    engine.setCouncilProviders([c1, paid]);

    const result = await engine.execute({ prompt: HIGH_RISK, estimatedTokens: 10 });

    expect(result.isCouncilMode).toBe(true);
    expect(paid.calls).toBe(1); // paid provider now allowed
    expect(main.calls).toBe(1);
    expect(c1.calls).toBe(1);

    const row = db.prepare('SELECT * FROM council_decisions ORDER BY created_at DESC LIMIT 1').get() as any;
    expect(row.provider_count).toBe(3);
  });

  it('LOCKED + below-2 eligible: skips council, falls back to the free sequential chain (no error, no paid call)', async () => {
    setLock(false);
    markPaid('paid-c1');
    markPaid('paid-c2');

    // Only the free primary is eligible; both council providers are paid+locked.
    const main = new DummyProvider('free-main', 'sequential-fallback-answer');
    const c1 = new DummyProvider('paid-c1', 'paid one');
    const c2 = new DummyProvider('paid-c2', 'paid two');

    const engine = new RouteSwitchEngine(undefined, main);
    engine.setCouncilProviders([c1, c2]);

    const before = (db.prepare('SELECT COUNT(*) AS n FROM council_decisions').get() as any).n;
    const result = await engine.execute({ prompt: HIGH_RISK, estimatedTokens: 10 });

    // Degrades to the normal single-provider chain served by the free primary...
    expect(result.isCouncilMode).toBe(false);
    expect(result.provider).toBe('free-main');
    expect(result.content).toBe('sequential-fallback-answer');
    expect(main.calls).toBe(1);
    // ...neither paid provider is called, and no council decision is logged.
    expect(c1.calls).toBe(0);
    expect(c2.calls).toBe(0);
    const after = (db.prepare('SELECT COUNT(*) AS n FROM council_decisions').get() as any).n;
    expect(after).toBe(before);
  });
});
