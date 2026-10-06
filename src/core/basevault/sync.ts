import type { Database } from 'better-sqlite3';

export interface MonotonicEventLog {
  id: number;
  table_name: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  timestamp: number;
  payload: string; // JSON string
}

/**
 * Generates a sync payload containing only the delta (mutations) that occurred 
 * strictly after the given timestamp.
 */
export function generateDeltaPayload(db: Database, lastSyncTimestamp: number): MonotonicEventLog[] {
  const stmt = db.prepare(`
    SELECT id, table_name, action, timestamp, payload 
    FROM sync_event_log 
    WHERE timestamp > ? 
    ORDER BY timestamp ASC
  `);
  return stmt.all(lastSyncTimestamp) as MonotonicEventLog[];
}

/**
 * Reconciles a remote delta payload into the local database using CRDT monotonic rules.
 * Uses a transaction and sets the sync_lock to prevent echoing the sync events back to the log.
 */
export function reconcileDeltaPayload(db: Database, events: MonotonicEventLog[]): void {
  if (events.length === 0) return;

  const runReconciliation = db.transaction(() => {
    // 1. Acquire sync lock so we don't trigger our own triggers
    db.prepare('UPDATE sync_lock SET is_syncing = 1 WHERE rowid = 1').run();

    try {
      for (const event of events) {
        const payload = JSON.parse(event.payload);
        
        if (event.action === 'INSERT') {
          const cols = Object.keys(payload);
          const placeholders = cols.map(() => '?').join(', ');
          const values = Object.values(payload);
          
          try {
            db.prepare(`INSERT INTO ${event.table_name} (${cols.join(', ')}) VALUES (${placeholders})`).run(...values);
          } catch (e: any) {
            if (e.message.includes('UNIQUE constraint failed')) {
              // CRDT fallback: Last-Write-Wins on conflict (or just ignore for INSERT)
              // For a true CRDT we might want an upsert here, but for now we ignore if it exists.
            } else {
              throw e;
            }
          }
        } else if (event.action === 'UPDATE') {
          if (!payload.id) continue;
          const setClause = Object.keys(payload).filter(k => k !== 'id').map(k => `${k} = ?`).join(', ');
          const values = Object.keys(payload).filter(k => k !== 'id').map(k => payload[k]);
          values.push(payload.id);
          
          db.prepare(`UPDATE ${event.table_name} SET ${setClause} WHERE id = ?`).run(...values);
        } else if (event.action === 'DELETE') {
          if (!payload.id) continue;
          db.prepare(`DELETE FROM ${event.table_name} WHERE id = ?`).run(payload.id);
        }

        // Insert into our own event log so subsequent syncs propagate it further
        // (CRDTs require monotonic propagation)
        db.prepare(`
          INSERT INTO sync_event_log (table_name, action, timestamp, payload) 
          VALUES (?, ?, ?, ?)
        `).run(event.table_name, event.action, event.timestamp, event.payload);
      }
    } finally {
      // 2. Release sync lock
      db.prepare('UPDATE sync_lock SET is_syncing = 0 WHERE rowid = 1').run();
    }
  });

  runReconciliation();
}
