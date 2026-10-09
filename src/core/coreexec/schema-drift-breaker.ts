/**
 * Axiom 4 — schema-drift circuit breaker (F-CB-IMPL).
 *
 * Axiom 4 ("Deterministic Reality — the eradication of hallucination")
 * specifies a 3-strike breaker over third-party LLM response schemas: after
 * enough consecutive schema-validation failures the system must STOP retrying
 * and hand the task to a human instead of looping on a model that is clearly
 * not going to produce the contracted shape.
 *
 * P8-2 discipline, enforced by construction:
 *   - the COUNTER is a plain in-memory integer per key — no LLM call decides
 *     whether a strike happened, and none decides when the breaker trips;
 *   - the TRIP action is a deterministic `os_todos` insert, the same literal
 *     `LLM_RETRY_OR_FIX` and the same HIGH severity the existing §3.4 escalation
 *     path uses (`coreexec/validateDAG.ts`), so the Deference UI's existing
 *     queue renders these rows with no new vocabulary;
 *   - verification of a response is a schema/shape check, never a second
 *     generate call. An LLM is never asked to verify an LLM.
 *
 * Module boundary: CoreExec owns action and retries, which is why the breaker
 * lives here rather than in a provider adapter. `okf/generator.ts` — the one
 * retry loop over an LLM response schema that exists today — imports the
 * counter and consults it; it does not own the trip policy.
 *
 * Deliberate non-goal: this breaker does NOT decide whether a response is
 * valid. Callers that already validate a response (e.g. the OKF extractor's
 * `JSON.parse` + `Array.isArray` + shape filter) report the outcome. Keeping
 * validation in the caller and policy here means there is exactly one place
 * where "three in a row means stop" is written down.
 */
import crypto from 'crypto';
import { db } from '../basevault/db';
import { scoutEmitter } from '../scoutdaemon/sse';

/**
 * Consecutive schema-validation failures that trip the breaker.
 *
 * Three is the Axiom 4 figure. It is intentionally low: two retries already
 * cover a transient hallucination, and a third failure is evidence about the
 * pipeline rather than about the attempt.
 */
export const SCHEMA_DRIFT_STRIKE_LIMIT = 3;

/**
 * The `os_todos.required_action_type` literal every schema-drift escalation
 * carries. Asserted verbatim by tests and matched by `NotificationCenter`.
 */
export const LLM_RETRY_OR_FIX_ACTION = 'LLM_RETRY_OR_FIX';

export interface StrikeResult {
  /** Consecutive failures recorded for this key, including this one. */
  strikes: number;
  /** True when this failure is the one that reached the limit. */
  tripped: boolean;
}

export interface ParkSchemaDriftOptions {
  /**
   * Identity of the unit whose retries are being halted (e.g. the OKF
   * extraction tier/prompt label). Stored in the escalation payload so the
   * human reviewing the ticket can tell which pipeline drifted.
   */
  key: string;
  /** Last validation error text — the escalation reason shown in PortGrid. */
  validationError: string;
  /** Optional project scope; `os_todos.project_id` is nullable by design. */
  projectId?: string;
  /** Where the failure was observed. Free-form, payload-only (never a FK). */
  origin?: string;
}

/**
 * Deterministic 3-strike counter.
 *
 * State is per-instance and in-memory: a `Map` keyed by the caller's own
 * identity for the failing unit. Nothing is persisted per strike — only the
 * trip is durable, via `parkSchemaDriftTask`. That is intentional: a strike
 * count is retry bookkeeping, and the Breaker's contract is "stop retrying",
 * which the caller enforces in-process by consulting `shouldAttempt`.
 *
 * Concurrency: `recordFailure` and `recordSuccess` are synchronous and do not
 * await, so two interleaved callers cannot observe a torn count.
 */
export class SchemaDriftBreaker {
  private readonly strikes = new Map<string, number>();

  constructor(private readonly limit: number = SCHEMA_DRIFT_STRIKE_LIMIT) {
    if (!Number.isInteger(limit) || limit < 1) {
      // A non-positive limit would trip on a success path or never trip at
      // all; both are silent policy failures, so fail loudly at construction.
      throw new Error(`SchemaDriftBreaker: limit must be a positive integer (got ${limit})`);
    }
  }

  /** Consecutive failures currently recorded for `key` (0 when healthy). */
  strikesFor(key: string): number {
    return this.strikes.get(key) ?? 0;
  }

  /**
   * Whether the caller may run another automated attempt for `key`.
   *
   * `false` once the limit is reached — this is the "halt automated retries"
   * half of the Axiom. It stays false until an explicit `reset` (a human
   * resolution, or a new task identity), so a tripped breaker cannot be
   * un-tripped by simply trying again.
   */
  shouldAttempt(key: string): boolean {
    return this.strikesFor(key) < this.limit;
  }

  /** True once `key` has hit the limit. */
  isTripped(key: string): boolean {
    return !this.shouldAttempt(key);
  }

  /**
   * Record one schema-validation failure for `key` and report the new state.
   *
   * `tripped` is true only on the failure that reaches the limit, so a caller
   * that parks the task on trip does it exactly once rather than on every
   * subsequent failure.
   */
  recordFailure(key: string): StrikeResult {
    const strikes = this.strikesFor(key) + 1;
    this.strikes.set(key, strikes);
    return { strikes, tripped: strikes >= this.limit };
  }

  /**
   * Record a schema-valid response, resetting the consecutive count.
   *
   * Consecutive is the whole point: a single success means the pipeline can
   * produce the contracted shape, so accumulated strikes are not evidence
   * about it any more. Only a success resets — an absent call does not.
   */
  recordSuccess(key: string): void {
    this.strikes.delete(key);
  }

  /** Clear one key (human resolution of a parked task, or a fresh identity). */
  reset(key: string): void {
    this.strikes.delete(key);
  }

  /** Clear every key. Boot/test hygiene; not part of the trip policy. */
  resetAll(): void {
    this.strikes.clear();
  }
}

/**
 * Process-wide breaker used by the wired-in callers.
 *
 * Exported as a singleton because the strike count only means anything if the
 * same instance observes consecutive attempts for a given key; a fresh
 * instance per call would count every failure as the first.
 */
export const schemaDriftBreaker = new SchemaDriftBreaker();

/**
 * Deterministic trip action: park the drifted task into `os_todos` and surface
 * it to PortGrid.
 *
 * Mirrors `escalateBlockedDAGToOsTodos` (`coreexec/validateDAG.ts`) — same
 * table, same `HIGH` severity, same `LLM_RETRY_OR_FIX` action type, same
 * `confidence: 0.0` so the row always crosses the Deference UI's 0.70
 * attention threshold — because a drifted schema and a blocked DAG are the
 * same thing to the person reviewing them: automated work that stopped and
 * needs a decision.
 *
 * `os_todos.dag_node_id` is left NULL: this escalation is not a DAG node, and
 * the column carries no foreign key (see the `os_todos` DDL in
 * `basevault/db.ts`), so no placeholder run/task row is fabricated to satisfy
 * one. Fabricating rows to satisfy a constraint that no longer exists would
 * itself be the kind of invented state Axiom 4 exists to prevent.
 *
 * Never throws on a DB failure: a breaker trip must not be able to take down
 * the pipeline that is already failing. A failed escalation is reported and
 * swallowed — the strike count has already halted the retries, which is the
 * safety property that matters.
 */
export function parkSchemaDriftTask(options: ParkSchemaDriftOptions): { todoId: string } | null {
  const { key, validationError, projectId, origin } = options;
  const todoId = crypto.randomUUID();
  const now = Date.now();

  const contextPayload = JSON.stringify({
    schema_drift_key: key,
    origin: origin ?? 'SchemaDriftBreaker',
    strikes: SCHEMA_DRIFT_STRIKE_LIMIT,
  });

  try {
    db.prepare(
      `INSERT INTO os_todos
         (id, project_id, source_module, context_payload, severity, escalation_reason, required_action_type, status, created_at, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      todoId,
      projectId ?? null,
      'CoreExecSchemaDrift',
      contextPayload,
      'HIGH',
      validationError,
      LLM_RETRY_OR_FIX_ACTION,
      'open',
      now,
      0.0
    );
  } catch (err) {
    console.error('[SchemaDriftBreaker] failed to park drifted task (retries already halted):', err);
    return null;
  }

  try {
    scoutEmitter.emit('update', {
      type: 'TODO_ESCALATED',
      todoId,
      workflowId: key,
      origin: origin ?? 'SchemaDriftBreaker',
      reason: validationError,
      timestamp: now,
    });
  } catch (err) {
    // Observability is best-effort; the durable row above is the record.
    console.warn('[SchemaDriftBreaker] scout emit failed (row written):', err);
  }

  return { todoId };
}
