---
title: "Test Strategy"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Test Strategy

## Test Suite and Frameworks

- **Unit Testing:** Powered by Vitest. Tests pure logic, validators, and custom exception classes.
- **Integration Testing:** Tests BaseVault SQLite table transactions and mock RouteSwitch cascades.
- **E2E / Workflow Testing:** Powered by Playwright. Simulates client workspace creation, DAG approvals, and run recovery.
- **Adversarial Security Testing:** Simulates prompt injections, path traversals, and sandbox escapes to verify seccomp/unshare constraints.
