---
title: "Security Verification Checklist"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Security Verification Checklist

## Checklist Gates

- [ ] Verify that no proposal contains `INSERT` or `UPDATE` SQL instructions (SA-01).
- [ ] Confirm no AI-generated proposal outputs executable script blocks (SA-02).
- [ ] Pass the sandbox/permission-gate/terminal-session test suites (61 test
      cases as of 2026-07-08: `sandbox.test.ts`, `terminal-session.test.ts`,
      `permission-gate.test.ts`) with zero successful escapes.
- [ ] Ensure `validationPassed` is checked by an independent validator process (SA-03).
- [ ] Block shell or exec node types from entering custom DAG layouts, except
      the explicitly-approved embedded terminal (SA-04/SA-05).
- [ ] Audit that no API key is written to Pino logging console outputs.
- [ ] `npm audit` — 0 critical/high vulnerabilities before release.
