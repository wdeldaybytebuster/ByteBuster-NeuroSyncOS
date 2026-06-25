**SUMMARY OF ORIGINAL DOCUMENT (code-standards.md):**
Coding conventions for NeuroSync Sovereign OS. Covers: general rules, TypeScript strict typing with exactOptionalPropertyTypes, file/folder organization by module boundary, naming conventions (PascalCase components/classes, camelCase functions, UPPER_SNAKE_CASE constants, snake_case DB tables), API/boundary standards, data standards (status enums owned by schema.ts, partitionBySchema<T>() required), styling/UI standards, CoreExec worker dispatch standards (WorkerInput union, classifyDirective routing), testing standards (confirmed test files per module), prohibited patterns.

===

<!-- Append-only log of changes — newest first -->

**Date:** 2026-06-26
**Agent:** Doc Agent (Documentation Audit)

- FULL REWRITE with confirmed naming examples from source files.
- CONFLICTS RESOLVED:
  - OLD: No mention of partitionBySchema or Zod patterns in data standards. FIXED: Added partitionBySchema as mandatory pattern; "no open-coding safeParse loops" as prohibited.
  - OLD: No worker dispatch standards. FIXED: Added confirmed WorkerInput discriminated union from worker.ts, classifyDirective routing from dispatch.ts.
  - OLD: Testing standards listed generic rules without confirmed test files. FIXED: Added confirmed test file inventory with case counts.
  - OLD: Prohibited Patterns did not mention inline coreexec handlers or ALLOWLIST duplication. FIXED: Both added as explicitly prohibited.
  - OLD: Naming conventions table had no examples from source. FIXED: Added PascalCase examples (FreeModeGovernor, RouteSwitchEngine, CerebroVectorStore, ApprovalCockpit), camelCase examples (executeRun, classifyDirective, validateDAGTemplate, partitionBySchema), UPPER_SNAKE_CASE examples (RESERVED_DAG_LABELS, ESTIMATED_COST_PER_1K_TOKENS_USD, ALLOWLIST).
- ADDED:
  - `noUncheckedIndexedAccess` two-step assign pattern from governor.ts.
  - ScoutLogic module folder mapping.
  - Module CamelCase Branding rules (exact casing for CoreExec, BaseVault, RouteSwitch, etc.).
  - `gitnexus wiki` prohibition.
