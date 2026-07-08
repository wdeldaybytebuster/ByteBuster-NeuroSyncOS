---
title: "UI Conventions and Confidence Model"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-07-08"
review_cadence: "weekly"
source_of_truth: true
---

# UI Conventions and Confidence Model

This content was originally pasted, unformatted, into
`docs/docs/01-product/market-and-competitor-analysis.md` (wrong location) on
2026-06-26. It's been fact-checked against the current codebase and moved
here since it describes real, shipped UI/architecture behavior, not market
positioning. Full original text (including since-superseded phase numbering)
is preserved at `docs/archive/early-architecture-ux-spec-2026-06-26.md`.

## The Deference UI

AI-generated outputs carry a numeric confidence score (`os_todos.confidence`,
`dag_proposals`). Per the Master Architect Specification (§4), items score
>=0.70 render as an auto-approve pill row; items <0.70 require manual review.
Confirmed live in `src/ui/views/PortGridDashboard.tsx`.

## Local Proof Badges

UI badges surfacing architectural-safety evidence directly in the approval
queue, so the operator doesn't have to trust an opaque score:

- **Local Only** — no external models or network calls were used.
- **Redacted Before Inference** — sensitive fields were scrubbed prior to any
  external model call.
- **Human Approved** — user explicitly signed off on this execution.
- **Source Linked** — output is connected to verifiable source material.
- **Low Confidence** — flagged for mandatory manual review.
- **Quota Protected** — Free Mode Governor permitted this call under current
  budget caps.
- **Project Scoped** — result derived strictly from active project memory.
- **Sandbox Enforced** — tool execution restricted by sandbox constraints.

*(Status: verify current implementation coverage against
`src/ui/views/PortGridDashboard.tsx` before treating every badge as fully
wired — the confidence threshold and sandbox enforcement are confirmed live;
some individual badges may still be partial.)*

## Confidence Tiers (qualitative display, backed by the numeric score)

- **Gold / Verified (95%+):** highly reliable.
- **Amber / Review Advised (80–94%):** potential nuance; verification
  recommended.
- **Red / Manual Review Required (<80%):** high risk; do not execute.
- **Gray / Insufficient Evidence:** system cannot ground the claim.

**Mandatory human approval regardless of score** for "Critical Tasks": file
deletion, dependency installation, schema migration, credential handling, and
network access changes.

## Accessibility

- Every interactive element has an accessible name.
- Sidebar toggles and tools have explicit ARIA labels.
- Modal dialogs trap focus correctly.
- Approval flows are navigable via keyboard only.
- Playwright tests include accessibility smoke checks — see
  `docs/docs/06-quality/acceptance-checklists.md`.
