---
title: "MVP Definition"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# MVP Definition

## MVP Objective

To deliver a beta-stable, local-only AI workflow engine that proves the core thesis: that AI actions can be governed as secure, transactional SQLite-backed workloads with absolute human-in-the-loop control.

## MVP User Outcome

A beginner hobbyist can: `successfully execute a 3-node DAG workflow locally, entirely offline, and recover from a simulated process crash without duplicating any completed tasks.`

## Included Capabilities

| Capability | User Value | Required for Demo? | Acceptance Criteria |
| --- | --- | --- | --- |
| CoreExec Engine | Asynchronous DAG routing and durable task execution | Yes | Workflows execute to completion |
| BaseVault Storage | SQLite WAL mode and BEGIN IMMEDIATE task claim locking | Yes | Prevents concurrent task collisions |
| PortGrid UI | Dashboard to review, edit, and approve DAG proposals | Yes | Operator manually triggers runs |
| Free Mode Governor | Restricts paid LLM calls and runs mock fallbacks | Yes | Runs offline without API keys |

## Excluded From MVP

| Capability | Reason Deferred | Revisit Trigger |
| --- | --- | --- |
| OAuth Integrations | Paid model licensing complication | User request |

Note: ScoutDaemon idle-time scheduling (real idle detector + OKF scanning) has
since shipped and is not deferred — see `docs/docs/00-foundation/project-charter.md`
§3.
