---
title: "Codebase Standards"
status: draft
owner: "williamdeldaymarketing"
last_updated: "2026-06-25"
review_cadence: "weekly"
source_of_truth: true
---

# Codebase Standards

- **Strict Type Validation:** All files must compile under TypeScript strict mode (`tsconfig.json`).
- **Input Filtering:** Validate all external inputs at system boundaries using strict Zod schemas.
- **Folder Scoping:** Code modifications must respect boundary folders:
  - `src/core/coreexec` owns execution logs.
  - `src/core/basevault` owns the SQLite schema.
- **Structured Errors:** Do not throw raw strings; extend the `NLMError` exception base class.
