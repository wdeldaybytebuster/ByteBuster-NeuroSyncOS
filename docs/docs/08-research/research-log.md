---
title: "Research Log"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Research Log

## Key Investigations

- **RL-001: Transactional vs Analytical Persistence:** DuckDB analytical column scanning was replaced by SQLite with `better-sqlite3` driver. Outcome: SQLite's B-trees and immediate locking solved task concurrency deadlocks.
- **RL-002: AI Coding Amnesia:** Investigated cognitive memory structures. Outcome: Implemented multi-level scoped memory schemas within SQLite, tied strictly to client project IDs.
