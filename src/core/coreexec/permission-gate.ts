/**
 * Phase 5 — real execution gating for the `shell` / `scrape` task actions.
 *
 * Resolves the task's project permission archetype and the tool-registry /
 * agent-permission settings (read inline from the BaseVault DB, mirroring the
 * project_id lookup done in worker.ts so the bundled worker thread needs no
 * extra wiring), then decides whether the action is permitted.
 *
 * Contract:
 *  - projectId undefined            → { blocked: false } (no project context)
 *  - permission_archetype IS NULL   → { blocked: false } (permissive default)
 *  - archetype assigned but unknown → { blocked: false } (fail-open: never
 *      break a run over a settings mismatch — the permissive-default guarantee
 *      wins over strictness here, and is logged rather than silently enforced)
 *  - any DB/parse error             → { blocked: false } (fail-open, logged)
 *
 * The two defaults below MUST stay in sync with the `/tools` and
 * `/agents/permissions` route defaults in src/server/routes/system.ts. They are
 * only consulted when the corresponding system_settings row has never been
 * written (fresh install); once the user opens the settings screen the stored
 * rows take over.
 *
 * `db` is loaded lazily inside `checkActionPermission` via a dynamic
 * `import()`, not a static top-level `import` and not a bare `require()`:
 *  - A static top-level `import` gets hoisted by esbuild to execute
 *    basevault/db.ts's module init (opening a second better-sqlite3
 *    connection) eagerly at bundle-load time, before the worker thread has
 *    finished initializing — the exact native-addon timing bug worker.ts's
 *    own lazy access to `db` already works around.
 *  - A bare `require('../basevault/db')` works fine once esbuild has bundled
 *    it into worker.generated.cjs, but fails ("Cannot find module") when this
 *    function is exercised directly under Vitest, which doesn't extend
 *    Node's native CJS resolver to `.ts` paths the way it transforms `import`.
 * A dynamic `import()` resolves correctly in both places: Vitest's own
 * module loader handles it like any other ESM import, and esbuild still
 * bundles it (lazily — evaluated only when this function actually runs, not
 * at bundle load) when producing worker.generated.cjs. That makes
 * `checkActionPermission` async; callers (worker.ts) await it.
 */

export type GateAction = 'shell' | 'scrape';
export type GateResult = { blocked: false } | { blocked: true; reason: string };

const DEFAULT_TOOL_REGISTRY: { id: string; status: string }[] = [
  { id: 'read_file', status: 'Active' },
  { id: 'write_file', status: 'Active' },
  { id: 'list_directory', status: 'Active' },
  { id: 'run_command', status: 'Sandboxed' },
  { id: 'web_scrape', status: 'Active' },
  { id: 'git_nexus', status: 'Active' },
  { id: 'sqlite_vec', status: 'Active' },
];

const DEFAULT_ARCHETYPES: { id: string; exec: boolean | string; network: boolean }[] = [
  { id: 'code_execute', exec: 'sandboxed', network: true },
  { id: 'research_only', exec: false, network: true },
  { id: 'admin_operator', exec: true, network: true },
];

export async function checkActionPermission(
  projectId: string | undefined,
  action: GateAction,
): Promise<GateResult> {
  if (!projectId) return { blocked: false };

  try {
    // Lazy dynamic import (see file header) — resolves under both Vitest and
    // the esbuild-bundled worker thread.
    const { db } = await import('../basevault/db.js');
    const proj = db
      .prepare('SELECT permission_archetype FROM projects WHERE id = ?')
      .get(projectId) as { permission_archetype: string | null } | undefined;
    const archetypeId = proj?.permission_archetype;

    // Permissive default: no archetype assigned → behave exactly as today.
    if (!archetypeId) return { blocked: false };

    // Tool registry (stored JSON in system_settings, else the shipped defaults).
    const toolRow = db
      .prepare("SELECT value FROM system_settings WHERE key = 'tool_registry'")
      .get() as { value: string } | undefined;
    const tools: { id: string; status: string }[] = toolRow
      ? JSON.parse(toolRow.value)
      : DEFAULT_TOOL_REGISTRY;

    // Agent permission archetypes.
    const permRow = db
      .prepare("SELECT value FROM system_settings WHERE key = 'agent_permissions'")
      .get() as { value: string } | undefined;
    const archetypes: { id: string; exec?: boolean | string; network?: boolean }[] = permRow
      ? (JSON.parse(permRow.value)?.archetypes ?? [])
      : DEFAULT_ARCHETYPES;
    const archetype = archetypes.find((a) => a.id === archetypeId);

    // Assigned archetype not found in settings → fail-open (never break a run
    // on a config mismatch; permissive-default guarantee wins).
    if (!archetype) {
      console.warn(
        `Permission archetype '${archetypeId}' assigned to project ${projectId} not found in agent_permissions; allowing (fail-open).`,
      );
      return { blocked: false };
    }

    if (action === 'shell') {
      const tool = tools.find((t) => t.id === 'run_command');
      if (tool && tool.status === 'Disabled') {
        return { blocked: true, reason: 'Blocked: run_command tool is disabled' };
      }
      // 'sandboxed' and true both count as allowed; false blocks.
      const execAllowed = archetype.exec === true || archetype.exec === 'sandboxed';
      if (!execAllowed) {
        return {
          blocked: true,
          reason: `Blocked: archetype '${archetypeId}' does not permit command execution`,
        };
      }
    } else {
      // action === 'scrape'
      const tool = tools.find((t) => t.id === 'web_scrape');
      if (tool && tool.status === 'Disabled') {
        return { blocked: true, reason: 'Blocked: web_scrape tool is disabled' };
      }
      if (!archetype.network) {
        return {
          blocked: true,
          reason: `Blocked: archetype '${archetypeId}' does not permit network/web access`,
        };
      }
    }

    return { blocked: false };
  } catch (err) {
    // Fail-open on any error — the permissive-default requirement is
    // non-negotiable; a broken settings read must never break a live run.
    console.error('Permission enforcement check failed; allowing (fail-open):', err);
    return { blocked: false };
  }
}
