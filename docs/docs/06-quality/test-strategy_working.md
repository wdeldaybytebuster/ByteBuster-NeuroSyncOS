**Document Summary: Test Strategy**

- **Unit Testing:** Powered by Vitest. Tests pure logic, validators, and custom exception classes.
- **Integration Testing:** Tests BaseVault SQLite table transactions and mock RouteSwitch cascades.
- **E2E / Workflow Testing:** Powered by Playwright. Simulates client workspace creation, DAG approvals, and run recovery.
- **Adversarial Security Testing:** Simulates prompt injections, path traversals, and sandbox escapes to verify seccomp/unshare constraints.

===

<!-- Append-only log of changes managed by BaseVault -->
