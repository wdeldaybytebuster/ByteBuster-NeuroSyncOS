---
title: "Decision Log"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Decision Log

## Architecture Decisions

- **AD-0001: Migrate to SQLite persistence:** Replaced DuckDB with SQLite (`better-sqlite3`, WAL mode).
- **AD-0002: Bounded ScopeLogic Interview:** Added max 8-round requirements gathering loop to limit token usage.
- **AD-0003: Subdivided RouteSwitch Router:** Refactored RouteSwitch into Provider Registry and routing policy blocks to prevent god-object code smell.
- **AD-0004: PortGrid and CoreExec stay permanently separate dashboards.**
  Their backend logic once shared one directory (`src/core/coreexec/`); that
  overlap was fixed by splitting into `src/core/portgrid/` +
  `src/core/coreexec/` (2026-07-01), not by merging the UI. Never merge them.
- **AD-0005: No shell escape hatches for the general command path.** New
  CLI/terminal features must go through the `CommandSandbox` allowlist
  (`src/core/portgrid/sandbox.ts`) — **exception:** a full unrestricted
  interactive shell was explicitly approved for PortGrid's embedded terminal
  only, sandboxed instead by `bwrap` directory+network containment. One-off
  tradeoff, not a precedent.
- **AD-0006: AI actions stay draft-only.** Any code path letting an AI/agent
  act still requires an explicit human click to confirm
  (worktree-quarantine pattern, `src/core/coreexec/worktree.ts`,
  `.nexus_worktrees/<runId>/`). The embedded terminal is human-only-launched
  for the same reason.
- **AD-0007: Tests must never touch the real dev database.**
  `src/core/basevault/db.ts` uses a private `:memory:` DB when
  `process.env.VITEST` is set, after a real-data-loss incident where test
  cleanup code (`DELETE FROM projects`, `fs.unlinkSync`) ran against the
  shared file.
