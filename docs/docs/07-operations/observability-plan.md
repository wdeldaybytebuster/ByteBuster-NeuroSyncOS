---
title: "Observability Plan"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Observability Plan

## Logging and Metrics

- **Structured Logging:** Powered by Pino. Outputs JSON format logs with automatic scrubbing of keys and tokens using serializer hooks.
- **Metrics Collection:** Uses `prom-client` to export Prometheus metrics (e.g. queue duration, CPU thread usage, SQLite transaction latencies).
- **Audit Logs:** BaseVault maintains a persistent audit log table detailing every run status, prompt version, validation state, and execution timestamp.
