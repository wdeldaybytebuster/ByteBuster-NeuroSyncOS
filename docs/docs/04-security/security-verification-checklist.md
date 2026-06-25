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

- [ ] Verify that no proposal contains `INSERT` or `UPDATE` SQL instructions.
- [ ] Confirm no AI-generated proposal outputs executable script blocks.
- [ ] Pass 40+ sandbox escape validation test cases.
- [ ] Ensure `validationPassed` is checked by an independent validator process.
- [ ] Block shell or exec node types from entering custom DAG layouts.
- [ ] Audit that no API key is written to Pino logging console outputs.
