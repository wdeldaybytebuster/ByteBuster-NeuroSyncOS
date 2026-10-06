import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { generateDeltaPayload, MonotonicEventLog } from './sync';

describe('Delta Syncing', () => {
  it('extracts delta from SQLite sync_event_log and prevents full database transfer', () => {
    const db = new Database(':memory:');
    
    // Setup SQLite schema
    db.exec(`
      CREATE TABLE sync_event_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        action TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        payload TEXT NOT NULL
      )
    `);

    // Insert dummy events
    const stmt = db.prepare('INSERT INTO sync_event_log (table_name, action, timestamp, payload) VALUES (?, ?, ?, ?)');
    stmt.run('os_todos', 'INSERT', 100, '{"foo": "bar"}');
    stmt.run('memory_quarantine', 'INSERT', 150, '{"foo": "baz"}');
    stmt.run('os_todos', 'UPDATE', 200, '{"foo": "qux"}');

    // Simulate peer requesting sync from timestamp 120
    const lastSyncTimestamp = 120;
    
    // Execute delta payload extraction from the actual database
    // (This function will need to be implemented by the Engineer to accept a DB instance)
    const deltaPayload = generateDeltaPayload(db, lastSyncTimestamp);
    
    expect(deltaPayload.length).toBe(2);
    expect(deltaPayload[0]!.id).toBe(2);
    expect(deltaPayload[1]!.id).toBe(3);
  });
});
