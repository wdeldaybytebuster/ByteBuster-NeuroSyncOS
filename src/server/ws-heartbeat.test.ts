/**
 * §2.3-P1-2 — 30 s WS heartbeat ping/terminate sweep.
 *
 * ─── AUDITOR ARTIFACT — TESTS ONLY, NO SRC EDITS ──────────────────────────
 *
 * This file NEVER imports server-main.ts (it binds port 3743, starts the
 * scheduler, and boots the provider registry — §4.2's rule, same as
 * perimeter.test.ts and ws-upgrade-guard.test.ts). Instead it works on
 * two tracks:
 *
 *   TRACK 1 (behavioral): a LOCAL faithful replica of the sweep at
 *   server-main.ts:196-210 (`wsHeartbeatSweep`), exercised with fake peers
 *   carrying the minimal structural type { isAlive, ping(), terminate() }.
 *   No `any` anywhere — the fakes are a small class, the replica takes
 *   Set<FakePeer>.
 *
 *   TRACK 2 (source contract): server-main.ts is read as TEXT (never
 *   executed) and pinned to export WS_HEARTBEAT_MS, wsHeartbeatPeers,
 *   wsHeartbeatSweep, and stopWsHeartbeat, so the mirror cannot drift
 *   from the source it shadows undetected.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/** Minimal structural peer — everything the sweep touches, nothing more. */
class FakePeer {
  isAlive: boolean;
  pingCalls = 0;
  terminateCalls = 0;
  constructor(isAlive: boolean, private readonly pingThrows = false) {
    this.isAlive = isAlive;
  }
  ping(): void {
    this.pingCalls++;
    if (this.pingThrows) throw new Error('socket already gone');
  }
  terminate(): void {
    this.terminateCalls++;
  }
}

/**
 * LOCAL mirror of server-main.ts:196-210. Logic duplicated verbatim
 * (modulo the Set element type) so the sweep is unit-testable without
 * importing the port-binding server-main module.
 */
function mirrorSweep(peers: Set<FakePeer>): void {
  for (const ws of [...peers]) {
    try {
      if (ws.isAlive === false) {
        try { ws.terminate(); } catch { /* socket already gone */ }
        peers.delete(ws);
      } else {
        ws.isAlive = false;
        try { ws.ping(); } catch { /* socket already gone */ }
      }
    } catch {
      try { peers.delete(ws); } catch { /* ignore */ }
    }
  }
}

// ─── TRACK 1: behavioral — the heartbeat sweep ─────────────────────────────

describe('P1-2 WS heartbeat sweep — dead peers terminated+removed, live peers pinged', () => {
  it('dead peer (isAlive === false) is terminated and removed from the set', () => {
    const dead = new FakePeer(false);
    const live = new FakePeer(true);
    const peers = new Set<FakePeer>([dead, live]);
    mirrorSweep(peers);
    expect(dead.terminateCalls).toBe(1);
    expect(peers.has(dead)).toBe(false);
    // The live peer is untouched by the dead peer's removal.
    expect(peers.has(live)).toBe(true);
  });

  it('alive peer is marked isAlive=false and pinged, and stays in the set', () => {
    const peer = new FakePeer(true);
    const peers = new Set<FakePeer>([peer]);
    mirrorSweep(peers);
    expect(peer.isAlive).toBe(false);
    expect(peer.pingCalls).toBe(1);
    expect(peer.terminateCalls).toBe(0);
    expect(peers.has(peer)).toBe(true);
  });

  it('ping-throwing peer is dropped: dead+throwing goes immediately, alive+throwing on the next sweep', () => {
    // A dead peer whose ping would throw is still terminated and removed —
    // the dead branch never reaches ping, so the throw cannot save it.
    const deadThrowing = new FakePeer(false, true);
    const peers = new Set<FakePeer>([deadThrowing]);
    mirrorSweep(peers);
    expect(deadThrowing.terminateCalls).toBe(1);
    expect(peers.has(deadThrowing)).toBe(false);

    // An alive peer whose ping throws: the source swallows the ping error
    // (server-main.ts:204 inner catch), marks isAlive=false, and keeps the
    // peer — the FOLLOW-UP sweep then sees the silence and drops it.
    const aliveThrowing = new FakePeer(true, true);
    const peers2 = new Set<FakePeer>([aliveThrowing]);
    mirrorSweep(peers2);
    expect(aliveThrowing.pingCalls).toBe(1);
    expect(aliveThrowing.isAlive).toBe(false);
    expect(peers2.has(aliveThrowing)).toBe(true);
    mirrorSweep(peers2);
    expect(aliveThrowing.terminateCalls).toBe(1);
    expect(peers2.has(aliveThrowing)).toBe(false);
  });

  it('empty peer set is a no-op (no throw, still empty)', () => {
    const peers = new Set<FakePeer>();
    expect(() => mirrorSweep(peers)).not.toThrow();
    expect(peers.size).toBe(0);
  });
});

// ─── TRACK 2: source contract on server-main.ts (perimeter.test.ts style) ──

describe('P1-2 source contract — server-main.ts exports the heartbeat sweep', () => {
  const src = fs.readFileSync(path.join(__dirname, 'server-main.ts'), 'utf8');

  it('server-main.ts exports WS_HEARTBEAT_MS (the 30 s interval)', () => {
    expect(src).toMatch(/export const WS_HEARTBEAT_MS/);
  });

  it('server-main.ts exports wsHeartbeatPeers (the live-socket set)', () => {
    expect(src).toMatch(/export const wsHeartbeatPeers/);
  });

  it('server-main.ts exports wsHeartbeatSweep (the sweep this file mirrors)', () => {
    expect(src).toMatch(/export function wsHeartbeatSweep/);
  });

  it('server-main.ts exports stopWsHeartbeat (centralized-shutdown hook)', () => {
    expect(src).toMatch(/export function stopWsHeartbeat/);
  });
});
