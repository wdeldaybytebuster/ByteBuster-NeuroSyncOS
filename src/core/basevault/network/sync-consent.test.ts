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
  it('accepts an RFC1918 target on a valid port', () => {
    expect(validateManualPeer('192.168.1.20', 3743, false)).toEqual({ ok: true });
    expect(validateManualPeer('10.0.0.5', 1, false)).toEqual({ ok: true });
    expect(validateManualPeer('172.16.9.9', 65535, false)).toEqual({ ok: true });
    expect(validateManualPeer('169.254.10.10', 8080, false)).toEqual({ ok: true }); // link-local
    expect(validateManualPeer('fd00::1', 3743, false)).toEqual({ ok: true }); // v6 ULA
    expect(validateManualPeer('fe80::1', 3743, false)).toEqual({ ok: true }); // v6 link-local
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

  it('REJECTS bad ports (not an integer in 1..65535)', () => {
    for (const port of [0, 65536, -1, 1.5, '3743', null, undefined, NaN]) {
      expect(validateManualPeer('10.0.0.1', port as any, false), `port ${String(port)}`).toEqual({
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
});
