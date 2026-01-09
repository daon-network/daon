/**
 * Tests for Backup Codes Utility
 */

import { describe, it, expect } from '@jest/globals';
import {
  generateBackupCodes,
  hashBackupCodes,
  verifyBackupCode,
  markBackupCodeUsed,
  normalizeBackupCode,
  isValidBackupCodeFormat,
  getRemainingCodeCount,
  shouldRegenerateBackupCodes
} from '../utils/backup-codes';

describe('Backup Codes Utility', () => {
  describe('generateBackupCodes', () => {
    it('should generate 10 codes by default', () => {
      const codes = generateBackupCodes();
      expect(codes).toHaveLength(10);
    });
    
    it('should generate custom number of codes', () => {
      const codes = generateBackupCodes(5);
      expect(codes).toHaveLength(5);
    });
    
    it('should generate codes in XXXX-XXXX format', () => {
      const codes = generateBackupCodes();
      
      codes.forEach(code => {
        expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      });
    });
    
    it('should generate unique codes', () => {
      const codes = generateBackupCodes(20);
      const uniqueCodes = new Set(codes);
      
      expect(uniqueCodes.size).toBe(20); // All unique
    });
    
    it('should not contain ambiguous characters', () => {
      const codes = generateBackupCodes(100);
      const combined = codes.join('');
      
      // Should not contain: 0, O, 1, I, L
      expect(combined).not.toMatch(/[01OIL]/);
    });
  });
  
  describe('hashBackupCodes', () => {
    it('should hash all codes', async () => {
      const codes = ['A1B2-C3D4', 'E5F6-G7H8'];
      const hashed = await hashBackupCodes(codes);
      
      expect(hashed).toHaveLength(2);
      hashed.forEach(hash => {
        expect(hash).toBeTruthy();
        expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are long
      });
    });
    
    it('should produce different hashes for same code', async () => {
      const codes = ['A1B2-C3D4', 'A1B2-C3D4'];
      const hashed = await hashBackupCodes(codes);
      
      expect(hashed[0]).not.toBe(hashed[1]); // bcrypt salts are random
    });
    
    it('should normalize codes before hashing', async () => {
      const codes1 = ['A1B2-C3D4'];
      const codes2 = ['a1b2-c3d4']; // lowercase
      const codes3 = ['A1B2 C3D4']; // space instead of dash
      
      const hashed1 = await hashBackupCodes(codes1);
      const hashed2 = await hashBackupCodes(codes2);
      const hashed3 = await hashBackupCodes(codes3);
      
      // All should verify against same normalized form
      const normalized = normalizeBackupCode(codes1[0]);
      expect(await verifyBackupCode(normalized, hashed1)).toBe(0);
      expect(await verifyBackupCode(normalized, hashed2)).toBe(0);
      expect(await verifyBackupCode(normalized, hashed3)).toBe(0);
    });
  });
  
  describe('verifyBackupCode', () => {
    it('should verify correct code', async () => {
      const codes = ['A1B2-C3D4', 'E5F6-G7H8'];
      const hashed = await hashBackupCodes(codes);
      
      const index = await verifyBackupCode('A1B2-C3D4', hashed);
      expect(index).toBe(0);
    });
    
    it('should return -1 for incorrect code', async () => {
      const codes = ['A1B2-C3D4'];
      const hashed = await hashBackupCodes(codes);
      
      const index = await verifyBackupCode('WRONG-CODE', hashed);
      expect(index).toBe(-1);
    });
    
    it('should find code in any position', async () => {
      const codes = ['A1B2-C3D4', 'E5F6-G7H8', 'J9K2-L3M4'];
      const hashed = await hashBackupCodes(codes);
      
      expect(await verifyBackupCode('A1B2-C3D4', hashed)).toBe(0);
      expect(await verifyBackupCode('E5F6-G7H8', hashed)).toBe(1);
      expect(await verifyBackupCode('J9K2-L3M4', hashed)).toBe(2);
    });
    
    it('should handle codes with different formatting', async () => {
      const codes = ['A1B2-C3D4'];
      const hashed = await hashBackupCodes(codes);
      
      // All these should verify
      expect(await verifyBackupCode('A1B2-C3D4', hashed)).toBe(0);
      expect(await verifyBackupCode('a1b2-c3d4', hashed)).toBe(0); // lowercase
      expect(await verifyBackupCode('A1B2 C3D4', hashed)).toBe(0); // space
      expect(await verifyBackupCode('A1B2C3D4', hashed)).toBe(0);  // no separator
    });
  });
  
  describe('markBackupCodeUsed', () => {
    it('should remove code at index', () => {
      const codes = ['hash1', 'hash2', 'hash3'];
      const updated = markBackupCodeUsed(codes, 1);
      
      expect(updated).toHaveLength(2);
      expect(updated).toEqual(['hash1', 'hash3']);
    });
    
    it('should not modify original array', () => {
      const codes = ['hash1', 'hash2', 'hash3'];
      const original = [...codes];
      
      markBackupCodeUsed(codes, 1);
      
      expect(codes).toEqual(original); // Original unchanged
    });
    
    it('should throw error for invalid index', () => {
      const codes = ['hash1', 'hash2'];
      
      expect(() => markBackupCodeUsed(codes, -1)).toThrow('Invalid backup code index');
      expect(() => markBackupCodeUsed(codes, 5)).toThrow('Invalid backup code index');
    });
    
    it('should handle removing first code', () => {
      const codes = ['hash1', 'hash2', 'hash3'];
      const updated = markBackupCodeUsed(codes, 0);
      
      expect(updated).toEqual(['hash2', 'hash3']);
    });
    
    it('should handle removing last code', () => {
      const codes = ['hash1', 'hash2', 'hash3'];
      const updated = markBackupCodeUsed(codes, 2);
      
      expect(updated).toEqual(['hash1', 'hash2']);
    });
  });
  
  describe('normalizeBackupCode', () => {
    it('should remove hyphens', () => {
      expect(normalizeBackupCode('A1B2-C3D4')).toBe('A1B2C3D4');
    });
    
    it('should remove spaces', () => {
      expect(normalizeBackupCode('A1B2 C3D4')).toBe('A1B2C3D4');
    });
    
    it('should convert to uppercase', () => {
      expect(normalizeBackupCode('a1b2-c3d4')).toBe('A1B2C3D4');
    });
    
    it('should handle mixed formatting', () => {
      expect(normalizeBackupCode('a1B2 -c3D4')).toBe('A1B2C3D4');
    });
    
    it('should handle already normalized code', () => {
      expect(normalizeBackupCode('A1B2C3D4')).toBe('A1B2C3D4');
    });
  });
  
  describe('isValidBackupCodeFormat', () => {
    it('should validate correct format', () => {
      expect(isValidBackupCodeFormat('A2B3-C4D5')).toBe(true);
      expect(isValidBackupCodeFormat('ABCD-EFGH')).toBe(true);
      expect(isValidBackupCodeFormat('2345-6789')).toBe(true);
    });

    it('should accept codes without separator', () => {
      expect(isValidBackupCodeFormat('A2B3C4D5')).toBe(true);
    });

    it('should accept lowercase', () => {
      expect(isValidBackupCodeFormat('a2b3-c4d5')).toBe(true);
    });

    it('should reject wrong length', () => {
      expect(isValidBackupCodeFormat('A2B3-C4')).toBe(false);
      expect(isValidBackupCodeFormat('A2B3-C4D5E6')).toBe(false);
    });

    it('should reject ambiguous characters', () => {
      expect(isValidBackupCodeFormat('O2B3-C4D5')).toBe(false); // O
      expect(isValidBackupCodeFormat('A0B3-C4D5')).toBe(false); // 0
      expect(isValidBackupCodeFormat('I2B3-C4D5')).toBe(false); // I
      expect(isValidBackupCodeFormat('L2B3-C4D5')).toBe(false); // L
      expect(isValidBackupCodeFormat('A1B3-C4D5')).toBe(false); // 1
    });

    it('should reject special characters', () => {
      expect(isValidBackupCodeFormat('A2B3-C4D!')).toBe(false);
      expect(isValidBackupCodeFormat('A2B3@C4D5')).toBe(false);
    });
    
    it('should reject empty string', () => {
      expect(isValidBackupCodeFormat('')).toBe(false);
    });
  });
  
  describe('getRemainingCodeCount', () => {
    it('should return correct count', () => {
      expect(getRemainingCodeCount(['h1', 'h2', 'h3'])).toBe(3);
      expect(getRemainingCodeCount(['h1'])).toBe(1);
      expect(getRemainingCodeCount([])).toBe(0);
    });
  });
  
  describe('shouldRegenerateBackupCodes', () => {
    it('should return true when 3 or fewer codes remain', () => {
      expect(shouldRegenerateBackupCodes(['h1', 'h2', 'h3'])).toBe(true);
      expect(shouldRegenerateBackupCodes(['h1', 'h2'])).toBe(true);
      expect(shouldRegenerateBackupCodes(['h1'])).toBe(true);
      expect(shouldRegenerateBackupCodes([])).toBe(true);
    });
    
    it('should return false when more than 3 codes remain', () => {
      expect(shouldRegenerateBackupCodes(['h1', 'h2', 'h3', 'h4'])).toBe(false);
      expect(shouldRegenerateBackupCodes(['h1', 'h2', 'h3', 'h4', 'h5'])).toBe(false);
    });
  });
  
  describe('Backup Codes Integration', () => {
    it('should complete full flow: generate, hash, verify, mark used', async () => {
      // Generate codes
      const codes = generateBackupCodes(5);
      expect(codes).toHaveLength(5);
      
      // Hash codes
      const hashed = await hashBackupCodes(codes);
      expect(hashed).toHaveLength(5);
      
      // Verify first code
      const index = await verifyBackupCode(codes[0], hashed);
      expect(index).toBe(0);
      
      // Mark as used
      const updated = markBackupCodeUsed(hashed, index);
      expect(updated).toHaveLength(4);
      
      // Verify code is no longer valid
      const retryIndex = await verifyBackupCode(codes[0], updated);
      expect(retryIndex).toBe(-1);
      
      // Other codes still work
      const index2 = await verifyBackupCode(codes[1], updated);
      expect(index2).toBe(0); // Now at position 0 after first removed
    });
    
    it('should handle multiple code usage', async () => {
      const codes = generateBackupCodes(10);
      let hashed = await hashBackupCodes(codes);
      
      // Use 7 codes
      for (let i = 0; i < 7; i++) {
        const index = await verifyBackupCode(codes[i], hashed);
        expect(index).toBeGreaterThanOrEqual(0);
        hashed = markBackupCodeUsed(hashed, index);
      }
      
      // Should have 3 left
      expect(getRemainingCodeCount(hashed)).toBe(3);
      expect(shouldRegenerateBackupCodes(hashed)).toBe(true);
    });
  });
});
