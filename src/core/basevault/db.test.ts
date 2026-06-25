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

  it('should enforce WAL mode', () => {
    const pragmaQuery = db.prepare(`PRAGMA journal_mode`);
    const result = pragmaQuery.get() as { journal_mode: string };
    
    expect(result.journal_mode.toLowerCase()).toBe('wal');
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
