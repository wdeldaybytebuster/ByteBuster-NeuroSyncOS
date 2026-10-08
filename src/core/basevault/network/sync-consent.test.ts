import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { db, initDB } from '../db';
import {
  validateManualPeer,
  isPrivatePeerTarget,
  isSyncEnabled,
  setSyncEnabled,
  isSyncAllowPublic,
  getApprovedPeers,
  addApprovedPeer,
  removeApprovedPeer,
  isApprovedPeer,
  updateApprovedPeerFingerprint,
} from './sync-consent';

/**
 * §2.1-C4 — sync consent + manual peer validation (V1).
 *
 * Verified truth: sync is opt-in (absent sync_enabled == false), manual
 * pairing default-denies anything that is not RFC1918/link-local unless
 * sync_allow_public is true, and the approved list is capped at 32 entries.
 */

beforeAll(() => { initDB(); });

beforeEach(() => {
  db.prepare(`DELETE FROM system_settings WHERE key IN ('sync_enabled','sync_peers','sync_allow_public')`).run();
});

describe('sync-consent — validateManualPeer (the §0-V1-5 exfil chain)', () => {
  it('accepts an RFC1918 target on a valid port (no allowlist = no port restriction)', () => {
    expect(validateManualPeer('192.168.1.20', 3743, false)).toEqual({ ok: true });
    expect(validateManualPeer('10.0.0.5', 1, false)).toEqual({ ok: true });
    expect(validateManualPeer('172.16.9.9', 65535, false)).toEqual({ ok: true });
    expect(validateManualPeer('169.254.10.10', 8080, false)).toEqual({ ok: true }); // link-local
    expect(validateManualPeer('fd00::1', 3743, false)).toEqual({ ok: true }); // v6 ULA
    expect(validateManualPeer('fe80::1', 3743, false)).toEqual({ ok: true }); // v6 link-local
  });

  it('P2-B4 — REJECTS non-allowlisted ports when the route layer passes its set', () => {
    const allowlist = new Set([3743]);
    // allowlisted member passes …
    expect(validateManualPeer('192.168.1.20', 3743, false, allowlist)).toEqual({ ok: true });
    // … everything else is rejected even though the ip/port are otherwise valid
    // (the peer-port trap: an approved peer must not probe arbitrary LAN ports).
    for (const port of [1, 80, 443, 8080, 9999, 65535]) {
      expect(validateManualPeer('192.168.1.20', port, false, allowlist), `port ${port}`).toEqual({
        ok: false,
        error: 'port-not-allowlisted',
      });
    }
    // allowlist check runs AFTER shape validation — malformed ports keep
    // their own error, never the allowlist one.
    expect(validateManualPeer('192.168.1.20', 0, false, allowlist)).toEqual({ ok: false, error: 'invalid-port' });
    expect(validateManualPeer('not-an-ip', 9999, false, allowlist)).toEqual({ ok: false, error: 'invalid-ip' });
  });

  it('REJECTS the exfiltration target: a public IP unless sync_allow_public', () => {
    expect(validateManualPeer('8.8.8.8', 3743, false)).toEqual({ ok: false, error: 'target-not-private' });
    expect(validateManualPeer('2001:db8::1', 3743, false)).toEqual({ ok: false, error: 'target-not-private' });
    expect(validateManualPeer('127.0.0.1', 3743, false)).toEqual({ ok: false, error: 'target-not-private' });
    // …and with the operator flag flipped it passes.
    expect(validateManualPeer('8.8.8.8', 3743, true)).toEqual({ ok: true });
  });

  it('REJECTS malformed IPs — including injection-shaped ones', () => {
    for (const ip of [
      'not-an-ip',
      '10.0.0.1; DROP TABLE tasks;--',
      '10.0.0.1 SELECT * FROM system_settings',
      '999.999.999.999',
      '',
      { toString: () => '10.0.0.1' }, // must not coerce
    ]) {
      expect(validateManualPeer(ip as any, 3743, false), `ip ${String(ip)}`).toEqual({
        ok: false,
        error: 'invalid-ip',
      });
    }
  });

  it('REJECTS bad ports (not an integer in 1..65535) — with or without an allowlist', () => {
    for (const port of [0, 65536, -1, 1.5, '3743', null, undefined, NaN]) {
      expect(validateManualPeer('10.0.0.1', port as any, false), `port ${String(port)}`).toEqual({
        ok: false,
        error: 'invalid-port',
      });
      expect(validateManualPeer('10.0.0.1', port as any, false, new Set([3743])), `allowlisted port ${String(port)}`).toEqual({
        ok: false,
        error: 'invalid-port',
      });
    }
  });

  it('isPrivatePeerTarget classifies by CIDR, not string prefix', () => {
    expect(isPrivatePeerTarget('10.1.2.3')).toBe(true);
    expect(isPrivatePeerTarget('11.0.0.1')).toBe(false); // 10/8 only
    expect(isPrivatePeerTarget('172.31.255.255')).toBe(true);
    expect(isPrivatePeerTarget('172.32.0.1')).toBe(false); // 172.16/12 only
    expect(isPrivatePeerTarget('192.168.0.1')).toBe(true);
    expect(isPrivatePeerTarget('192.169.0.1')).toBe(false);
    expect(isPrivatePeerTarget('169.254.1.1')).toBe(true);
    expect(isPrivatePeerTarget('172.15.0.1')).toBe(false);
    expect(isPrivatePeerTarget('1.2.3.4')).toBe(false);
    expect(isPrivatePeerTarget('garbage')).toBe(false);
  });
});

describe('sync-consent — sync_enabled is opt-in (default false)', () => {
  it('absent key => false, JSON true => true, false => false, garbage => false', () => {
    expect(isSyncEnabled(db)).toBe(false);
    setSyncEnabled(db, true);
    expect(isSyncEnabled(db)).toBe(true);
    setSyncEnabled(db, false);
    expect(isSyncEnabled(db)).toBe(false);
    db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('sync_enabled', 'not-json')`).run();
    expect(isSyncEnabled(db)).toBe(false);
    db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('sync_enabled', '"yes"')`).run();
    expect(isSyncEnabled(db)).toBe(false); // must be literal JSON true
  });

  it('sync_allow_public is opt-in too', () => {
    expect(isSyncAllowPublic(db)).toBe(false);
    db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('sync_allow_public', 'true')`).run();
    expect(isSyncAllowPublic(db)).toBe(true);
  });
});

describe('sync-consent — approved peer list (cap 32, deduped)', () => {
  it('adds, lists, detects membership and removes', () => {
    expect(getApprovedPeers(db)).toEqual([]);
    expect(isApprovedPeer(db, '192.168.1.20', 3743)).toBe(false);

    expect(addApprovedPeer(db, '192.168.1.20', 3743, 'abc123')).toEqual({ ok: true });
    expect(isApprovedPeer(db, '192.168.1.20', 3743)).toBe(true);
    const peers = getApprovedPeers(db);
    expect(peers).toHaveLength(1);
    expect(peers[0]).toMatchObject({ ip: '192.168.1.20', port: 3743, fingerprint: 'abc123' });
    expect(typeof peers[0]!.approvedAt).toBe('number');

    // duplicate ip:port must not create a second entry
    expect(addApprovedPeer(db, '192.168.1.20', 3743)).toEqual({ ok: true });
    expect(getApprovedPeers(db)).toHaveLength(1);

    expect(removeApprovedPeer(db, '192.168.1.20', 3743)).toBe(true);
    expect(getApprovedPeers(db)).toEqual([]);
    expect(removeApprovedPeer(db, '192.168.1.20', 3743)).toBe(false);
  });

  it('hard-caps the list at 32 entries', () => {
    for (let i = 0; i < 32; i++) {
      expect(addApprovedPeer(db, `10.0.0.${i}`, 3743), `peer ${i}`).toEqual({ ok: true });
    }
    expect(getApprovedPeers(db)).toHaveLength(32);
    expect(addApprovedPeer(db, '10.1.0.1', 3743)).toEqual({ ok: false, error: 'peer-list-full' });
    expect(getApprovedPeers(db)).toHaveLength(32);
  });

  it('survives corrupt sync_peers JSON (fail-closed to empty list)', () => {
    db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('sync_peers', '{oops')`).run();
    expect(getApprovedPeers(db)).toEqual([]);
    expect(isApprovedPeer(db, '10.0.0.1', 3743)).toBe(false);
    // and a fresh add recovers the list
    expect(addApprovedPeer(db, '10.0.0.1', 3743)).toEqual({ ok: true });
    expect(getApprovedPeers(db)).toHaveLength(1);
  });

  it('P2-B4 — TOFU-learn: updateApprovedPeerFingerprint persists to the SAME row (no migration)', () => {
    // approve path persist (operator-supplied seed) …
    expect(addApprovedPeer(db, '192.168.1.20', 3743, 'seed-fp')).toEqual({ ok: true });
    // … and manual-path persist (no seed) both land in the fingerprint field.
    expect(addApprovedPeer(db, '192.168.1.21', 3743)).toEqual({ ok: true });
    expect(getApprovedPeers(db).find((p) => p.ip === '192.168.1.21')?.fingerprint).toBeUndefined();

    // first handshake learns it
    expect(updateApprovedPeerFingerprint(db, '192.168.1.21', 3743, 'learned-fp')).toBe(true);
    expect(getApprovedPeers(db).find((p) => p.ip === '192.168.1.21')).toMatchObject({ fingerprint: 'learned-fp' });

    // re-learning the same value is idempotent
    expect(updateApprovedPeerFingerprint(db, '192.168.1.21', 3743, 'learned-fp')).toBe(true);
    expect(getApprovedPeers(db)).toHaveLength(2);

    // rotation overwrites (re-approval is the operator's explicit consent)
    expect(updateApprovedPeerFingerprint(db, '192.168.1.21', 3743, 'rotated-fp')).toBe(true);
    expect(getApprovedPeers(db).find((p) => p.ip === '192.168.1.21')).toMatchObject({ fingerprint: 'rotated-fp' });

    // a peer that is NOT on the consent list learns nothing (canonical gate)
    expect(updateApprovedPeerFingerprint(db, '10.9.9.9', 9999, 'evil-fp')).toBe(false);
    expect(isApprovedPeer(db, '10.9.9.9', 9999)).toBe(false);
  });
});
