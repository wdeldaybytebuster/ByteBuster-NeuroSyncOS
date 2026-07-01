/**
 * §3.4 — Shared DAG validation, used by both:
 *   - refreshJobs (cron-driven paths reading from the workflows table)
 *   - /api/coreexec/approve (interactive run-approval path)
 *
 * Centralising the parse → structure → semantics pipeline here prevents drift
 * between the two surfaces and ensures a malicious dag_template inserted
 * directly into SQLite cannot bypass §1.2 / §2.0 safety boundaries.
 */
import { ValidatorLogic } from '../scopelogic/validator';
import { db } from '../basevault/db';
import { scoutEmitter } from '../scoutdaemon/sse';
import crypto from 'crypto';
import type { DAGProposal } from '../scopelogic/interview';

export interface ValidateDAGResult {
  /** Validator message if validation failed (SA-06/SA-01/SA-04/SA-05/SA-07 / Parse Violation). null when accepted. */
  error: string | null;
  /** Parsed proposal if structurally valid (even if validator flagged it). null on parse failure or SA-06. */
  proposal: DAGProposal | null;
}

const EMPTY_DAG_MSG = 'SA-06 Violation: dag_template contains no nodes.';

/**
 * Validate a raw dag_template string (the cron / scheduler path).
 * Returns `{ error, proposal }` — never throws on parse errors.
 */
export function validateDAGTemplate(templateStr: string): ValidateDAGResult {
  if (typeof templateStr !== 'string' || templateStr.trim() === '') {
    return { error: EMPTY_DAG_MSG, proposal: null };
  }
  let proposal: any;
  try {
    proposal = JSON.parse(templateStr);
  } catch (err: any) {
    return {
      error: `Parse Violation: dag_template is not valid JSON (${err?.message ?? 'unknown'}).`,
      proposal: null,
    };
  }
  return validateDAGProposal(proposal);
}

/**
 * Validate a parsed proposal object (the /api/coreexec/approve path).
 * Structural SA-06 + ValidatorLogic gate. Returns `{ error, proposal }`.
 */
export function validateDAGProposal(proposal: unknown): ValidateDAGResult {
  if (
    !proposal ||
    typeof proposal !== 'object' ||
    !Array.isArray((proposal as any).nodes) ||
    (proposal as any).nodes.length === 0
  ) {
    return { error: EMPTY_DAG_MSG, proposal: null };
  }
  return {
    error: ValidatorLogic.validate(proposal as DAGProposal),
    proposal: proposal as DAGProposal,
  };
}

/**
 * §3.4 escalation helper — writes a HIGH-severity os_todos row tracking the
 * blocked DAG and emits a TODO_ESCALATED scout update so the Administrative
 * Cockpit surfaces it.
 *
 * FK chain:
 *   os_todos.dag_node_id → tasks.id → workflow_runs.id
 *
 * To satisfy the FK constraint without spinning up a real run, we pre-insert
 * a placeholder `workflow_runs` + one `tasks` row in a single transaction,
 * then REFERENCE that tasks.id as the os_todos.dag_node_id. The placeholder
 * rows are marked with status='blocked-by-validation' so cleanup scripts and
 * the NotificationCenter can identify and prune them separately from real runs.
 *
 * `workflowId` is the workflows.id (or a synthetic run-id for /approve path
 * routes where no workflow row exists). It is stored only in the scout event
 * payload, NOT in any FK-bound column, so it may be free-form.
 */
export function escalateBlockedDAGToOsTodos(
  workflowId: string,
  validationError: string,
  origin: 'scheduler' | 'approve-route' = 'scheduler',
): { todoId: string; sentinelTaskId: string; runId: string } {
  const sentinelTaskId = `blocked-task-${crypto.randomUUID()}`;
  const runId = `blocked-run-${crypto.randomUUID()}`;
  const todoId = crypto.randomUUID();
  const now = Date.now();

  // Single transaction so a partial insert can never leave a dangling FK.
  // Each escalation gets its own project row so cleanup jobs and the
  // NotificationCenter can target a single sentinel block reliably — otherwise
  // every escalation would share one fixed-id row and the most-recent write
  // would overwrite every previous block's DAG context.
  const sentinelProjectId = `blocked-project-${crypto.randomUUID()}`;
  const insertBlocked = db.transaction(() => {
    db.prepare(
      `INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)`,
    ).run(sentinelProjectId, '__BLOCKED_BY_VALIDATION__', now);

    db.prepare(
      `INSERT INTO workflow_runs
         (id, project_id, dag_layout, status, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      runId,
      sentinelProjectId,
      JSON.stringify({
        blocked_by_validation: true,
        reason: validationError,
        origin_workflow_id: workflowId,
        origin,
      }),
      'blocked-by-validation',
      now,
    );

    db.prepare(
      `INSERT INTO tasks (id, run_id, status, claim_lease, output_data)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      sentinelTaskId,
      runId,
      'blocked-by-validation',
      null,
      JSON.stringify({ validation_error: validationError, origin_workflow_id: workflowId }),
    );

    db.prepare(
      `INSERT INTO os_todos
         (id, dag_node_id, severity, escalation_reason, required_action_type, status, created_at, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      todoId,
      sentinelTaskId,
      'HIGH',
      validationError,
      'LLM_RETRY_OR_FIX',
      'open',
      now,
      // Deterministic structural validation failure, not an AI judgment call —
      // always below the 0.70 threshold, always routed to human review.
      0.0,
    );
  });
  insertBlocked();

  scoutEmitter.emit('update', {
    type: 'TODO_ESCALATED',
    todoId,
    workflowId,
    sentinelTaskId,
    runId,
    origin,
    reason: validationError,
    timestamp: now,
  });

  return { todoId, sentinelTaskId, runId };
}
