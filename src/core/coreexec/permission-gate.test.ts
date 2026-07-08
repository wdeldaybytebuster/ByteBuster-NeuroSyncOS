import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db, initDB, dbPath } from '../basevault/db';
import { checkActionPermission } from './permission-gate';
import fs from 'fs';

/**
 * Phase 5 — enforcement gating tests. Proves:
 *  (a) permissive default: no archetype → shell AND scrape both allowed (the
 *      non-negotiable "existing/unconfigured projects keep working" guarantee),
 *  (b) research_only-archetype project is blocked from shell,
 *  (c) an archetype with network:false is blocked from scrape,
 *  plus the tool-registry disable path and fail-open safety cases.
 */
describe('checkActionPermission (Phase 5 execution gating)', () => {
  const seedProject = (id: string, archetype: string | null) => {
    db.prepare(
      'INSERT OR REPLACE INTO projects (id, name, permission_archetype, created_at) VALUES (?, ?, ?, ?)'
    ).run(id, 'Test Project', archetype, Date.now());
  };

  beforeAll(() => {
    initDB();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM projects').run();
    db.prepare("DELETE FROM system_settings WHERE key IN ('tool_registry','agent_permissions')").run();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
  });

  // ── (a) Permissive default ────────────────────────────────────────────────
  it('allows shell + scrape when no projectId is supplied', async () => {
    expect(await checkActionPermission(undefined, 'shell')).toEqual({ blocked: false });
    expect(await checkActionPermission(undefined, 'scrape')).toEqual({ blocked: false });
  });

  it('allows shell + scrape for a project with NULL permission_archetype (permissive default)', async () => {
    seedProject('proj-null', null);
    expect(await checkActionPermission('proj-null', 'shell')).toEqual({ blocked: false });
    expect(await checkActionPermission('proj-null', 'scrape')).toEqual({ blocked: false });
  });

  it('allows shell + scrape for a project row that does not exist (permissive default)', async () => {
    expect(await checkActionPermission('does-not-exist', 'shell')).toEqual({ blocked: false });
  });

  // ── (b) research_only blocked from shell ──────────────────────────────────
  it('blocks shell for a research_only project but allows scrape (network default true)', async () => {
    seedProject('proj-research', 'research_only');
    const shell = await checkActionPermission('proj-research', 'shell');
    expect(shell.blocked).toBe(true);
    if (shell.blocked) expect(shell.reason).toMatch(/does not permit command execution/);

    // research_only defaults to network:true — research explicitly needs the web.
    expect(await checkActionPermission('proj-research', 'scrape')).toEqual({ blocked: false });
  });

  it('allows shell for code_execute (exec: sandboxed) and admin_operator (exec: true)', async () => {
    seedProject('proj-code', 'code_execute');
    seedProject('proj-admin', 'admin_operator');
    expect(await checkActionPermission('proj-code', 'shell')).toEqual({ blocked: false });
    expect(await checkActionPermission('proj-admin', 'shell')).toEqual({ blocked: false });
  });

  // ── (c) network:false blocked from scrape ─────────────────────────────────
  it('blocks scrape when the assigned archetype has network:false', async () => {
    // Store a custom agent_permissions matrix where research_only cannot reach
    // the network.
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('agent_permissions', ?)").run(
      JSON.stringify({
        archetypes: [
          { id: 'research_only', read: true, write: false, exec: false, git: true, network: false },
        ],
      })
    );
    seedProject('proj-nonet', 'research_only');
    const scrape = await checkActionPermission('proj-nonet', 'scrape');
    expect(scrape.blocked).toBe(true);
    if (scrape.blocked) expect(scrape.reason).toMatch(/does not permit network/);
  });

  // ── Tool-registry disable path ────────────────────────────────────────────
  it('blocks shell when the run_command tool is Disabled, even for admin_operator', async () => {
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('tool_registry', ?)").run(
      JSON.stringify([{ id: 'run_command', name: 'run_command', type: 'Execute', status: 'Disabled' }])
    );
    seedProject('proj-admin2', 'admin_operator');
    const shell = await checkActionPermission('proj-admin2', 'shell');
    expect(shell.blocked).toBe(true);
    if (shell.blocked) expect(shell.reason).toMatch(/run_command tool is disabled/);
  });

  it('blocks scrape when the web_scrape tool is Disabled', async () => {
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('tool_registry', ?)").run(
      JSON.stringify([{ id: 'web_scrape', name: 'web_scrape', type: 'Network', status: 'Disabled' }])
    );
    seedProject('proj-admin3', 'admin_operator');
    const scrape = await checkActionPermission('proj-admin3', 'scrape');
    expect(scrape.blocked).toBe(true);
    if (scrape.blocked) expect(scrape.reason).toMatch(/web_scrape tool is disabled/);
  });

  // ── Fail-open safety ──────────────────────────────────────────────────────
  it('fails open (allows) when the assigned archetype id is unknown', async () => {
    seedProject('proj-bogus', 'nonexistent_archetype');
    expect(await checkActionPermission('proj-bogus', 'shell')).toEqual({ blocked: false });
    expect(await checkActionPermission('proj-bogus', 'scrape')).toEqual({ blocked: false });
  });
});
