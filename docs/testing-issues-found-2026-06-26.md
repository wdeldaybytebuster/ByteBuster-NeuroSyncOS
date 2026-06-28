# Testing Issues Found — 2026-06-26

## Issues Found During Manual Walkthrough

### Issue 1: Schema-Dirty Workflow Runs (FIXED)
**Problem:** The `/api/basevault/runs` endpoint only selected `id, status, created_at` from `workflow_runs`, but the `WorkflowRunSchema` requires `project_id` and `dag_layout`. Every row failed Zod validation and was dropped as "dirty."

**What this looked like:** The CoreExec and BaseVault dashboards showed "No workflow runs found" even after a workflow was approved and created in the database.

**Example:** A user completes the interview, approves the workflow, it executes — but when they go to CoreExec Dashboard, the run list is empty.

**Fix Applied:** Updated the SQL query to `SELECT id, project_id, dag_layout, status, created_at FROM workflow_runs` so all required schema fields are present.

---

### Issue 2: Proposal Not Persisted Across Navigation (FIXED)
**Problem:** The DAG proposal from ScopeLogic was stored only in React component state (`useState`). If the user navigated to another module and came back, the proposal disappeared.

**What this looked like:** User completes interview → sees "review proposal below" → clicks to another module → comes back → proposal is gone, can't approve or reject.

**Fix Applied:** Proposals are now persisted to the backend via `POST /api/system/proposals/stage`. They survive navigation and are loaded on mount.

---

### Issue 3: Raw JSON Shown to Non-Technical Users (FIXED)
**Problem:** After the interview completed, the "Draft Proposal Quarantine" showed raw JSON like `{"id":"uuid-...", "nodes":[...]}`. A beginner user wouldn't know what this means.

**What this looked like:** A wall of curly braces, UUIDs, and technical field names where an approval button should be.

**Fix Applied:** Proposals now auto-navigate to PortGrid where they're rendered as a visual flowchart (ReactFlow) with human-readable step labels and numbered step list. The approval action happens visually, not through JSON.

---

### Issue 4: PortGrid Approve Didn't Pass Project ID (FIXED)
**Problem:** When clicking "Approve & Execute Workflow" in PortGrid, the POST to `/api/coreexec/approve` didn't include the active `projectId`. The backend used a random UUID fallback, creating a workflow run not associated with the user's selected project.

**What this looked like:** The workflow ran, but it didn't show up when filtering by the user's active project.

**Fix Applied:** PortGrid now passes `activeProjectId` from NavigationContext in the approval POST body.

---

### Issue 5: Interview Stuck in "Complete" State (FIXED)
**Problem:** After completing an interview, if the user returned to ScopeLogic, the input was disabled with no obvious way to start fresh. The "Reset" button existed but was labeled ambiguously.

**What this looked like:** User comes back to ScopeLogic after approving a workflow. They see the old conversation, a disabled input saying "Interview complete," and a tiny "Reset" button that doesn't clearly communicate it starts a new interview.

**Fix Applied:** 
- Button now shows "+ New Interview" when the interview is complete (clearer affordance)
- Reset also clears any persisted proposal from the backend
- On mount, if interview is complete and a proposal exists, shows the status card with "Open in PortGrid for Review →"

---

### Issue 6: ScoutDaemon FK Constraint Error (KNOWN — LOW PRIORITY)
**Problem:** When the system goes idle, ScoutDaemon tries to create a maintenance workflow but uses `'system-maintenance'` as the project_id, which doesn't exist in the `projects` table (FK constraint).

**What this looked like:** Server log shows: `SqliteError: FOREIGN KEY constraint failed`

**Suggested Fix:** Insert a `'system-maintenance'` project row in `initDB()` or have the idle handler use `INSERT OR IGNORE INTO projects` before creating the run.

---

### Issue 7: MockProvider First Response is Confusing (KNOWN — LOW PRIORITY)
**Problem:** When using the default MockProvider (no LLM configured), the first interview response returns: `[MOCK RESPONSE] Acknowledged prompt: "You are ScopeLogic..."` which is raw debug output, not a useful question.

**What this looked like:** User's first message gets a response that looks like an error or debug dump instead of a clarifying question.

**Suggested Fix:** The RouteSwitchEngine should detect when MockProvider returns its fallback string and ScopeLogic should fall through to the static question list immediately rather than displaying the mock output.

---

## Summary

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Schema-dirty runs query | Critical | ✅ Fixed |
| 2 | Proposal lost on navigation | Critical | ✅ Fixed |
| 3 | Raw JSON for approval | High | ✅ Fixed |
| 4 | Missing projectId on approve | High | ✅ Fixed |
| 5 | Interview stuck with no clear reset | Medium | ✅ Fixed |
| 6 | ScoutDaemon FK constraint on idle | Low | Known — not blocking |
| 7 | MockProvider first response | Low | Known — not blocking |
