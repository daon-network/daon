/**
 * Tests for TOTP Utility
 */

import { describe, it, expect } from '@jest/globals';
import {
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  generateTotpUrl,
  formatTotpSecret,
  isValidTotpSecret
} from '../utils/totp';

describe('TOTP Utility', () => {
  describe('generateTotpSecret', () => {
    it('should generate valid Base32 secret', () => {
      const secret = generateTotpSecret();
      
      expect(secret).toBeTruthy();
      expect(secret.length).toBeGreaterThan(0);
      expect(secret).toMatch(/^[A-Z2-7]+$/); // Base32 alphabet
    });
    
    it('should generate unique secrets', () => {
      const secret1 = generateTotpSecret();
      const secret2 = generateTotpSecret();
      
      expect(secret1).not.toBe(secret2);
    });
    
    it('should generate secrets of consistent length', () => {
      const secrets = Array.from({ length: 10 }, () => generateTotpSecret());
      const lengths = new Set(secrets.map(s => s.length));
      
      expect(lengths.size).toBe(1); // All same length
    });
  });
  
  describe('generateTotpCode', () => {
    it('should generate 6-digit code', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const code = generateTotpCode(secret);
      
      expect(code).toMatch(/^\d{6}$/);
      expect(code.length).toBe(6);
    });
    
    it('should generate same code for same time and secret', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const time = Math.floor(Date.now() / 1000);
      
      const code1 = generateTotpCode(secret, time);
      const code2 = generateTotpCode(secret, time);
      
      expect(code1).toBe(code2);
    });
    
    it('should generate different codes for different times', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const time1 = 1000000000;
      const time2 = 1000000100;
      
      const code1 = generateTotpCode(secret, time1);
      const code2 = generateTotpCode(secret, time2);
      
      expect(code1).not.toBe(code2);
    });
    
    it('should generate different codes for different secrets', () => {
      const time = Math.floor(Date.now() / 1000);
      
      const code1 = generateTotpCode('JBSWY3DPEHPK3PXP', time);
      const code2 = generateTotpCode('HXDMVJECJJWSRB3H', time);
      
      expect(code1).not.toBe(code2);
    });
    
    it('should pad codes to 6 digits', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const code = generateTotpCode(secret);
      
      // Even if code starts with 0, should be 6 digits
      expect(code.length).toBe(6);
      expect(/^\d{6}$/.test(code)).toBe(true);
    });
  });
  
  describe('verifyTotpCode', () => {
    it('should verify valid code', () => {
      const secret = generateTotpSecret();
      const code = generateTotpCode(secret);
      
      const isValid = verifyTotpCode(secret, code);
      expect(isValid).toBe(true);
    });
    
    it('should reject invalid code', () => {
      const secret = generateTotpSecret();
      
      const isValid = verifyTotpCode(secret, '000000');
      expect(isValid).toBe(false);
    });
    
    it('should verify code with time window tolerance', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Generate code for 30 seconds ago
      const pastCode = generateTotpCode(secret, currentTime - 30);
      
      // Should still be valid (within window)
      const isValid = verifyTotpCode(secret, pastCode, 1);
      expect(isValid).toBe(true);
    });
    
    it('should reject code outside time window', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Generate code for 5 minutes ago (outside window)
      const oldCode = generateTotpCode(secret, currentTime - 300);
      
      const isValid = verifyTotpCode(secret, oldCode, 1);
      expect(isValid).toBe(false);
    });
    
    it('should handle codes from different secrets', () => {
      const secret1 = 'JBSWY3DPEHPK3PXP';
      const secret2 = 'HXDMVJECJJWSRB3H';
      
      const code = generateTotpCode(secret1);
      const isValid = verifyTotpCode(secret2, code);
      
      expect(isValid).toBe(false);
    });
  });
  
  describe('generateTotpUrl', () => {
    it('should generate valid otpauth:// URL', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const accountName = 'user@example.com';
      const url = generateTotpUrl(secret, accountName);
      
      expect(url).toContain('otpauth://totp/');
      expect(url).toContain(secret);
      expect(url).toContain('DAON');
    });
    
    it('should encode special characters in account name', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const accountName = 'user+test@example.com';
      const url = generateTotpUrl(secret, accountName);
      
      expect(url).toContain('user%2Btest%40example.com');
    });
    
    it('should include required parameters', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const accountName = 'user@example.com';
      const url = generateTotpUrl(secret, accountName);
      
      expect(url).toContain('secret=');
      expect(url).toContain('issuer=');
      expect(url).toContain('algorithm=SHA1');
      expect(url).toContain('digits=6');
      expect(url).toContain('period=30');
    });
  });
  
  describe('formatTotpSecret', () => {
    it('should format secret in groups of 4', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const formatted = formatTotpSecret(secret);
      
      expect(formatted).toBe('JBSW Y3DP EHPK 3PXP');
    });
    
    it('should handle secrets of different lengths', () => {
      const secret = 'ABCD';
      const formatted = formatTotpSecret(secret);
      
      expect(formatted).toBe('ABCD');
    });
    
    it('should handle secrets not divisible by 4', () => {
      const secret = 'ABCDEFGH';
      const formatted = formatTotpSecret(secret);
      
      expect(formatted).toBe('ABCD EFGH');
    });
  });
  
  describe('isValidTotpSecret', () => {
    it('should validate correct Base32 secret', () => {
      expect(isValidTotpSecret('JBSWY3DPEHPK3PXP')).toBe(true);
    });
    
    it('should validate secret with spaces', () => {
      expect(isValidTotpSecret('JBSW Y3DP EHPK 3PXP')).toBe(true);
    });
    
    it('should reject lowercase letters', () => {
      expect(isValidTotpSecret('jbswy3dpehpk3pxp')).toBe(false);
    });
    
    it('should reject invalid Base32 characters', () => {
      expect(isValidTotpSecret('INVALID0189')).toBe(false); // 0, 1, 8, 9 not in Base32
    });
    
    it('should reject empty string', () => {
      expect(isValidTotpSecret('')).toBe(false);
    });
    
    it('should reject special characters', () => {
      expect(isValidTotpSecret('JBSWY3DP@#$%')).toBe(false);
    });
  });
  
  describe('TOTP Integration', () => {
    it('should complete full flow: generate secret, create code, verify code', () => {
      // Generate secret
      const secret = generateTotpSecret();
      expect(isValidTotpSecret(secret)).toBe(true);
      
      // Generate code
      const code = generateTotpCode(secret);
      expect(code).toMatch(/^\d{6}$/);
      
      // Verify code
      const isValid = verifyTotpCode(secret, code);
      expect(isValid).toBe(true);
    });
    
    it('should generate QR-compatible URL', () => {
      const secret = generateTotpSecret();
      const url = generateTotpUrl(secret, 'test@example.com');
      
      // URL should be parseable
      const parsed = new URL(url);
      expect(parsed.protocol).toBe('otpauth:');
      expect(parsed.hostname).toBe('totp');
    });
  });
});
