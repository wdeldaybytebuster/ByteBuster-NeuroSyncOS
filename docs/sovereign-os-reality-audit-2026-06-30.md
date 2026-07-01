# NeuroSync Sovereign OS — Reality Audit (2026-06-30)

Methodology: source-only traversal of `src/` (TypeScript/React/Hono/SQLite). No file under `docs/*.md` was read, per the Blindfold Rule. All claims below cite `file:line`.

---

## The Naked Truth

### Module-by-module: does each of the 6 named modules exist as code?

| Spec module | Dashboard view | Core logic dir | Verdict |
|---|---|---|---|
| PortGrid | `src/ui/views/PortGridDashboard.tsx` (31.7KB) | `src/core/coreexec/` (dispatch, sandbox, worktree, scheduler) | Real, substantial |
| ScopeLogic | `src/ui/views/ScopeLogicDashboard.tsx` (22.7KB) | `src/core/scopelogic/` (interview.ts, validator.ts, risk.ts) + `src/core/scoutlogic/` (classifier, dynamic-router, benchmarker) | Real, but split across two similarly-named dirs (`scopelogic` vs `scoutlogic`) — confusing naming collision |
| RouteSwitch | `src/ui/views/RouteSwitchDashboard.tsx` (36KB, largest view) | `src/core/routeswitch/` (engine.ts, council.ts, governor.ts, discovery.ts, adapters/) | Real, most mature module |
| BaseVault | `src/ui/views/BaseVaultDashboard.tsx` (19.9KB) | `src/core/basevault/` (db.ts, schema.ts, redactor.ts, crypto.ts, auth.ts) | Real |
| CoreExec | `src/ui/views/CoreExecDashboard.tsx` (22.7KB) | Overlaps entirely with PortGrid's core dir (`src/core/coreexec/`) — no separate `src/core/coreexec` vs `portgrid` split exists | CoreExec is a UI-only distinction; there is no dedicated `src/core/portgrid/` |
| ScoutDaemon | `src/ui/views/ScoutDaemonDashboard.tsx` (25KB) | `src/core/scoutdaemon/` (idle.ts, research.ts, gitnexus-worker.ts, db-sync.ts, sse.ts) | Real |

Plus two dashboards outside the spec's 6: `CerebroDashboard.tsx` (25KB) and `UnifiedMasterDashboard.tsx` (17KB) — the actual global/master dashboard is a 7th view not named in the spec's module list.

**A second, entirely separate frontend exists and is dead:** `src/ui-next/` is a full Next.js 16 app (own `package.json`, `node_modules`, `tsconfig.json`) containing `src/ui-next/src/components/DeferenceUI.tsx` and `TaskQueue.tsx` — a working implementation of exactly the confidence-based approve/reject pill bar the Master Spec asks for (`DeferenceUI.tsx:36-67`: floating pill showing `{tasks.length} high-confidence tasks pending approval` with Approve All / Reject All). It is **not wired into the running app**: `index.html:13` loads only `/src/ui/main.tsx`, and `vite.config.ts:12` explicitly excludes `src/ui-next` from `optimizeDeps`. Last touched 2026-06-28 (`git log -1 --format=%ci -- src/ui-next`), three commits in, then abandoned in favor of continuing the Vite `src/ui` tree. **The best extant implementation of the Deference UI concept is sitting unused in a directory the build never touches.**

### Deference UI / 0.70 confidence threshold

- `confidence` is a first-class concept in `src/core/routeswitch/engine.ts:35,158-175,212-268` — but it's typed as `'High' | 'Medium' | 'Low'`, a 3-bucket enum, **not a numeric 0.0–1.0 score**, and there is no `>= 0.70` comparison anywhere in `src/core` or `src/server` (verified: only numeric `0.7` literals in the whole codebase are `sample.temperature = 0.7` LLM params in `openai-compatible.ts:51` / `cerebro-assist.ts:39`, a commented-out line in `llama-cpp.ts:56`, and a similarity-scoring formula in `vector.ts:79-99` — none of these are the confidence-gate the spec describes).
- Numeric confidence *does* exist for OKF concepts: `okf_nodes.confidence REAL NOT NULL DEFAULT 1.0` and `scout_okf_nodes.confidence REAL NOT NULL DEFAULT 0.5` (`db.ts:160,184`), and `OKFGenerator` asks the LLM to emit a `confidence: 0.0-1.0` field per extracted concept (`generator.ts:182`). This is real, but it gates OKF *knowledge extraction*, not task/action approval.
- "Attention Required" widget: **MISSING**. Grep across `src/` for "Attention Required" returns zero hits. `PortGridDashboard.tsx:289-296` has a "Zero-Trust Quarantine & HITL Approval Queue" widget and `:315-316` has per-item Approve/Decline buttons, but every item goes through the same manual click-per-item flow — there is no confidence-based split between a low-confidence modal queue and a high-confidence bulk-approval pill row.
- "Pill Row" / bulk approval: **MISSING** in the live app. The only Pill Row implementation is the dead `src/ui-next/src/components/DeferenceUI.tsx` described above.

### PortGrid CLI/MCP windows

**MISSING.** `PortGridDashboard.tsx` has a `Terminal` icon import (`:4`) used decoratively at `:417`, but there is no `iframe`, `pty`, `xterm`, or embedded-terminal infrastructure anywhere in `src/` (grep for `iframe|pty|xterm|terminal` in a case-insensitive pass across `src/ui` and `src/core` returns nothing beyond that one icon and the `CommandSandbox` class, which executes single allowlisted shell commands server-side, not an interactive CLI session — `sandbox.ts:21-25` allowlists only `ls, cat, grep, pwd, diff, find, head, tail, wc, sort, uniq, stat, file, du, df, lsblk, lscpu, uname, whoami, date, python, python3`). There is no code path for hosting Claude CLI, Antigravity, or OpenCode inside PortGrid.

### 6th-grade reading level & Developer Mode

- 6th-grade reading level: **MISSING as an implemented feature.** The only occurrence in the entire codebase is a static marketing string: `PortGridDashboard.tsx:510` — `"SmartTips System ... 45+ on-demand tooltips explaining technical terms at 6th-grade reading level"`. This is copy describing a feature, not a rendering mode; there is no complexity-toggle logic, no simplified-text generation, no tooltip content system with 45 entries found anywhere in `src/`.
- Developer Mode toggle: **MISSING.** Zero hits for `developerMode`, `DeveloperMode`, `isDeveloperMode` anywhere in `src/`. There is a `ThemeContext.tsx` / `ThemeToggle.tsx` pair for light/dark theme, but no comprehension-level or raw-JSON/DAG-reveal context exists. (Note: `ThemeToggle.tsx` itself is also an orphan — see Clutter section.)

### 3-Tier folder structure

**Real and correctly implemented for OKF**, contrary to what the naming in the spec ("`.neurosync/`", "`neurosync-config.yaml`") would suggest — the actual on-disk layout differs from spec vocabulary but the 3-tier *resolution* logic is solid:
- `src/core/okf/directory-manager.ts:16-118` (`OKFDirectoryManager`) creates and resolves:
  - GLOBAL: `~/.neurosync/global_okf/` (`:29-33`)
  - USER: `~/.neurosync/user_okf/` (`:36-40`)
  - PROJECT: `<project_root>/.neurosync/project_okf/` (`:43-50`)
  - SCOUT quarantine: `<project_root>/.neurosync/scout_drafts/` (`:53-60`)
- Resolution order PROJECT > USER > GLOBAL is implemented in `getAllDirsForContext` (`:66-78`).
- **`neurosync-config.yaml` does not exist anywhere** — grep for `neurosync-config` across `src/` returns zero hits. There is no per-project YAML config file; project settings live entirely in the SQLite `projects` table (`db.ts:35-40`, `workspace_path`/`project_root_path` columns added via `ALTER TABLE` at `:202-216`).
- A second, unrelated hidden directory also gets created inside project roots: `.nexus_worktrees/` for draft-code isolation (`src/core/coreexec/worktree.ts:18`, wired into `engine.ts:7,46`) — functionally sound (real quarantine-until-approval pattern) but it's a *third* dot-directory alongside `.neurosync/` and `.gitnexus/`, not mentioned in the spec's file-system section.

### Tri-Modal Memory & Context Routing

**Partially real, but the "router" doesn't route.** The three modalities do exist as separate stores:
- Modality A (OKF/semantic): `okf_nodes` / `okf_edges` SQLite tables (`db.ts:154-176`) + Markdown files on disk, generated via GBNF-grammar-constrained LLM extraction (`src/core/okf/generator.ts:26-41` defines a real GBNF grammar; `:162-225` extracts and validates concepts). This is genuinely well-built — grammar-constrained decoding is not vaporware here.
- Modality B (GitNexus/AST): handled entirely by the external `.gitnexus/` tool + `src/core/scoutdaemon/gitnexus-worker.ts` (a worker-thread wrapper), separate from the app's own SQLite.
- Modality C (Knowledge Graph): `okf_nodes`/`okf_edges` double as this — there's no separate relational "workflow success/failure" graph beyond the existing `workflow_runs`/`tasks` tables (`db.ts:42-68`).
- Separately, `src/core/memory/cerebro/vector.ts` implements `CerebroVectorStore`, a **fourth**, independent semantic store (keyword-similarity heuristic, not true embeddings — see `vector.ts:79-99`, `similarity = 0.7 + matchCount * 0.05`, a formula not a vector distance).
- **No Context Router exists.** `src/server/routes/cerebro.ts:63-72` — the chat endpoint's vector search calls `CerebroVectorStore.search()` only. It never queries `okf_nodes`, never calls GitNexus, never touches the "graph" tables based on prompt content. `src/core/okf/graph-query.ts` (`OKFGraphQuery`) exists and can query the OKF graph, but nothing in `src/server/routes/cerebro.ts` or `src/core/routeswitch/engine.ts` calls it conditionally based on query type. The four stores are populated independently; nothing decides which one to read from for a given user prompt. The spec's "Context Router... saving tokens and preventing hallucination" is **not implemented** — it's four silos, not a router.

### Architecture & Security

- Node/Hono/SQLite-WAL: **confirmed real.** `src/core/basevault/db.ts:18-29` — `better-sqlite3`, `db.pragma('journal_mode = WAL')`, `synchronous = NORMAL`, `foreign_keys = ON`, `busy_timeout = 5000`. `src/server/index.ts:1-21` — Hono app, `@hono/node-server`, port 3743.
- Worker threads: **confirmed real**, not decorative. Live `Worker(...)` instantiations in `src/core/scoutdaemon/parser.ts:22`, `src/core/coreexec/scheduler.ts:55`, plus `worker_threads` imports in `reflection-worker.ts`, `gitnexus-worker.ts`, `db.ts:4` (guards `initDB()` to main thread only, `db.ts:33`).
- Draft-only AI / human-in-the-loop: **substantially real.** `src/core/coreexec/worktree.ts` quarantines all AI file mutations into `.nexus_worktrees/<runId>/` until approved (docstring at `:5-16` states the intent, code backs it: `createRunWorktree`/`removeRunWorktree` at `:46-74`). `src/server/index.ts:127-132` comment confirms a prior HIGH-risk DB-bypass was closed by routing all writes through `coreexecRouter`'s `validateDAGProposal`/`escalateBlockedDAGToOsTodos` gate. `sandbox.ts:71-127` sandboxes shell execution via `bwrap --unshare-net` with an allowlist and shell-metacharacter rejection (`:82-88`) — genuinely defensive, not just a docstring claim.
- Redaction: **real but not Pino.** The spec says "Pino serializers"; the actual codebase has zero Pino dependency (grep for `pino` in `src/` returns nothing) and instead implements a hand-rolled `SensitiveDataRedactor` (`src/core/basevault/redactor.ts:14-82`) with regex-based API-key/email/phone scrubbing and a 3-tier `DataTier` enum (PUBLIC/INTERNAL/CONFIDENTIAL). Functionally does the same job, but the spec's specific tooling claim is wrong.

### ScopeLogic council/consensus mode

**Real, not a single-shot call with a fallback label slapped on.** `src/core/routeswitch/council.ts:9-61` (`ConsensusSynthesizer.executeCouncilMode`) fires all registered providers in parallel (`:21`), filters failures, and computes a disagreement score from response-length variance (`:39-51`) to derive a High/Medium/Low confidence bucket. It's a crude heuristic (length variance, not semantic comparison — the code's own comment at `:34` admits "In a full implementation, we'd use another LLM call or structural AST diffing to compare the DAGs"), but it is genuinely multi-model parallel execution with synthesis, wired into `engine.ts:212-268`.

### New untracked files — what they actually implement

- `src/core/okf/*` (directory-manager, generator, graph-query, indexer, parser) — the OKF subsystem described above. Real, functioning, in active development (generator.ts last modified 04:43, most recent file in the repo).
- `src/core/coreexec/worktree.ts` — draft-isolation quarantine, wired into `engine.ts`. Real.
- `src/core/scoutdaemon/research.ts` — `ScoutResearch` class (`:33`), imports `OKFDirectoryManager`/`OKFParser`/`OKFIndexer`; scans project directories for existing docs to convert into OKF concepts.
- `src/server/routes/okf.ts` — 6 real endpoints: `/api/okf/status`, `/scan-project`, `/convert-document`, `/sync`, `/graph`, `/file-content` (line refs `146,222,319,389,431,472`). Fully wired into `src/server/index.ts:134-135`.
- `src/ui/components/OKFMindmap.tsx`, `OKFWorkspaceWidget.tsx`, `PathBrowser.tsx` — frontend for the above; `PathBrowser` is consumed by `ProjectSwitcher.tsx:4,228-234` for filesystem directory picking, `OKFMindmap`/`OKFWorkspaceWidget` render the `/api/okf/graph` data.

All of this is **coherent, active, in-progress work toward the Tri-Modal Memory spec section** — it's the most spec-aligned code in the entire repo, actively being built as of the last commit (`generator.ts` at 04:43, newest file by mtime).

---

## The Clutter & Drift

1. **`src/ui-next/` — delete or finish, don't leave half-built.** An entire orphaned Next.js 16 application (own `node_modules`, `package-lock.json`, `tsconfig.tsbuildinfo`) that the build (`vite.config.ts:12`) explicitly excludes. It contains the *only* working Deference-UI pill-bar implementation in the repo (`DeferenceUI.tsx`) plus `TaskQueue.tsx`, `AutonomyDials.tsx` (duplicate of `src/ui/components/AutonomyDials.tsx`), `ProjectManager.tsx` (duplicate of the also-orphaned `src/ui/components/ProjectManager.tsx`), `SettingsModal.tsx` (duplicate of `src/ui/components/SettingsModal.tsx`). This is dead weight on disk and a genuine bug risk — a future contributor could easily edit the wrong copy.
2. **Six zero-import React components in `src/ui/components/`** (verified via repo-wide grep, no importers found outside their own file):
   - `AgentKPIStrip.tsx`
   - `CerebroHealthWidget.tsx`
   - `GovernorUI.tsx`
   - `LearningApprovalsQueue.tsx`
   - `ProjectManager.tsx`
   - `ThemeToggle.tsx`
   
   These are fully orphaned — not routed, not rendered, not referenced by any dashboard. Either wire them in or delete them.
3. **Naming collision: `src/core/scopelogic/` vs `src/core/scoutlogic/`.** Two directories one character apart, both containing routing/classification logic (`scopelogic/interview.ts`, `scoutlogic/dynamic-router.ts` and `classifier.ts`). This is a maintenance hazard, not dead code, but worth flagging as drift from a clean module boundary.
4. **CoreExec has no dedicated core directory.** The UI has a `CoreExecDashboard.tsx`, but all its backing logic lives in `src/core/coreexec/`, which is also PortGrid's backing directory. Either CoreExec and PortGrid should share one dashboard, or CoreExec needs its own core module — currently the UI module boundary doesn't match the code module boundary.
5. **No DuckDB or Rust references found** — the spec's "deprecated tech" warning doesn't apply; the codebase is consistently better-sqlite3 + TypeScript. Nothing to delete there.
6. **`docs/full-codebase-review-2026-06-28.md` and `docs/okf-implementation-plan.md` and `docs/ui-backend-sync-plan_working.md`** exist as untracked/modified docs (not read, per the Blindfold Rule) — their mere presence alongside this new audit means there will shortly be four competing "state of the world" documents. Worth consolidating once this audit is reviewed.

---

## Dashboard & Setups Status

- **Setup isolation is real but manual, not structural.** `ProjectSwitcher.tsx:16-237` correctly separates a "Global (All Projects)" filter (`:113-122`) from per-project entries (`:133-173`), and each module dashboard presumably reads `activeProjectId` from the same `useNavigation()` context — but nothing in the audited code *enforces* that a given module's Set-up section is global-only or project-only; it's left to each dashboard's own conditional rendering, which was not exhaustively checked per-view. The risk: config bleed is possible if a future dashboard forgets to gate on `activeProjectId`.
- **Deference UI is the single largest gap between spec and shipped code.** The concept exists in name in an abandoned Next.js prototype, and the *data* for it (numeric OKF confidence scores) exists in SQLite, but the live PortGrid HITL queue (`PortGridDashboard.tsx:289-316`) treats every pending item identically — same modal-style approve/decline row regardless of confidence. There is no confidence threshold anywhere in `src/core/routeswitch/engine.ts` gating UI routing (only a 3-bucket High/Medium/Low label used for logging, not for UI branching). **This is the single most spec-visible feature request, and it's currently 0% implemented in the running application.**
- **CLI/MCP plug-and-play in PortGrid is entirely aspirational.** There's a Terminal icon and nothing else. No embedded terminal, no session bridge, no protocol for capturing external CLI context. This would be a from-scratch build, not a wire-up.
- **6th-grade / Developer Mode toggle is entirely aspirational.** One decorative string claims it exists; no code implements it. This is also a from-scratch build.
- **What genuinely works well in the UI layer:** RouteSwitch (`RouteSwitchDashboard.tsx`, 36KB — the most built-out dashboard, matching the fact that `routeswitch/` is the most mature core module with real provider registry, council mode, and fallback chains per the `a54d3fd` commit), and OKF (`OKFMindmap.tsx` + `OKFWorkspaceWidget.tsx` + `PathBrowser.tsx`, all freshly wired to 6 real backend endpoints as of today).

---

## Gap Analysis vs Master Spec

| Spec requirement | Current reality | Status | Evidence |
|---|---|---|---|
| Node 22 LTS + Hono + SQLite WAL | Implemented as specified | **Done** | `db.ts:18-29`, `server/index.ts:1-21` |
| Worker threads for heavy tasks | Real, multiple live `Worker()` call sites | **Done** | `scoutdaemon/parser.ts:22`, `coreexec/scheduler.ts:55` |
| Draft-only AI / human-in-the-loop gating | Worktree quarantine + DAG validation gate on write path | **Done** | `coreexec/worktree.ts:5-74`, `server/index.ts:127-132` |
| Redaction via Pino serializers | Custom regex redactor exists; zero Pino usage | **Partial** (wrong tool, same outcome) | `basevault/redactor.ts:14-82` |
| 6 modules as separated dashboards | 6 dashboards exist, but CoreExec/PortGrid share one core dir; ScopeLogic split across `scopelogic`+`scoutlogic` | **Partial** | `src/ui/views/*.tsx` listing; `src/core/coreexec/`, `scopelogic/`, `scoutlogic/` |
| Setup config global vs project isolation | ProjectSwitcher supports Global/Project toggle; enforcement is per-dashboard, not centrally guaranteed | **Partial** | `ProjectSwitcher.tsx:113-173` |
| 0.70 confidence threshold routing | No numeric threshold anywhere; RouteSwitch uses a 3-bucket label, not gated at 0.70; OKF has numeric confidence but it's not used for UI routing | **Missing** | grep across `src/` for `0.7`/`0.70` outside LLM temperature params and vector-similarity formula |
| "Attention Required" widget | Not present under that name or an equivalent low-confidence-only view | **Missing** | grep, zero hits |
| "Pill Row" 1-click bulk approval | Fully built in dead `src/ui-next/`, absent from the live app | **Missing** (in shipped app) | `src/ui-next/src/components/DeferenceUI.tsx:36-67` vs `PortGridDashboard.tsx:289-316` |
| PortGrid CLI/MCP embedded windows | No terminal/iframe/pty infrastructure | **Missing** | grep across `src/ui`, `src/core` |
| 6th-grade reading level default | One marketing string only, no rendering logic | **Missing** | `PortGridDashboard.tsx:510` |
| Developer Mode global toggle | Not implemented | **Missing** | grep, zero hits |
| `.neurosync/` 3-tier project/user/global dirs | Implemented, correctly resolved PROJECT > USER > GLOBAL | **Done** | `okf/directory-manager.ts:16-118` |
| `neurosync-config.yaml` per project | Does not exist; config lives in SQLite instead | **Missing** | grep, zero hits |
| Tri-modal memory: OKF chunks | Implemented with GBNF-grammar-constrained extraction | **Done** | `okf/generator.ts:26-41,162-225` |
| Tri-modal memory: GitNexus AST | Implemented as external tool + worker wrapper | **Done** | `scoutdaemon/gitnexus-worker.ts` |
| Tri-modal memory: Knowledge Graph | `okf_nodes`/`okf_edges` serve double duty; no independent workflow-relational graph beyond existing task tables | **Partial** | `db.ts:154-176` vs `:42-68` |
| Context Router selecting OKF vs GitNexus vs KG per prompt | Does not exist — Cerebro chat only queries one 4th, separate vector store (`CerebroVectorStore`); OKF graph query code exists but is never called conditionally | **Missing** | `server/routes/cerebro.ts:63-72`; `okf/graph-query.ts` unused by chat path |
| ScopeLogic council/consensus mode | Real parallel multi-provider execution with disagreement scoring | **Done** (heuristic quality, not semantic) | `routeswitch/council.ts:9-61` |
| No external DBs / paid libraries | Confirmed — better-sqlite3 only, no DuckDB/Postgres/paid SDKs found | **Done** | grep, zero hits |

---

## The Implementation Action Plan

### P0 — Close the highest-visibility spec gap (Deference UI)
1. Change `RouteSwitchEngine`'s confidence output from the 3-bucket `'High'|'Medium'|'Low'` enum to a numeric 0.0–1.0 score (`src/core/routeswitch/engine.ts:35,158-175,212-268`; `council.ts:49-58`'s `maxDiff`-based bucketing already has the raw number — just stop discretizing it).
2. Add a `confidence_score REAL` column to whatever table backs `os_todos`/HITL items (`db.ts:70-79`) so pending approvals carry a numeric score, not just severity/reason strings.
3. Port `src/ui-next/src/components/DeferenceUI.tsx` into `src/ui/components/` (it's a clean, self-contained component — straightforward port, not a rewrite) and wire it into `UnifiedMasterDashboard.tsx` and `PortGridDashboard.tsx`'s HITL widget (`:289-316`), splitting items at the 0.70 threshold: `< 0.70` → existing per-item modal row; `>= 0.70` → new pill-row bulk-approve.
4. Delete `src/ui-next/` once the port is done (or keep only as an archived branch, not in the working tree) — no reason to carry a second framework's `node_modules`/`package-lock.json` indefinitely.

### P0 — Fix dashboard/module boundary confusion
5. Either merge `CoreExecDashboard.tsx` into `PortGridDashboard.tsx` (they share the same core directory, `src/core/coreexec/`) or split `src/core/coreexec/` into `src/core/portgrid/` + `src/core/coreexec/` matching the two dashboards.
6. Rename one of `src/core/scopelogic/` or `src/core/scoutlogic/` — the one-character difference is an active bug risk for future edits/greps.

### P1 — Build the Context Router (Tri-Modal Memory's missing piece)
7. Add a router function (e.g., `src/core/memory/context-router.ts`) that `src/server/routes/cerebro.ts`'s chat handler calls instead of hard-coding `CerebroVectorStore.search()` at `:63-72`. Route to `OKFGraphQuery` (`okf/graph-query.ts`, currently unused by any live query path) for concept/preference questions, to GitNexus MCP tools for code-structure questions, and keep `CerebroVectorStore` for raw conversational recall. Simple keyword/intent classification is enough for v1 — the spec doesn't require ML-grade routing, just a router that exists.

### P1 — PortGrid CLI/MCP windows
8. This is a from-scratch feature. Minimum viable: a `node-pty`-backed WebSocket bridge + an xterm.js panel inside `PortGridDashboard.tsx`, scoped through the existing `CommandSandbox` (`sandbox.ts`) so it inherits the same allowlist/bubblewrap isolation rather than opening an unrestricted shell.

### P2 — 6th-grade / Developer Mode toggle
9. Add a `DeveloperModeContext` (mirror the existing `ThemeContext.tsx` pattern) providing `isDeveloperMode: boolean`, persisted to `system_settings` (`db.ts:108-111`, already exists for exactly this kind of global flag). Gate raw JSON/DAG viewers (`NodeOutputInspector.tsx`) behind it; write a second, simplified-copy variant of the existing tooltip/error strings for the default state.

### P2 — Cleanup
10. Delete the 6 confirmed zero-import components (`AgentKPIStrip.tsx`, `CerebroHealthWidget.tsx`, `GovernorUI.tsx`, `LearningApprovalsQueue.tsx`, `ProjectManager.tsx`, `ThemeToggle.tsx`) or wire them into a dashboard — don't leave them as silent bit rot.
11. Add `neurosync-config.yaml` generation to `OKFDirectoryManager.resolveProjectDir` (`directory-manager.ts:43-50`) if per-project declarative config (vs. SQLite-only) is still wanted — currently the spec names a file that doesn't exist anywhere in the implementation.
