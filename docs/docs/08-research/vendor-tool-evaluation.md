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
- **Vite/React vs Next.js:** Next.js selected for the dashboard and Cockpit setup to utilize server actions and SSR optimization.
- **prom-client vs cloud metrics:** `prom-client` chosen to keep observability completely local and offline-compatible.
