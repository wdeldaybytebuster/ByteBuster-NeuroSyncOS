---
title: "Decision Log"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Decision Log

## Architecture Decisions

- **AD-0001: Migrate to SQLitePersistence:** Replaced DuckDB with SQLite.
- **AD-0002: Bounded ScopeLogic Interview:** Added max 8-round requirements gathering loop to limit token usage.
- **AD-0003: Subdivided RouteSwitch Router:** Refactored RouteSwitch into Provider Registry and routing policy blocks to prevent god-object code smell.
