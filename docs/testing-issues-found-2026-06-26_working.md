**SUMMARY OF ORIGINAL DOCUMENT (testing-issues-found-2026-06-26.md):**
Manual testing walkthrough of the complete user flow (create project → interview → approve → execute → monitor). Found 7 issues: 5 critical/high (all fixed), 2 low-priority (known, documented). Fixed: schema-dirty runs query, proposal persistence, raw JSON replaced with visual flowchart, missing projectId on approve, interview reset UX. Known: ScoutDaemon FK constraint on idle, MockProvider first-response confusion.

===

<!-- Append-only log of changes — newest first -->

**Date:** 2026-06-26
**Agent:** Kiro (Manual Testing Walkthrough)

- Performed complete end-to-end testing of user flow via API calls and server log inspection.
- Identified 7 issues across the proposal flow, schema validation, and UX clarity.
- Fixed 5 issues in this session: schema query fix (server/index.ts), proposal persistence + auto-nav (ScopeLogicDashboard), projectId pass-through (PortGridDashboard), reset UX improvement (ScopeLogicDashboard).
- Created user-manual.md at 6th-grade reading level covering: getting started, screen layout, creating projects, creating workflows (3-step flow), all 8 modules explained, common tasks, troubleshooting, safety, glossary.
- 2 known low-priority issues documented for future fix (ScoutDaemon FK, MockProvider response).
