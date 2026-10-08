import { describe, it, expect, beforeAll, vi } from 'vitest';

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
