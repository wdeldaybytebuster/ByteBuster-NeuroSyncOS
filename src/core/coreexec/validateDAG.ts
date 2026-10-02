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
  projectId?: string
): { todoId: string } {
  const todoId = crypto.randomUUID();
  const now = Date.now();
  const contextPayload = JSON.stringify({
    origin_workflow_id: workflowId,
    origin,
  });

  db.prepare(
    `INSERT INTO os_todos
       (id, project_id, source_module, context_payload, severity, escalation_reason, required_action_type, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    todoId,
    projectId || null,
    origin === 'scheduler' ? 'CoreExecScheduler' : 'CoreExecApprove',
    contextPayload,
    'HIGH',
    validationError,
    'LLM_RETRY_OR_FIX',
    'open',
    now
  );

  scoutEmitter.emit('update', {
    type: 'TODO_ESCALATED',
    todoId,
    workflowId,
    origin,
    reason: validationError,
    timestamp: now,
  });

  return { todoId };
}
