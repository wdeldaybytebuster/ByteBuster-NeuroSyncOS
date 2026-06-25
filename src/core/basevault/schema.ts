import { z } from 'zod';

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  created_at: z.number().int(),
});
export type Project = z.infer<typeof ProjectSchema>;

// §3.3 — 'blocked-by-validation' is a sentinel status written by
// escalateBlockedDAGToOsTodos (§3.4) into the FK-satisfying placeholder
// workflow_runs row. It must be a first-class enum member so that
// /api/basevault/run/:runId rehydration responses type-check, and so that
// the RunHistory UI can render these rows distinctly from 'failed' runs.
export const WorkflowRunSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  dag_layout: z.string(), // JSON string representing the DAG template
  status: z.enum(['pending', 'running', 'completed', 'failed', 'blocked-by-validation']),
  created_at: z.number().int(),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

// §3.3 mirrors the run-level status — escalation writes a sentinel task row
// (status='blocked-by-validation') so cleanup scripts and the
// NotificationCenter can target a single escalation block reliably. Keeping
// the enum symmetric means a single safeParse axis covers both rows.
export const TaskSchema = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  status: z.enum(['unclaimed', 'claimed', 'completed', 'failed', 'blocked-by-validation']),
  claim_lease: z.number().int().nullable(),
  output_data: z.string().nullable(), // Redacted JSON payload
});
export type Task = z.infer<typeof TaskSchema>;

// §3.3 — single helper used by every /api/basevault/* endpoint that returns
// a list. Runtime truth is enforced here at the HTTP boundary instead of
// relying on type-system-only discipline. Future callers should import
// `partitionBySchema` rather than open-coding a safeParse loop.
// §3.3 — per-row detail-log budget. Larger than typical hand-fix batches so
// the operator sees actionable ids in one screen; small enough to avoid the
// ~120 lines/min flood that would happen on a dirty DB /runs poll (3s cadence).
const PER_ROW_LOG_CAP = 5;

export interface PartitionResult<T> {
  /** Rows that passed safeParse with shape T. */
  clean: T[];
  /** IDs (stringified) of rows that failed safeParse, in input order. */
  dirtyIds: string[];
}

export function partitionBySchema<T>(
  rawRows: Record<string, unknown>[],
  schema: z.ZodType<T>,
  label: string,
): PartitionResult<T> {
  const clean: T[] = [];
  const dirtyIds: string[] = [];
  for (const row of rawRows) {
    const parsed = schema.safeParse(row);
    if (parsed.success) {
      clean.push(parsed.data);
    } else {
      // Use a sentinel for any falsy id (undefined / null / '' / NaN / 0) so
      // the operator log always carries a usable identifier. raw `undefined`,
      // `null` or empty-string id rows fail UUID validation anyway, but the
      // raw unstringified values would be untraceable in stderr. UUID-shaped
      // ids are always truthy strings, so this is correct by construction.
      const id = !row.id ? '<missing-id>' : String(row.id);
      dirtyIds.push(id);
      // Per-row detail only emitted for the first PER_ROW_LOG_CAP entries;
      // remaining rows are summarised at the tail so a dirty DB does not
      // flood stderr on every /runs poll (3s cadence).
      if (dirtyIds.length <= PER_ROW_LOG_CAP) {
        console.error(`[§3.3] ${label} dropped schema-dirty row ${id}:`, parsed.error.format());
      }
    }
  }
  // Cap-boundary seam: above the cap, per-row-detail is capped + a single
  // suppressed-summary line ships with the full id list and the suppression
  // count. Below the cap, per-row detail already covers all rows; the
  // trailing short summary is suppressed to avoid double-listing. Exactly at
  // the cap, per-row already shows everything; suppress the redundant summary.
  if (dirtyIds.length > PER_ROW_LOG_CAP) {
    console.error(`[§3.3] ${label} suppressed per-row detail for ${dirtyIds.length - PER_ROW_LOG_CAP} more rows; total dropped = ${dirtyIds.length}: ${dirtyIds.join(', ')}`);
  } else if (dirtyIds.length > 0 && dirtyIds.length < PER_ROW_LOG_CAP) {
    // Below cap — operator gets verbose per-row details above plus a quick
    // id list summary here for grep-friendly cross-reference.
    console.error(`[§3.3] ${label} dropped ${dirtyIds.length} schema-dirty rows: ${dirtyIds.join(', ')}`);
  }
  return { clean, dirtyIds };
}
