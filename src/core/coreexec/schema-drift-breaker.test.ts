import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { db, initDB } from '../basevault/db';
import { scoutEmitter } from '../scoutdaemon/sse';
import { OKFGenerator } from '../okf/generator';
import {
  SchemaDriftBreaker,
  schemaDriftBreaker,
  parkSchemaDriftTask,
  SCHEMA_DRIFT_STRIKE_LIMIT,
  LLM_RETRY_OR_FIX_ACTION,
} from './schema-drift-breaker';

/**
 * F-CB-IMPL — Axiom 4 schema-drift circuit breaker.
 *
 * Deterministic only: the counter is an integer and the trip action is an
 * `os_todos` insert. No LLM is involved in deciding a strike or a trip, and the
 * acceptance criterion — "three consecutive schema validation errors stop
 * retries and park the task" — is asserted literally, including the
 * `LLM_RETRY_OR_FIX` required_action_type the Deference UI keys on.
 *
 * The DB is the in-memory test database (see vitest :memory: convention); rows
 * written here are cleaned per test so assertions are exact.
 */

const SOURCE_MODULE = 'CoreExecSchemaDrift';

beforeAll(() => {
  initDB();
});

function clearParkedRows(): void {
  db.prepare('DELETE FROM os_todos WHERE source_module = ?').run(SOURCE_MODULE);
}

function parkedRows(): any[] {
  return db
    .prepare('SELECT * FROM os_todos WHERE source_module = ? ORDER BY created_at')
    .all(SOURCE_MODULE) as any[];
}

describe('SchemaDriftBreaker — deterministic strike counting', () => {
  it('exports the Axiom 4 limit of three', () => {
    expect(SCHEMA_DRIFT_STRIKE_LIMIT).toBe(3);
  });

  it('refuses a non-positive or non-integer limit at construction', () => {
    for (const bad of [0, -1, 1.5, NaN]) {
      expect(() => new SchemaDriftBreaker(bad)).toThrow(/positive integer/);
    }
  });

  it('counts consecutive failures and does NOT trip before the limit', () => {
    const breaker = new SchemaDriftBreaker();
    const key = 'unit-under-test';

    const first = breaker.recordFailure(key);
    expect(first).toEqual({ strikes: 1, tripped: false });
    const second = breaker.recordFailure(key);
    expect(second).toEqual({ strikes: 2, tripped: false });

    expect(breaker.strikesFor(key)).toBe(2);
    expect(breaker.isTripped(key)).toBe(false);
    expect(breaker.shouldAttempt(key)).toBe(true);
  });

  it('trips on exactly the third consecutive failure, and reports the trip only once', () => {
    const breaker = new SchemaDriftBreaker();
    const key = 'unit-under-test';

    breaker.recordFailure(key);
    breaker.recordFailure(key);
    const third = breaker.recordFailure(key);

    expect(third).toEqual({ strikes: 3, tripped: true });
    expect(breaker.isTripped(key)).toBe(true);
    expect(breaker.shouldAttempt(key)).toBe(false);

    // The trip is edge-triggered: a further failure reports tripped=true but
    // the count keeps climbing, so a caller that parks on trip does it once
    // (it should be gated on shouldAttempt, not on isTripped).
    expect(breaker.recordFailure(key).strikes).toBe(4);
  });

  it('a schema-valid response resets the consecutive count', () => {
    const breaker = new SchemaDriftBreaker();
    const key = 'unit-under-test';

    breaker.recordFailure(key);
    breaker.recordFailure(key);
    expect(breaker.strikesFor(key)).toBe(2);

    breaker.recordSuccess(key);
    expect(breaker.strikesFor(key)).toBe(0);
    expect(breaker.shouldAttempt(key)).toBe(true);

    // ...and the next failure starts a fresh run at one, not at three.
    expect(breaker.recordFailure(key)).toEqual({ strikes: 1, tripped: false });
  });

  it('counts each key independently', () => {
    const breaker = new SchemaDriftBreaker();
    breaker.recordFailure('a');
    breaker.recordFailure('a');
    breaker.recordFailure('b');

    expect(breaker.strikesFor('a')).toBe(2);
    expect(breaker.strikesFor('b')).toBe(1);
    expect(breaker.isTripped('a')).toBe(false);
    expect(breaker.isTripped('b')).toBe(false);
    // An unknown key is healthy, not tripped.
    expect(breaker.strikesFor('never-seen')).toBe(0);
    expect(breaker.shouldAttempt('never-seen')).toBe(true);
  });

  it('an explicit reset clears a tripped breaker (the human-resolution path)', () => {
    const breaker = new SchemaDriftBreaker();
    const key = 'unit-under-test';
    breaker.recordFailure(key);
    breaker.recordFailure(key);
    breaker.recordFailure(key);
    expect(breaker.isTripped(key)).toBe(true);

    breaker.reset(key);
    expect(breaker.isTripped(key)).toBe(false);
    expect(breaker.strikesFor(key)).toBe(0);
  });

  it('exposes a process-wide singleton (the count is only meaningful if shared)', () => {
    expect(schemaDriftBreaker).toBeInstanceOf(SchemaDriftBreaker);
  });
});

describe('parkSchemaDriftTask — deterministic trip action', () => {
  beforeEach(() => {
    clearParkedRows();
  });

  it('writes one HIGH-severity os_todos row carrying the literal LLM_RETRY_OR_FIX action', () => {
    const result = parkSchemaDriftTask({
      key: 'okf-concept-extraction',
      validationError: 'Parsed JSON was not an array (got object)',
      origin: 'OKFGenerator',
    });

    expect(result).not.toBeNull();
    const rows = parkedRows();
    expect(rows).toHaveLength(1);

    const row = rows[0]!;
    expect(row.id).toBe(result!.todoId);
    expect(row.required_action_type).toBe('LLM_RETRY_OR_FIX');
    expect(row.required_action_type).toBe(LLM_RETRY_OR_FIX_ACTION);
    expect(row.severity).toBe('HIGH');
    expect(row.status).toBe('open');
    expect(row.escalation_reason).toBe('Parsed JSON was not an array (got object)');
    // 0.0 guarantees the Deference UI (0.70 threshold) always surfaces it.
    expect(row.confidence).toBe(0.0);
  });

  it('records the drift identity in the escalation payload, and no fabricated FK row', () => {
    const result = parkSchemaDriftTask({
      key: 'okf-concept-extraction',
      validationError: 'boom',
      origin: 'OKFGenerator',
    })!;

    const row = parkedRows()[0]!;
    const payload = JSON.parse(row.context_payload);
    expect(payload.schema_drift_key).toBe('okf-concept-extraction');
    expect(payload.origin).toBe('OKFGenerator');

    // dag_node_id is intentionally NULL: this is not a DAG node, and the column
    // has no foreign key, so no placeholder task/run row is invented.
    expect(row.dag_node_id).toBeNull();
    expect(row.project_id).toBeNull();
    expect(result.todoId).toBeTruthy();
  });

  it('scopes the row to a project when one is supplied', () => {
    parkSchemaDriftTask({
      key: 'okf-concept-extraction',
      validationError: 'boom',
      projectId: 'proj-123',
    });
    expect(parkedRows()[0]!.project_id).toBe('proj-123');
  });

  it('emits a TODO_ESCALATED scout event so PortGrid surfaces the trip', () => {
    const seen: any[] = [];
    const handler = (payload: any) => seen.push(payload);
    // scoutEmitter is a node EventEmitter; register, act, unregister.
    scoutEmitter.on('update', handler);
    try {
      parkSchemaDriftTask({ key: 'k', validationError: 'boom', origin: 'OKFGenerator' });
    } finally {
      scoutEmitter.off('update', handler);
    }

    const escalated = seen.find((e) => e?.type === 'TODO_ESCALATED');
    expect(escalated).toBeDefined();
    expect(escalated.workflowId).toBe('k');
    expect(escalated.origin).toBe('OKFGenerator');
  });

  it('never throws when the DB write fails — retries are already halted', () => {
    const spy = vi.spyOn(db, 'prepare').mockImplementation(() => {
      throw new Error('simulated db failure');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() =>
        parkSchemaDriftTask({ key: 'k', validationError: 'boom' })
      ).not.toThrow();
      expect(parkSchemaDriftTask({ key: 'k', validationError: 'boom' })).toBeNull();
      expect(errSpy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      errSpy.mockRestore();
    }
  });
});

describe('F-CB-IMPL acceptance — three consecutive failures stop retries and park the task', () => {
  beforeEach(() => {
    clearParkedRows();
    schemaDriftBreaker.resetAll();
  });

  it('halts the loop once the third strike lands, at the shared pipeline key', () => {
    const key = 'okf-concept-extraction';
    expect(schemaDriftBreaker.shouldAttempt(key)).toBe(true);

    schemaDriftBreaker.recordFailure(key);
    expect(schemaDriftBreaker.shouldAttempt(key)).toBe(true);
    schemaDriftBreaker.recordFailure(key);
    expect(schemaDriftBreaker.shouldAttempt(key)).toBe(true);

    const third = schemaDriftBreaker.recordFailure(key);
    expect(third.tripped).toBe(true);
    expect(schemaDriftBreaker.shouldAttempt(key)).toBe(false);

    // The trip handler parks exactly one ticket.
    parkSchemaDriftTask({ key, validationError: 'LLM output was not JSON', origin: 'OKFGenerator' });
    const rows = parkedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.required_action_type).toBe('LLM_RETRY_OR_FIX');
  });
});

/**
 * The wiring, not just the policy: `OKFGenerator._extractConcepts` is the one
 * retry loop over an LLM response schema in the codebase, and these cases prove
 * it reports strikes to the breaker and stops attempting once it has tripped.
 *
 * `fromWorkflowRun` is driven with a projectId that has no row, so
 * `resolveProjectDir` returns null and the generator returns before writing any
 * file — extraction (the code under test) runs first, and nothing touches the
 * filesystem (`OKFDirectoryManager.resolveUserDir()` would create
 * `~/.neurosync/user_okf/`, which a test must not do).
 */
describe('F-CB-IMPL wiring — OKFGenerator halts its retry loop on trip', () => {
  const DRIFT_KEY = 'okf-concept-extraction';
  const NO_SUCH_PROJECT = 'project-that-does-not-exist';

  beforeEach(() => {
    clearParkedRows();
    schemaDriftBreaker.resetAll();
  });

  /** A generateFn that never returns parseable JSON — a permanently drifted model. */
  function poisonedGenerator(): { fn: (p: string, s?: any) => Promise<string>; calls: () => number } {
    let calls = 0;
    return {
      fn: async () => {
        calls += 1;
        return 'I am afraid I cannot produce JSON today.';
      },
      calls: () => calls,
    };
  }

  it('accumulates strikes across invocations, trips, and parks with the literal action type', async () => {
    const gen = poisonedGenerator();

    // Invocation 1: primary + retry = 2 strikes. Not yet tripped.
    await OKFGenerator.fromWorkflowRun(gen.fn, 'run-1', [], NO_SUCH_PROJECT);
    expect(gen.calls()).toBe(2);
    expect(schemaDriftBreaker.strikesFor(DRIFT_KEY)).toBe(2);
    expect(schemaDriftBreaker.isTripped(DRIFT_KEY)).toBe(false);
    expect(parkedRows()).toHaveLength(0);

    // Invocation 2: the third consecutive failure trips the breaker and parks
    // the task, and the loop's own second attempt is skipped as a result.
    await OKFGenerator.fromWorkflowRun(gen.fn, 'run-2', [], NO_SUCH_PROJECT);
    expect(schemaDriftBreaker.isTripped(DRIFT_KEY)).toBe(true);
    expect(gen.calls()).toBe(3); // NOT 4 — the retry was halted by the trip

    const rows = parkedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.required_action_type).toBe('LLM_RETRY_OR_FIX');
    expect(rows[0]!.severity).toBe('HIGH');
    expect(JSON.parse(rows[0]!.context_payload).origin).toBe('OKFGenerator');
  });

  it('makes zero further LLM calls while tripped, and recovers after a reset', async () => {
    const gen = poisonedGenerator();

    await OKFGenerator.fromWorkflowRun(gen.fn, 'run-1', [], NO_SUCH_PROJECT);
    await OKFGenerator.fromWorkflowRun(gen.fn, 'run-2', [], NO_SUCH_PROJECT);
    expect(schemaDriftBreaker.isTripped(DRIFT_KEY)).toBe(true);
    const callsAtTrip = gen.calls();

    // A third invocation must not reach the model at all.
    await OKFGenerator.fromWorkflowRun(gen.fn, 'run-3', [], NO_SUCH_PROJECT);
    expect(gen.calls()).toBe(callsAtTrip);

    // ...and exactly one ticket exists, not one per subsequent attempt.
    expect(parkedRows()).toHaveLength(1);

    // Human resolution clears it; the next call attempts again.
    schemaDriftBreaker.reset(DRIFT_KEY);
    await OKFGenerator.fromWorkflowRun(gen.fn, 'run-4', [], NO_SUCH_PROJECT);
    expect(gen.calls()).toBeGreaterThan(callsAtTrip);
  });

  it('a schema-valid response resets the count so a healthy pipeline is never tripped', async () => {

    // Contrive a non-tripped breaker with historical strikes, then succeed.
    schemaDriftBreaker.recordFailure(DRIFT_KEY);
    schemaDriftBreaker.recordFailure(DRIFT_KEY);
    expect(schemaDriftBreaker.strikesFor(DRIFT_KEY)).toBe(2);

    const valid = async () => JSON.stringify([
      { type: 'rule', title: 'T', description: 'D', confidence: 0.9, tags: [], relatedConcepts: [] },
    ]);
    await OKFGenerator.fromWorkflowRun(valid, 'run-ok', [], NO_SUCH_PROJECT);

    expect(schemaDriftBreaker.strikesFor(DRIFT_KEY)).toBe(0);
    expect(parkedRows()).toHaveLength(0);
  });
});
