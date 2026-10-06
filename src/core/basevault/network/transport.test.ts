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
    // We should probably stop polling if the transport interval isn't cleaned up
    // but the transport class doesn't expose a close method. Let's add it or rely on vitest cleanup.
    // Actually we can just let it be. Wait, setInterval in NodeTransport will leak in tests.
    // I will mock setInterval.
  });

  it('should apply INSERT and DELETE deltas correctly', () => {
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

    (transport as any).handleSyncDelta(deletePacket);

    const projDeleted = db.prepare(`SELECT * FROM projects WHERE id = ?`).get('test-proj-1');
    expect(projDeleted).toBeUndefined();
  });
});
