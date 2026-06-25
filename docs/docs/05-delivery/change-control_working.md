**Document Summary: Change Control**

- **Agent Handoff Constraints:** AI coding agents must remain in scoped directories (e.g. `/src/coreexec/`) and cannot rename core modules or introduce paid/cloud library dependencies.
- **System Prompt Updates:** Prompt updates require specific validation checks depending on scope:
  - Typos: require Category C validation checks.
  - Constraint additions: require AI Architect and Security approval.
  - Safety changes: require full regression test suite pass.
  - Formats: require contract schema validation tests.

===

<!-- Append-only log of changes managed by BaseVault -->
