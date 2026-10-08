import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { db, initDB } from '../db';
import { NodeTransport } from './transport';
import { loadSyncSecret, syncMac } from './sync-handshake';
import { addApprovedPeer, getApprovedPeers } from './sync-consent';
import { scoutEmitter } from '../../scoutdaemon/sse';

// §2.1-C3 + P2-B4: same temp-secret discipline as transport-sync-safety —
// tests never touch (and never depend on) .data/.sync.secret.
process.env.NEUROSYNC_SYNC_SECRET_PATH ??= '/tmp/opencode/neurosync/test-sync.secret';

/**
 * P2-B4 — TOFU fingerprint compare on the handshake (transport.ts
 * handleAuthFrame). Drives the INITIATOR side: beginHandshake issues the
 * challenge, then a crafted SYNC_AUTH answers it.
 *
 * Verified truth:
 *  - no stored fp + presented fp → LEARNS it (persisted, no migration);
 *  - stored fp == presented fp → authenticates as before;
 *  - stored fp != presented fp → refused (4401, never authenticated) + a
 *    PEER_FINGERPRINT_MISMATCH PortGrid event;
 *  - absent fp (old peers) → authenticates as before (backward compatible);
 *  - peer not on the consent list → handshake proceeds (route layer owns
 *    consent; isApprovedPeer is the one canonical gate).
 */

let transport: NodeTransport;

function fakeWs() {
  return {
    sent: [] as string[],
    closed: [] as Array<{ code: number; reason: string }>,
    readyState: 1,
    send(msg: string) { this.sent.push(msg); },
    close(code?: number, reason?: string) { this.closed.push({ code: code ?? 1005, reason: reason ?? '' }); },
  } as any;
}

/** Issue a challenge to `peerId` and return the challenge + socket. */
function challenge(peerId: string): { ws: any; nonce: string; label: string } {
  const ws = fakeWs();
  (transport as any).beginHandshake(peerId, ws);
  const raw = ws.sent[ws.sent.length - 1];
  expect(raw, 'initiator must send a SYNC_CHALLENGE').toBeDefined();
  const parsed = JSON.parse(raw);
  expect(parsed.type).toBe('SYNC_CHALLENGE');
  return { ws, nonce: parsed.nonce as string, label: parsed.peerId as string };
}

function answer(ws: any, peerId: string, nonce: string, label: string, fp?: string): void {
  const mac = syncMac(loadSyncSecret(), nonce, label);
  transport.handleIncomingMessage(
    JSON.stringify({
      type: 'SYNC_AUTH',
      nonce,
      peerId: label,
      mac,
      ...(fp !== undefined ? { fp } : {}),
    }),
    peerId,
    ws,
  );
}

function isAuthed(peerId: string): boolean {
  return (transport as any).authenticatedPeers.has(peerId);
}

beforeAll(() => { initDB(); });

beforeEach(() => {
  transport = new NodeTransport();
  (transport as any).pollInterval && clearInterval((transport as any).pollInterval);
  (transport as any).pollInterval = null;
  db.prepare(`DELETE FROM system_settings WHERE key IN ('sync_peers')`).run();
});

afterAll(() => {
  try { transport.dispose(); } catch { /* already disposed per-test */ }
  db.close();
});

describe('TOFU fingerprint — learn / match / mismatch / absent / unapproved', () => {
  it('learns the presented fingerprint on first handshake (approved peer, no stored fp)', () => {
    const peerId = '10.20.30.40:3743';
    expect(addApprovedPeer(db, '10.20.30.40', 3743)).toEqual({ ok: true });
    const { ws, nonce, label } = challenge(peerId);
    answer(ws, peerId, nonce, label, 'first-seen-fp');
    expect(isAuthed(peerId)).toBe(true);
    expect(getApprovedPeers(db).find((p) => p.ip === '10.20.30.40')).toMatchObject({ fingerprint: 'first-seen-fp' });
  });

  it('authenticates when the presented fingerprint matches the stored one', () => {
    expect(addApprovedPeer(db, '10.20.30.41', 3743, 'known-fp')).toEqual({ ok: true });
    const peerId = '10.20.30.41:3743';
    const { ws, nonce, label } = challenge(peerId);
    answer(ws, peerId, nonce, label, 'known-fp');
    expect(isAuthed(peerId)).toBe(true);
    expect(ws.closed).toEqual([]);
  });

  it('REFUSES on mismatch: 4401 fingerprint-mismatch, never authenticated, PortGrid event emitted', () => {
    expect(addApprovedPeer(db, '10.20.30.42', 3743, 'expected-fp')).toEqual({ ok: true });
    const events: any[] = [];
    const onUpdate = (d: any) => { events.push(d); };
    scoutEmitter.on('update', onUpdate);
    try {
      const peerId = '10.20.30.42:3743';
      const { ws, nonce, label } = challenge(peerId);
      answer(ws, peerId, nonce, label, 'rotated-or-imposter-fp');
      expect(isAuthed(peerId)).toBe(false);
      expect(ws.closed).toEqual([{ code: 4401, reason: 'fingerprint-mismatch' }]);
    } finally {
      scoutEmitter.off('update', onUpdate);
    }
    const mismatch = events.find((e) => e?.type === 'PEER_FINGERPRINT_MISMATCH');
    expect(mismatch, 'must emit PEER_FINGERPRINT_MISMATCH').toBeDefined();
    expect(mismatch.node).toMatchObject({ ip: '10.20.30.42', port: 3743, expected: 'expected-fp', presented: 'rotated-or-imposter-fp' });
    // stored fingerprint is NOT overwritten by the refused presentation
    expect(getApprovedPeers(db).find((p) => p.ip === '10.20.30.42')).toMatchObject({ fingerprint: 'expected-fp' });
  });

  it('absent fp (old peers) authenticates exactly as before — no statement, no failure', () => {
    expect(addApprovedPeer(db, '10.20.30.43', 3743, 'known-fp')).toEqual({ ok: true });
    const peerId = '10.20.30.43:3743';
    const { ws, nonce, label } = challenge(peerId);
    answer(ws, peerId, nonce, label); // no fp field at all
    expect(isAuthed(peerId)).toBe(true);
    expect(ws.closed).toEqual([]);
  });

  it('peer NOT on the consent list: handshake proceeds, nothing learned (route layer owns consent)', () => {
    const peerId = '10.20.30.44:3743';
    const { ws, nonce, label } = challenge(peerId);
    answer(ws, peerId, nonce, label, 'stranger-fp');
    expect(isAuthed(peerId)).toBe(true);
    expect(getApprovedPeers(db)).toEqual([]);
  });
});
