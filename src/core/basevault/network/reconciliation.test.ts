import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { generateDeltaPayload, reconcileDeltaPayload } from '../sync';
import type { MonotonicEventLog } from '../sync';

describe('CRDT Reconciliation Logic', () => {
  let db1: Database.Database;
  let db2: Database.Database;

  beforeEach(() => {
    db1 = new Database(':memory:');
    db2 = new Database(':memory:');

    const schema = `
      CREATE TABLE sync_event_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        action TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE os_todos (
        id TEXT PRIMARY KEY,
        status TEXT,
        severity TEXT
      );
      CREATE TABLE memory_quarantine (
        id TEXT PRIMARY KEY,
        content TEXT,
        taint_flag INTEGER
      );
      CREATE TABLE sync_lock (is_syncing INTEGER);
      INSERT INTO sync_lock (rowid, is_syncing) VALUES (1, 0);
    `;

    db1.exec(schema);
    db2.exec(schema);
  });

  afterEach(() => {
    db1.close();
    db2.close();
  });

  it('should successfully merge conflicting rows without dropping actions', () => {
    // 1. Simulate db1 inserting a todo
    db1.exec(`
      INSERT INTO os_todos (id, status, severity) VALUES ('todo-1', 'open', 'HIGH');
      INSERT INTO sync_event_log (table_name, action, timestamp, payload) 
      VALUES ('os_todos', 'INSERT', 1000, '{"id":"todo-1","status":"open","severity":"HIGH"}');
    `);

    // 2. Simulate db2 inserting a different todo and memory quarantine offline
    db2.exec(`
      INSERT INTO os_todos (id, status, severity) VALUES ('todo-2', 'open', 'LOW');
      INSERT INTO sync_event_log (table_name, action, timestamp, payload) 
      VALUES ('os_todos', 'INSERT', 1005, '{"id":"todo-2","status":"open","severity":"LOW"}');

      INSERT INTO memory_quarantine (id, content, taint_flag) VALUES ('mem-1', 'test content', 1);
      INSERT INTO sync_event_log (table_name, action, timestamp, payload) 
      VALUES ('memory_quarantine', 'INSERT', 1010, '{"id":"mem-1","content":"test content","taint_flag":1}');
    `);

    // 3. Sync db2 payload to db1
    const payload = generateDeltaPayload(db2, 0);
    expect(payload.length).toBe(2);

    // This should fail right now since reconcileDeltaPayload doesn't exist
    reconcileDeltaPayload(db1, payload);

    // 4. Assert db1 has both todos and the quarantine record
    const todos = db1.prepare('SELECT id FROM os_todos ORDER BY id').all();
    expect(todos).toEqual([{ id: 'todo-1' }, { id: 'todo-2' }]);

    const mems = db1.prepare('SELECT id FROM memory_quarantine').all();
    expect(mems).toEqual([{ id: 'mem-1' }]);

    // 5. Assert sync_event_log in db1 has all 3 events
    const logs = db1.prepare('SELECT table_name FROM sync_event_log ORDER BY timestamp ASC').all();
    expect(logs.length).toBe(3);
  });
});
