import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, initDB, dbPath } from './db';
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
