---
title: "Implementation Plan Reliability"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-07-08"
review_cadence: "weekly"
source_of_truth: true
---

# Implementation Plan Reliability

This document previously contained a full early-stage implementation plan
that had drifted from reality (wrong runtime version, wrong folder layout,
outdated phase framing). That plan is archived in full at
`docs/archive/early-reliability-and-security-plan-2026-06-25.md`; this file
now tracks what actually shipped and where the live plan lives.

## Where delivery status actually lives

`docs/implementation-plan-and-progress-tracker.md` is the living, dated
progress log — read its Status Dashboard (section 1) before assuming
something is a gap. As of 2026-07-01, all 11 P0/P1/P2 tasks from the
2026-06-30 reality audit are VERIFIED:

- Numeric confidence scoring + `os_todos.confidence` column
- Ported Deference UI pill-bar (0.70 threshold)
- Deleted the dead `src/ui-next/` Next.js prototype
- Split `coreexec` → `portgrid` + `coreexec` backend directories (dashboards
  stayed separate)
- Renamed `scoutlogic` → `routeswitch/model-selector/`
- Built a real tri-modal Context Router (`src/core/memory/context-router.ts`)
- Built a real hardened-`bwrap` embedded terminal in PortGrid
  (`src/core/portgrid/terminal-session.ts`)
- Global Developer Mode toggle + 6th-grade-reading-level default copy
- Orphan-component cleanup

## What's still in flight

`docs/llm-provider-testing-plan-2026-07-01.md` — OpenCode Zen and OpenRouter
provider adapters, real `node-llama-cpp` local inference, and a live-test
matrix that's still being worked through with real API keys. See
`docs/docs/09-governance/open-questions.md` for the current open item.

## Reliability mechanisms that did ship (fact-checked against source)

- **Crash recovery:** `resumeInProgressRuns()` in `src/core/coreexec/engine.ts`,
  called on server boot, requeues interrupted `workflow_runs` without
  duplicating completed task effects.
- **Free Mode Governor:** per-provider `is_paid_tier` + a global unlock,
  blocking paid-provider calls by default (`src/core/routeswitch/governor.ts`).
- **Redaction pipeline:** `SensitiveDataRedactor` (`src/core/basevault/redactor.ts`),
  three tiers (Public/Internal/Confidential), in-memory-only restoration for
  UI display.
- **Memory decay:** `MemorySweepScheduler` / habituation scoring in
  `src/core/memory/cerebro/habituation.ts` — frequently-accessed memories are
  promoted, unreferenced ones decay. Exact tuning constants live in code, not
  duplicated here since they change without a doc update.
