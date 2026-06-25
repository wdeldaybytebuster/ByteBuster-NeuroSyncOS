**Document Summary: Codebase Standards**

- **Strict Type Validation:** All files must compile under TypeScript strict mode (`tsconfig.json`).
- **Input Filtering:** Validate all external inputs at system boundaries using strict Zod schemas.
- **Folder Scoping:** Code modifications must respect boundary folders:
  - `src/core/coreexec` owns execution logs.
  - `src/core/basevault` owns the SQLite schema.
- **Structured Errors:** Do not throw raw strings; extend the `NLMError` exception base class.

===

<!-- Append-only log of changes managed by BaseVault -->
