/**
 * AES-256-GCM Encryption Utility for TOTP Secrets
 * 
 * Encrypts sensitive TOTP secrets before storing in database.
 * Format: iv:authTag:ciphertext (all hex-encoded)
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Get encryption key from environment variable
 * Throws error if not configured
 */
function getEncryptionKey(): Buffer {
  const key = process.env.TOTP_ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error('TOTP_ENCRYPTION_KEY environment variable not set. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  
  if (key.length !== KEY_LENGTH * 2) {
    throw new Error(`TOTP_ENCRYPTION_KEY must be ${KEY_LENGTH * 2} hex characters (${KEY_LENGTH} bytes)`);
  }
  
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt a TOTP secret for storage
 * 
 * @param secret - Base32 encoded TOTP secret
 * @returns Encrypted string in format: iv:authTag:ciphertext
 */
export function encryptTotpSecret(secret: string): string {
  if (!secret) {
    throw new Error('Cannot encrypt empty secret');
  }
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encrypted (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a TOTP secret from storage
 * 
 * @param encryptedData - Encrypted string in format: iv:authTag:ciphertext
 * @returns Decrypted Base32 TOTP secret
 */
export function decryptTotpSecret(encryptedData: string): string {
  if (!encryptedData) {
    throw new Error('Cannot decrypt empty data');
  }
  
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format. Expected iv:authTag:ciphertext');
  }
  
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getEncryptionKey();
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Generate a secure encryption key (for initial setup)
 * This should be run once and stored in environment variables
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Verify encryption key is valid
 */
export function verifyEncryptionKey(): boolean {
  try {
    const testSecret = 'JBSWY3DPEHPK3PXP'; // Test Base32 string
    const encrypted = encryptTotpSecret(testSecret);
    const decrypted = decryptTotpSecret(encrypted);
    return decrypted === testSecret;
  } catch (error) {
    return false;
  }
}
