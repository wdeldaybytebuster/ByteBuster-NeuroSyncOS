---
title: "Runbook"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-07-08"
review_cadence: "weekly"
source_of_truth: true
---

# Runbook

## Routine Operations

- **Manual Database Backup:** `GET /backup` on the running server
  (`src/server/routes/system.ts`) streams progress over SSE and writes
  `backup-<timestamp>.db` in the working directory via `better-sqlite3`'s
  native `db.backup()`. There is no separate CLI tool for this — it's an API
  call, e.g. `curl http://localhost:3743/api/backup`.
- **Clear Stale Leases / Resume After Crash:** handled automatically on boot
  by `resumeInProgressRuns()` in `src/core/coreexec/engine.ts` — no manual
  step needed under normal restart.
- **Migrations:** schema migrations run automatically on server start via
  idempotent `ALTER TABLE ... ADD COLUMN` retries in
  `src/core/basevault/db.ts`. There is no separate migration CLI.
- **Dev servers:** `npm run dev:ui` (Vite) and `npm run dev:server` (tsx
  watch on `src/server/index.ts`). Production: `npm run build` then
  `npm start`.

(There is no `nlm` CLI in this project — that was a placeholder name from an
earlier planning pass.)
