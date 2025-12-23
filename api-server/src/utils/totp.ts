/**
 * TOTP (Time-Based One-Time Password) Utility
 * 
 * Generates and verifies TOTP codes for 2FA authentication.
 * Uses native Node.js crypto instead of external libraries for security.
 */

import crypto from 'crypto';

const TOTP_WINDOW = parseInt(process.env.TOTP_WINDOW || '1', 10); // Accept codes from ±1 time window
const TOTP_STEP = 30; // 30 second time step
const TOTP_DIGITS = 6; // 6 digit codes
const TOTP_ISSUER = process.env.TOTP_ISSUER || 'DAON';

/**
 * Generate a random Base32 secret for TOTP
 * 
 * @returns Base32 encoded secret (32 characters)
 */
export function generateTotpSecret(): string {
  const buffer = crypto.randomBytes(20); // 160 bits
  return base32Encode(buffer);
}

/**
 * Generate TOTP code for a given secret at current time
 * 
 * @param secret - Base32 encoded secret
 * @param time - Unix timestamp (defaults to now)
 * @returns 6-digit TOTP code
 */
export function generateTotpCode(secret: string, time?: number): string {
  const counter = Math.floor((time || Date.now() / 1000) / TOTP_STEP);
  return generateHOTP(secret, counter);
}

/**
 * Verify a TOTP code against a secret
 * 
 * @param secret - Base32 encoded secret
 * @param code - 6-digit code to verify
 * @param window - Number of time steps to check (defaults to TOTP_WINDOW)
 * @returns true if code is valid
 */
export function verifyTotpCode(secret: string, code: string, window: number = TOTP_WINDOW): boolean {
  const currentTime = Math.floor(Date.now() / 1000);
  const currentCounter = Math.floor(currentTime / TOTP_STEP);
  
  // Check current time window and ±window
  for (let i = -window; i <= window; i++) {
    const testCode = generateHOTP(secret, currentCounter + i);
    if (constantTimeCompare(code, testCode)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Generate otpauth:// URL for QR code
 * 
 * @param secret - Base32 encoded secret
 * @param accountName - User's email or username
 * @returns otpauth:// URL
 */
export function generateTotpUrl(secret: string, accountName: string): string {
  const encodedIssuer = encodeURIComponent(TOTP_ISSUER);
  const encodedAccount = encodeURIComponent(accountName);
  
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP}`;
}

/**
 * Format secret for manual entry (groups of 4 characters)
 * 
 * @param secret - Base32 encoded secret
 * @returns Formatted secret (e.g., "JBSW Y3DP EHPK 3PXP")
 */
export function formatTotpSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(' ') || secret;
}

/**
 * Generate HOTP (HMAC-based One-Time Password)
 * Used internally by TOTP
 * 
 * @param secret - Base32 encoded secret
 * @param counter - Counter value
 * @returns 6-digit code
 */
function generateHOTP(secret: string, counter: number): string {
  const decodedSecret = base32Decode(secret);
  
  // Convert counter to 8-byte buffer (big-endian)
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  
  // Generate HMAC-SHA1
  const hmac = crypto.createHmac('sha1', decodedSecret);
  hmac.update(counterBuffer);
  const digest = hmac.digest();
  
  // Dynamic truncation (RFC 4226)
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  );
  
  // Get last 6 digits
  const otp = (code % Math.pow(10, TOTP_DIGITS)).toString();
  return otp.padStart(TOTP_DIGITS, '0');
}

/**
 * Base32 encode (RFC 4648)
 */
function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  
  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }
  
  return output;
}

/**
 * Base32 decode (RFC 4648)
 */
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanInput = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  
  let bits = 0;
  let value = 0;
  let index = 0;
  const output = Buffer.alloc(Math.ceil((cleanInput.length * 5) / 8));
  
  for (let i = 0; i < cleanInput.length; i++) {
    const char = cleanInput[i];
    const charValue = alphabet.indexOf(char);
    
    if (charValue === -1) {
      throw new Error(`Invalid Base32 character: ${char}`);
    }
    
    value = (value << 5) | charValue;
    bits += 5;
    
    if (bits >= 8) {
      output[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  
  return output.slice(0, index);
}

/**
 * Constant-time string comparison (prevents timing attacks)
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Validate TOTP secret format
 */
export function isValidTotpSecret(secret: string): boolean {
  try {
    const cleaned = secret.replace(/\s/g, '');
    if (!/^[A-Z2-7]+$/.test(cleaned)) {
      return false;
    }
    base32Decode(cleaned);
    return true;
  } catch {
    return false;
  }
}
