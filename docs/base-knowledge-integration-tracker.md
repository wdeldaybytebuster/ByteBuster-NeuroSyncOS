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

## Chunk 2 — Core Reasoning & Execution Patterns: DONE, PR pending

Audited all 21 `core-reasoning/` seed nodes against the actual code (re-used and
independently spot-checked the Chunk-1 distillation's "NeuroSync Applicability"
findings rather than re-deriving from scratch — this is the intended payoff of
having seeded that content).

**Already implemented, confirmed correct, no action needed:**
- `dag-workflow-orchestration` — `src/core/coreexec/engine.ts` (~L95-209): real
  dependency-driven parallel scheduler (`Promise.all` over dependency-satisfied
  tasks), not a linear chain.
- `plan-validate-execute-security-pattern` — `ValidatorLogic.validate()`
  (`src/core/scopelogic/validator.ts`) + `validateDAGTemplate`/`validateDAGProposal`
  (`src/core/coreexec/validateDAG.ts`): a real, deterministic (non-LLM) Verifier
  gate independent of the LLM Planner, exactly matching the source pattern's
  rationale for using a different engine class for planning vs. verification.
- `heterogeneous-compute-routing-by-complexity` — `selectOptimalModel`
  (`src/core/routeswitch/model-selector/dynamic-router.ts`): real
  complexity/priority-weighted model selection.

**Partially implemented, confirmed real but incomplete, no action needed this pass:**
- `mrkl-modular-expert-routing` — `context-router.ts` (already audited in Chunk 1).
- `natural-language-to-dag-compilation` — ScopeLogic's interview → LLM-schema-hinted
  proposal → `ValidatorLogic` gate → deterministic-template fallback pipeline.
- `plan-and-solve-reasoning-first-decomposition` — `DAGProposalSchema` forces a
  `reasoning` field before `nodes`/`response`, structurally (via Zod), not just by
  prompt convention.
- `plan-then-execute-context-isolation` — see architectural note below.
- `self-refine-and-reflexion-loops` — fixed in Chunk 1 (contradiction handling).

**Deliberately not implemented — explicit recommendation against building these,
not an oversight:**
ReAct's interleaved loop, Tree/Graph-of-Thoughts branching search,
self-consistency-decoding's multi-sample voting, adaptive/recursive
complexity-gated decomposition, the ReWOO/LLMCompiler symbolic-placeholder+Joiner
pattern, the durable-execution saga/compensating-transaction pattern, and
shared-mutable-state reducer conflicts are all genuinely absent. **Recommendation:
do not build any of these.** Reasoning: (a) online-RL self-correction and
internalized/hidden-vector deliberation require training or fine-tuning a model —
architecturally incompatible with a system that treats every LLM provider as a
fixed external black box; (b) ToT/GoT/self-consistency-voting all mean paying for
multiple full generations per step, which cuts directly against this system's
free-tier/local-LLM cost governance (`FreeModeGovernor`) — the existing
single-pass-generate + deterministic-template-fallback + `ValidatorLogic` gate is
already a reasonable safety/cost tradeoff for this system's scale, and adding
branching search wasn't requested and doesn't obviously clear the "does this help
a confused beginner, stability, or learning" bar; (c) the saga/compensating-
transaction pattern solves a problem (auto-reversing completed steps after a later
failure) this system doesn't currently have evidence of — `os_todos` escalation on
a blocked DAG is the existing, simpler mitigation. Revisit only if a concrete
failure mode is observed in practice, not speculatively.

**Architectural notes — deliberate correct choices, not gaps:**
- `react-thought-action-observation-loop`: NeuroSync uses plan-then-execute
  (ScopeLogic produces a full validated `DAGProposal` before `CoreExec` runs
  anything) instead of ReAct's interleaved reasoning. This is the *safer* choice
  for a system whose core requirement is human-approvable plans before execution —
  ReAct's dynamically-interleaved actions are harder to review before-the-fact than
  a complete, `ValidatorLogic`-gated DAG. Not a gap to fill.
- `shared-state-reducer-conflicts`: NeuroSync's DAG engine stores each task's
  output independently per-row (`tasks.output_data`) rather than through a shared
  mutable state object multiple concurrent nodes write into, so the entire class of
  reducer-conflict problems this concept addresses doesn't arise by construction.

**Real, well-scoped fix shipped this chunk (not from the audit table above — found
while verifying the `self-consistency-decoding` "not implemented" claim):**
`ConsensusSynthesizer.executeCouncilMode` (`src/core/routeswitch/council.ts`) is
adjacent to self-consistency-decoding (samples multiple providers in parallel for
HIGH-RISK prompts) but its agreement/confidence scoring is a self-documented
"basic length/keyword heuristic" stub. Verified independently: **every caller** of
`RouteSwitchEngine.execute()` (`_cerebroGenerateFn`, `generateFn`,
`_coreExecGenerateFn`, `_okfGenerateFn` in `src/server/index.ts`) discards
`result.confidence`/`result.isCouncilMode` entirely — confirmed via
`grep -rn "isCouncilMode\|disagreementScore" src` showing zero read sites outside
the type definitions themselves. Council Mode incurs real cost (parallel provider
calls, tracked via `governor.recordUsage`) specifically to arbitrate high-risk
decisions, and the resulting signal was completely invisible — no log, no
persistence, no UI. Fixed the *observability* gap only (persist to a new
`council_decisions` table, log the outcome, surface recent decisions in
`RouteSwitchDashboard`) — deliberately did **not** touch the scoring algorithm
itself, since improving it is a separate, bigger, cost-sensitive design question
already flagged as unresolved in the code's own comments.

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
