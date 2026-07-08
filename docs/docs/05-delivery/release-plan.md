---
title: "Release Plan"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Release Plan

## Cutover and Rollbacks

- **Pre-Release Gates:** Before tag cutover, build must satisfy:
  - Full test suite passing (`npm test`; 47 test files as of 2026-07-08 — see
    `docs/docs/06-quality/test-strategy.md`).
  - Sandbox/permission-gate/terminal-session tests passing with zero escapes.
  - Zero `npx tsc --noEmit` errors.
  - Zero critical/high dependencies in `npm audit`.
  - `npm run build` succeeds.
- **Rollback Policy:** In event of failure, revert to last tag. SQLite DB migrations support idempotent rollback actions.
