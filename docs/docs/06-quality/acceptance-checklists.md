---
title: "Acceptance Checklists"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Acceptance Checklists

## Verification Gates

- [ ] Core execution path completes without network connection.
- [ ] Stale leases are correctly expired on boot.
- [ ] Memory namespaces prevent cross-project context bleed.
- [ ] Free Mode Governor intercepts and blocks calls if API keys are missing.
- [ ] AI proposals pass independent schema validation.
- [ ] No credential or sensitive token is written to plaintext logging.
