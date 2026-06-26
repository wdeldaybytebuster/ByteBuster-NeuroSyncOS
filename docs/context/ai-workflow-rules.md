---
title: "AI Workflow Rules"
status: current
owner: "williamdeldaymarketing"
last_updated: "2026-06-26"
review_cadence: "weekly"
source_of_truth: true
---

# AI Workflow Rules

## Operating Model

Build this project using a **spec-driven, incremental workflow**. Context files define the product, architecture, standards, and current state. Feature specs define the exact work. Do not infer missing behavior from general convention — record the gap in `context/progress-tracker.md` under Open Questions.

---

## Required Behavior

- Read the mandatory context files before implementation (see Mandatory Context Read Order in `docs/AGENTS.md`).
- Work on one implementation unit at a time.
- Keep edits inside the active unit scope.
- Use existing patterns before creating new patterns (e.g., `partitionBySchema` for HTTP parse, `validateDAGProposal` for DAG gates).
- Record missing requirements instead of inventing product behavior.
- Prefer small verifiable changes over broad speculative rewrites.
- Update documentation when implementation changes documented behavior.

---

## Scoping Rules

Do not combine these in one implementation unit unless the spec explicitly requires it:

- UI redesign plus database migration.
- API contract changes plus deployment changes.
- Security model changes plus feature additions.
- Refactoring plus behavior changes.
- Dependency replacement plus user-facing functionality.
- Multiple unrelated integrations.

---

## Missing or Ambiguous Requirements

When a requirement is missing:

1. Check `context/project-overview.md`, `context/architecture.md`, and the active spec.
2. If still missing, add the gap to `context/progress-tracker.md` under Open Questions.
3. Use the safest narrow implementation that does not create irreversible architecture debt.
4. Do not add paid, cloud, privileged, write-capable, or external behavior unless explicitly allowed.

---

## Protected Files and Areas

Do not modify without explicit instruction:

- `.env*`, API keys, `.data/.master.key`, private keys, tokens.
- Generated migration history.
- Third-party or generated UI library internals.
- Lockfiles (`package-lock.json`), unless dependency changes are approved in the active spec.
- Production deployment configuration.
- Security policies, auth middleware, or access-control logic outside the active spec.
- `docs/AGENTS.md` (root project) — changes require explicit user instruction.

---

## Verification Before Completion

Before marking a unit complete:

- [ ] Active spec checklist is satisfied.
- [ ] No documented architecture invariant is violated (see `context/architecture.md` — Architecture Invariants section).
- [ ] New or changed behavior has vitest tests or a documented manual verification path.
- [ ] No unrelated files were modified.
- [ ] Security and data handling implications were checked (SA-01–SA-07).
- [ ] `context/progress-tracker.md` is updated with evidence of completion.
- [ ] Relevant docs were updated if behavior changed.
- [ ] `gitnexus_detect_changes()` was run to confirm scope.

---

## Documentation Sync Triggers

Update docs when changing:

- Product scope or core user flow.
- Data model, storage location, retention, or migration behavior.
- System boundary ownership.
- Auth, access control, secrets, privacy, or security posture.
- External integrations, dependencies, deployment, or operations.
- Build order, test strategy, release criteria, or milestones.
- Zod schema enums (status values in `WorkflowRunSchema` / `TaskSchema`) — all consumer docs must be updated.

---

## Documentation Immutability & Working Copies

For all planning documents in the `./docs/` folder:

1. **Original Documents:** Serve as the master baseline. These are updated only when implementation changes require it, following the evidence-based source-of-truth process.
2. **Working Copies (`_working` files):** Track ongoing changes. For every `filename.md`, there must be a `filename_working.md`. Structure:
   - Summary of the original document at the top.
   - Separator line (`===`).
   - Append-only log of changes in reverse chronological order (newest first, immediately under separator).

---

## DAG Execution Rules

These rules govern how the AI agent may interact with the CoreExec DAG system:

1. **Draft-Only Proposals:** `ScopeLogicSession` always produces `status: 'draft'` proposals. Never write code that auto-approves or self-executes a proposal.
2. **Validator Gate is Mandatory:** Any path that creates `workflow_runs` or `tasks` rows must call `validateDAGTemplate()` or `validateDAGProposal()` first. Inline handlers that bypass this gate are forbidden.
3. **Reserved Labels Are Off-Limits:** Never generate DAG node prompts containing: `scopelogic`, `basevault`, `routeswitch`, `scoutdaemon`, `coreexec`, `portgrid`, `cerebro`. These trigger SA-07 and are caught by both `ValidatorLogic` (server) and `App.tsx handleProposal` (client).
4. **Escalation is FK-Safe:** When writing `os_todos` rows, always use `escalateBlockedDAGToOsTodos()` — never write sentinel rows outside of a `db.transaction()`.
5. **Retry re-validates:** `POST /api/coreexec/retry/:runId` re-reads `workflow_runs.dag_layout` and runs `validateDAGTemplate` before retrying — do not trust the original approval.

---

## GitNexus Code Intelligence Engine (MANDATORY)

The **GitNexus Zero-Server Code Intelligence Engine** MUST be used for all development workflows. Standard text-searching tools (like `grep` or reading entire source trees) are forbidden when structural queries can answer the question.

### GitNexus Status
- **Repository:** NeuroSyncMega
- **Index:** ✅ Up-to-date (verified 2026-06-26, commit df328cb)
- **Symbols:** 1358, Relationships: 2205, Execution Flows: 36

### Mandatory GitNexus Workflow

**PHASE 1: Index Verification**
Run `/usr/bin/gitnexus status` before any development task. If stale, run `/usr/bin/gitnexus analyze`.

**PHASE 2: Reconnaissance (No-Grep Protocol)**
- Architecture discovery → `gitnexus_query({ query: "concept" })`
- Symbol lookup → `gitnexus_context({ name: "symbolName" })`
- Cross-module coupling → `gitnexus_cypher({ query: "MATCH ..." })`

**PHASE 3: Pre-Edit Blast Radius (CRITICAL GUARDRAIL)**
Before modifying ANY function, class, or method:
```
gitnexus_impact({ target: "symbolName", direction: "upstream" })
```
- **HIGH or CRITICAL risk** → halt, report to user, wait for confirmation before writing code.

**PHASE 4: Execution**
- Renames → use `gitnexus_rename()` not text replacement.
- Apply changes using framework-native formatting.

**PHASE 5: Post-Edit Validation**
After every change, before staging:
```
gitnexus_detect_changes()
```
Verify only intended symbols are affected. If unintended side-effects appear, roll back and restart Phase 3.

### High-Risk Symbols (extra caution required)
Based on architecture, these symbols have high upstream impact — run `impact` before touching:
- `executeRun()` — called by `scheduler.ts` + `coreexec-router.ts`
- `validateDAGProposal()` — both cron and interactive gate
- `partitionBySchema<T>()` — all `/api/basevault/*` endpoints
- `FreeModeGovernor.recordUsage()` — all provider paths
- `scoutEmitter.emit()` — all real-time UI updates
- `db.transaction()` in `escalateBlockedDAGToOsTodos()` — FK chain integrity
- `WorkflowRunSchema` / `TaskSchema` — status enum canonical truth

### Banned Commands
- `gitnexus wiki` — DO NOT CALL (requires external LLM API billing).

---

## System Resource Rules (Chromebook / Resource-Constrained Hardware)

All terminal commands must comply with hardware limits:

1. **Sequential execution:** Never start multiple memory-heavy terminal commands concurrently.
2. **Node.js memory ceiling:** Prefix Node/npm processes with `NODE_OPTIONS="--max-old-space-size=1024"`.
3. **Thread pool cap:** Set `UV_THREADPOOL_SIZE=3` for Node/npm scripts.
4. **Test runners:** Max workers = 4 (`--maxWorkers=4` for Vitest).
5. **No massive parallel file scans** that saturate eMMC I/O.

---

## Change Log

| Date | Change |
| --- | --- |
| 2026-06-26 | Added DAG Execution Rules section (reserved labels, validator gate, escalation FK safety, retry re-validation). Updated GitNexus status to current index state. Added High-Risk Symbols list. Added System Resource Rules. Updated verification checklist to include `gitnexus_detect_changes`. Transitioning to Phase 13 (Free-tier testing). |
| 2026-06-25 | Initial draft. |
