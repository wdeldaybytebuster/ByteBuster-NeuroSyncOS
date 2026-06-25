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
  fs.writeFileSync(masterKeyPath, key);
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
  const decipher = crypto.createDecipheriv(ALGO, MASTER_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
