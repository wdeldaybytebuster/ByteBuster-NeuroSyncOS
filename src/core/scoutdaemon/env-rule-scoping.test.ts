import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { db, initDB } from '../basevault/db';
import { getEnvRule } from './hardware-profiler';
import { getEnvironmentMaxWorkers } from '../coreexec/engine';

/**
 * D2 — newest-wins + active-profile scoping for environment_rules reads.
 *
 * Regression: getEnvRule had no ORDER BY (arbitrary row won when a key was
 * written more than once for a profile), and CoreExec's getEnvironmentMaxWorkers
 * read unscoped (a stale profile's max_workers could override the active tier).
 */
function seedProfile(id: string, profiledAt: number): void {
  db.prepare(`
    INSERT OR REPLACE INTO hardware_profiles
      (id, profiled_at, cpu_cores, cpu_physical_cores, ram_total_mb, os_platform, tier)
    VALUES (?, ?, 6, 6, 12000, 'linux', 'standard')
  `).run(id, profiledAt);
}

function seedRule(profileId: string, key: string, value: string, createdAt: number): void {
  db.prepare(
    'INSERT INTO environment_rules (id, profile_id, rule_key, rule_value, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(randomUUID(), profileId, key, value, createdAt);
}

beforeEach(() => {
  initDB();
  db.prepare('DELETE FROM environment_rules').run();
  db.prepare('DELETE FROM hardware_profiles').run();
});

describe('D2 — getEnvRule newest-wins within the active profile', () => {
  it('returns the newest rule_value when the same key is written twice', () => {
    const pid = 'prof-d2-active';
    seedProfile(pid, Date.now());
    seedRule(pid, 'max_workers', '2', 1000);
    seedRule(pid, 'max_workers', '6', 2000);
    expect(getEnvRule('max_workers', 'fallback')).toBe('6');
  });

  it('ignores rules from a stale profile, reading only the newest profile', () => {
    seedProfile('prof-d2-stale', 1000);
    seedRule('prof-d2-stale', 'max_workers', '99', 3000);
    seedProfile('prof-d2-new', 2000);
    seedRule('prof-d2-new', 'max_workers', '2', 1500);
    expect(getEnvRule('max_workers', 'fallback')).toBe('2');
  });
});

describe('D2 — getEnvironmentMaxWorkers scoped to the active profile', () => {
  it('newest profile wins even when the stale profile has a newer rule row', () => {
    seedProfile('prof-d2-stale', 1000);
    seedRule('prof-d2-stale', 'max_workers', '99', 9000);
    seedProfile('prof-d2-new', 2000);
    seedRule('prof-d2-new', 'max_workers', '2', 1500);
    expect(getEnvironmentMaxWorkers()).toBe(2);
  });

  it('newest duplicate rule within the active profile wins', () => {
    seedProfile('prof-d2-single', Date.now());
    seedRule('prof-d2-single', 'max_workers', '4', 1000);
    seedRule('prof-d2-single', 'max_workers', '5', 2000);
    expect(getEnvironmentMaxWorkers()).toBe(5);
  });

  it('falls back to 3 when no profile or rule exists', () => {
    expect(getEnvironmentMaxWorkers()).toBe(3);
  });
});
