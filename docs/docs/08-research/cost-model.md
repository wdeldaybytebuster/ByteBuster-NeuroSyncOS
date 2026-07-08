---
title: "Cost Model"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Cost Model

## Hardware Economics & Token Burn

The core vision is local-first, meaning the baseline operating cost is **0.00 USD/day** for offline mock/free-tier/local-GGUF routing.
- **Paid Upgrades:** paid providers are blocked by default by the Free Mode
  Governor (`is_paid_tier` per provider); a global unlock is required before
  any paid call can be made.
- **Budget Caps:** the specific numeric daily-spend cap mechanism referenced
  in earlier planning docs (a `config.toml`-based dollar limit) is not
  confirmed in the current codebase — there is no `config.toml`. Treat as an
  open design question, not shipped behavior, until verified against
  `src/core/routeswitch/governor.ts`.
