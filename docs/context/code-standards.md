---
title: "Code Standards"
status: current
owner: "williamdeldaymarketing"
last_updated: "2026-06-26"
review_cadence: "weekly"
source_of_truth: true
---

# Code Standards

## General Rules

- Keep modules small, cohesive, and owned by one boundary.
- Prefer explicit, readable logic over clever abstractions.
- Fix root causes instead of layering workarounds.
- Do not mix unrelated concerns in one component, function, route, or worker.
- Do not introduce hidden global state unless documented in architecture.
- Every mutation path must validate input, authorize access, and handle failure.
- No silent failure paths. Exceptions must be logged or surfaced.

---

## Language and Type Safety

| Rule | Required Standard |
| --- | --- |
| Strict typing | TypeScript strict mode (`tsconfig.json`); `exactOptionalPropertyTypes` enabled |
| External input | Validate at boundary before use using Zod schemas (`src/core/basevault/schema.ts`) |
| Nullability | Represent optional data explicitly (`Type \| null` or `T \| undefined`) |
| Error types | Use predictable errors; include context (file, function, input) |
| Serialization | Define Zod schemas for all external contracts; use `safeParse` not `parse` at boundaries |
| Optional field assignment | Use two-step assign-then-read to satisfy `noUncheckedIndexedAccess` (see `governor.ts` pattern) |

**Confirmed pattern (§3.2, `governor.ts`):**
```typescript
// Correct: assign then read to satisfy noUncheckedIndexedAccess
if (!byProvider[r.provider]) {
  byProvider[r.provider] = { tokens: 0, requests: 0 };
}
const entry = byProvider[r.provider]!;
entry.tokens += r.tokens;
```

---

## File and Folder Organization

| Folder | Belongs Here | Does Not Belong Here |
| --- | --- | --- |
| `src/` | First-party source code | Third-party packages, build artifacts |
| `src/core/basevault/` | SQLite schema, Zod schemas, `partitionBySchema`, crypto | UI rendering, business logic |
| `src/core/coreexec/` | DAG execution, worker pool, sandbox, dispatch, scheduler, validator | Model selection, UI rendering, DB schema |
| `src/core/routeswitch/` | Provider adapters, governor, council, triage, interceptor, discovery | DB storage, DAG execution state |
| `src/core/scopelogic/` | Interview logic, DAG proposal generation, Category A validation | Model routing, task execution |
| `src/core/scoutdaemon/` | SSE bus, idle detection, AST parsing | Business logic, model calls |
| `src/core/scoutlogic/` | Model benchmarking, complexity classification, optimal routing | UI rendering |
| `src/core/memory/cerebro/` | Vector store, reflection, habituation | Task execution, model routing |
| `src/ui/` | React components, dashboards, canvas | Raw DB queries, SQLite driver dependencies |
| `src/server/` | Hono routing, singleton init, static file serving | Core business logic (delegate to `src/core/*`) |
| `docs/` | Context files, specs, planning docs | Executable code |
| `.data/` | Runtime DB (`neurosync.db`), master key (`.master.key`) | Source-controlled files |

---

## Naming Conventions

| Entity | Convention | Confirmed Examples |
| --- | --- | --- |
| React Components | PascalCase | `ApprovalCockpit`, `GovernorUI`, `RouteSwitchConfig`, `CerebroHealthWidget` |
| Classes | PascalCase | `FreeModeGovernor`, `RouteSwitchEngine`, `ScopeLogicSession`, `CerebroVectorStore`, `AgentStopSupervisor` |
| Functions/methods | camelCase | `executeRun`, `classifyDirective`, `validateDAGTemplate`, `partitionBySchema` |
| Exported constants | UPPER_SNAKE_CASE | `RESERVED_DAG_LABELS`, `ESTIMATED_COST_PER_1K_TOKENS_USD`, `ALLOWLIST` |
| Database tables | snake_case | `workflow_runs`, `cerebro_memories_meta`, `model_benchmarks`, `os_todos` |
| Events (scoutEmitter) | UPPER_SNAKE_CASE | `TASK_STATUS`, `RUN_STATUS`, `TODO_ESCALATED` |
| Test files | `.test.ts` suffix | `engine.test.ts`, `validateDAG.test.ts`, `governor.test.ts` |
| Working doc copies | `_working` suffix | `architecture_working.md`, `project-overview_working.md` |

**Module CamelCase Branding (must be preserved exactly):**
- `CoreExec` — not CoreExecution, not core-exec
- `BaseVault` — not base-vault, not basevault
- `RouteSwitch` — not route-switch, not routeSwitch
- `ScopeLogic` — not scope-logic
- `ScoutDaemon` — not scout-daemon
- `ScoutLogic` — not scout-logic
- `Cerebro` — not cerebro-memory
- `PortGrid` — not port-grid

---

## API / Boundary Standards

- Validate request input before business logic (Zod `safeParse` at route handler entry).
- Enforce ownership before mutation (`project_id` FK check).
- Return consistent response shapes.
- Do not expose internal stack traces to users; return structured `{ error: string }` instead.
- Side effects must be idempotent where retries are possible (e.g., `claimTask()` idempotent via `BEGIN IMMEDIATE`).
- Partition dirty rows with `partitionBySchema<T>()` — never silently drop or silently pass schema-invalid rows.

**Confirmed response shapes (from `server/index.ts`):**
- `/api/basevault/runs` → `{ runs: WorkflowRun[], dirtyRunIds: string[] }`
- `/api/basevault/run/:runId` → `{ run: WorkflowRun, tasks: Task[], dirtyTaskIds: string[] }` or `{ error, runId, issues }` (500 on dirty run row)
- `/api/coreexec/approve` → `{ success: boolean, runId?: string }` or `{ error }` on validation failure

---

## Data Standards

- Store canonical data in the system of record named in `context/architecture.md`.
- Do not duplicate canonical data unless a sync owner and conflict rule are documented.
- **Status enums are owned by `WorkflowRunSchema` / `TaskSchema` in `src/core/basevault/schema.ts`**. Adding a new status requires updating only the Zod schema — all downstream consumers (UI, HTTP endpoints) must derive from it.
- Do not open-code safeParse loops. Use `partitionBySchema<T>(rawRows, schema, label)`.
- Cerebro memory: `cerebro_memories_meta` stores text; `cerebro_memories_vec` stores `float[1536]` embeddings (optional). Always insert meta first, then vector if available.
- Sentinel rows (from `escalateBlockedDAGToOsTodos`) use `status='blocked-by-validation'`. These are identifiable and prunable via the `__BLOCKED_BY_VALIDATION__` project name.

---

## Styling and UI Standards

- Use design tokens from `context/ui-context.md`.
- Do not hardcode hex colors (use CSS variables: `--bg-base`, `--text-primary`, `--accent-primary`, `--state-error`, etc.).
- `glass-panel` CSS class for glassmorphism surfaces.
- All icon-only buttons require `aria-label`.
- Node status rendered exclusively via `data.status` → CSS class `status-{status}`.
- `blocked-by-validation` status is treated as `'error'` in UI state machines.

---

## CoreExec Worker Dispatch Standards

**Discriminated union for `WorkerInput` (confirmed in `worker.ts`):**
```typescript
type WorkerInput =
  | { kind: 'legacy'; data: any }
  | { kind: 'dag'; taskId: string; prompt: string; directive?: NodeDirective }
```

**`classifyDirective(prompt)` action routing (confirmed in `dispatch.ts`):**
- `'shell'` → `CommandSandbox.execute(payload)` — requires URL regex or bash code fence with allowlisted root
- `'scrape'` → `StealthScraper.scrape(url, true)` — triggered by URL in prompt
- `'generic'` → metadata echo — any prompt that does not match shell or scrape patterns

**ALLOWLIST** is exported from `sandbox.ts` and imported by `dispatch.ts`. Never duplicate the allowlist — use the named export.

---

## Testing Standards

| Test Type | Required For | Minimum Rule |
| --- | --- | --- |
| Unit | Pure logic, validators, utilities, Zod schemas | Test success, failure, and edge cases. |
| Integration | DB, filesystem, API, service adapters | Test realistic boundary behavior. |
| Contract | Zod schema shapes | Test enum acceptance, rejection, and cross-schema invariants (see `schema.test.ts` pattern). |
| Worker dispatch | `classifyDirective`, `worker.ts` action routing | Test all three actions + allowlist boundaries + empty prompt fallback. |
| Security | SA-01–SA-07, reserved labels | Test all 7 reserved labels, case-insensitive, mid-prompt, word-boundary. |

**Confirmed test files and coverage:**
- `system-reserved.test.ts` — 15 cases, all 7 labels, negative controls
- `validator.test.ts` — SA-01–SA-07 + SA-07-wins-over-SA-05
- `validateDAG.test.ts` — 26 cases: template/proposal paths, escalation FK chain
- `engine.test.ts` — DAG traversal regression
- `governor.test.ts` — 10 cases: cost math, 24h window, prune-on-read, provider attribution
- `scheduler.test.ts` — cron scheduling, FK back-reference, `_stopSchedulerLoopForTests()`
- `worker.test.ts` — 10+ cases for classifyDirective
- `schema.test.ts` — 8+ canonical shape regressions + 9 partitionBySchema cases

**Test runner:** Vitest. Do not run test suites concurrently — sequential only per system resource rules.

---

## Prohibited Patterns

- Silent failure paths (no swallowed exceptions without logging).
- Untyped external data (all API responses must be Zod-parsed before use).
- Business logic in UI components (delegate to `src/core/` modules).
- Unreviewed dependency additions.
- Code generation that overwrites hand-authored logic.
- Open-coding `safeParse` loops at HTTP boundaries — use `partitionBySchema<T>()`.
- Inline `/api/coreexec/*` handlers in `server/index.ts` — use `coreexecRouter` mounted via `app.route()`.
- Duplicating the bash `ALLOWLIST` — always import from `sandbox.ts`.
- Passing `(node as any).prompt` in engine.ts — use `PromptedDAGNode` type.
- Hardcoded hex colors or spacing values in feature code.
- `gitnexus wiki` command — banned (requires external LLM API billing).

---

## Change Log

| Date | Change |
| --- | --- |
| 2026-06-26 | Added confirmed naming examples from source. Added CoreExec worker dispatch standards. Added partitionBySchema pattern. Added prohibited pattern for inline coreexec handlers, open-coded safeParse loops, and ALLOWLIST duplication. Updated test file inventory. Transitioning to Phase 13 (Free-tier testing). |
| 2026-06-25 | Initial draft. |
