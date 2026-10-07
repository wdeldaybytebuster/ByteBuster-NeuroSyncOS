/**
 * §2.1-C1 — V1 remediation: table + column allowlists, identifier validation.
 *
 * Pure module: no DB, no I/O. Transcribed verbatim from
 * docs/security/ARCHITECT-security-remediation-critical-perimeter.md §2.1
 * (the "exact content an Engineer can transcribe" block), with the unused
 * `zod` import removed to keep `npx tsc --noEmit` clean.
 *
 * Every incoming sync delta is validated here BEFORE any SQL is prepared in
 * NodeTransport.handleSyncDelta — identifiers are proven members of an
 * allowlist; every value is bound as a `?` parameter.
 */

/** Derived from db.ts:713-758 — the ONLY tables the sync triggers ever write. */
export const SYNC_TABLES = {
  projects:      ['id', 'name', 'created_at'],
  workflow_runs: ['id', 'project_id', 'status', 'dag_layout', 'track', 'created_at', 'completed_at'],
  tasks:         ['id', 'run_id', 'status'],
} as const;
export type SyncTable = keyof typeof SYNC_TABLES;

/** DELETE is never emitted by any trigger in db.ts (INSERT/UPDATE only) — refuse it. */
export const SYNC_ACTIONS = ['INSERT', 'UPDATE'] as const;
export type SyncAction = (typeof SYNC_ACTIONS)[number];

/** TEXT PKs in this codebase: UUIDs, slugs like 'system-maintenance', 'test-proj-1'. */
export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_:.-]{0,127}$/;

/**
 * 'parked' is a real runtime status for BOTH tables (engine.ts:199, :256) even though
 * WorkflowRunSchema/TaskSchema omit it — validate against the superset actually written,
 * not against the Zod enums, or legitimate syncs get dropped.
 */
const RUN_STATUS = new Set(['pending','running','completed','failed','blocked-by-validation','parked']);
const TASK_STATUS = new Set(['unclaimed','claimed','completed','failed','blocked-by-validation','parked']);

const MAX_PAYLOAD_BYTES = 256 * 1024;   // dag_layout is the largest legal column
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const MAX_FUTURE_MS = 60_000;

export type DeltaReject =
  | 'unknown-table' | 'unsupported-action' | 'unknown-column' | 'bad-id'
  | 'bad-status' | 'bad-timestamp' | 'payload-too-large' | 'bad-type';

export type ValidatedDelta = {
  table: SyncTable; action: SyncAction; timestamp: number;
  id: string; columns: string[]; values: unknown[];
  setSql: string;   // "col1 = ?, col2 = ?" built ONLY from allowlisted identifiers
  insertSql: string;// "(col1, col2) VALUES (?, ?)"
};

export function parseDelta(raw: unknown): { ok: true; delta: ValidatedDelta } | { ok: false; reason: DeltaReject } {
  if (raw === null || typeof raw !== 'object') return { ok: false, reason: 'bad-type' };
  const d = raw as Record<string, unknown>;
  if (typeof d.table_name !== 'string' || !(d.table_name in SYNC_TABLES)) return { ok: false, reason: 'unknown-table' };
  const table = d.table_name as SyncTable;
  if (typeof d.action !== 'string' || !(SYNC_ACTIONS as readonly string[]).includes(d.action)) return { ok: false, reason: 'unsupported-action' };
  const action = d.action as SyncAction;
  if (typeof d.timestamp !== 'number' || !Number.isFinite(d.timestamp)) return { ok: false, reason: 'bad-timestamp' };
  const now = Date.now();
  if (d.timestamp < now - MAX_AGE_MS || d.timestamp > now + MAX_FUTURE_MS) return { ok: false, reason: 'bad-timestamp' };
  if (typeof d.payload !== 'string' || d.payload.length > MAX_PAYLOAD_BYTES) return { ok: false, reason: 'payload-too-large' };

  let payload: unknown;
  try { payload = JSON.parse(d.payload); } catch { return { ok: false, reason: 'bad-type' }; }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, reason: 'bad-type' };
  const p = payload as Record<string, unknown>;

  if (typeof p.id !== 'string' || !ID_RE.test(p.id)) return { ok: false, reason: 'bad-id' };

  const allowed = SYNC_TABLES[table] as readonly string[];
  const columns: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (!(allowed as readonly string[]).includes(k)) return { ok: false, reason: 'unknown-column' };
    if (v !== null && typeof v === 'object') return { ok: false, reason: 'bad-type' };   // only scalars
    if (k === 'status') {
      const set = table === 'tasks' ? TASK_STATUS : RUN_STATUS;
      if (typeof v !== 'string' || !set.has(v)) return { ok: false, reason: 'bad-status' };
    }
    if (k === 'created_at' || k === 'completed_at') {
      if (v !== null && (typeof v !== 'number' || !Number.isInteger(v))) return { ok: false, reason: 'bad-type' };
    }
    if ((k === 'name' || k === 'dag_layout' || k === 'project_id' || k === 'run_id') && typeof v !== 'string') {
      return { ok: false, reason: 'bad-type' };
    }
    columns.push(k); values.push(v);
  }
  if (columns.length === 0) return { ok: false, reason: 'bad-type' };
  if (action === 'UPDATE' && !columns.includes('id')) return { ok: false, reason: 'bad-id' };

  return { ok: true, delta: {
    table, action, timestamp: d.timestamp, id: p.id as string,
    columns, values,
    setSql: columns.map(c => `${c} = ?`).join(', '),
    insertSql: `(${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
  }};
}

/**
 * §2.1-C1 — `assertIdentifier()` (listed in the plan's Files table): a single
 * place that enforces the identifier shape used anywhere sync SQL is built.
 * Defense-in-depth for call sites that must interpolate an identifier at all.
 */
export function assertIdentifier(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && name.length <= 64 && /^[A-Za-z0-9_]+$/.test(name);
}
