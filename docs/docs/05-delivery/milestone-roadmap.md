---
title: "Milestone Roadmap"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Milestone Roadmap

## Status (2026-07-08)

The phase-numbered roadmap below is historical framing from early planning
(2026-06-25) and does not track 1:1 with what shipped — several items landed
out of order or under different names. For actual delivery status, use
`docs/implementation-plan-and-progress-tracker.md`'s Status Dashboard, which
is dated and kept current. Summary: core execution (CoreExec + BaseVault),
the PortGrid dashboard + approval flow, RouteSwitch routing/Free Mode
Governor, and ScopeLogic's draft-proposal engine are all shipped. ScoutDaemon
does real idle-time background research (not "manual only"). The open item
is the LLM-provider live-test matrix (`docs/llm-provider-testing-plan-2026-07-01.md`).

## Original Phase Framing (historical reference)

- **Phase 0: Documentation & Governance:** naming conventions and module ownership contracts.
- **Phase 1: Local Core Execution:** SQLite schema, CoreExec queue, restart recovery.
- **Phase 2: PortGrid Dashboard UI:** front-end cockpit and human-in-the-loop approval views.
- **Phase 3: BaseVault Memory MVP:** project workspace scoping and token redaction logic.
- **Phase 4: RouteSwitch Traffic Router:** quota ledger, fallback cascades, provider integrations.
- **Phase 5: ScopeLogic proposal engine:** interview-first requirements gathering, draft DAG proposals.
- **Phase 6: ScoutDaemon:** idle-time background research and OKF scanning.
- **Phase 7: Hardening:** network isolation, sandbox tightening, encrypted keys.

## Implementation Plans

- [Implementation Plan Reliability](implementation-plan-reliability.md) — what shipped, fact-checked
- [Living Progress Tracker](../../implementation-plan-and-progress-tracker.md)
