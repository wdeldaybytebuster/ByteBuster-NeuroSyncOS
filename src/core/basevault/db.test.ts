import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, initDB, dbPath, migratePendingProposalBlob } from './db';
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
});
