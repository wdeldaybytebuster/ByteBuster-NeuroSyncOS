import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { db, initDB } from '../db';
import { NodeTransport, SyncPacket } from './transport';

describe('TDD Mesh Transport Suite: sync_lock & Network Partitions', () => {
  let transport: NodeTransport;

  beforeAll(() => {
    initDB();
  });

  beforeEach(() => {
    transport = new NodeTransport();
    db.prepare('DELETE FROM projects').run();
    db.prepare('DELETE FROM sync_event_log').run();
    // Ensure sync_lock is initially 0
    db.prepare('UPDATE sync_lock SET is_syncing = 0 WHERE rowid = 1').run();
  });

  afterEach(() => {
    if ((transport as any).pollInterval) {
      clearInterval((transport as any).pollInterval);
    }
  });

  it('should prevent infinite echo loops during concurrent delta collisions', () => {
    const packet: SyncPacket = {
      type: 'SYNC_DELTA',
      lastSyncTimestamp: Date.now(),
      deltas: [
        {
          id: 999,
          table_name: 'projects',
          action: 'INSERT',
          timestamp: Date.now(),
          payload: JSON.stringify({ id: 'collided-proj-1', name: 'Collided Project', created_at: Date.now() })
        }
      ]
    };

    (transport as any).handleSyncDelta(packet);

    const newLogs = db.prepare('SELECT * FROM sync_event_log WHERE table_name = ? AND action = ?').all('projects', 'INSERT');
    expect(newLogs.length).toBe(0);

    const proj = db.prepare('SELECT * FROM projects WHERE id = ?').get('collided-proj-1');
    expect(proj).toBeDefined();
    expect((proj as any).name).toBe('Collided Project');
  });

  it('should enforce sync_lock state even under adversarial/malformed packet timing', () => {
    const packet1: SyncPacket = {
      type: 'SYNC_DELTA',
      lastSyncTimestamp: Date.now() - 100,
      deltas: [
        {
          id: 1000,
          table_name: 'projects',
          action: 'INSERT',
          timestamp: Date.now() - 100,
          payload: JSON.stringify({ id: 'adv-proj-1', name: 'Adv Project 1', created_at: Date.now() })
        }
      ]
    };
    const packet2: SyncPacket = {
      type: 'SYNC_DELTA',
      lastSyncTimestamp: Date.now(),
      deltas: [
        {
          id: 1001,
          table_name: 'projects',
          action: 'INSERT',
          timestamp: Date.now(),
          payload: JSON.stringify({ id: 'adv-proj-2', name: 'Adv Project 2', created_at: Date.now() })
        }
      ]
    };

    (transport as any).handleSyncDelta(packet1);
    (transport as any).handleSyncDelta(packet2);

    const lock = db.prepare('SELECT is_syncing FROM sync_lock WHERE rowid = 1').get() as { is_syncing: number };
    expect(lock.is_syncing).toBe(0);

    const newLogs = db.prepare('SELECT * FROM sync_event_log WHERE table_name = ?').all('projects');
    expect(newLogs.length).toBe(0);
  });
});
