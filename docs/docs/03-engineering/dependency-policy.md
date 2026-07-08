---
title: "Dependency Policy"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Dependency Policy

## Supply Chain Security

To preserve the zero-trust local boundary, dependency additions must follow strict rules:
- **Patch Updates (0.0.x):** Weekly, automated via lockfile updates.
- **Minor Updates (0.x.0):** Monthly, requiring manual PR reviews.
- **Major Updates (x.0.0):** Allowed only per-release after full test suite verification.
- **Security Vulnerabilities:** Immediate intervention via `npm audit fix` on critical or high warnings.
- **Lockfile Enforcement:** All environments build using `npm ci` to ensure lockfile parity.
- **No paid libraries, no external databases:** everything stays on
  `better-sqlite3`. New *free* npm packages (MIT/Apache) are acceptable but
  must be flagged to the user before installing — see
  `docs/docs/09-governance/decision-log.md`.
