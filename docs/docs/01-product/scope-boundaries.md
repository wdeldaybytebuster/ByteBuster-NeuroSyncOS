---
title: "Scope Boundaries"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Scope Boundaries

## In Scope (MVP)

- Single-user, multi-project workspace isolation.
- Transactional DAG execution engine (CoreExec) and SQLite database persistence (BaseVault).
- ScopeLogic interview loops generating draft-only DAG proposals.
- PortGrid cockpit UI with Local Proof Badges.
- RouteSwitch free-tier/mock routing with Free Mode Governor.
- Manual execution of file/URL checks.

## Out of Scope (Non-Goals)

- Multi-tenant cloud hosting.
- Distributed service mesh configurations.
- Unsupervised autonomous execution — ScoutDaemon does real idle-time
  background research, but any resulting workflow proposal still requires
  human approval before it can run (see `docs/docs/04-security/security-privacy-model.md`).
- Heavy external vector databases — uses `sqlite-vec` for local semantic
  search instead.
