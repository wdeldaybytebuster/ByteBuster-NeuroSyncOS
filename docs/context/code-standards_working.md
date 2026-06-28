**SUMMARY OF ORIGINAL DOCUMENT (code-standards.md):**
Coding conventions for NeuroSync Sovereign OS. Covers: general rules, TypeScript strict typing with exactOptionalPropertyTypes, file/folder organization by module boundary, naming conventions (PascalCase components/classes, camelCase functions, UPPER_SNAKE_CASE constants, snake_case DB tables), API/boundary standards, data standards (status enums owned by schema.ts, partitionBySchema<T>() required), styling/UI standards, CoreExec worker dispatch standards (WorkerInput union, classifyDirective routing), testing standards (confirmed test files per module), prohibited patterns.

===

<!-- Append-only log of changes — newest first -->

**Date:** 2026-06-26
**Agent:** Maintenance Agent (Antigravity)

- System-wide TypeScript type resolution completed.
- Backend type errors (165 tests) passing and cleared.
- Successfully bootstrapped missing dependencies in Next.js `ui-next` directory.
- Root TSConfig optimized for monorepo separation.
- Unfinished tasks in `ts-errors.txt` successfully verified and marked as complete.



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
- Transitioning to Phase 13 (Free-tier testing).

### [2026-06-26] UI Overhaul - Full Dashboard Suite Redesign Complete
- Fully redesigned and refactored **BaseVault**, **PortGrid**, **ScopeLogic**, **CoreExec**, **RouteSwitch**, **ScoutDaemon**, and **Cerebro** dashboards.
- Applied the "Grit, Not Grime" zero-budget, high-reliability local execution design philosophy.
- Transitioned to "High-Glow" dynamic themes tailored to each module's core function.
- Finalized global styling variables in `index.css`.
- Synchronized all module routes inside `OSLayout.tsx` and `App.tsx` ensuring 100% cohesion across the suite.
