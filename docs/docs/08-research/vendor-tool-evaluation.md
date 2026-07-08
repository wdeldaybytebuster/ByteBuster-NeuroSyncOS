---
title: "Vendor Tool Evaluation"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Vendor Tool Evaluation

## Comparison Matrix

- **DuckDB vs SQLite:** SQLite selected for transactional speed, BEGIN IMMEDIATE locks, and minimal memory footprint.
- **Vite/React vs Next.js:** Vite + React 19 selected for the dashboard — no
  server-rendering need for a fully local, single-user tool, and Vite's
  simpler build kept the footprint smaller. (An earlier version of this doc
  recorded the opposite conclusion; corrected 2026-07-08 against the actual
  shipped stack — there is no Next.js in this project.)
- **prom-client vs cloud metrics:** `prom-client` chosen to keep observability completely local and offline-compatible.
