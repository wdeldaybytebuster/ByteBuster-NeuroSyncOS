import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, initDB, dbPath, migratePendingProposalBlob, migrate_v0_v1, SCHEMA_VERSION, getUserVersion, setUserVersion } from './db';
import fs from 'fs';

describe('BaseVault SQLite Database', () => {
  beforeAll(() => {
    // Initialize the DB schema
    initDB();
  });

  afterAll(() => {
    // Clean up
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
  });

  it('should initialize tables correctly', () => {
    const tableQuery = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`);
    const tables = tableQuery.all() as { name: string }[];
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('workflow_runs');
    expect(tableNames).toContain('tasks');
  });

  it('should enforce WAL mode (or SQLite\'s in-memory equivalent under tests)', () => {
    const pragmaQuery = db.prepare(`PRAGMA journal_mode`);
    const result = pragmaQuery.get() as { journal_mode: string };

    // SQLite doesn't support WAL for ':memory:' databases (used here to keep
    // the test suite isolated from the real dev database) — it silently
    // falls back to 'memory' regardless of the requested pragma. WAL is a
    // file-backed-database concern; this file db never exists in test mode.
    const expected = dbPath === ':memory:' ? 'memory' : 'wal';
    expect(result.journal_mode.toLowerCase()).toBe(expected);
  });

  it('should give os_todos a numeric confidence column defaulting to 0.5 (Deference UI 0.70 threshold)', () => {
    const columns = db.prepare(`PRAGMA table_info(os_todos)`).all() as { name: string; type: string; dflt_value: string | null }[];
    const confidenceCol = columns.find(c => c.name === 'confidence');

    expect(confidenceCol).toBeDefined();
    expect(confidenceCol!.type.toUpperCase()).toBe('REAL');
    expect(confidenceCol!.dflt_value).toBe('0.5');
  });

  it('should give projects a nullable archived_at column for soft-delete', () => {
    const columns = db.prepare(`PRAGMA table_info(projects)`).all() as { name: string; type: string; notnull: number }[];
    const archivedAtCol = columns.find(c => c.name === 'archived_at');

    expect(archivedAtCol).toBeDefined();
    expect(archivedAtCol!.type.toUpperCase()).toBe('INTEGER');
    expect(archivedAtCol!.notnull).toBe(0);
  });

  it('should give llm_providers an opt-in is_paid_tier column defaulting to 0 (free)', () => {
    const columns = db.prepare(`PRAGMA table_info(llm_providers)`).all() as { name: string; type: string; notnull: number; dflt_value: string | null }[];
    const paidCol = columns.find(c => c.name === 'is_paid_tier');

    expect(paidCol).toBeDefined();
    expect(paidCol!.type.toUpperCase()).toBe('INTEGER');
    // NOT NULL DEFAULT 0 — every provider (including pre-existing rows) starts
    // free; nothing is silently reclassified as paid by provider type.
    expect(paidCol!.notnull).toBe(1);
    expect(paidCol!.dflt_value).toBe('0');
  });

  it('defaults is_paid_tier to 0 for an inserted provider that does not set it', () => {
    const id = 'prov_test_paidtier';
    db.prepare(`INSERT INTO llm_providers (id, name, type, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, 'Free Proxy', 'openai-compatible', '{}', Date.now(), Date.now());
    const row = db.prepare('SELECT is_paid_tier FROM llm_providers WHERE id = ?').get(id) as { is_paid_tier: number };
    expect(row.is_paid_tier).toBe(0);
    db.prepare('DELETE FROM llm_providers WHERE id = ?').run(id);
  });

  it('should create a dag_proposals table with the expected columns/defaults', () => {
    const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map(t => t.name);
    expect(tables).toContain('dag_proposals');

    const columns = db.prepare(`PRAGMA table_info(dag_proposals)`).all() as { name: string; type: string; notnull: number; dflt_value: string | null }[];
    const col = (name: string) => {
      const c = columns.find(x => x.name === name);
      expect(c, `column ${name} should exist`).toBeDefined();
      return c!;
    };

    expect(col('id').type.toUpperCase()).toBe('TEXT');
    // project_id is nullable ("Global"/no-active-project proposals are valid).
    expect(col('project_id').notnull).toBe(0);
    expect(col('proposal').notnull).toBe(1);
    expect(col('confidence').type.toUpperCase()).toBe('REAL');
    expect(col('confidence').dflt_value).toBe('0.5');
    expect(col('status').dflt_value).toContain('pending');
  });

  it('migrates a legacy system_settings[pending_proposal] blob into dag_proposals', () => {
    const blob = JSON.stringify({ nodes: [{ id: 'legacy-1', prompt: 'legacy step' }] });
    db.prepare("INSERT INTO system_settings (key, value) VALUES ('pending_proposal', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(blob);

    migratePendingProposalBlob();

    // Old key cleared
    const leftover = db.prepare("SELECT value FROM system_settings WHERE key = 'pending_proposal'").get();
    expect(leftover).toBeUndefined();

    // New row present, pending, default confidence, no project scope
    const row = db.prepare("SELECT * FROM dag_proposals WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1").get() as any;
    expect(row).toBeDefined();
    expect(row.confidence).toBe(0.5);
    expect(row.project_id).toBeNull();
    expect(JSON.parse(row.proposal).nodes[0].id).toBe('legacy-1');

    // Idempotent: a second run with no legacy key does not add another row
    const before = (db.prepare('SELECT COUNT(*) c FROM dag_proposals').get() as any).c;
    migratePendingProposalBlob();
    const after = (db.prepare('SELECT COUNT(*) c FROM dag_proposals').get() as any).c;
    expect(after).toBe(before);

    // Cleanup so it doesn't leak into other assertions in this file
    db.prepare("UPDATE dag_proposals SET status = 'rejected' WHERE status = 'pending'").run();
  });

  it('should allow inserting and querying a project', () => {
    const insertProject = db.prepare(`INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)`);
    const projectId = 'test-proj-123';
    insertProject.run(projectId, 'Test Project', Date.now());

    const queryProject = db.prepare(`SELECT * FROM projects WHERE id = ?`);
    const project = queryProject.get(projectId) as any;

    expect(project).toBeDefined();
    expect(project.name).toBe('Test Project');
  });

  // ── P2-4: user_version contract (uses the shared :memory: db only —
  // never opens the real file DB) ──────────────────────────────────────
  it('uses an isolated :memory: database under tests (never the real file DB)', () => {
    expect(dbPath).toBe(':memory:');
    expect(db.name).toBe(':memory:');
  });

  it('stamps user_version to SCHEMA_VERSION at the end of initDB', () => {
    expect(getUserVersion()).toBe(SCHEMA_VERSION);
  });

  it('is idempotent: a second initDB keeps version stamped and schema intact', () => {
    initDB();
    expect(getUserVersion()).toBe(SCHEMA_VERSION);
    const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map(t => t.name);
    expect(tables).toContain('projects');
    expect(tables).toContain('workflow_runs');
    expect(tables).toContain('tasks');
  });

  it('migrates a legacy unstamped DB (v0 + tables present) to the current version', () => {
    // Simulate a pre-P2-4 database: version never stamped, tables present.
    setUserVersion(0);
    expect(getUserVersion()).toBe(0);
    initDB();
    expect(getUserVersion()).toBe(SCHEMA_VERSION);
    // migrate_v0_v1 (18 unique column-adds; the 19th historical ALTER was a
    // project_root_path duplicate) still applied exactly once (idempotent).
    const taskCols = (db.prepare(`PRAGMA table_info(tasks)`).all() as { name: string }[]).map(c => c.name);
    expect(taskCols).toContain('node_type');
    expect(taskCols).toContain('started_at');
    const runCols = (db.prepare(`PRAGMA table_info(workflow_runs)`).all() as { name: string }[]).map(c => c.name);
    expect(runCols).toContain('completed_at');
    expect(runCols).toContain('track');
  });

  // ── P3-S5: CREATE = v-latest-only ─────────────────────────────────────
  // Fresh tables (built by the CREATE bodies alone) must already carry all
  // 10 formerly-ALTER-only columns with their exact types/defaults — a
  // fresh DB and a migrated legacy DB converge to the same shape.
  it('creates v-latest tables carrying the 10 formerly-ALTER-only columns', () => {
    const cols = (table: string) =>
      db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; type: string; notnull: number; dflt_value: string | null }[];
    const col = (table: string, name: string) => {
      const c = cols(table).find(x => x.name === name);
      expect(c, `column ${table}.${name} should exist`).toBeDefined();
      return c!;
    };

    // os_todos.confidence
    expect(col('os_todos', 'confidence').type.toUpperCase()).toBe('REAL');
    expect(col('os_todos', 'confidence').dflt_value).toBe('0.5');
    // projects trio
    for (const name of ['archived_at', 'gitnexus_repo_name', 'permission_archetype']) {
      const c = col('projects', name);
      expect(c.type.toUpperCase()).toBe(name === 'archived_at' ? 'INTEGER' : 'TEXT');
      expect(c.notnull).toBe(0);
    }
    // workflow_runs.completed_at
    expect(col('workflow_runs', 'completed_at').type.toUpperCase()).toBe('INTEGER');
    // llm_providers paid-tier pair
    for (const name of ['require_paid_tier', 'is_paid_tier']) {
      const c = col('llm_providers', name);
      expect(c.type.toUpperCase()).toBe('INTEGER');
      expect(c.notnull).toBe(1);
      expect(c.dflt_value).toBe('0');
    }
    // approvals conflict pair
    for (const name of ['conflict_with_id', 'conflict_reasoning']) {
      expect(col('cerebro_learning_approvals', name).type.toUpperCase()).toBe('TEXT');
    }
    // tasks.node_type
    expect(col('tasks', 'node_type').type.toUpperCase()).toBe('TEXT');
  });

  // ── P3-S5: legacy-DB repair ───────────────────────────────────────────
  // Simulate a v0-era database (columns missing, version unstamped) and prove
  // initDB → migrate_v0_v1 repairs it to the v-latest shape and restamps.
  it('repairs a legacy DB missing v1 columns back to the v-latest shape', () => {
    const taskCols = () =>
      (db.prepare(`PRAGMA table_info(tasks)`).all() as { name: string }[]).map(c => c.name);
    const runCols = () =>
      (db.prepare(`PRAGMA table_info(workflow_runs)`).all() as { name: string }[]).map(c => c.name);
    expect(taskCols()).toContain('node_type');
    expect(runCols()).toContain('completed_at');

    // Carve the v0-era shape back out (drop triggers that name the column
    // first — initDB recreates them below; DROP COLUMN is supported here).
    db.exec('DROP TRIGGER IF EXISTS sync_workflow_runs_insert;');
    db.exec('DROP TRIGGER IF EXISTS sync_workflow_runs_update;');
    db.exec('ALTER TABLE tasks DROP COLUMN node_type;');
    db.exec('ALTER TABLE workflow_runs DROP COLUMN completed_at;');
    expect(taskCols()).not.toContain('node_type');
    expect(runCols()).not.toContain('completed_at');

    // Unstamp → legacy, then boot-migrate.
    setUserVersion(0);
    expect(getUserVersion()).toBe(0);
    initDB();

    expect(getUserVersion()).toBe(SCHEMA_VERSION);
    expect(taskCols()).toContain('node_type');
    expect(runCols()).toContain('completed_at');
    // Sync triggers that name completed_at are recreated and functional.
    const triggers = (db.prepare(
      `SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'sync_workflow_runs_%'`
    ).all() as { name: string }[]).map(t => t.name);
    expect(triggers).toContain('sync_workflow_runs_insert');
    expect(triggers).toContain('sync_workflow_runs_update');
  });
});
