# Phase 12: ScoutLogic Dynamic Routing & Benchmarking

## Objectives
Implement a semantic routing layer that dynamically assigns the optimal LLM to each individual DAG task based on task complexity, live latency/cost benchmarks, and user-defined priority weightings.

## Background & Design Decision
Phase 11 provided a reliable fallback chain to prevent crashes from rate-limit exhaustion. Phase 12 upgrades this into an **intelligent semantic router**. The core insight is: not every task requires a powerful (and expensive/rate-limited) flagship model. A task like "format this output as JSON" is `trivial` and can be handled by a blazing-fast free Groq model in 200ms. A task like "implement a scalable algorithm" is `complex` and deserves a more capable model.

ScoutLogic dynamically selects the right model for each DAG node by merging:
1. **User Priority** (Cost, Speed, or Intelligence — set via UI dials)
2. **Task Complexity** (heuristically classified without burning any LLM tokens)
3. **Live Benchmark Performance** (rolling averages of real provider latency and TPS tracked in SQLite)

## Execution Strategy

### Task 1: Live Benchmarking Engine
- **File:** `src/core/scoutlogic/benchmarker.ts` ✅ + `src/core/basevault/db.ts` (updated)
- **Goal:** Track model performance metrics over time.
- **Details:**
  - Update SQLite schema to include a `model_benchmarks` table (model_id, avg_latency_ms, avg_tps, failure_rate).
  - Create the `Benchmarker` class which intercepts completed RouteSwitch calls and updates these rolling averages.
- **Status:** COMPLETE — `model_benchmarks` table added to `db.ts`. `Benchmarker` class implements exponential moving average (EMA) for `avg_latency_ms` and `avg_tps`. Records every API call with actual measured latency and derived TPS.

### Task 2: Task Complexity Classifier
- **File:** `src/core/scoutlogic/classifier.ts` ✅
- **Goal:** Analyze the text of a prompt to heuristically determine its complexity.
- **Details:**
  - Export `classifyComplexity(prompt: string): 'trivial' | 'logical' | 'complex'`
  - Uses keyword extraction, length analysis, and requested format (e.g., "format as JSON" vs "write a robust algorithm") to assign a score.
- **Status:** COMPLETE — `classifyComplexity()` is a deterministic function (zero LLM token cost). Keywords like "implement", "scalable", "design", "architecture" push toward `complex`. Keywords like "format", "list", "summarize" push toward `trivial`. Length thresholds provide fallback scoring. Verified via `classifier.test.ts`.

### Task 3: Dynamic Model Selector (ScoutLogic)
- **File:** `src/core/scoutlogic/dynamic-router.ts` ✅
- **Goal:** Merge User Priorities, Task Complexity, and Live Benchmarks to select the ideal model.
- **Details:**
  - Implements the mathematical weighting function.
  - E.g., If user selects "Speed" and task is "Trivial", it heavily weights models with high TPS (like Groq).
  - Outputs the selected `modelId` which is then handed to the Phase 11 `executeWithFallback` function.
- **Status:** COMPLETE — `selectOptimalModel()` implements a normalized composite score: `score = w_speed * (1/latency) + w_intelligence * (1/complexity_penalty) + w_cost * (1/estimated_cost)`. Weights are derived from user's priority dial settings. Verified via `dynamic-router.test.ts`.

### Task 4: UI Priority Dials Integration
- **File:** `src/ui/components/RoutingDials.tsx` ✅
- **Goal:** Expose the Priority logic to the user visually.
- **Details:**
  - Create analog-style sliders for Speed, Cost, and Intelligence.
  - Save these preferences to `system_settings` via API.
- **Status:** COMPLETE — `RoutingDials.tsx` implements three premium analog-style sliders for Speed, Cost, and Intelligence priority weighting. Integrated into `SettingsModal.tsx` adjacent to `RouteSwitchConfig`. Settings persist to BaseVault `system_settings` table via `POST /api/system/settings`.

## Checkpoint Logs

| Date | Task | Description | File Verified |
|------|------|-------------|---------------|
| 2026-06-25 | Task 1 | Updated `src/core/basevault/db.ts` to include `model_benchmarks` table. Created `src/core/scoutlogic/benchmarker.ts` — `Benchmarker` class records latency and TPS per API call using exponential moving averages. | `src/core/scoutlogic/benchmarker.ts` ✅ |
| 2026-06-25 | Task 2 | Created `src/core/scoutlogic/classifier.ts` — `classifyComplexity()` is a 100% deterministic heuristic (no LLM tokens consumed). Full coverage verified via `classifier.test.ts`. | `src/core/scoutlogic/classifier.ts` ✅ |
| 2026-06-25 | Task 3 | Created `src/core/scoutlogic/dynamic-router.ts` — `selectOptimalModel()` implements normalized composite scoring math combining user weights, task complexity, and benchmark TPS/latency. Tests in `dynamic-router.test.ts`. | `src/core/scoutlogic/dynamic-router.ts` ✅ |
| 2026-06-25 | Task 4 | Created `src/ui/components/RoutingDials.tsx` — three analog-style sliders (Speed, Cost, Intelligence). Integrated into `SettingsModal.tsx`. Persists to `system_settings` via API. | `src/ui/components/RoutingDials.tsx` ✅ |
| 2026-06-25 | ALL | **Phase 12 100% COMPLETE.** ScoutLogic now autonomously selects the optimal LLM per DAG node based on live benchmarks, task complexity, and user priorities. | All files ✅ |

---
*Last audited: 2026-06-25 by Documentation Auditor Subagent*
