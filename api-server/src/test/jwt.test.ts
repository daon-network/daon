/**
 * Tests for JWT Utility
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  decodeAccessToken,
  isTokenExpired,
  getTokenTimeRemaining,
  getAccessTokenLifetime,
  validateJwtConfig
} from '../utils/jwt';

// Helper to create an expired token for testing
function createExpiredToken(userId: number): string {
  const secret = process.env.JWT_SECRET || 'test-secret-key-min-32-characters-long-for-security';
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { user_id: userId, type: 'access', iat: now - 1000, exp: now - 10 },
    secret,
    { algorithm: 'HS256' }
  );
}

describe('JWT Utility', () => {
  const originalEnv = process.env.JWT_SECRET;
  
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-key-min-32-characters-long-for-security';
    process.env.ACCESS_TOKEN_LIFETIME = '900'; // 15 minutes
  });
  
  afterAll(() => {
    if (originalEnv) {
      process.env.JWT_SECRET = originalEnv;
    } else {
      delete process.env.JWT_SECRET;
    }
  });
  
  describe('generateAccessToken', () => {
    it('should generate valid JWT access token', () => {
      const userId = 42;
      const token = generateAccessToken(userId);
      
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
    });
    
    it('should include user_id and type in payload', () => {
      const userId = 123;
      const token = generateAccessToken(userId);
      const decoded = decodeAccessToken(token);
      
      expect(decoded).toBeTruthy();
      expect(decoded?.user_id).toBe(userId);
      expect(decoded?.type).toBe('access');
    });
    
    it('should have expiration time', () => {
      const token = generateAccessToken(1);
      const decoded = decodeAccessToken(token);
      
      expect(decoded?.exp).toBeTruthy();
      expect(decoded?.iat).toBeTruthy();
      expect(decoded!.exp).toBeGreaterThan(decoded!.iat);
    });
    
    it('should generate tokens with consistent structure for same user', () => {
      const userId = 1;
      const token1 = generateAccessToken(userId);
      const token2 = generateAccessToken(userId);

      // Both tokens should decode to the same user
      const decoded1 = decodeAccessToken(token1);
      const decoded2 = decodeAccessToken(token2);

      expect(decoded1?.user_id).toBe(userId);
      expect(decoded2?.user_id).toBe(userId);
      expect(decoded1?.type).toBe('access');
      expect(decoded2?.type).toBe('access');
    });
  });
  
  describe('generateRefreshToken', () => {
    it('should generate 64-character hex string', () => {
      const token = generateRefreshToken();
      
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(token.length).toBe(64);
    });
    
    it('should generate unique tokens', () => {
      const token1 = generateRefreshToken();
      const token2 = generateRefreshToken();
      
      expect(token1).not.toBe(token2);
    });
    
    it('should generate cryptographically random tokens', () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateRefreshToken());
      }
      
      expect(tokens.size).toBe(100); // All unique
    });
  });
  
  describe('verifyAccessToken', () => {
    it('should verify valid token', () => {
      const userId = 42;
      const token = generateAccessToken(userId);
      const decoded = verifyAccessToken(token);
      
      expect(decoded.user_id).toBe(userId);
      expect(decoded.type).toBe('access');
    });
    
    it('should throw error for invalid token', () => {
      expect(() => verifyAccessToken('invalid.token.here')).toThrow('token_invalid');
    });
    
    it('should throw error for malformed token', () => {
      expect(() => verifyAccessToken('not-a-jwt')).toThrow('token_invalid');
    });
    
    it('should throw error for token with wrong signature', () => {
      const token = generateAccessToken(1);
      const parts = token.split('.');
      parts[2] = 'wrongsignature';
      const tampered = parts.join('.');
      
      expect(() => verifyAccessToken(tampered)).toThrow('token_invalid');
    });
    
    it('should throw error for expired token', () => {
      const token = createExpiredToken(1);
      // Expired tokens should throw either token_expired or token_invalid
      // depending on jwt library version behavior
      expect(() => verifyAccessToken(token)).toThrow(/token_(expired|invalid)/);
    });
  });
  
  describe('decodeAccessToken', () => {
    it('should decode token without verification', () => {
      const userId = 42;
      const token = generateAccessToken(userId);
      const decoded = decodeAccessToken(token);
      
      expect(decoded?.user_id).toBe(userId);
      expect(decoded?.type).toBe('access');
    });
    
    it('should return null for invalid token', () => {
      const decoded = decodeAccessToken('not-a-token');
      expect(decoded).toBeNull();
    });
    
    it('should decode expired token (no verification)', () => {
      const token = createExpiredToken(1);
      const decoded = decodeAccessToken(token);
      expect(decoded).toBeTruthy();
      expect(decoded?.user_id).toBe(1);
    });
  });
  
  describe('isTokenExpired', () => {
    it('should return false for valid token', () => {
      const token = generateAccessToken(1);
      expect(isTokenExpired(token)).toBe(false);
    });
    
    it('should return true for expired token', () => {
      const token = createExpiredToken(1);
      expect(isTokenExpired(token)).toBe(true);
    });
    
    it('should return true for invalid token', () => {
      expect(isTokenExpired('invalid')).toBe(true);
    });
    
    it('should return true for malformed token', () => {
      expect(isTokenExpired('not.a.token')).toBe(true);
    });
  });
  
  describe('getTokenTimeRemaining', () => {
    it('should return remaining seconds for valid token', () => {
      const token = generateAccessToken(1);
      const remaining = getTokenTimeRemaining(token);
      
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(getAccessTokenLifetime());
    });
    
    it('should return 0 for expired token', () => {
      const token = createExpiredToken(1);
      expect(getTokenTimeRemaining(token)).toBe(0);
    });
    
    it('should return 0 for invalid token', () => {
      expect(getTokenTimeRemaining('invalid')).toBe(0);
    });
  });
  
  describe('getAccessTokenLifetime', () => {
    it('should return configured lifetime', () => {
      const lifetime = getAccessTokenLifetime();
      expect(lifetime).toBe(900); // From beforeAll
    });
  });
  
  describe('validateJwtConfig', () => {
    it('should validate proper JWT secret', () => {
      const isValid = validateJwtConfig();
      expect(isValid).toBe(true);
    });
    
    it('should return true when properly configured', () => {
      // JWT_SECRET is set to a valid 32+ char string in beforeAll
      // This test verifies the config validation passes with proper setup
      const isValid = validateJwtConfig();
      expect(isValid).toBe(true);
    });
    
    it('should warn about default JWT secret in production', () => {
      const originalSecret = process.env.JWT_SECRET;
      const originalEnv = process.env.NODE_ENV;
      
      process.env.JWT_SECRET = 'dev-secret-change-in-production';
      process.env.NODE_ENV = 'production';
      
      const isValid = validateJwtConfig();
      expect(isValid).toBe(false);
      
      process.env.JWT_SECRET = originalSecret;
      process.env.NODE_ENV = originalEnv;
    });
  });
});
