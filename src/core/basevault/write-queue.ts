import Database from 'better-sqlite3';
import { MessageChannel, MessagePort } from 'worker_threads';
import { db, dbPath, initDB } from './db';
import { log } from '../observability/logger';

/**
 * §5 / Phase F-6 — the single-writer write queue (WORKER-WRITE-TOPOLOGY.md).
 *
 * Until this module, every poolifier worker thread held its own write-capable
 * better-sqlite3 handle and issued INSERTs/DELETEs directly against the same
 * file the main thread wrote (WAL row/page locking was the ONLY serialization
 * — see the topology doc §1-§3). This module closes that gap:
 *
 *   worker thread ──postWriteOp(op)──▶ write port ──▶ main thread
 *                     (bounded,       (per-task      applyWriteOp(db, op)
 *                      sync,          MessageChannel, inside its own
 *                      429 on         see engine.ts / transaction)
 *                      overflow)      reflection.ts
 *
 * Contract (per §5 precondition 1 — "main-thread write-RPC endpoint exists
 * with backpressure, bounded queue + caller-visible drop/overflow"):
 *   - `postWriteOp(op)` is SYNCHRONOUS and returns
 *       200 — accepted (queued for the single writer, or applied locally when
 *             no channel is configured — the main-thread/test path)
 *       400 — invalid op (rejected BEFORE any enqueue)
 *       429 — the per-channel in-flight bound (MAX_PENDING_WRITES) is
 *             saturated; the caller SEES the overflow (no silent drop —
 *             every caller site surfaces it)
 *   - The main thread drains its port in FIFO order and applies each op in
 *     its own transaction. FIFO across one worker's channel means an insert
 *     posted after a prune op can no longer be pruned by that same sweep
 *     (§3's prune-vs-insert race — structurally removed by cutover).
 *
 * Threading note: workers import this module through the bundled worker.ts;
 * `postWriteOp` with no configured client applies LOCALLY on the current
 * thread's handle (the pre-cutover behavior) — this path is only reached
 * when a plugin executes without the engine's channel wiring (inline test
 * execution, direct `executePlugin()` unit tests).
 */

// ── op vocabulary ───────────────────────────────────────────────────────────
// One union covering all TWELVE §2a/§2b write sites. Embeddings travel as
// number[] because Float32Array is not structured-cloneable (the RPC hop
// would throw); applyWriteOp rehydrates them. Sizes stay small: 1536 dims.

export interface MemoryInsertOp {
  kind: 'memory_insert';
  id: string;
  content: string;
  type: string;
  projectId?: string | null;
  isAutoIngested: boolean;
  sourceTool?: string | null;
  embedding?: number[];
}

export interface LearningApprovalInsertOp {
  kind: 'learning_approval_insert';
  id: string;
  fact: string;
  confidence: number;
  sourceTool?: string | null;
  conflictWithId?: string;
  conflictReasoning?: string;
}

export interface TodoInsertOp {
  kind: 'todo_insert';
  id: string;
  projectId?: string | null;
  severity: string;
  escalationReason: string;
  requiredActionType: string;
  contextPayload: string;
}

export interface MemoryDeleteOp {
  kind: 'memory_delete';
  id: string;
}

export interface PruneStaleOp {
  kind: 'prune_stale';
  staleThreshold: number;
  minAccess: number;
}

export interface VecCleanupOrphansOp {
  kind: 'vec_cleanup_orphans';
}

export type WriteOp =
  | MemoryInsertOp
  | LearningApprovalInsertOp
  | TodoInsertOp
  | MemoryDeleteOp
  | PruneStaleOp
  | VecCleanupOrphansOp;

export interface WriteResult {
  /** 200 accepted (queued or applied locally) · 400 invalid op · 429 overflow */
  status: 200 | 400 | 429;
  /** Echo of the op's id when it carries one. */
  id?: string;
  error?: string;
  applied: 'queued' | 'local' | 'dropped';
}

/** Per-channel in-flight bound (§5: "bounded queue"). 100 files × 2 writes. */
export const MAX_PENDING_WRITES = 256;

/** A single apply slower than this is WAL-contention signal (one release). */
export const SLOW_APPLY_WARN_MS = 250;

// ── validation (the 400 path) ───────────────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** Returns an error string when the op is malformed, null when valid. */
export function validateWriteOp(op: unknown): string | null {
  if (typeof op !== 'object' || op === null) return 'op must be an object';
  const kind = (op as { kind?: unknown }).kind;
  switch (kind) {
    case 'memory_insert': {
      const o = op as MemoryInsertOp;
      if (!isNonEmptyString(o.id)) return 'memory_insert requires a non-empty id';
      if (!isNonEmptyString(o.content)) return 'memory_insert requires non-empty content';
      if (!isNonEmptyString(o.type)) return 'memory_insert requires a non-empty type';
      if (typeof o.isAutoIngested !== 'boolean') return 'memory_insert requires boolean isAutoIngested';
      if (o.embedding !== undefined && !Array.isArray(o.embedding)) return 'memory_insert embedding must be a number[]';
      return null;
    }
    case 'learning_approval_insert': {
      const o = op as LearningApprovalInsertOp;
      if (!isNonEmptyString(o.id)) return 'learning_approval_insert requires a non-empty id';
      if (!isNonEmptyString(o.fact)) return 'learning_approval_insert requires a non-empty fact';
      if (typeof o.confidence !== 'number' || !Number.isFinite(o.confidence)) return 'learning_approval_insert requires numeric confidence';
      return null;
    }
    case 'todo_insert': {
      const o = op as TodoInsertOp;
      if (!isNonEmptyString(o.id)) return 'todo_insert requires a non-empty id';
      if (!isNonEmptyString(o.severity)) return 'todo_insert requires a non-empty severity';
      if (!isNonEmptyString(o.escalationReason)) return 'todo_insert requires a non-empty escalationReason';
      if (!isNonEmptyString(o.requiredActionType)) return 'todo_insert requires a non-empty requiredActionType';
      if (typeof o.contextPayload !== 'string') return 'todo_insert requires a string contextPayload';
      return null;
    }
    case 'memory_delete': {
      const o = op as MemoryDeleteOp;
      if (!isNonEmptyString(o.id)) return 'memory_delete requires a non-empty id';
      return null;
    }
    case 'prune_stale': {
      const o = op as PruneStaleOp;
      if (!Number.isFinite(o.staleThreshold)) return 'prune_stale requires a numeric staleThreshold';
      if (!Number.isInteger(o.minAccess) || o.minAccess < 0) return 'prune_stale requires a non-negative integer minAccess';
      return null;
    }
    case 'vec_cleanup_orphans':
      return null;
    default:
      return `unknown write op kind: ${String(kind)}`;
  }
}

// ── the main-thread executor (the ONLY place these statements run) ───────────

type Db = Database.Database;

/** Apply one op on the single writer's connection, in its own transaction. */
export function applyWriteOp(target: Db, op: WriteOp): void {
  switch (op.kind) {
    case 'memory_insert': {
      const now = Date.now();
      if (op.isAutoIngested) {
        target.prepare(`
          INSERT INTO memory_quarantine (id, content, type, project_id, last_accessed_at, access_count, created_at, taint_flag, source_tool)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(op.id, op.content, op.type, op.projectId ?? null, now, 0, now, 1, op.sourceTool ?? null);
        if (op.embedding) {
          target.prepare(`
            INSERT INTO memory_quarantine_vec (id, embedding)
            VALUES (?, vec_quantize_binary(?))
          `).run(op.id, Float32Array.from(op.embedding));
        }
      } else {
        target.prepare(`
          INSERT INTO cerebro_memories_meta (id, content, type, project_id, last_accessed_at, access_count, created_at, source_tool)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(op.id, op.content, op.type, op.projectId ?? null, now, 0, now, op.sourceTool ?? null);
        if (op.embedding) {
          target.prepare(`
            INSERT INTO cerebro_memories_vec (id, embedding)
            VALUES (?, vec_quantize_binary(?))
          `).run(op.id, Float32Array.from(op.embedding));
        }
      }
      return;
    }
    case 'learning_approval_insert': {
      target.prepare(`
        INSERT INTO cerebro_learning_approvals (id, fact, confidence, status, source_run_id, created_at, conflict_with_id, conflict_reasoning, source_tool)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        op.id, op.fact, op.confidence, 'pending', null, Date.now(),
        op.conflictWithId ?? null, op.conflictReasoning ?? null, op.sourceTool ?? null,
      );
      return;
    }
    case 'todo_insert': {
      target.prepare(`
        INSERT INTO os_todos (
          id, project_id, source_module, context_payload,
          severity, escalation_reason, required_action_type, status, created_at
        ) VALUES (?, ?, 'CoreExec', ?, ?, ?, 'REVIEW', 'pending', ?)
      `).run(op.id, op.projectId ?? null, op.contextPayload, op.severity, op.escalationReason, Date.now());
      return;
    }
    case 'memory_delete': {
      target.prepare('DELETE FROM cerebro_memories_meta WHERE id = ?').run(op.id);
      target.prepare('DELETE FROM cerebro_memories_vec WHERE id = ?').run(op.id);
      return;
    }
    case 'prune_stale': {
      target.prepare(`
        DELETE FROM cerebro_memories_meta
        WHERE last_accessed_at < ? AND access_count < ?
      `).run(op.staleThreshold, op.minAccess);
      return;
    }
    case 'vec_cleanup_orphans': {
      target.prepare(`
        DELETE FROM cerebro_memories_vec
        WHERE id NOT IN (SELECT id FROM cerebro_memories_meta)
      `).run();
      return;
    }
  }
}

// ── worker→main transport ───────────────────────────────────────────────────

const WRITE_OP_KEY = '__nsWriteOp';
const WRITE_ACK_KEY = '__nsWriteAck';

interface WriteClient {
  port: MessagePort;
  pending: number;
}

let writeClient: WriteClient | null = null;

/**
 * Configure this thread's write client (worker side). Called once per task
 * from the worker's execute wrapper when the engine attached a write port.
 * `null` releases it and closes the port.
 */
export function configureWriteClient(port: MessagePort | null): void {
  if (writeClient && writeClient.port !== port) {
    try { writeClient.port.close(); } catch { /* already closed */ }
  }
  writeClient = port === null ? null : { port, pending: 0 };
  if (writeClient) {
    // In-flight accounting needs the writer's acks: the sink acks every
    // applied op, so pending tracks TRULY-in-flight ops (not lifetime
    // posts) — that is what makes MAX_PENDING_WRITES a real bound.
    writeClient.port.on('message', (msg: unknown) => {
      if ((msg as { [WRITE_ACK_KEY]?: unknown } | null | undefined)?.[WRITE_ACK_KEY]) {
        if (writeClient) writeClient.pending = Math.max(0, writeClient.pending - 1);
      }
    });
  }
}

/** The worker call site for every one of the 12 routed write statements. */
export function postWriteOp(op: WriteOp): WriteResult {
  const invalid = validateWriteOp(op);
  if (invalid) return { status: 400, error: invalid, applied: 'dropped' };

  if (!writeClient) {
    // No channel: apply locally (main thread / inline test execution).
    applyWriteOp(db, op);
    return 'id' in op
      ? { status: 200, id: op.id, applied: 'local' }
      : { status: 200, applied: 'local' };
  }

  if (writeClient.pending >= MAX_PENDING_WRITES) {
    // §5: "caller-visible drop/overflow semantics" — the caller SEES 429.
    stats.overflowRejects++;
    return { status: 429, error: `write queue saturated (${MAX_PENDING_WRITES} in flight)`, applied: 'dropped' };
  }

  writeClient.pending++;
  stats.enqueued++;
  writeClient.port.postMessage({ [WRITE_OP_KEY]: op });
  return 'id' in op
    ? { status: 200, id: op.id, applied: 'queued' }
    : { status: 200, applied: 'queued' };
}

/**
 * Throw-if-overflow wrapper for the sites that previously ran a raw
 * `.run()` (a write failure there aborted the plugin with an exception;
 * the cutover keeps that failure loud instead of silently skipping).
 */
export function postWriteOpOrThrow(op: WriteOp): void {
  const res = postWriteOp(op);
  if (res.status !== 200) {
    throw new Error(`[BaseVault] write op rejected (${res.status}): ${res.error ?? 'unknown'}`);
  }
}

// ── main-thread drain side ──────────────────────────────────────────────────

export interface WriteChannelStats {
  enqueued: number;
  applied: number;
  overflowRejects: number;
  invalidRejects: number;
  busyRejects: number;
  slowApplies: number;
  maxApplyMs: number;
}

/**
 * Process-wide counters — §5 precondition 5: "WAL contention logging
 * enabled for one release". Every apply records its duration; a single
 * apply over SLOW_APPLY_WARN_MS or any SQLITE_BUSY is logged and counted
 * so ordering assumptions the cutover could otherwise mask surface.
 */
export const stats: WriteChannelStats = {
  enqueued: 0,
  applied: 0,
  overflowRejects: 0,
  invalidRejects: 0,
  busyRejects: 0,
  slowApplies: 0,
  maxApplyMs: 0,
};

export interface WriteChannel {
  /** Resolves when the remote end closed AND every posted op was applied. */
  readonly done: Promise<void>;
  /** Ops posted by the worker on this channel. */
  readonly received: number;
  /** Ops received but not yet applied. */
  readonly inFlight: number;
  readonly remoteClosed: boolean;
  /**
   * Wait for the drain to settle (bounded by graceMs), then close the
   * main-side port. Resolves immediately in the healthy case: the worker
   * closes its port after its last post, so by the time the pool promise
   * settles, remoteClosed is true and inFlight is 0.
   */
  finishAndDrain(graceMs?: number): Promise<void>;
}

/** Default grace before abandoning a drain that never settles (mock pools). */
export const DRAIN_GRACE_MS = 250;

export function attachWriteChannel(port: MessagePort): WriteChannel {
  let received = 0;
  let inFlight = 0;
  let remoteClosed = false;
  let resolveDone: () => void;
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });

  const maybeSettle = (): void => {
    if (remoteClosed && inFlight === 0) resolveDone();
  };

  // Applies run through a sequential chain: message delivery is already
  // FIFO, and the chain keeps apply order FIFO even when a slow write
  // makes an individual apply await.
  let applyChain: Promise<void> = Promise.resolve();

  const applyOne = async (op: WriteOp): Promise<void> => {
    const startedAt = Date.now();
    try {
      const invalid = validateWriteOp(op);
      if (invalid) {
        stats.invalidRejects++;
        log.warn(`[BaseVault] write op rejected by sink validation: ${invalid}`);
      } else {
        applyWriteOp(db, op);
        stats.applied++;
      }
    } catch (err: any) {
      if (err?.code === 'SQLITE_BUSY') {
        stats.busyRejects++;
        log.warn(`[BaseVault] WAL contention: SQLITE_BUSY applying ${op.kind} (busy_timeout 5000ms exhausted)`);
      } else {
        log.error(`[BaseVault] write op ${op.kind} failed to apply:`, err);
      }
    } finally {
      const applyMs = Date.now() - startedAt;
      stats.maxApplyMs = Math.max(stats.maxApplyMs, applyMs);
      if (applyMs > SLOW_APPLY_WARN_MS) {
        stats.slowApplies++;
        log.warn(`[BaseVault] slow write apply ${applyMs}ms for ${op.kind} (WAL contention signal)`);
      }
      inFlight--;
      // Ack so the writer's in-flight bound reflects real backpressure.
      try { port.postMessage({ [WRITE_ACK_KEY]: true }); } catch { /* far end gone */ }
      maybeSettle();
    }
  };

  port.on('message', (msg: unknown) => {
    const op = (msg as { [WRITE_OP_KEY]?: unknown } | null | undefined)?.[WRITE_OP_KEY] as WriteOp | undefined;
    if (!op) return; // foreign/non-write message — never crash the drainer
    received++;
    inFlight++;
    applyChain = applyChain.then(() => applyOne(op));
  });

  port.on('close', () => {
    remoteClosed = true;
    maybeSettle();
  });

  return {
    done,
    get received() { return received; },
    get inFlight() { return inFlight; },
    get remoteClosed() { return remoteClosed; },
    async finishAndDrain(graceMs: number = DRAIN_GRACE_MS): Promise<void> {
      const deadline = Date.now() + graceMs;
      while (Date.now() < deadline) {
        if (remoteClosed && inFlight === 0) break;
        await new Promise((r) => setTimeout(r, 5));
      }
      if (!(remoteClosed && inFlight === 0)) {
        // Only reachable on a channel whose owner never closed the far end
        // (e.g. a mocked pool in tests that discards the transferred port).
        log.warn(
          `[BaseVault] write channel finalized undrained (remoteClosed=${remoteClosed}, inFlight=${inFlight}, received=${received})`,
        );
      } else if (received > 0) {
        log.info(
          `[BaseVault] write channel drained: ${received} op(s) applied, max apply ${stats.maxApplyMs}ms ` +
          `(busy=${stats.busyRejects}, slow=${stats.slowApplies})`,
        );
      }
      try { port.close(); } catch { /* already closed */ }
    },
  };
}

/** Create the main/worker channel pair (callers own both ends' wiring). */
export function createWriteChannelPair(): { port1: MessagePort; port2: MessagePort } {
  return new MessageChannel();
}

// ── read-only handles (§5 precondition 3) ───────────────────────────────────
// The worker's remaining DB touchpoints (project-path resolution, the verify
// node's prior-output read) acquire a READ-ONLY handle: a physical inability
// to write, not merely an unused write handle.

const isTestEnv = !!process.env.VITEST;

let readonlyHandle: Db | null = null;

/**
 * Open (memoized) a read-only connection for worker-thread SELECTs.
 * Production: a separate `readonly: true` connection to the same file —
 * better-sqlite3 enforces the flag in C++, so a write attempt throws
 * SQLITE_READONLY, which is the point. Tests: the shared per-thread
 * ':memory:' handle (a readonly open of :memory: would yield an empty db).
 */
export function openReadonlyHandle(): Db {
  if (readonlyHandle) return readonlyHandle;
  if (isTestEnv) {
    initDB();
    readonlyHandle = db;
    return readonlyHandle;
  }
  readonlyHandle = new Database(dbPath, { readonly: true, fileMustExist: true });
  return readonlyHandle;
}
