import argon2 from 'argon2';
import crypto from 'crypto';

export class AuthManager {
  /**
   * Hashes a user password using Argon2id for maximum security.
   * @param plainText The plaintext password.
   * @returns The Argon2id hash string.
   */
  public static async hashPassword(plainText: string): Promise<string> {
    return await argon2.hash(plainText, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB (balanced for Chromebooks while retaining security)
      timeCost: 3,         // 3 iterations
      parallelism: 1       // 1 thread to respect 8-core CPU limit
    });
  }

  /**
   * Verifies a plain text password against a stored Argon2id hash.
   */
  public static async verifyPassword(hash: string, plainText: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plainText);
    } catch (err) {
      return false; // Safely fail on invalid hash format
    }
  }

  /**
   * API Keys are NOT hashed so they can be retrieved and used by ScopeLogic,
   * but they ARE encrypted symmetrically at rest using a local vault key.
   */
  public static encryptApiKey(apiKey: string, vaultSecret: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(vaultSecret, 'neurosync-salt', 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  public static decryptApiKey(encryptedPayload: string, vaultSecret: string): string {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) throw new Error("Invalid encrypted payload format");
    
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
}
