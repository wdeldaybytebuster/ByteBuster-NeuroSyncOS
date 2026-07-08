# Base-Knowledge Integration — Progress Tracker

Companion to the plan at `.claude/plans/majestic-moseying-widget.md` (session-local
path, not committed) and `docs/implementation-plan-and-progress-tracker.md` §0 for
project ground rules. Read this before resuming any chunk below — it exists so a
fresh session/agent doesn't re-discover or re-fix what's already merged.

## Important: `docs/CODE-AUDIT-REPORT.md` is historical, not a live gap list

It predates commit `179c178` ("hobbyist-first dashboards and real backend
enforcement, de-fake audit findings"), which resolved nearly everything it flagged.
Do not treat its findings as current work without re-verifying against the actual
code first — this file's own investigation caught it being wrong at least once
(the "Global Knowledge Base" widget claim).

## Chunk 1 — Memory & Learning Foundation: DONE, merged to `oss-readiness`

- **Item 1** (PR #12, merged `f179e34`): 87 distilled OKF concept nodes from the 20
  base-knowledge docs, seeded into `resources/global_okf_seed/` and bootstrapped into
  the real GLOBAL OKF tier (`~/.neurosync/global_okf/`) on first server boot via
  `src/core/okf/global-seed.ts`. 4 nodes ship at `confidence: 0.85` to exercise the
  pending-review gate. Verified end-to-end against a live server boot.
- **Item 2** (context-router.ts audit): **no code change made**. `RouteSwitchEngine.execute()`
  already runs a real, scoped OKF keyword+graph-expansion search
  (`OKFGraphQuery.resolveContext`) unconditionally for every prompt over 20 chars,
  independent of `context-router.ts`'s own intent classification — so the file's
  documented "doesn't re-query OKF itself" tradeoff is sound, not a gap. Minor,
  non-urgent note for later: `classifyIntent`'s broad camelCase "code" pattern could
  occasionally misclassify a knowledge question, but this doesn't gate OKF
  injection, so the practical impact is low.
- **Item 3** (PR #13, merged `981242e`): real Reflexion contradiction handling in
  `src/core/memory/cerebro/reflection.ts` — genuine updates/contradictions are now
  queued into `cerebro_learning_approvals` (two new columns: `conflict_with_id`,
  `conflict_reasoning`) instead of silently dropped; approving one supersedes
  (deletes) the old memory row. Two-tier classification: live LLM when wired,
  exact-text-match fallback offline.
- **Item 4** (also PR #13): decay-rate constant was orphaned — the "Idle-Dampening
  Multiplier" slider saved a setting nothing read. Now wired via a shared
  `computeDecayFactor()` in `habituation.ts`, consumed by `/decay-stats` and
  prune-candidate selection in `cerebro.ts`.
  **Deliberately NOT fixed**: the "Active-Boost Multiplier" slider
  (`cerebro_access_boost`) still has no live consumer — `HabituationScorer.rank`,
  the only place it matters, has zero production call sites (confirmed via
  GitNexus `impact()`). Wiring it in means deciding whether/how to introduce real
  re-ranking of vector search results — a bigger design decision than a bugfix.
  **Next session picking this up should treat it as a fresh scoped decision, not
  assume it's simple.**
- **Item 5/6** (CLI check, UI surfacing): not built as a separate script this pass —
  the two PRs' own test suites function as the compliance check for now. The Global
  Knowledge Base widget (`CerebroDashboard.tsx`) and Learning Approvals widget
  already surface the real data live; no additional UI was needed beyond what
  landed in the two PRs.

## Chunk 2 — Core Reasoning & Execution Patterns: NOT STARTED

Audit ReAct/Plan-and-Solve/DAG-chaining concepts against `src/core/coreexec/engine.ts`
and `src/core/scopelogic/interview.ts`. Per the seeded `core-reasoning/` nodes
(`dag-workflow-orchestration.md`, `plan-validate-execute-security-pattern.md`,
`react-thought-action-observation-loop.md`, etc.) several concepts already came back
"Already/Partially implemented" during the Chunk-1 distillation pass — re-read those
nodes' "NeuroSync Applicability" sections first before re-auditing from scratch, they
already cite real file:function locations.

## Chunk 3 — Tooling & Integration: NOT STARTED

MCP/function-calling/structured-output-validation, against GitNexus MCP integration
and LLM provider adapters. Re-verify the GBNF grammar-constrained-decoding gap the
stale audit flagged — the `tooling-integration/grammar-constrained-decoding.md` seed
node already found this "Already implemented" via `generator.ts`/`gbnf-grammar.ts` —
confirm that's still accurate before assuming a gap exists.

## Chunk 4 — Multi-Agent & Orchestration: NOT STARTED

Council/consensus mode (`src/core/routeswitch/{triage,council}.ts`) and Context Drift
Detection (likely the biggest real gap — nothing compares live system state against
Master-Spec/OKF decisions over time). The seeded `multi-agent-orchestration/` nodes
already have grounded applicability notes for several of these concepts.

## Chunk 5 — Safety, Reliability & Operations: NOT STARTED

Expected to be the lightest-touch chunk — HITL/Deference, idempotent execution, and
sandboxing are all already substantially real per project ground rules. Confirmation
pass, not a rebuild.

## Chunk 6 (conditional) — General de-fake cleanup: NOT SCHEDULED

Only relevant if, after re-verifying current state, some `CODE-AUDIT-REPORT.md`
finding turns out to still be real and unrelated to any base-knowledge concept.
Confirm with the user before starting — not assumed in scope.
