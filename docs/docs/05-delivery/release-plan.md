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

- **Beta-Stable Pre-Release Gates:** Before tag cutover, build must satisfy:
  - 398+ backend tests passing.
  - 40+ sandbox escape tests passing.
  - Zero TypeScript compilation or ESLint error-level alerts.
  - Zero Vale, Spectral, or Markdownlint schema errors.
  - Zero critical/high dependencies in npm audits (CycloneDX compliant SBOMs).
- **Rollback Policy:** In event of failure, revert to last tag. SQLite DB migrations support idempotent rollback actions.
