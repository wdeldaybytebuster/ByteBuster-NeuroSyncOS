# Worker Write Topology — WAL Contract, Interim Bounds, RPC-Cutover Preconditions

Status: P3-S6 — DOC + BOUND only. No RPC cutover (gated: Phase 5).

> **F-6 UPDATE (2026-10-09): RPC cutover LANDED.** §5 below records the
> landed design, its precondition-by-precondition evidence, and the known
> remaining transitive-handle surface. The §1-§4 as-built/interim-bound
> history is kept verbatim — it documents the topology the cutover
> replaced. Related: roll-in B6 (`docs/security/FOLLOWUPS-P2-ROLLIN.md:60-63`).

## 1. Current topology (as-built)

Two independent poolifier `DynamicThreadPool`s, each hard-capped at
`safeMaxThreads = 2` (OOM guard for 8-core/6 GB devices — both pools run
simultaneously):

- CoreExec pool — `src/core/coreexec/worker-pool.ts:10-12` (cap), `:96-99`
  (1 min / 2 max threads), worker file `worker.js` bundle.
- Cerebro pool — `src/core/memory/cerebro/worker-pool.ts:12-14` (cap),
  `:60-62` (1 min / 2 max threads), worker file `worker-cerebro.js` bundle.

Each worker thread opens its OWN better-sqlite3 connection to the same
`.data/neurosync.db` file (production; tests get private `:memory:` DBs).
Concurrency control today = SQLite WAL + `busy_timeout`:

- `src/core/basevault/db.ts:103-107` — `journal_mode = WAL`, `busy_timeout = 5000`.
- Nothing serializes worker→main writes beyond WAL row/page locking and the
  5 s busy retry. This document is the interim contract until the Phase 5
  RPC cutover (§5).

## 2. Write-site inventory (workers hold write-capable handles TODAY)

### 2a. CoreExec worker (`src/core/coreexec/worker.ts`)

The worker thread acquires its handle lazily per task:

- `:323-337` — `require('../basevault/db')` + `initDB()` + SELECT
  `tasks ⨝ workflow_runs` to resolve `project_id` (read-only; safe).
- `:365-367` — `const { db: workerDb } = require('../basevault/db')` passed
  into `executePlugin` — **this is the write-capable handle**. Every site
  below writes through it from inside a worker thread.

`executePlugin` write sites (all via `workerDb` or the injected
`CerebroVectorStore`, which itself writes — `vector.ts:86-107`):

- `gitnexus_mapper` — `:87` vector insert (`CerebroVectorStore.insert`
  → `cerebro_memories_meta` + `cerebro_memories_vec`, `vector.ts:99-107`).
- `okf_indexer` files batch — `:139` vector insert + `:143-147` `os_todos`
  INSERT **per file** (unbounded before P3-S6; now count/size-capped, §4).
- `okf_indexer` URL fetch — `:199` quarantine vector insert (`vector.ts:86-93`
  → `memory_quarantine*`) + `:204` `os_todos` INSERT. Fetch itself is
  governed (`egressFetch`, 15 s / 2 MB cap, `:177-181`).
- `schema_patcher` — `:253` `os_todos` INSERT (high severity).

Read-only worker sites (safe, stay as-is under any topology):

- `:394` — verify-node prior-`output_data` SELECT.
- `:70`, `:229` — project path resolution SELECTs.

### 2b. Cerebro pool (`src/core/memory/cerebro/`)

- `reflection.ts:71-83` — dispatch: test mode runs the sweep INLINE on the
  main thread (`:71-72`); production offloads to `cerebroWorkerPool`
  (`:75-79`, `require('./worker-pool')`).
- `reflection-sweep.ts:14` — worker-side `initDB()` (own connection).
- `reflection-sweep.ts:31-34` — `cerebro_learning_approvals` INSERT
  (conflict path) + `:39` vector insert, **from the worker thread**.
- `reflection-sweep.ts:55-57, :65-77` — habituation/staleness prune DELETEs
  (`cerebro_memories_meta` + `_vec`), **from the worker thread**. These
  DELETE against tables the main thread also reads (`vector.ts:133,182`
  SELECTs) — WAL serializes, but there is no application-level mutual
  exclusion with concurrent main-thread inserts.

### 2c. Main-thread writers (the other side of every race)

- `engine.ts:144,151,168,176,199,203` — `workflow_runs` status transitions.
- `engine.ts:232` — `claimTask` (`queue.ts:48-67`, BEGIN IMMEDIATE —
  the ONE properly serialized cross-thread primitive, §3).
- `engine.ts:249,256,356` — task park/complete UPDATEs (`output_data`).
- `reflection.ts:71-72` inline sweep (test mode) — same statements as §2b
  but on the main connection.

## 3. Claim races (analyzed, no change)

Task claiming is safe TODAY: `claimTask` (`queue.ts:48-67`) runs in a
`db.transaction(...).immediate` (BEGIN IMMEDIATE), so the SELECT-then-UPDATE
is atomic across connections — two dispatch ticks (or a tick vs a stale
lease) cannot double-claim. Lease expiry (`claim_lease < now()`, `:57`)
allows re-claim of crashed workers without a sweeper process.

What is NOT race-safe (documented, accepted interim risk):

- Worker `os_todos`/vector INSERTs vs main-thread reads — WAL-serialized at
  the page level; no lost writes, but no ordering guarantees either. All
  such rows are quarantine/review surfaces (human-gated downstream), so
  ordering insensitivity holds by construction.
- Cerebro prune DELETEs vs concurrent inserts — a memory inserted between
  the SELECT (`:45`) and DELETE (`:55-69`) in the same sweep can be pruned
  in the same pass it was created. Bounded impact (background preference
  memory, re-learnable); the RPC cutover (§5) removes it structurally.

## 4. Interim bound (P3-S6, this commit)

`worker.ts:49-50` — `MAX_OKF_FILES_PER_TASK = 100`,
`MAX_OKF_FILE_BYTES = 1_000_000`, enforced at the files-batch acquisition
path (`:106-160`): over-cap files are deferred, oversize/unreadable files
are skipped, both counted and surfaced in the task summary + a `console.warn`
— never silent. Pinned by `worker-plugin-bounds.test.ts` (4 cases).
Rationale: the files array arrives unbounded from idle flushes; without a
cap one pathological flush = 10k vector INSERTs + 10k `os_todos` INSERTs
from a single worker thread on an edge node.

## 5. RPC-cutover (Phase F — LANDED 2026-10-09)

**Status: LANDED.** The single-writer topology (workers read-only / routed
writes to the main thread) is implemented and tested. Precondition-by-
precondition evidence:

1. **Main-thread write endpoint with backpressure** — `src/core/basevault/write-queue.ts`.
   `postWriteOp(op)` is synchronous and returns **200** (accepted: queued
   on the per-task MessageChannel, or applied locally on the main thread /
   in tests), **400** (invalid op, rejected pre-enqueue — every field
   validated by `validateWriteOp`), **429** (`MAX_PENDING_WRITES = 256`
   in flight — caller-visible overflow, never a silent drop). The sink
   (`attachWriteChannel`) drains FIFO through a sequential apply chain,
   acks every applied op so the bound tracks real backpressure, and logs
   per-apply durations with a 250 ms slow-apply warn + SQLITE_BUSY
   counters (`stats`) — the WAL-contention logging stayed on for this
   release.
2. **Every §2a/§2b write site routed** — the 12-site checklist maps to
   ops as follows. `worker.ts`: :87 `gitnexus_mapper` + :139 okf files +
   :199 okf quarantine vector inserts route via `CerebroVectorStore.insert`
   (now a `memory_insert` op); :143-147/:204/:253 `os_todos` INSERTs are
   `todo_insert` ops. `reflection-sweep.ts`: :31-34 is
   `learning_approval_insert`, :39 a `memory_insert` op, :55-56 the two
   prune DELETEs consolidated into ONE `memory_delete` op (the sink
   deletes meta then vec), :65-69 `prune_stale` (minAccess 5 preserved),
   :73-77 `vec_cleanup_orphans`. Regression-pinned by source contracts in
   `reflection-cutover.test.ts` (comments stripped — the "was:" quotes
   must not trip them): no raw DELETE/INSERT may reappear in the sweep or
   worker, and `workerDb` may never return to `executePlugin`.
3. **`workerDb` removed; read-only handles** — `executePlugin(input,
   projectId, CerebroVectorStore)` takes no DB handle at all. The three
   SELECT sites (`:323-337` project-id resolution, `:390-394` verify-node
   prior-output read, plus the two cwd SELECTs inside the plugins) use
   `openReadonlyHandle()` — a separate `readonly: true` connection in
   production (SQLITE_READONLY enforced in C++), the per-thread `:memory:`
   handle under VITEST. Known remaining surface (tracked, not hidden):
   modules the worker bundle pulls in transitively (RouteSwitchEngine,
   gate-order) still import a write-capable `db` handle at module scope —
   the write PATHS no longer use one, but the handle object still exists
   in-thread. Removing it is its own ticket.
4. **Prune-vs-insert regression** — `reflection-cutover.test.ts` posts
   `prune_stale` before a concurrent `memory_insert` on a real channel and
   proves the insert survives (FIFO single-writer; pre-cutover the
   worker-side DELETE could still take that row). The source-contract
   half fails on the pre-cutover tree by construction.
5. **Suite green + WAL logging** — full suite run at the cutover commit
   with the write-channel logging live (drain summaries, slow-apply warns,
   SQLITE_BUSY counts).

Transport note: worker→main uses a per-task `MessageChannel` whose worker
end rides in the task payload via poolifier's `transferList`
(`engine.ts` for CoreExec plugin tasks, `reflection.ts` for the Cerebro
sweep). The engine awaits the drain in a `finally` before the task result
is written back, so a trailing escalation is applied before completion.
Proven end-to-end by `worker-write-integration.test.ts` against the real
pool + bundled worker.
