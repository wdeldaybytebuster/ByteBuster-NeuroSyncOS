/**
 * §2.2(d) — operator credential: KDF, first-run setup window, bind check.
 *
 * This module ABSORBS src/core/basevault/auth.ts (deleted in the same commit).
 * AGENTS.md is explicit that BaseVault "must NEVER process logic, run
 * workflows, or communicate with the outside world" — authentication is both
 * logic and the inbound network perimeter, which is precisely why the orphaned
 * AuthManager sat unused. It now lives in the server layer, where auth
 * belongs; BaseVault keeps only crypto.ts (symmetric protection of data at
 * rest = "stores and protects data", in-boundary).
 *
 * §2.2(h) — Axiom 6: Argon2id at memoryCost 2^16 allocates 64 MiB of NATIVE
 * memory per verification (--max-old-space-size does not bound it), so every
 * verify runs through a single promise-chain mutex: peak Argon2 RSS is exactly
 * 1 × 64 MiB regardless of concurrent logins. The mutex is instrumented with
 * getVerifyBudget() so argon2-budget.test.ts can prove it (maxPending === 1).
 *
 * Packaging safety: argon2 is lazy-imported; if the native addon fails to load
 * (packaged sidecar) we fall back to crypto.scrypt (N=2^15, r=8, p=1 = 32 MiB,
 * built-in) rather than crashing the login path. The KDF choice sits behind
 * exactly one hashPassword/verifyPassword pair so it stays swappable without
 * touching the middleware.
 */
import crypto from 'node:crypto';
import { db } from '../../core/basevault/db';
import { isLoopbackAddress } from '../perimeter';

export const MIN_PASSWORD_LENGTH = 12;
export const SETUP_WINDOW_MS = 10 * 60_000; // §2.2(a): boot time + 10 min

const CREDENTIAL_KEY = 'operator_credential';
const SETUP_EXPIRES_KEY = 'auth_setup_expires_at';

// ─── KDF (lazy argon2, scrypt fallback) ──────────────────────────────────────

interface Kdf {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}

const SCRYPT_N = 1 << 15; // 2^15 → 32 MiB (§2.2(h) fallback budget)
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 128 * SCRYPT_N * SCRYPT_R * 2; // 64 MiB headroom
const SCRYPT_PREFIX = 'scrypt$';

function scryptHash(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      plain,
      salt,
      32,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM },
      (err, key) => {
        if (err) reject(err);
        else resolve(`${SCRYPT_PREFIX}${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${key.toString('hex')}`);
      }
    );
  });
}

function scryptVerify(hash: string, plain: string): Promise<boolean> {
  return new Promise((resolve) => {
    const parts = hash.split('$');
    // scrypt$N$r$p$saltHex$keyHex
    const n = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const saltHex = parts[4];
    const keyHex = parts[5];
    if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p) || !saltHex || !keyHex) {
      resolve(false);
      return;
    }
    crypto.scrypt(
      plain,
      Buffer.from(saltHex, 'hex'),
      Buffer.from(keyHex, 'hex').length,
      { N: n, r, p, maxmem: SCRYPT_MAXMEM },
      (err, key) => {
        if (err) {
          resolve(false);
          return;
        }
        const expected = Buffer.from(keyHex, 'hex');
        resolve(expected.length === key.length && crypto.timingSafeEqual(expected, key));
      }
    );
  });
}

let kdfPromise: Promise<Kdf> | null = null;

async function loadKdf(): Promise<Kdf> {
  if (!kdfPromise) {
    kdfPromise = (async (): Promise<Kdf> => {
      try {
        const mod = (await import('argon2')) as any;
        const argon2 = mod.default ?? mod;
        return {
          hash: (plain: string) =>
            argon2.hash(plain, {
              type: argon2.argon2id,
              memoryCost: 2 ** 16, // 64 MB (balanced for Chromebooks while retaining security)
              timeCost: 3, // 3 iterations
              parallelism: 1, // 1 thread to respect 8-core CPU limit
            }),
          verify: async (hash: string, plain: string) => {
            try {
              return await argon2.verify(hash, plain);
            } catch {
              return false; // Safely fail on invalid hash format
            }
          },
        };
      } catch (err) {
        console.warn('[Auth] argon2 addon unavailable — falling back to scrypt (32 MiB):', (err as Error)?.message);
        return {
          hash: scryptHash,
          verify: (hash, plain) => (hash.startsWith(SCRYPT_PREFIX) ? scryptVerify(hash, plain) : Promise.resolve(false)),
        };
      }
    })();
  }
  return kdfPromise;
}

/** Hashes a user password (Argon2id, scrypt fallback) for operator login. */
export async function hashPassword(plainText: string): Promise<string> {
  const kdf = await loadKdf();
  return kdf.hash(plainText);
}

/** Verifies a plain text password against a stored hash (KDF chosen by prefix). */
export async function verifyPassword(hash: string, plainText: string): Promise<boolean> {
  if (!hash) return false;
  if (hash.startsWith(SCRYPT_PREFIX)) return scryptVerify(hash, plainText);
  const kdf = await loadKdf();
  return kdf.verify(hash, plainText);
}

// ─── Serialized verification (the Axiom-6 memory guard) ──────────────────────

let chain: Promise<void> = Promise.resolve();
let pending = 0;
let maxPending = 0;

/** Test seam for argon2-budget.test.ts — proves the mutex is actually serial. */
export function getVerifyBudget(): { pending: number; maxPending: number } {
  return { pending, maxPending };
}

/**
 * §2.2(h): every operator verification is chained behind the previous one, so
 * at most one 64 MiB Argon2 (or 32 MiB scrypt) verification is in flight at a
 * time. Failures resolve `false` instead of rejecting (a KDF error must never
 * 500 the login route).
 */
export function verifyOperator(plainText: string): Promise<boolean> {
  const hash = getCredential();
  if (!hash) return Promise.resolve(false);
  const run = chain
    .then(async () => {
      pending++;
      if (pending > maxPending) maxPending = pending;
      try {
        return await verifyPassword(hash, plainText);
      } finally {
        pending--;
      }
    })
    .then(
      (r) => r,
      () => false
    );
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

// ─── Credential storage (system_settings — no migration, §2.2(a)) ───────────

let credentialCache: string | null | undefined; // undefined = not read yet

function getCredential(): string | null {
  if (credentialCache === undefined) {
    try {
      const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(CREDENTIAL_KEY) as
        | { value: string }
        | undefined;
      credentialCache = row?.value ? row.value : null;
    } catch {
      credentialCache = null; // table missing / closed DB → not configured
    }
  }
  return credentialCache;
}

/** Drop the cached presence check (tests write the row directly). */
export function invalidateCredentialCache(): void {
  credentialCache = undefined;
}

/** Auth state derives from exactly ONE thing: operator_credential exists. */
export function isSetupComplete(): boolean {
  return getCredential() !== null;
}

export type SetupResult = { ok: true } | { ok: false; error: 'weak-password' | 'already-configured' };

/**
 * Writes the Argon2id hash and closes the setup window (§2.2(a): the route
 * returns 404 forever afterwards). Two keys, one transaction, one eMMC write.
 */
export async function completeSetup(password: string): Promise<SetupResult> {
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: 'weak-password' };
  if (isSetupComplete()) return { ok: false, error: 'already-configured' };
  const hash = await hashPassword(password);
  const write = db.transaction(() => {
    db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run(CREDENTIAL_KEY, hash);
    db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run(SETUP_EXPIRES_KEY, '0');
  });
  write();
  credentialCache = hash;
  closeSetupWindow();
  return { ok: true };
}

// ─── First-run setup window + bind condition (§2.2(a)) ──────────────────────

// Kept in RAM on purpose: the plan's cost table budgets exactly ONE eMMC write
// for setup, and a boot-time DB write would fire on every restart. The window
// therefore opens at boot (server-main calls openSetupWindow()) and expires
// SETUP_WINDOW_MS later; NEUROSYNC_AUTH_SETUP=1 keeps it open indefinitely for
// automation/e2e. completeSetup() persists auth_setup_expires_at = 0 so the
// DB still records that the window is closed.
let setupExpiresAt = 0;
let setupIndefinite = false;

export function openSetupWindow(opts: { now?: number; indefinite?: boolean } = {}): void {
  const now = opts.now ?? Date.now();
  setupExpiresAt = now + SETUP_WINDOW_MS;
  setupIndefinite = opts.indefinite === true || process.env.NEUROSYNC_AUTH_SETUP === '1';
}

export function closeSetupWindow(): void {
  setupExpiresAt = 0;
  setupIndefinite = false;
}

export function isSetupWindowOpen(now: number = Date.now()): boolean {
  return setupIndefinite || now < setupExpiresAt;
}

/**
 * The address server-main binds to, mirrored here so the setup route can
 * enforce §2.2(a) condition 4 ("bind_address is loopback") without importing
 * server-main (which binds a port — forbidden by §4.2).
 */
let bindAddress = '127.0.0.1';

export function setBindAddress(addr: string): void {
  bindAddress = addr;
}

export function getBindAddress(): string {
  return bindAddress;
}

/** §2.2(a) condition 4 — setup is only possible on a loopback-bound server. */
export function isBindLoopback(): boolean {
  return isLoopbackAddress(bindAddress);
}

/** Reset every piece of module state (tests). */
export function __resetAuthForTests(): void {
  credentialCache = undefined;
  setupExpiresAt = 0;
  setupIndefinite = false;
  bindAddress = '127.0.0.1';
  chain = Promise.resolve();
  pending = 0;
  maxPending = 0;
}
