---
title: "Runbook"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Runbook

## Routine Operations

- **Manual Database Backup:** Export database using SQLite command:
  ```bash
  sqlite3 basevault.db ".backup backup.db"
  ```
- **Clear Stale Leases:** In event of hard crash, run CLI command:
  ```bash
  nlm queue reset-leases
  ```
- **Introspective Migrations:** Run migrations command to upgrade/verify tables safely:
  ```bash
  nlm migrate up
  ```
