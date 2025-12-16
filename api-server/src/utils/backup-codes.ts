/**
 * Backup Codes Utility
 * 
 * Generates and verifies backup codes for 2FA recovery.
 * Codes are hashed before storage (like passwords).
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';

const CODE_LENGTH = 8; // 8 characters
const CODE_COUNT = 10; // 10 backup codes
const BCRYPT_ROUNDS = 12; // bcrypt work factor

/**
 * Generate a set of backup codes
 * 
 * @param count - Number of codes to generate (default: 10)
 * @returns Array of formatted backup codes (e.g., "A1B2-C3D4")
 */
export function generateBackupCodes(count: number = CODE_COUNT): string[] {
  const codes: string[] = [];
  
  for (let i = 0; i < count; i++) {
    codes.push(generateSingleCode());
  }
  
  return codes;
}

/**
 * Generate a single backup code
 * Format: XXXX-XXXX (uppercase alphanumeric, no ambiguous characters)
 */
function generateSingleCode(): string {
  // Use base32 alphabet (no ambiguous chars: 0/O, 1/I/L)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  
  for (let i = 0; i < CODE_LENGTH; i++) {
    const randomIndex = crypto.randomInt(0, alphabet.length);
    code += alphabet[randomIndex];
  }
  
  // Format as XXXX-XXXX
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Hash backup codes for storage
 * 
 * @param codes - Array of plaintext backup codes
 * @returns Array of bcrypt hashed codes
 */
export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  const hashed: string[] = [];
  
  for (const code of codes) {
    const normalized = normalizeBackupCode(code);
    const hash = await bcrypt.hash(normalized, BCRYPT_ROUNDS);
    hashed.push(hash);
  }
  
  return hashed;
}

/**
 * Verify a backup code against stored hashes
 * 
 * @param code - Plaintext code to verify
 * @param hashedCodes - Array of bcrypt hashed codes
 * @returns Index of matching code, or -1 if no match
 */
export async function verifyBackupCode(code: string, hashedCodes: string[]): Promise<number> {
  const normalized = normalizeBackupCode(code);
  
  for (let i = 0; i < hashedCodes.length; i++) {
    const match = await bcrypt.compare(normalized, hashedCodes[i]);
    if (match) {
      return i;
    }
  }
  
  return -1;
}

/**
 * Mark a backup code as used by removing it from the array
 * 
 * @param hashedCodes - Array of hashed codes
 * @param index - Index of code to mark as used
 * @returns Updated array with code removed
 */
export function markBackupCodeUsed(hashedCodes: string[], index: number): string[] {
  if (index < 0 || index >= hashedCodes.length) {
    throw new Error('Invalid backup code index');
  }
  
  const updated = [...hashedCodes];
  updated.splice(index, 1);
  return updated;
}

/**
 * Normalize backup code (remove spaces, hyphens, lowercase)
 * 
 * @param code - Raw code input
 * @returns Normalized code
 */
export function normalizeBackupCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Validate backup code format
 * 
 * @param code - Code to validate
 * @returns true if valid format
 */
export function isValidBackupCodeFormat(code: string): boolean {
  const normalized = normalizeBackupCode(code);
  
  // Must be 8 characters, alphanumeric, no ambiguous chars
  if (normalized.length !== CODE_LENGTH) {
    return false;
  }
  
  const validChars = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;
  return validChars.test(normalized);
}

/**
 * Get remaining backup code count
 * 
 * @param hashedCodes - Array of hashed codes
 * @returns Number of unused codes
 */
export function getRemainingCodeCount(hashedCodes: string[]): number {
  return hashedCodes.length;
}

/**
 * Check if user should regenerate backup codes (running low)
 * 
 * @param hashedCodes - Array of hashed codes
 * @returns true if 3 or fewer codes remain
 */
export function shouldRegenerateBackupCodes(hashedCodes: string[]): boolean {
  return hashedCodes.length <= 3;
}
