---
title: "Environment Config"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Environment Config

## Local-First Environment Setup

Configuration parameters live locally in `config.toml`. Secrets and provider keys must never be committed to source repositories.

- **`PORTGRID_PORT`**: Port number for PortGrid cockpit (default `3000`).
- **`BASEVAULT_DB_PATH`**: SQLite file path (default `~/.notebooklm-mcp-cli/basevault.db`).
- **`FREE_MODE_LIMIT`**: Token quota cap per day (default `50000`).
- **`ROUTE_FALLBACK`**: Cascade configuration for provider errors.
