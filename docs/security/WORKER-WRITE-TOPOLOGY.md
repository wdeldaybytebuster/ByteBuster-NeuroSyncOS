# Worker Write Topology — WAL Contract, Interim Bounds, RPC-Cutover Preconditions

Status: P3-S6 — DOC + BOUND only. No RPC cutover (gated: Phase 5).
Related: roll-in B6 (`docs/security/FOLLOWUPS-P2-ROLLIN.md:60-63`).

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

## 5. RPC-cutover preconditions (Phase 5 gate — NOT started)

The single-writer topology (workers read-only / RPC writes to main thread)
may begin only when ALL of these hold:

1. A main-thread write-RPC endpoint exists with backpressure (bounded queue
   + caller-visible drop/overflow semantics — the current pools have none).
2. Every §2a/§2b write site is routed through it (mechanical checklist:
   `worker.ts:87,139,143-147,199,204,253`;
   `reflection-sweep.ts:31-34,39,55-57,65-77`).
3. `executePlugin`'s `workerDb` parameter is removed (not merely unused) and
   `worker.ts:323-337,365-367,390-394` acquires read-only handles.
4. The prune-vs-insert race (§3) has a regression test that fails on the
   current topology and passes after cutover.
5. Full DB shard + both pool suites green with WAL contention logging
   enabled for one release (to catch ordering assumptions the cutover
   would otherwise mask).
