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

- **Unit/Integration Testing:** Vitest, 47 colocated `*.test.ts` files under
  `src/` as of 2026-07-08 (`npm test`). Tests use a private `:memory:` DB
  (auto-selected via `process.env.VITEST`) — never the real
  `.data/neurosync.db`.
- **E2E:** Playwright is a real dependency (`package.json`); no dedicated E2E
  suite exists in `src/` yet beyond the colocated tests — flag as a real gap,
  not a shipped capability.
- **Sandbox/Adversarial Testing:** `src/core/portgrid/sandbox.test.ts`,
  `terminal-session.test.ts`, `permission-gate.test.ts` (61 test cases
  combined) exercise the `CommandSandbox` allowlist and `bwrap` containment.
- **Known-flaky test:** `LlamaCppProvider should format correctly` in
  `routeswitch.test.ts` has been observed flaky across sessions — not a
  regression if it fails in isolation.
