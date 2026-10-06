import { z } from 'zod';
import { SyncEventLogSchema, SyncEventLog } from '../schema';
import { db } from '../db';
import WebSocket from 'ws';
import type { DiscoveredNode } from './mdns-discovery';

// Validation for incoming sync packets
export const SyncPacketSchema = z.object({
  type: z.enum(['SYNC_OFFER', 'SYNC_ANSWER', 'SYNC_DELTA']),
  lastSyncTimestamp: z.number().int(),
  deltas: z.array(SyncEventLogSchema).optional(),
});
export type SyncPacket = z.infer<typeof SyncPacketSchema>;

export class NodeTransport {
  // Simulates an E2EE connection over WebSocket or WebRTC Data Channels
  private activeConnections: Map<string, WebSocket> = new Map();
  private lastPolledTimestamp: number = Date.now();
  private pollInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.startPolling();
  }

  // Connect to a discovered peer
  connectToPeer(node: DiscoveredNode) {
    const peerId = `${node.ip}:${node.port}`;
    if (this.activeConnections.has(peerId)) return;

    console.log(`[Transport] Initiating connection to peer ${peerId}`);
    const ws = new WebSocket(`ws://${node.ip}:${node.port}/api/sync`);
    
    ws.on('open', () => {
      console.log(`[Transport] Connected to ${peerId}`);
      this.activeConnections.set(peerId, ws);
      
      // Send an initial SYNC_OFFER
      const offer: SyncPacket = {
        type: 'SYNC_OFFER',
        lastSyncTimestamp: this.lastPolledTimestamp
      };
      ws.send(JSON.stringify(offer));
    });

    ws.on('message', (data) => {
      this.handleIncomingMessage(data.toString(), peerId, ws);
    });

    ws.on('close', () => {
      console.log(`[Transport] Connection closed to ${peerId}`);
      this.activeConnections.delete(peerId);
    });

    ws.on('error', (err: any) => {
      console.error(`[Transport] Connection error with ${peerId}:`, err.message);
      this.activeConnections.delete(peerId);
    });
  }

  addIncomingConnection(peerId: string, ws: any) {
    console.log(`[Transport] Registering incoming connection from ${peerId}`);
    this.activeConnections.set(peerId, ws);
  }

  private startPolling() {
    this.pollInterval = setInterval(() => {
      this.pollAndBroadcastDeltas();
    }, 1000);
  }

  private pollAndBroadcastDeltas() {
    if (this.activeConnections.size === 0) return;

    try {
      const stmt = db.prepare(`
        SELECT id, table_name, action, timestamp, payload 
        FROM sync_event_log 
        WHERE timestamp > ? 
        ORDER BY timestamp ASC
      `);
      const deltas = stmt.all(this.lastPolledTimestamp) as SyncEventLog[];

      if (deltas.length > 0) {
        this.lastPolledTimestamp = deltas[deltas.length - 1]!.timestamp;
        const packet: SyncPacket = {
          type: 'SYNC_DELTA',
          lastSyncTimestamp: this.lastPolledTimestamp,
          deltas
        };

        const payload = JSON.stringify(packet);
        for (const [peerId, ws] of this.activeConnections.entries()) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(payload);
          }
        }
      }
    } catch (err) {
      console.error('[Transport] Error polling sync_event_log:', err);
    }
  }

  handleIncomingMessage(data: string, peerId: string, ws: WebSocket) {
    try {
      const parsed = JSON.parse(data);
      const packet = SyncPacketSchema.parse(parsed);

      if (packet.type === 'SYNC_OFFER') {
        this.handleSyncOffer(packet, peerId, ws);
      } else if (packet.type === 'SYNC_DELTA') {
        this.handleSyncDelta(packet);
      }
    } catch (e) {
      console.error(`[Transport] Invalid sync packet from ${peerId}:`, e);
    }
  }

  private handleSyncOffer(offer: SyncPacket, peerId: string, ws: WebSocket) {
    console.log(`[Transport] Received SYNC_OFFER from ${peerId} (lastSync: ${offer.lastSyncTimestamp})`);
    
    // Fetch deltas since peer's lastSyncTimestamp
    const stmt = db.prepare(`
      SELECT id, table_name, action, timestamp, payload 
      FROM sync_event_log 
      WHERE timestamp > ? 
      ORDER BY timestamp ASC
    `);
    const deltas = stmt.all(offer.lastSyncTimestamp) as SyncEventLog[];

    const response: SyncPacket = {
      type: 'SYNC_DELTA',
      lastSyncTimestamp: Date.now(), // Update water mark
      deltas
    };

    // Send response back
    ws.send(JSON.stringify(response));
  }

  private handleSyncDelta(deltaPacket: SyncPacket) {
    if (!deltaPacket.deltas || deltaPacket.deltas.length === 0) return;
    
    console.log(`[Transport] Applying ${deltaPacket.deltas.length} delta events`);
    
    db.transaction(() => {
      // Prevent sync loop reflection
      db.prepare(`UPDATE sync_lock SET is_syncing = 1 WHERE rowid = 1`).run();
      try {
        for (const delta of deltaPacket.deltas!) {
          try {
            const payload = JSON.parse(delta.payload);
          
          if (delta.action === 'INSERT' || delta.action === 'UPDATE') {
            const keys = Object.keys(payload);
            const placeholders = keys.map(() => '?').join(', ');
            const stmt = db.prepare(`INSERT OR REPLACE INTO ${delta.table_name} (${keys.join(', ')}) VALUES (${placeholders})`);
            stmt.run(...Object.values(payload));
          } else if (delta.action === 'DELETE') {
            if (payload.id) {
               db.prepare(`DELETE FROM ${delta.table_name} WHERE id = ?`).run(payload.id);
            }
          }
          console.log(`[Transport] Applied ${delta.action} on ${delta.table_name}`);
        } catch (e) {
          console.error(`[Transport] Failed to apply delta to ${delta.table_name}:`, e);
        }
      }
      } finally {
        db.prepare(`UPDATE sync_lock SET is_syncing = 0 WHERE rowid = 1`).run();
      }
    })();
  }

  private send(peerId: string, message: string) {
    const ws = this.activeConnections.get(peerId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }

  // --- Manual IP Pairing Mechanism ---
  async connectToManualPeer(ip: string, port: number): Promise<void> {
    const peerId = `${ip}:${port}`;
    if (this.activeConnections.has(peerId)) {
      return Promise.resolve();
    }

    console.log(`[Transport] Initiating MANUAL connection to peer ${peerId}`);
    
    return new Promise((resolve, reject) => {
      let resolvedOrRejected = false;
      const ws = new WebSocket(`ws://${ip}:${port}/api/sync`);
      
      const timeoutId = setTimeout(() => {
        if (!resolvedOrRejected) {
          resolvedOrRejected = true;
          ws.terminate();
          reject(new PeerConnectionError(`Connection to ${peerId} timed out after 5000ms`));
        }
      }, 5000);

      ws.on('open', () => {
        if (!resolvedOrRejected) {
          resolvedOrRejected = true;
          clearTimeout(timeoutId);
          console.log(`[Transport] Connected manually to ${peerId}`);
          this.activeConnections.set(peerId, ws);
          
          // Send an initial SYNC_OFFER
          const offer: SyncPacket = {
            type: 'SYNC_OFFER',
            lastSyncTimestamp: this.lastPolledTimestamp
          };
          ws.send(JSON.stringify(offer));
          resolve();
        }
      });

      ws.on('error', (err: any) => {
        if (!resolvedOrRejected) {
          resolvedOrRejected = true;
          clearTimeout(timeoutId);
          console.error(`[Transport] Connection error with manual peer ${peerId}:`, err.message);
          this.activeConnections.delete(peerId);
          reject(new PeerConnectionError(`Connection to ${peerId} failed: ${err.message}`));
        }
      });

      ws.on('message', (data) => {
        this.handleIncomingMessage(data.toString(), peerId, ws);
      });

      ws.on('close', () => {
        console.log(`[Transport] Connection closed to ${peerId}`);
        this.activeConnections.delete(peerId);
        if (!resolvedOrRejected) {
          resolvedOrRejected = true;
          clearTimeout(timeoutId);
          reject(new PeerConnectionError(`Connection to ${peerId} closed prematurely`));
        }
      });
    });
  }
}

export class PeerConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PeerConnectionError';
  }
}
