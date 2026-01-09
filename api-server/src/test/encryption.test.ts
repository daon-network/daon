/**
 * Tests for TOTP Secret Encryption Utility
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { encryptTotpSecret, decryptTotpSecret, generateEncryptionKey, verifyEncryptionKey } from '../utils/encryption';

describe('TOTP Encryption', () => {
  const originalEnvKey = process.env.TOTP_ENCRYPTION_KEY;
  
  beforeAll(() => {
    // Set up a test encryption key
    process.env.TOTP_ENCRYPTION_KEY = generateEncryptionKey();
  });
  
  afterAll(() => {
    // Restore original env
    if (originalEnvKey) {
      process.env.TOTP_ENCRYPTION_KEY = originalEnvKey;
    } else {
      delete process.env.TOTP_ENCRYPTION_KEY;
    }
  });
  
  it('should generate valid 64-character hex encryption keys', () => {
    const key = generateEncryptionKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key.length).toBe(64);
  });
  
  it('should encrypt and decrypt TOTP secret correctly', () => {
    const secret = 'JBSWY3DPEHPK3PXP'; // Valid Base32 TOTP secret
    const encrypted = encryptTotpSecret(secret);
    const decrypted = decryptTotpSecret(encrypted);
    
    expect(decrypted).toBe(secret);
  });
  
  it('should produce different ciphertext for same plaintext (different IV)', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted1 = encryptTotpSecret(secret);
    const encrypted2 = encryptTotpSecret(secret);
    
    expect(encrypted1).not.toBe(encrypted2); // Different IVs
    expect(decryptTotpSecret(encrypted1)).toBe(secret);
    expect(decryptTotpSecret(encrypted2)).toBe(secret);
  });
  
  it('should produce encrypted data in correct format (iv:authTag:ciphertext)', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptTotpSecret(secret);
    
    const parts = encrypted.split(':');
    expect(parts.length).toBe(3);
    expect(parts[0]).toMatch(/^[0-9a-f]{32}$/); // IV: 16 bytes = 32 hex chars
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/); // Auth tag: 16 bytes = 32 hex chars
    expect(parts[2]).toMatch(/^[0-9a-f]+$/);    // Ciphertext: hex encoded
  });
  
  it('should throw error when encrypting empty secret', () => {
    expect(() => encryptTotpSecret('')).toThrow('Cannot encrypt empty secret');
  });
  
  it('should throw error when decrypting empty data', () => {
    expect(() => decryptTotpSecret('')).toThrow('Cannot decrypt empty data');
  });
  
  it('should throw error when decrypting invalid format', () => {
    expect(() => decryptTotpSecret('invalid')).toThrow('Invalid encrypted data format');
    expect(() => decryptTotpSecret('only:two')).toThrow('Invalid encrypted data format');
  });
  
  it('should throw error when decrypting with wrong key', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptTotpSecret(secret);
    const savedKey = process.env.TOTP_ENCRYPTION_KEY;

    // Change encryption key
    process.env.TOTP_ENCRYPTION_KEY = generateEncryptionKey();

    expect(() => decryptTotpSecret(encrypted)).toThrow();
    process.env.TOTP_ENCRYPTION_KEY = savedKey;
  });
  
  it('should throw error when decrypting tampered ciphertext', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptTotpSecret(secret);
    
    // Tamper with ciphertext
    const parts = encrypted.split(':');
    parts[2] = 'deadbeef'; // Invalid ciphertext
    const tampered = parts.join(':');
    
    expect(() => decryptTotpSecret(tampered)).toThrow();
  });
  
  it('should verify encryption key is working', () => {
    const isValid = verifyEncryptionKey();
    expect(isValid).toBe(true);
  });
  
  it('should fail verification with missing key', () => {
    const savedKey = process.env.TOTP_ENCRYPTION_KEY;
    delete process.env.TOTP_ENCRYPTION_KEY;
    const isValid = verifyEncryptionKey();
    expect(isValid).toBe(false);
    process.env.TOTP_ENCRYPTION_KEY = savedKey;
  });

  it('should throw error when encryption key not set', () => {
    const savedKey = process.env.TOTP_ENCRYPTION_KEY;
    delete process.env.TOTP_ENCRYPTION_KEY;
    expect(() => encryptTotpSecret('test')).toThrow('TOTP_ENCRYPTION_KEY environment variable not set');
    process.env.TOTP_ENCRYPTION_KEY = savedKey;
  });

  it('should throw error when encryption key is wrong length', () => {
    const savedKey = process.env.TOTP_ENCRYPTION_KEY;
    process.env.TOTP_ENCRYPTION_KEY = 'tooshort';
    expect(() => encryptTotpSecret('test')).toThrow('TOTP_ENCRYPTION_KEY must be 64 hex characters');
    process.env.TOTP_ENCRYPTION_KEY = savedKey;
  });
  
  it('should handle long TOTP secrets', () => {
    const longSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    const encrypted = encryptTotpSecret(longSecret);
    const decrypted = decryptTotpSecret(encrypted);
    expect(decrypted).toBe(longSecret);
  });
  
  it('should handle special characters in secrets', () => {
    const specialSecret = 'ABC123-XYZ789+=/';
    const encrypted = encryptTotpSecret(specialSecret);
    const decrypted = decryptTotpSecret(encrypted);
    expect(decrypted).toBe(specialSecret);
  });
});
