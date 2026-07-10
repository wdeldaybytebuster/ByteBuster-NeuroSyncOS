// Shared, framework-agnostic logic for PortGrid's unified approval queue.
//
// PortGrid used to run TWO disconnected "pending approval" systems on one
// screen: os_todos (per-DAG-node escalations) and a staged DAG proposal. The
// "Attention Required" widget's "All Clear" empty state only ever checked the
// todos, so a user could see "All Clear" while a real proposal sat pending in
// another widget. This module normalizes both sources into one shape and
// splits them by the Deference UI confidence threshold so the queue — and the
// empty state — is honest about everything pending.

// Deference UI (Master Spec §4): items at/above this confidence skip the
// per-item review row and go to the quiet bulk-approve pill bar instead.
// This is the *default* threshold, used when the CoreExec "Autonomy &
// Delegation" dial (`src/ui/components/AutonomyDials.tsx`) hasn't been moved
// from its own default of 30% — see `autonomyToThreshold` below.
export const DEFERENCE_THRESHOLD = 0.7;

/**
 * CoreExec "Autonomy & Delegation" dial → Deference UI auto-approve
 * threshold.
 *
 * The slider persists an `autonomy` percentage (0-100, default 30) to
 * `system_settings`, but until this wiring nothing read it back — both this
 * module and the server-side confidence re-check in
 * `src/server/routes/todos.ts` independently hardcoded 0.70. Higher autonomy
 * means the user trusts the system to auto-approve more, i.e. a LOWER
 * confidence bar: `threshold = 1 - autonomy/100`. The default autonomy of
 * 30% maps to exactly 0.7, matching the pre-existing hardcoded constant, so
 * a fresh install (autonomy setting absent, dial shows its default 30%)
 * behaves identically to before this change.
 *
 * Kept here (not imported by the server) and mirrored by an equivalent
 * formula in `src/server/routes/todos.ts` — the same duplication pattern
 * already used for `DEFERENCE_THRESHOLD` itself, since the client bundle and
 * the server process don't share a module graph in this project.
 */
export function autonomyToThreshold(autonomy: number): number {
  const clamped = Math.min(100, Math.max(0, autonomy));
  return 1 - clamped / 100;
}

export type ApprovalKind = 'todo' | 'proposal';

// Normalized queue item. `proposal` carries the raw DAG proposal JSON for
// proposal-kind items so the approve action can forward it to CoreExec without
// the renderer needing to know the underlying data source.
export interface ApprovalItem {
  id: string;
  kind: ApprovalKind;
  description: string;
  confidence: number;
  proposal?: any;
}

export interface OsTodoLike {
  id: string;
  escalation_reason: string;
  severity?: string;
  required_action_type?: string;
  confidence: number;
}

export interface PendingProposalLike {
  id: string;
  confidence: number;
  proposal: any;
}

/**
 * Merge os_todos and (optionally) a single staged proposal into one normalized
 * list. Proposals are represented with their raw JSON attached so the caller
 * can route an approval to CoreExec.
 */
export function buildApprovalItems(
  todos: OsTodoLike[],
  proposal: PendingProposalLike | null | undefined,
): ApprovalItem[] {
  const items: ApprovalItem[] = todos.map((t) => ({
    id: t.id,
    kind: 'todo' as const,
    description: t.escalation_reason,
    confidence: t.confidence,
  }));

  if (proposal && proposal.id) {
    const nodeCount = Array.isArray(proposal.proposal?.nodes) ? proposal.proposal.nodes.length : 0;
    items.push({
      id: proposal.id,
      kind: 'proposal',
      description: `Workflow proposal awaiting approval (${nodeCount} step${nodeCount === 1 ? '' : 's'})`,
      confidence: proposal.confidence,
      proposal: proposal.proposal,
    });
  }

  return items;
}

/**
 * Confidence-gated split. Low-confidence items (< threshold) need a human look
 * (the "Attention Required" list); high-confidence items go to the quiet
 * bulk-approve pill bar.
 */
export function partitionByConfidence(
  items: ApprovalItem[],
  threshold: number = DEFERENCE_THRESHOLD,
): { low: ApprovalItem[]; high: ApprovalItem[] } {
  const low: ApprovalItem[] = [];
  const high: ApprovalItem[] = [];
  for (const item of items) {
    if (item.confidence >= threshold) high.push(item);
    else low.push(item);
  }
  return { low, high };
}

/**
 * Split a set of ids into per-backend buckets so a mixed-kind bulk action can
 * dispatch todos to /api/todos/* and proposals to /api/system/proposals/* +
 * /api/coreexec/approve. Ids not present in `items` are ignored.
 */
export function partitionByKind(
  items: ApprovalItem[],
  ids: string[],
): { todoIds: string[]; proposals: ApprovalItem[] } {
  const byId = new Map(items.map((i) => [i.id, i]));
  const todoIds: string[] = [];
  const proposals: ApprovalItem[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) continue;
    if (item.kind === 'proposal') proposals.push(item);
    else todoIds.push(id);
  }
  return { todoIds, proposals };
}
