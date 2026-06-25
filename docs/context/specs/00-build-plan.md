---
title: "Build Plan"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# 00 Build Plan

This file breaks the project into ordered, verifiable implementation units. No unit should require functionality that has not already been built in a previous unit.

## Build Strategy

- Build foundations before features.
- Build security and access control before protected functionality.
- Build backend contracts before frontend wiring.
- Build UI shells before connecting real data when it reduces risk.
- Introduce dependencies just in time.
- Keep every unit small enough to review and verify independently.

## Phase Overview

| Phase | Goal | Exit Criteria |
| --- | --- | --- |
| Phase 0 — Foundation | Documentation, tooling baseline, naming alignment | Coding prompts use canonical names, ADRs are initialized |
| Phase 1 — Core System | Foundational SQLite schema, CoreExec engine | Execute 3-node workflow run with restart recovery |
| Phase 2 — MVP Features | PortGrid Cockpit, ScopeLogic proposals | Human-in-the-loop manual DAG approval UI completes |
| Phase 3 — Hardening | Security sandboxing, test coverage, supply chain | 398+ backend tests pass; CycloneDX compliance |
| Phase 4 — Constraints & Consensus | Category A constraints, JSON schema, Council Mode | Models triage and reach parallel consensus |
| Phase 5 — Cerebro & Memory | Vector search, Habituation Decay, async reflection | SQLite-vec logs successfully ingested |
| Phase 6 — Zero-Trust Security | SSE Push architecture, Tiered UI Approvals, bash sandbox | 20-command CWD-locked execution approved via UI |
| Phase 7 — Network Isolation | Resource capping, Garcon bypass, production build | Standalone Node API routing compiled static Vite UI |
## Unit List

| Unit | Name | What It Builds | Depends On | Verification |
| ---: | --- | --- | --- | --- |
| 00 | Project scaffold | Repository, CLI, linter setup | None | Build and lint checks pass |
| 01 | SQLite BaseVault schema | Table structures for runs, logs | Unit 00 | SQL validation queries run |
| 02 | CoreExec Queue | BEGIN IMMEDIATE task claims | Unit 01 | Test concurrent locks |
| 03 | CoreExec Execution | Asynchronous DAG workflow runner | Unit 02 | Test 3-node DAG run |
| 04 | PortGrid UI Canvas | React node editor dashboard | Unit 03 | UI component rendering |
| 05 | ScopeLogic Interview | 8-round requirements-gathering | Unit 04 | Generate draft-only JSON |

## Dependency Validation

- [x] All required previous units exist.
- [x] The unit has one primary outcome.
- [x] The unit stays within one system boundary or explicitly justifies crossing boundaries.
- [x] The unit has a test or manual verification path.
- [x] The unit does not require unresolved open questions.

## Out-of-Order Change Rule

If a new urgent unit must be inserted:

1. Add it to this file.
2. Explain why it is inserted.
3. Update dependencies for later units.
4. Update `context/progress-tracker.md`.
5. Add ADR if it changes architecture.

## Implementation Log Rollup (2026-06-26)

**Date:** 2026-06-25
**Agent:** Antigravity

- Resolved blocking UI rendering issues preventing the Master Dashboard and Sub-dashboards from loading their intended styling. 
- Integrated structural React UI components with the `public/` folder so static image assets correctly bundle.
- Validated these changes comply with GitNexus architectural boundaries. 
- Next phase: Formal live browser tests utilizing DevTools to ensure real-world visual fidelity prior to advancing core system logic.
