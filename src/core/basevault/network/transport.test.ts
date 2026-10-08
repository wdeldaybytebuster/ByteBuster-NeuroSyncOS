import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { db, initDB } from '../db';
import { NodeTransport, SyncPacket } from './transport';

describe('NodeTransport', () => {
  let transport: NodeTransport;

  beforeAll(() => {
    initDB();
  });

  beforeEach(() => {
    transport = new NodeTransport();
    // clear tables to ensure clean state
    db.prepare(`DELETE FROM projects`).run();
    db.prepare(`DELETE FROM sync_event_log`).run();
  });

  afterEach(() => {
    // §2.1: dispose() stops the 1s broadcast poll so intervals don't leak
    // between test files (Axiom 6 — no orphan timers on the edge box).
    transport.dispose();
  });

  it('should apply INSERT deltas and REFUSE DELETE (unsupported-action)', () => {
    const packet: SyncPacket = {
      type: 'SYNC_DELTA',
      lastSyncTimestamp: Date.now(),
      deltas: [
        {
          id: 1,
          table_name: 'projects',
          action: 'INSERT',
          timestamp: Date.now(),
          payload: JSON.stringify({ id: 'test-proj-1', name: 'Test Project 1', created_at: Date.now() })
        }
      ]
    };

    // Use any to bypass private visibility
    (transport as any).handleSyncDelta(packet);

    const proj = db.prepare(`SELECT * FROM projects WHERE id = ?`).get('test-proj-1');
    expect(proj).toBeDefined();
    expect((proj as any).name).toBe('Test Project 1');

    const deletePacket: SyncPacket = {
      type: 'SYNC_DELTA',
      lastSyncTimestamp: Date.now(),
      deltas: [
        {
          id: 2,
          table_name: 'projects',
          action: 'DELETE',
          timestamp: Date.now(),
          payload: JSON.stringify({ id: 'test-proj-1' })
        }
      ]
    };

    // §4.1-4 (intent): no sync trigger in db.ts ever emits DELETE, so the
    // allowlist refuses it — the row MUST survive. This assertion was
    // inverted from the pre-remediation expectation (row deleted) because
    // the old behaviour was the vulnerability: peer-controlled DELETE.
    (transport as any).handleSyncDelta(deletePacket);

    const projDeleted = db.prepare(`SELECT * FROM projects WHERE id = ?`).get('test-proj-1');
    expect(projDeleted).toBeDefined();
    expect((projDeleted as any).name).toBe('Test Project 1');
  });
});
