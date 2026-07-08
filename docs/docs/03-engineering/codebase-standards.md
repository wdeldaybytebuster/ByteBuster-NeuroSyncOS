---
title: "Codebase Standards"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Codebase Standards

- **Strict Type Validation:** All files must compile under TypeScript strict mode (`tsconfig.json`); run `npx tsc --noEmit` before merging.
- **Input Filtering:** Validate all external inputs at system boundaries using Zod schemas.
- **Folder Scoping:** respect the module boundaries in
  `docs/docs/02-architecture/system-boundaries.md` — `src/core/coreexec` and
  `src/core/portgrid` are permanently separate and must never be merged.
- **Structured Errors:** extend `Error` with a purpose-specific subclass
  (e.g. `CommandExecutionError` in `src/core/portgrid/sandbox.ts`) rather than
  throwing raw strings.
- **Tests:** colocate `*.test.ts` next to the source file (Vitest); never let
  a test touch the real `.data/neurosync.db` — use `:memory:` (auto-selected
  when `process.env.VITEST` is set).
