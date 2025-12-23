/**
 * JWT Utility for Access and Refresh Tokens
 * 
 * Generates and verifies JWT tokens for authentication.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_ALGORITHM = (process.env.JWT_ALGORITHM || 'HS256') as jwt.Algorithm;
const ACCESS_TOKEN_LIFETIME = parseInt(process.env.ACCESS_TOKEN_LIFETIME || '900', 10); // 15 minutes
const REFRESH_TOKEN_LIFETIME = parseInt(process.env.REFRESH_TOKEN_LIFETIME || '2592000', 10); // 30 days

export interface AccessTokenPayload {
  user_id: number;
  type: 'access';
}

export interface DecodedAccessToken extends AccessTokenPayload {
  iat: number;
  exp: number;
}

/**
 * Generate access token (JWT, stateless)
 * 
 * @param userId - User ID
 * @returns JWT access token
 */
export function generateAccessToken(userId: number): string {
  const payload: AccessTokenPayload = {
    user_id: userId,
    type: 'access'
  };
  
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: ACCESS_TOKEN_LIFETIME
  });
}

/**
 * Generate refresh token (random, DB-backed)
 * 
 * @returns Random 64-character hex string
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify access token
 * 
 * @param token - JWT access token
 * @returns Decoded token payload
 * @throws Error if token is invalid or expired
 */
export function verifyAccessToken(token: string): DecodedAccessToken {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM]
    }) as DecodedAccessToken;
    
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }
    
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('token_expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('token_invalid');
    }
    throw error;
  }
}

/**
 * Decode access token without verification (for debugging)
 * 
 * @param token - JWT access token
 * @returns Decoded token payload or null
 */
export function decodeAccessToken(token: string): DecodedAccessToken | null {
  try {
    return jwt.decode(token) as DecodedAccessToken;
  } catch {
    return null;
  }
}

/**
 * Get token expiration time in seconds
 * 
 * @returns Access token lifetime in seconds
 */
export function getAccessTokenLifetime(): number {
  return ACCESS_TOKEN_LIFETIME;
}

/**
 * Get refresh token expiration time in seconds
 * 
 * @returns Refresh token lifetime in seconds
 */
export function getRefreshTokenLifetime(): number {
  return REFRESH_TOKEN_LIFETIME;
}

/**
 * Check if token is expired
 * 
 * @param token - JWT token
 * @returns true if expired
 */
export function isTokenExpired(token: string): boolean {
  try {
    const decoded = jwt.decode(token) as DecodedAccessToken;
    if (!decoded || !decoded.exp) return true;
    
    return Date.now() >= decoded.exp * 1000;
  } catch {
    return true;
  }
}

/**
 * Get time remaining until token expires
 * 
 * @param token - JWT token
 * @returns Seconds remaining, or 0 if expired
 */
export function getTokenTimeRemaining(token: string): number {
  try {
    const decoded = jwt.decode(token) as DecodedAccessToken;
    if (!decoded || !decoded.exp) return 0;
    
    const remaining = Math.floor((decoded.exp * 1000 - Date.now()) / 1000);
    return Math.max(0, remaining);
  } catch {
    return 0;
  }
}

/**
 * Validate JWT secret is configured
 */
export function validateJwtConfig(): boolean {
  if (!JWT_SECRET || JWT_SECRET === 'dev-secret-change-in-production') {
    console.warn('WARNING: Using default JWT_SECRET. Set JWT_SECRET environment variable in production!');
    return process.env.NODE_ENV !== 'production';
  }
  
  if (JWT_SECRET.length < 32) {
    console.warn('WARNING: JWT_SECRET should be at least 32 characters long');
    return false;
  }
  
  return true;
}
