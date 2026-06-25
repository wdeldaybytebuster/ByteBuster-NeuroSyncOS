import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './crypto';

describe('Crypto BaseVault', () => {
  it('should encrypt and decrypt correctly', () => {
    const plain = 'my-secret-key-123';
    const encrypted = encrypt(plain);
    expect(encrypted).not.toEqual(plain);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toEqual(plain);
  });
  
  it('should handle empty strings', () => {
    expect(encrypt('')).toEqual('');
    expect(decrypt('')).toEqual('');
  });
  
  it('should return original string if decrypting invalid format', () => {
    expect(decrypt('invalid_format')).toEqual('invalid_format');
  });
});
