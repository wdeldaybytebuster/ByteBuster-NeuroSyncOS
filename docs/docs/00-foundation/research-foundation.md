---
owner: ByteBuster Core Team
review_cadence: Quarterly
last_updated: "2026-07-08"
source_of_truth: true
---

# Research Foundation

The architectural choices behind each module trace back to specific problems
with conventional agent-orchestration designs:

## 1. Transactional execution (CoreExec & BaseVault)

Analytical/columnar engines (e.g. DuckDB) introduce friction for
row-level task orchestration. NeuroSync uses `better-sqlite3` in WAL mode:
B-tree indexes and `BEGIN IMMEDIATE` transaction semantics give atomic
task-claiming and durable state updates for single-process local execution,
and `resumeInProgressRuns()` replays interrupted `workflow_runs` on boot
without duplicating completed task effects.

## 2. Draft-only synthesis (ScopeLogic)

Autonomous agents suffer context drift and hallucination amplification when
untested assumptions get written to long-term memory. ScopeLogic's interview
loop is bounded and produces structurally-validated DAG proposals that have no
authority to execute without human approval — the numeric-confidence
"Deference UI" (>=0.70 auto-approve pill row vs <0.70 manual review) makes
that confidence explicit rather than hiding it behind a vague label.

## 3. Idle-time background work (ScoutDaemon)

Background AI polling drains battery and causes thermal throttling on
consumer hardware. ScoutDaemon uses a real idle detector
(`src/core/scoutdaemon/idle.ts`) to gate research/OKF-scanning work to actual
idle windows rather than running continuously.

## 4. Provider routing under free-tier constraints (RouteSwitch)

Free-tier models (e.g. OpenRouter's free tier) have severe rate limits.
RouteSwitch implements a fallback cascade across providers and a Free Mode
Governor that intercepts and blocks paid-provider calls unless explicitly
unlocked, falling back gracefully on 429/402 errors.

## 5. Open questions

Genuinely unresolved items live in
`docs/docs/09-governance/open-questions.md` and
`docs/llm-provider-testing-plan-2026-07-01.md` — do not duplicate them here.
This file documents *why* the architecture is shaped the way it is, not
current task status.
