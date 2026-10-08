import { z } from 'zod';
import { SyncEventLogSchema, SyncEventLog } from '../schema';
import { db } from '../db';
import { parseDelta } from './sync-policy';
import { loadSyncSecret, syncMac, macsEqual, syncFingerprint } from './sync-handshake';
import {
  getApprovedPeers,
  isApprovedPeer,
  updateApprovedPeerFingerprint,
} from './sync-consent';
import { scoutEmitter } from '../../scoutdaemon/sse';
import { randomBytes } from 'node:crypto';
import type { Statement } from 'better-sqlite3';
import WebSocket from 'ws';
import type { DiscoveredNode } from './mdns-discovery';

// Validation for incoming sync packets
export const SyncPacketSchema = z.object({
  type: z.enum(['SYNC_OFFER', 'SYNC_ANSWER', 'SYNC_DELTA']),
  lastSyncTimestamp: z.number().int(),
  deltas: z.array(SyncEventLogSchema).optional(),
});
export type SyncPacket = z.infer<typeof SyncPacketSchema>;

/** §2.1-C3 — state for one in-flight challenge we issued to a peer. */
interface PendingChallenge {
  nonce: string;
  /** The label WE assigned the responder; also sent in the challenge. */
  label: string;
  timer: NodeJS.Timeout;
  /** Client-side only: fires to send SYNC_OFFER once the peer is proven. */
  onAuthenticated?: (() => void) | undefined;
}

export class NodeTransport {
  // E2EE-style connection over WebSocket (see sync-handshake.ts for the
  // §2.1-C3 challenge–response that actually authenticates the peer).
  private activeConnections: Map<string, WebSocket> = new Map();
  private lastPolledTimestamp: number = Date.now();
  private pollInterval: NodeJS.Timeout | null = null;

  /** §2.1-C3: peers that completed the HMAC handshake. Frames from anyone
   *  else are dropped before schema parsing, let alone SQL. */
  private authenticatedPeers = new Set<string>();
  private pendingChallenges = new Map<string, PendingChallenge>();
  /** ≤ 64 entries: {fails, until} per peerId, 5-minute window. */
  private handshakeFailures = new Map<string, { fails: number; until: number }>();

  private static readonly HANDSHAKE_TIMEOUT_MS = 5_000;
  private static readonly MAX_HANDSHAKE_FAILS = 3;
  private static readonly HANDSHAKE_LOCKOUT_MS = 5 * 60 * 1000;
  private static readonly MAX_FAILURE_ENTRIES = 64;
  private static readonly MAX_AUTHENTICATED = 128;

  constructor() {
    this.startPolling();
  }

  /**
   * §2.1 — stop the 1s broadcast poll, drop cached statements and any
   * in-flight handshake timers. Callers/tests must call this on shutdown so
   * no interval leaks (Axiom 6: no timers outliving their owner).
   */
  dispose() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    for (const pending of this.pendingChallenges.values()) clearTimeout(pending.timer);
    this.pendingChallenges.clear();
    this.authenticatedPeers.clear();
    this.handshakeFailures.clear();
    this.stmtCache.clear();
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

      // §2.1-C3: challenge FIRST. The SYNC_OFFER is only sent after the peer
      // proves it knows the sync secret (see beginHandshake/onAuthenticated).
      this.beginHandshake(peerId, ws, () => {
        const offer: SyncPacket = {
          type: 'SYNC_OFFER',
          lastSyncTimestamp: this.lastPolledTimestamp
        };
        ws.send(JSON.stringify(offer));
      });
    });

    ws.on('message', (data) => {
      this.handleIncomingMessage(data.toString(), peerId, ws);
    });

    ws.on('close', () => {
      console.log(`[Transport] Connection closed to ${peerId}`);
      this.activeConnections.delete(peerId);
      this.authenticatedPeers.delete(peerId);
      this.clearChallenge(peerId);
    });

    ws.on('error', (err: any) => {
      console.error(`[Transport] Connection error with ${peerId}:`, err.message);
      this.activeConnections.delete(peerId);
      this.authenticatedPeers.delete(peerId);
      this.clearChallenge(peerId);
    });
  }

  addIncomingConnection(peerId: string, ws: any) {
    console.log(`[Transport] Registering incoming connection from ${peerId}`);
    this.activeConnections.set(peerId, ws);
    // §2.1-C3: every inbound socket is challenged on open; nothing else it
    // sends is honoured until it answers with a valid HMAC.
    this.beginHandshake(peerId, ws);
  }

  private startPolling() {
    this.pollInterval = setInterval(() => {
      this.pollAndBroadcastDeltas();
    }, 1000);
  }

  private pollAndBroadcastDeltas() {
    if (this.activeConnections.size === 0) return;

    // §2.1-C3: only peers that completed the handshake receive data. Compute
    // recipients BEFORE advancing the watermark, or deltas would be skipped
    // for the (yet unauthenticated) peers they were read for.
    const recipients = [...this.activeConnections.entries()]
      .filter(([peerId]) => this.authenticatedPeers.has(peerId));
    if (recipients.length === 0) return;

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
        for (const [, ws] of recipients) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(payload);
          }
        }
      }
    } catch (err) {
      console.error('[Transport] Error polling sync_event_log:', err);
    }
  }

  // ─── §2.1-C3: challenge–response handshake ─────────────────────────────────

  /**
   * Issue a SYNC_CHALLENGE to the peer. It must answer within 5 s with
   * `SYNC_AUTH {nonce, peerId, mac}` where
   * `mac = HMAC(secret, nonce + '|' + peerId)` and `peerId` is THIS side's
   * label for the peer (echoed from the challenge so both sides MAC the same
   * input). Verified in constant time; 3 failures per peer per 5 min lock
   * the peerId out; failure closes the socket with 4401.
   */
  private beginHandshake(peerId: string, ws: any, onAuthenticated?: () => void) {
    if (this.isLockedOut(peerId)) {
      console.warn(`[Transport] Handshake refused for locked-out peer ${peerId}`);
      try { ws.close(4401, 'locked-out'); } catch { /* socket already gone */ }
      return;
    }
    this.clearChallenge(peerId);
    const nonce = randomBytes(16).toString('base64url');
    const timer = setTimeout(() => {
      this.recordHandshakeFailure(peerId, 'timeout');
      this.clearChallenge(peerId);
      try { ws.close(4401, 'handshake-timeout'); } catch { /* socket already gone */ }
    }, NodeTransport.HANDSHAKE_TIMEOUT_MS);
    this.pendingChallenges.set(peerId, { nonce, label: peerId, timer, onAuthenticated });
    try {
      ws.send(JSON.stringify({ type: 'SYNC_CHALLENGE', nonce, peerId }));
    } catch (e) {
      console.error(`[Transport] Failed to send challenge to ${peerId}:`, e);
    }
  }

  /** A peer challenged US: answer with a MAC over its nonce + its label.
   *
   * P2-B4 — the answer also presents our node fingerprint
   * (`syncFingerprint`, the pairing-verification code) as `fp` so the
   * challenger can run its TOFU compare. Extra frame field: old peers that
   * do not send `fp` are still honoured (backward compatible — absence is
   * "no statement", never a failure).
   */
  private respondToChallenge(parsed: Record<string, unknown>, peerId: string, ws: any) {
    const nonce = typeof parsed.nonce === 'string' ? parsed.nonce : '';
    const label = typeof parsed.peerId === 'string' ? parsed.peerId : peerId;
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(nonce)) return; // malformed → ignore
    try {
      ws.send(JSON.stringify({
        type: 'SYNC_AUTH',
        nonce,
        peerId: label,
        mac: syncMac(loadSyncSecret(), nonce, label),
        fp: syncFingerprint(loadSyncSecret()),
      }));
    } catch (e) {
      console.error(`[Transport] Failed to answer challenge from ${peerId}:`, e);
    }
  }

  /** Verify the peer's SYNC_AUTH against the challenge WE issued. */
  private handleAuthFrame(parsed: Record<string, unknown>, peerId: string, ws: any) {
    const pending = this.pendingChallenges.get(peerId);
    const nonce = typeof parsed.nonce === 'string' ? parsed.nonce : '';
    const mac = typeof parsed.mac === 'string' ? parsed.mac : '';

    if (!pending || !nonce || !mac || !macsEqual(nonce, pending.nonce)) {
      this.failHandshake(peerId, ws, pending ? 'nonce-mismatch' : 'no-pending-challenge');
      return;
    }
    const expected = syncMac(loadSyncSecret(), pending.nonce, pending.label);
    if (!macsEqual(mac, expected)) {
      this.failHandshake(peerId, ws, 'bad-mac');
      return;
    }

    // P2-B4 — TOFU fingerprint compare (runs only for peers on the consent
    // list, parsed as ip:port — inbound `incoming-<uuid>` sockets never map
    // to an approved peer, so the route-layer consent decision still owns
    // them; see server-main.ts /api/sync routes). First handshake with a
    // presented `fp` LEARNS it (persisted to the existing sync_peers
    // `fingerprint` field, no migration); a later DIFFERENT `fp` refuses
    // the peer and surfaces a PortGrid event. Absent `fp` (old peers) or no
    // stored fingerprint = no statement, handshake proceeds as before.
    // isApprovedPeer is the ONE canonical approval gate — nothing here
    // re-implements list membership.
    const presentedFp = typeof parsed.fp === 'string' && parsed.fp !== '' ? parsed.fp : null;
    if (presentedFp) {
      const host = peerId.split(':')[0] ?? '';
      const port = Number(peerId.split(':')[1]);
      if (host !== '' && Number.isInteger(port) && isApprovedPeer(db, host, port)) {
        const stored = getApprovedPeers(db).find((p) => p.ip === host && p.port === port);
        const knownFp = stored?.fingerprint ?? null;
        if (knownFp && knownFp !== presentedFp) {
          console.warn(`[Transport] Fingerprint MISMATCH for approved peer ${peerId} — refusing`);
          this.clearChallenge(peerId);
          this.authenticatedPeers.delete(peerId);
          try { ws.close(4401, 'fingerprint-mismatch'); } catch { /* socket already gone */ }
          try {
            scoutEmitter.emit('update', {
              type: 'PEER_FINGERPRINT_MISMATCH',
              node: { ip: host, port, expected: knownFp, presented: presentedFp },
              timestamp: Date.now(),
            });
          } catch { /* telemetry must never break the refusal */ }
          return;
        }
        if (!knownFp) {
          updateApprovedPeerFingerprint(db, host, port, presentedFp); // TOFU-learn
        }
      }
    }

    // Valid — retire the challenge. (A re-challenge of an already-authenticated
    // peer simply refreshes the proof; auth state is unchanged.)
    clearTimeout(pending.timer);
    this.pendingChallenges.delete(peerId);
    const alreadyAuthed = this.authenticatedPeers.has(peerId);
    if (!alreadyAuthed) {
      if (this.authenticatedPeers.size >= NodeTransport.MAX_AUTHENTICATED) {
        const oldest = this.authenticatedPeers.values().next().value;
        if (oldest !== undefined) this.authenticatedPeers.delete(oldest); // bounded Set
      }
      this.authenticatedPeers.add(peerId);
      console.log(`[Transport] Peer ${peerId} authenticated`);
    }
    pending.onAuthenticated?.();
  }

  private failHandshake(peerId: string, ws: any, why: string) {
    this.recordHandshakeFailure(peerId, why);
    this.clearChallenge(peerId);
    this.authenticatedPeers.delete(peerId);
    try { ws.close(4401, 'auth-failed'); } catch { /* socket already gone */ }
  }

  /** ≤ 64 entries; window fixed at first failure of the current 5 min. */
  private recordHandshakeFailure(peerId: string, why: string) {
    const now = Date.now();
    let entry = this.handshakeFailures.get(peerId);
    if (!entry || entry.until < now) {
      if (this.handshakeFailures.size >= NodeTransport.MAX_FAILURE_ENTRIES) {
        const oldest = this.handshakeFailures.keys().next().value;
        if (oldest !== undefined) this.handshakeFailures.delete(oldest);
      }
      entry = { fails: 0, until: now + NodeTransport.HANDSHAKE_LOCKOUT_MS };
      this.handshakeFailures.set(peerId, entry);
    }
    entry.fails += 1;
    console.warn(`[Transport] Handshake failure ${entry.fails}/${NodeTransport.MAX_HANDSHAKE_FAILS} for ${peerId} (${why})`);
  }

  /** Exposed for tests: 3 failures inside 5 min → locked until `until`. */
  private isLockedOut(peerId: string): boolean {
    const entry = this.handshakeFailures.get(peerId);
    return !!entry && entry.fails >= NodeTransport.MAX_HANDSHAKE_FAILS && entry.until >= Date.now();
  }

  private clearChallenge(peerId: string) {
    const pending = this.pendingChallenges.get(peerId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingChallenges.delete(peerId);
    }
  }

  handleIncomingMessage(data: string, peerId: string, ws: WebSocket) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (e) {
      console.error(`[Transport] Non-JSON frame from ${peerId}`);
      return;
    }

    // §2.1-C3 enforcement point: handshake frames are handled BEFORE the
    // packet schema, and an unauthenticated peer may only ever complete (or
    // fail) the handshake — its SYNC_DELTA can never reach handleSyncDelta.
    if (parsed !== null && typeof parsed === 'object') {
      const type = (parsed as Record<string, unknown>).type;
      if (type === 'SYNC_CHALLENGE') {
        this.respondToChallenge(parsed as Record<string, unknown>, peerId, ws);
        return;
      }
      if (type === 'SYNC_AUTH') {
        this.handleAuthFrame(parsed as Record<string, unknown>, peerId, ws);
        return;
      }
    }

    if (!this.authenticatedPeers.has(peerId)) {
      const type = (parsed as Record<string, unknown> | null)?.type;
      console.warn(`[Transport] Dropping ${String(type)} frame from unauthenticated peer ${peerId}`);
      return;
    }

    try {
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

  /**
   * §2.1-C1 — prepared-statement cache for the sync writer.
   *
   * Statements are only ever built AFTER `parseDelta` has proven every
   * identifier is a member of the SYNC_TABLES allowlist, and every runtime
   * value is bound as a `?` parameter. The cache is bounded at 32 entries
   * (clear-on-overflow — no LRU bookkeeping); in practice the key-set is one
   * of a handful of fixed trigger payloads, so ~6-10 entries live here.
   */
  private stmtCache = new Map<string, Statement<unknown[]>>();
  private static MAX_CACHED_STMTS = 32;

  private stmt(sql: string) {
    let s = this.stmtCache.get(sql);
    if (!s) {
      if (this.stmtCache.size >= NodeTransport.MAX_CACHED_STMTS) this.stmtCache.clear();
      s = db.prepare(sql);
      this.stmtCache.set(sql, s);
    }
    return s;
  }

  private handleSyncDelta(deltaPacket: SyncPacket) {
    if (!deltaPacket.deltas || deltaPacket.deltas.length === 0) return;

    console.log(`[Transport] Applying ${deltaPacket.deltas.length} delta events`);

    db.transaction(() => {
      // Prevent sync loop reflection
      db.prepare(`UPDATE sync_lock SET is_syncing = 1 WHERE rowid = 1`).run();
      try {
        for (const delta of deltaPacket.deltas!) {
          // §2.1-C1: validate BEFORE any SQL is prepared. table_name, action
          // and every payload key have been proven allowlist members by
          // parseDelta; every value below is a `?` binding. An unvalidated
          // delta never reaches db.prepare — no SQL string is even built.
          const parsed = parseDelta(delta);
          if (!parsed.ok) {
            console.warn(
              `[Transport] Rejected delta on peer input (reason=${parsed.reason}, table=${String((delta as any)?.table_name).slice(0, 64)})`,
            );
            continue;
          }
          const { table, action, setSql, insertSql, id, values } = parsed.delta;
          try {
            // MERGE for all tables: sync trigger payloads may carry only a subset
            // of columns (e.g. sync_tasks_update omits output_data, started_at).
            // A blind INSERT OR REPLACE would wipe those columns or trigger
            // NOT NULL constraint failures (e.g. workflow_runs.dag_layout).
            // Do a read-modify-write so existing columns are preserved.
            const existing = this.stmt(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, any> | undefined;
            if (existing) {
              // UPDATE: merge payload columns onto the existing row
              this.stmt(`UPDATE ${table} SET ${setSql} WHERE id = ?`).run(...values, id);
              console.log(`[Transport] Merged UPDATE on ${table} row ${id}`);
            } else {
              // INSERT: full payload is safe here (no existing row to preserve)
              this.stmt(`INSERT OR REPLACE INTO ${table} ${insertSql}`).run(...values);
              console.log(`[Transport] Inserted ${table} row ${id}`);
            }
            console.log(`[Transport] Applied ${action} on ${table}`);
          } catch (e) {
            console.error(`[Transport] Failed to apply delta to ${table}:`, e);
          }
        }
      } finally {
        db.prepare(`UPDATE sync_lock SET is_syncing = 0 WHERE rowid = 1`).run();
      }
    })();
  }

  private send(peerId: string, message: string) {
    if (!this.authenticatedPeers.has(peerId)) return; // §2.1-C3
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

          // §2.1-C3: challenge FIRST — SYNC_OFFER only after the peer proves
          // it knows the sync secret.
          this.beginHandshake(peerId, ws, () => {
            const offer: SyncPacket = {
              type: 'SYNC_OFFER',
              lastSyncTimestamp: this.lastPolledTimestamp
            };
            ws.send(JSON.stringify(offer));
          });
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
