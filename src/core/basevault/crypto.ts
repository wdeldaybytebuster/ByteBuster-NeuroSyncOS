import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const masterKeyPath = path.join(process.cwd(), '.data', '.master.key');

function getMasterKey(): Buffer {
  if (fs.existsSync(masterKeyPath)) {
    const keyFile = fs.readFileSync(masterKeyPath);
    if (keyFile.length === 32) {
      return keyFile;
    }
  }
  const dataDir = path.join(process.cwd(), '.data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(masterKeyPath, key, { mode: 0o600 });
  // Lock permissions to owner-only (rw-------) even if umask is permissive.
  // Defense-in-depth: the key must never be world-readable.
  fs.chmodSync(masterKeyPath, 0o600);
  return key;
}

const MASTER_KEY = getMasterKey();
const ALGO = 'aes-256-gcm';

export function encrypt(text: string): string {
  if (!text) return text;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, MASTER_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(hexString: string): string {
  if (!hexString || !hexString.includes(':')) return hexString;
  const parts = hexString.split(':');
  if (parts.length !== 3) return hexString;
  const [ivHex, authTagHex, encryptedHex] = parts;
  if (!ivHex || !authTagHex || !encryptedHex) return hexString;
  const decipher = crypto.createDecipheriv(ALGO, MASTER_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ── API-key envelope (§2.2(d): moved here from src/core/basevault/auth.ts) ───
// API keys are NOT hashed — ScopeLogic must retrieve and use them — but they
// ARE encrypted symmetrically at rest under the operator's vault secret.
// Logic preserved verbatim from the deleted AuthManager (only the `static`
// wrapper and class shell are gone; nothing was stripped).

export function encryptApiKey(apiKey: string, vaultSecret: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(vaultSecret, 'neurosync-salt', 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptApiKey(encryptedPayload: string, vaultSecret: string): string {
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted payload format');

  const ivHex = parts[0] as string;
  const authTagHex = parts[1] as string;
  const encryptedHex = parts[2] as string;

  const key = crypto.scryptSync(vaultSecret, 'neurosync-salt', 32);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
