import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// Mock executeRun so the idle handler's fire-and-forget DAG kickoff can't
// asynchronously spin up the real worker pool/sandbox during this test. We are
// testing the synthetic maintenance-DAG's INSERT ordering / FK correctness,
// not the engine execution loop itself (covered elsewhere), matching the
// established pattern in `src/server/routes/coreexec-router-retry.test.ts`.
const { executeRunMock } = vi.hoisted(() => ({
  executeRunMock: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../coreexec/engine', () => ({
  executeRun: executeRunMock,
}));

// systeminformation is only touched by idle.ts's thermal-yield branch
// (si.cpuTemperature()). Mock it so the C.4a tests below can drive that branch
// deterministically without probing the real host. hardware-profiler also
// imports systeminformation but only calls it inside runGenesisProfiler(),
// which these tests never invoke.
const { cpuTemperatureMock } = vi.hoisted(() => ({
  cpuTemperatureMock: vi.fn(),
}));
vi.mock('systeminformation', () => ({
  cpuTemperature: cpuTemperatureMock,
}));

import { db, initDB } from '../basevault/db';
import { idleDetector } from './idle';

beforeAll(() => {
  initDB();
});

describe('IdleDetector "idle" handler — synthetic maintenance-DAG creation (ScoutDaemon)', () => {
  it('creates a real workflow_runs row for the "system-maintenance" DAG without an FK violation', () => {
    // On a fresh :memory: test DB (per this project's VITEST convention), no
    // 'system-maintenance' project row has ever been created. The tracker doc
    // (docs/implementation-plan-and-progress-tracker.md, 2026-07-03 entry) notes
    // a real "FOREIGN KEY constraint failed" observed in server logs from this
    // exact path. workflow_runs.project_id has
    // `FOREIGN KEY(project_id) REFERENCES projects(id)` with `foreign_keys = ON`
    // (src/core/basevault/db.ts), so inserting a workflow_runs row whose
    // project_id is the literal string 'system-maintenance' fails on the very
    // first idle trigger ever, unconditionally — reproduced here directly
    // rather than guessed at.
    const countRuns = () =>
      (db.prepare(
        "SELECT COUNT(*) as n FROM workflow_runs WHERE project_id = 'system-maintenance'"
      ).get() as { n: number }).n;

    const before = countRuns();

    expect(() => idleDetector.emit('idle')).not.toThrow();

    const after = countRuns();

    // Before the fix: the INSERT throws inside idle.ts's own try/catch, which
    // logs and swallows it — so from the caller's side nothing throws, but the
    // row is silently never created. That silent no-op is the actual bug: the
    // "autonomous maintenance" feature the tracker doc describes never runs.
    expect(after).toBe(before + 1);
  });

  it('the "system-maintenance" project row genuinely exists as the real FK target (not just an assumed literal)', () => {
    const project = db
      .prepare("SELECT id FROM projects WHERE id = 'system-maintenance'")
      .get();
    expect(project).toBeDefined();
  });

  it('creates exactly one unclaimed task row wired to the new run (tasks.run_id FK also satisfied)', () => {
    const row = db
      .prepare(
        `SELECT t.status FROM tasks t
         JOIN workflow_runs r ON r.id = t.run_id
         WHERE r.project_id = 'system-maintenance'
         ORDER BY r.created_at DESC LIMIT 1`
      )
      .get() as { status: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.status).toBe('unclaimed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C.4a — thermal-yield must attribute its environment_rules rows to the active
// hardware profile. environment_rules.profile_id is NOT NULL and REFERENCES
// hardware_profiles(id) (src/core/basevault/db.ts:718), so before the fix both
// the yield write and the restore write threw a constraint failure that the
// surrounding swallow-all catch discarded — thermal protection never engaged.
// ─────────────────────────────────────────────────────────────────────────────
describe('IdleDetector thermal-yield — environment_rules profile_id attribution (C.4a)', () => {
  /** Inserts a hardware_profiles row with an explicit profiled_at (fake timers
   *  freeze Date.now(), so ties must be avoided to make "active" deterministic). */
  const seedProfile = (id: string, profiledAt: number): string => {
    db.prepare(
      `INSERT INTO hardware_profiles
       (id, profiled_at, cpu_cores, cpu_physical_cores, ram_total_mb, os_platform, tier)
       VALUES (?, ?, 6, 6, 12000, 'linux', 'standard')`
    ).run(id, profiledAt);
    return id;
  };

  const seedRule = (id: string, profileId: string, value: string, createdAt: number) => {
    db.prepare(
      'INSERT INTO environment_rules (id, profile_id, rule_key, rule_value, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, profileId, 'max_workers', value, createdAt);
  };

  const newestRule = () =>
    db.prepare(
      "SELECT profile_id, rule_key, rule_value FROM environment_rules WHERE rule_key = 'max_workers' ORDER BY created_at DESC LIMIT 1"
    ).get() as { profile_id: string; rule_key: string; rule_value: string } | undefined;

  const ruleCount = () =>
    (db.prepare("SELECT COUNT(*) as n FROM environment_rules WHERE rule_key = 'max_workers'").get() as { n: number }).n;

  beforeEach(() => {
    // environment_rules has ON DELETE CASCADE from hardware_profiles, so
    // clearing profiles clears rules. Explicit rule delete keeps this robust
    // even if the FK pragma is ever relaxed.
    db.prepare('DELETE FROM environment_rules').run();
    db.prepare('DELETE FROM hardware_profiles').run();
    vi.useFakeTimers();
  });

  afterEach(() => {
    idleDetector.stop();
    vi.useRealTimers();
    cpuTemperatureMock.mockReset();
  });

  it('writes the thermal-yield rule with profile_id taken from getActiveHardwareProfile()', async () => {
    const profileId = seedProfile('prof-active', 1_000_000);
    seedRule('rule-seed', profileId, '4', 1_000_001);

    cpuTemperatureMock.mockResolvedValue({ main: 92, max: 100 });
    idleDetector.start();
    await vi.advanceTimersByTimeAsync(10000);

    const row = newestRule();
    expect(row).toBeDefined();
    // THE C.4a ASSERTION: profile_id must be present, not NULL/absent.
    expect(row!.profile_id).toBe(profileId);
    expect(row!.rule_key).toBe('max_workers');
    expect(row!.rule_value).toBe('0');
  });

  it('scopes the read to the ACTIVE profile — a newer rule from another profile is ignored', async () => {
    // active profile is the newer one; the other profile's rule is written LAST
    // so an unscoped "ORDER BY created_at DESC LIMIT 1" read returns '9' and
    // blames the wrong profile.
    seedProfile('prof-old', 1_000_000);
    const activeProfile = seedProfile('prof-new', 2_000_000);
    seedRule('rule-old', 'prof-old', '4', 1_000_001);
    seedRule('rule-new', 'prof-new', '9', 2_000_001);

    cpuTemperatureMock.mockResolvedValue({ main: 92, max: 100 });
    idleDetector.start();
    await vi.advanceTimersByTimeAsync(10000);

    const yieldRow = newestRule();
    expect(yieldRow!.profile_id).toBe(activeProfile);
    expect(yieldRow!.rule_value).toBe('0');

    // Recover: the restore must write the ACTIVE profile's '4', not '9'.
    cpuTemperatureMock.mockResolvedValue({ main: 60, max: 100 });
    await vi.advanceTimersByTimeAsync(10000);

    const restoreRow = newestRule();
    expect(restoreRow!.profile_id).toBe(activeProfile);
    expect(restoreRow!.rule_value).toBe('4');
  });

  it('latch clears on recovery, so a later spike writes a fresh yield row (no double-count)', async () => {
    const profileId = seedProfile('prof-active', 1_000_000);
    seedRule('rule-seed', profileId, '4', 1_000_001);
    const afterSeed = ruleCount();

    cpuTemperatureMock.mockResolvedValue({ main: 92, max: 100 });
    idleDetector.start();
    await vi.advanceTimersByTimeAsync(10000); // spike 1
    cpuTemperatureMock.mockResolvedValue({ main: 60, max: 100 });
    await vi.advanceTimersByTimeAsync(10000); // recovery
    const afterRecovery = ruleCount();

    // Exact counts: seed + yield(1) + restore(1). No duplicate writes.
    expect(afterSeed).toBe(1);
    expect(afterRecovery).toBe(afterSeed + 2);
  });

  it('refuses to write any rule row when genesis has not run (no hardware profile exists)', async () => {
    // With no hardware_profiles row the NOT NULL/FK makes a write impossible, so
    // the correct behaviour is to refuse loudly and write nothing — NOT to throw
    // into the swallow-all catch and silently no-op as it did before the fix.
    cpuTemperatureMock.mockResolvedValue({ main: 92, max: 100 });
    idleDetector.start();
    await vi.advanceTimersByTimeAsync(10000);

    expect(newestRule()).toBeUndefined();
    expect(ruleCount()).toBe(0);
  });
});
