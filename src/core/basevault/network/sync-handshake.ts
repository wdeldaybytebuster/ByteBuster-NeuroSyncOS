/**
 * §2.1-C3 — sync HMAC secret + challenge–response MAC helpers (V1 peer auth).
 *
 * Pure-ish module: the secret is 32 random bytes created ONCE with
 * `fs.openSync(path, 'wx', 0o600)` (exclusive-create, owner-only) at
 * `.data/.sync.secret`, shared across nodes by the operator. Path override
 * via NEUROSYNC_SYNC_SECRET_PATH so tests never touch the real file.
 *
 * Protocol:
 *   challenger → {type:'SYNC_CHALLENGE', nonce, peerId}
 *   responder  → {type:'SYNC_AUTH', nonce, peerId, mac}
 *     mac = base64url(HMAC-SHA256(secret, `${nonce}|${peerId}`))
 * where `peerId` is the label the CHALLENGER assigned the responder, echoed
 * back so both sides MAC the exact same input. Verified with
 * `crypto.timingSafeEqual` on equal-length buffers.
 *
 * Costs (Axiom 6): one 32 B file read once, ~1 µs HMAC per handshake,
 * 0 new dependencies (node:crypto only), 0 threads.
 */
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { openSync, closeSync, readFileSync, writeSync, chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const SECRET_ENV = 'NEUROSYNC_SYNC_SECRET_PATH';
const SECRET_BYTES = 32;

let cachedSecret: Buffer | null = null;

export function syncSecretPath(): string {
  return process.env[SECRET_ENV] ?? path.join(process.cwd(), '.data', '.sync.secret');
}

/** Load (or atomically create-once) the 32-byte sync secret. */
export function loadSyncSecret(): Buffer {
  if (cachedSecret) return cachedSecret;
  const p = syncSecretPath();
  mkdirSync(path.dirname(p), { recursive: true });
  try {
    // 'wx' = fail if the file exists → exactly one creator, no race window.
    const fd = openSync(p, 'wx', 0o600);
    try {
      writeSync(fd, randomBytes(SECRET_BYTES), 0, SECRET_BYTES, 0);
    } finally {
      closeSync(fd);
    }
  } catch (err: any) {
    if (err?.code !== 'EEXIST') throw err;
  }
  const buf = readFileSync(p);
  if (buf.length !== SECRET_BYTES) {
    throw new Error(`sync secret at ${p} must be ${SECRET_BYTES} bytes, got ${buf.length}`);
  }
  try {
    chmodSync(p, 0o600); // tighten if an older copy was lax
  } catch { /* best-effort on exotic filesystems */ }
  cachedSecret = buf;
  return cachedSecret;
}

/** mac = HMAC-SHA256(secret, `${nonce}|${peerId}`), base64url-encoded. */
export function syncMac(secret: Buffer, nonce: string, peerId: string): string {
  return createHmac('sha256', secret).update(`${nonce}|${peerId}`).digest('base64url');
}

/** Constant-time comparison of two MAC strings (length must match). */
export function macsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length === 0 || ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** sha256(secret).slice(0,16) — shown in PortGrid for pairing verification. */
export function syncFingerprint(secret: Buffer): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 16);
}
