/**
 * §2.1-C4 — sync consent: opt-in flag, manual-peer validation, approved list.
 *
 * BaseVault storage-layer helpers (system_settings reads/writes) plus pure
 * validation — no outbound connection decisions happen here (RouteSwitch/
 * PortGrid boundaries: this module only stores and validates; the caller in
 * server-main decides whether to connect, and only after PortGrid consent).
 *
 * Security contract (§0-V1-5 exfiltration chain):
 *  - `sync_enabled` absent  => sync OFF (default false, opt-in only),
 *  - manual pairing target must pass `net.isIP` + integer port 1..65535,
 *  - default-deny any target that is not RFC1918/link-local unless
 *    `sync_allow_public` is true (public IP = the delta-exfil destination),
 *  - approved peer list capped at 32 entries (≈1.6 KB total).
 */
import net from 'node:net';
import type { Database } from 'better-sqlite3';

export interface ApprovedPeer {
  ip: string;
  port: number;
  fingerprint?: string | undefined;
  approvedAt: number;
}

export const MAX_APPROVED_PEERS = 32;

export type PeerValidation = { ok: true } | { ok: false; error: string };

/** RFC1918 + link-local (v4); ULA + link-local (v6) — CIDR-exact, not prefix strings. */
export function isPrivatePeerTarget(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const octets = ip.split('.').map(Number);
    const [a, b] = octets as [number, number, number, number];
    if (a === 10) return true;                                    // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;             // 172.16.0.0/12
    if (a === 192 && b === 168) return true;                      // 192.168.0.0/16
    if (a === 169 && b === 254) return true;                      // 169.254.0.0/16 link-local
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
      return true;                                                // fe80::/10 link-local
    }
    if (/^f[cd]/.test(lower)) return true;                        // fc00::/7 ULA (v6 analogue of RFC1918)
    return false;
  }
  return false;
}

/**
 * Validate an operator-supplied manual-pairing target.
 * NOTE (documented decision): loopback (127.0.0.1 / ::1) is NOT RFC1918 or
 * link-local, so it is default-denied like any other non-private target —
 * plan-literal reading of §2.1-C4; operators can allow it via sync_allow_public.
 */
export function validateManualPeer(ip: unknown, port: unknown, allowPublic: boolean): PeerValidation {
  if (typeof ip !== 'string' || net.isIP(ip) === 0) {
    return { ok: false, error: 'invalid-ip' };
  }
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: 'invalid-port' };
  }
  if (!allowPublic && !isPrivatePeerTarget(ip)) {
    return { ok: false, error: 'target-not-private' };
  }
  return { ok: true };
}

function readJson<T>(db: Database, key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback; // corrupt value fails closed
  }
}

function writeJson(db: Database, key: string, value: unknown) {
  db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
}

/** system_settings.sync_enabled (JSON `true|false`), absent = false. */
export function isSyncEnabled(db: Database): boolean {
  return readJson<boolean | null>(db, 'sync_enabled', null) === true;
}

export function setSyncEnabled(db: Database, on: boolean): void {
  writeJson(db, 'sync_enabled', on === true);
}

/** system_settings.sync_allow_public (JSON `true|false`), absent = false. */
export function isSyncAllowPublic(db: Database): boolean {
  return readJson<boolean | null>(db, 'sync_allow_public', null) === true;
}

function normalizePeers(raw: unknown): ApprovedPeer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is ApprovedPeer => {
      if (p === null || typeof p !== 'object') return false;
      const c = p as Record<string, unknown>;
      return typeof c.ip === 'string' && net.isIP(c.ip) !== 0
        && typeof c.port === 'number' && Number.isInteger(c.port) && c.port >= 1 && c.port <= 65535;
    })
    .slice(0, MAX_APPROVED_PEERS);
}

export function getApprovedPeers(db: Database): ApprovedPeer[] {
  return normalizePeers(readJson<unknown>(db, 'sync_peers', []));
}

export function addApprovedPeer(
  db: Database,
  ip: string,
  port: number,
  fingerprint?: string,
): { ok: true } | { ok: false; error: string } {
  const peers = getApprovedPeers(db);
  if (peers.some((p) => p.ip === ip && p.port === port)) return { ok: true }; // idempotent
  if (peers.length >= MAX_APPROVED_PEERS) return { ok: false, error: 'peer-list-full' };
  peers.push({ ip, port, fingerprint, approvedAt: Date.now() });
  writeJson(db, 'sync_peers', peers);
  return { ok: true };
}

export function removeApprovedPeer(db: Database, ip: string, port: number): boolean {
  const peers = getApprovedPeers(db);
  const next = peers.filter((p) => !(p.ip === ip && p.port === port));
  if (next.length === peers.length) return false;
  writeJson(db, 'sync_peers', next);
  return true;
}

export function isApprovedPeer(db: Database, ip: string, port: number): boolean {
  return getApprovedPeers(db).some((p) => p.ip === ip && p.port === port);
}
