/**
 * Admin Authentication Middleware
 * 
 * Protects admin-only endpoints with JWT authentication and admin role verification.
 * 
 * Usage:
 *   app.post('/api/v1/admin/brokers/register', requireAdminAuth, handler);
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import { DatabaseClient } from '../database/client.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
    new winston.transports.File({ filename: 'logs/admin-auth.log', level: 'warn' })
  ]
});

/**
 * Get admin user IDs from environment variable
 * Reading dynamically to support testing with changing env vars
 */
function getAdminUserIds(): Set<number> {
  return new Set(
    (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean).map(Number)
  );
}

/**
 * Get admin email domains from environment variable
 * Reading dynamically to support testing with changing env vars
 */
function getAdminEmailDomains(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAIL_DOMAINS || 'daon.io').split(',').filter(Boolean)
  );
}

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      adminUser?: {
        id: number;
        email: string;
        is_admin: boolean;
      };
    }
  }
}

/**
 * Middleware to require admin authentication
 * 
 * Verifies JWT token and checks if user is an admin.
 * Attaches req.userId and req.adminUser if successful.
 */
export function requireAdminAuth(db: DatabaseClient) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Admin auth failed: Missing authorization header', {
        ip: req.ip,
        endpoint: req.path
      });
      
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        code: 'ADMIN_AUTH_MISSING',
        message: 'Admin authentication required. Please provide Bearer token.'
      });
    }
    
    const token = authHeader.substring(7);
    
    try {
      // Verify JWT token
      const decoded = verifyAccessToken(token);
      const userId = decoded.user_id;
      
      // Fetch user from database
      const userResult = await db.query(
        'SELECT id, email, created_at FROM users WHERE id = $1',
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        logger.warn('Admin auth failed: User not found', {
          user_id: userId,
          ip: req.ip,
          endpoint: req.path
        });
        
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
          code: 'ADMIN_USER_NOT_FOUND',
          message: 'User account not found'
        });
      }
      
      const user = userResult.rows[0];
      
      // Check if user is admin
      const isAdmin = isUserAdmin(userId, user.email);
      
      if (!isAdmin) {
        logger.warn('Admin auth failed: Insufficient permissions', {
          user_id: userId,
          email: user.email,
          ip: req.ip,
          endpoint: req.path
        });
        
        await logSecurityEvent(db, {
          user_id: userId,
          event_type: 'unauthorized_admin_access',
          severity: 'high',
          description: `User ${userId} attempted to access admin endpoint: ${req.path}`,
          ip_address: req.ip || 'unknown',
          endpoint: req.path
        });
        
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          code: 'ADMIN_INSUFFICIENT_PERMISSIONS',
          message: 'Admin privileges required for this operation'
        });
      }
      
      // Attach user info to request
      req.userId = userId;
      req.adminUser = {
        id: userId,
        email: user.email,
        is_admin: true
      };
      
      logger.info('Admin authenticated successfully', {
        user_id: userId,
        email: user.email,
        endpoint: req.path
      });
      
      next();
    } catch (error: any) {
      logger.error('Admin auth error:', error);
      
      if (error.message === 'token_expired') {
        return res.status(401).json({
          success: false,
          error: 'Token expired',
          code: 'ADMIN_TOKEN_EXPIRED',
          message: 'Admin session expired. Please log in again.'
        });
      }
      
      if (error.message === 'token_invalid') {
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'ADMIN_TOKEN_INVALID',
          message: 'Invalid authentication token'
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'ADMIN_AUTH_ERROR',
        message: 'Authentication failed'
      });
    }
  };
}

/**
 * Check if user is admin
 * 
 * This is a temporary implementation. In production, this should:
 * 1. Check a `role` column in the users table
 * 2. Use a separate `admin_users` table
 * 3. Implement a full RBAC (Role-Based Access Control) system
 * 
 * Current logic:
 * - User ID is in ADMIN_USER_IDS env var
 * - OR email domain is in ADMIN_EMAIL_DOMAINS env var
 */
function isUserAdmin(userId: number, email: string | null): boolean {
  const adminUserIds = getAdminUserIds();
  const adminEmailDomains = getAdminEmailDomains();
  
  // Check by user ID
  if (adminUserIds.has(userId)) {
    return true;
  }
  
  // Check by email domain
  if (email) {
    const emailDomain = email.split('@')[1];
    if (emailDomain && adminEmailDomains.has(emailDomain)) {
      return true;
    }
  }
  
  // Default: not admin
  return false;
}

/**
 * Log security events for admin operations
 */
async function logSecurityEvent(
  db: DatabaseClient,
  event: {
    user_id: number;
    event_type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    ip_address: string;
    endpoint: string;
  }
): Promise<void> {
  try {
    await db.query(`
      INSERT INTO admin_security_events (
        user_id, event_type, severity, description, ip_address, endpoint, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
      event.user_id,
      event.event_type,
      event.severity,
      event.description,
      event.ip_address,
      event.endpoint
    ]);
  } catch (error) {
    // Don't throw - security logging failures shouldn't break auth flow
    logger.error('Failed to log security event:', error);
  }
}

/**
 * Log admin action for audit trail
 */
export async function logAdminAction(
  db: DatabaseClient,
  action: {
    user_id: number;
    action_type: string;
    resource_type: string;
    resource_id: number | string;
    details?: any;
    ip_address?: string;
  }
): Promise<void> {
  try {
    await db.query(`
      INSERT INTO admin_audit_log (
        user_id, action_type, resource_type, resource_id, details, ip_address, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
      action.user_id,
      action.action_type,
      action.resource_type,
      action.resource_id.toString(),
      action.details ? JSON.stringify(action.details) : null,
      action.ip_address || null
    ]);
  } catch (error) {
    logger.error('Failed to log admin action:', error);
  }
}
