/**
 * Authentication Routes
 * 
 * Express routes for all authentication endpoints.
 */

import { Router, Request, Response } from 'express';
import { AuthService, DeviceInfo } from './auth-service.js';
import { DatabaseClient } from '../database/client.js';
import { verifyAccessToken } from '../utils/jwt.js';

const router = Router();

// Middleware to extract device info from request
function getDeviceInfo(req: Request): DeviceInfo {
  return {
    user_agent: req.headers['user-agent'] || 'unknown',
    ip: req.ip || req.socket.remoteAddress || 'unknown',
    screen: req.body.device_info?.screen,
    timezone: req.body.device_info?.timezone,
    device_id: req.body.device_info?.device_id,
    device_fingerprint: req.body.device_info?.device_fingerprint
  };
}

// Middleware to verify access token
function requireAuth(req: Request, res: Response, next: any) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'unauthorized',
      message: 'Missing or invalid authorization header'
    });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = verifyAccessToken(token);
    (req as any).userId = decoded.user_id;
    next();
  } catch (error: any) {
    return res.status(401).json({
      success: false,
      error: error.message === 'token_expired' ? 'token_expired' : 'unauthorized',
      message: error.message === 'token_expired' ? 'Token expired' : 'Invalid token'
    });
  }
}

/**
 * Initialize auth routes with database client
 */
export function createAuthRoutes(db: DatabaseClient): Router {
  const authService = new AuthService(db);
  
  /**
   * POST /api/v1/auth/magic-link
   * Send magic link to email
   */
  router.post('/magic-link', async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'Email is required'
        });
      }
      
      const result = await authService.sendMagicLink(email);
      res.json(result);
    } catch (error: any) {
      console.error('Magic link error:', error);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: 'Failed to send magic link'
      });
    }
  });
  
  /**
   * GET /api/v1/auth/verify
   * Verify magic link token (for clicking email links)
   */
  router.get('/verify', async (req: Request, res: Response) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'Token is required'
        });
      }
      
      const deviceInfo = getDeviceInfo(req);
      const result = await authService.verifyMagicLink(token, deviceInfo);
      
      res.json(result);
    } catch (error: any) {
      console.error('Verify error:', error);
      res.status(400).json({
        success: false,
        error: 'invalid_token',
        message: error.message || 'Invalid or expired magic link'
      });
    }
  });
  
  /**
   * POST /api/v1/auth/verify
   * Verify magic link token (for programmatic verification with device_info)
   */
  router.post('/verify', async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      
      if (!token || typeof token !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'Token is required'
        });
      }
      
      const deviceInfo = getDeviceInfo(req);
      const result = await authService.verifyMagicLink(token, deviceInfo);
      
      res.json(result);
    } catch (error: any) {
      console.error('Verify error:', error);
      res.status(400).json({
        success: false,
        error: 'invalid_token',
        message: error.message || 'Invalid or expired magic link'
      });
    }
  });
  
  /**
   * POST /api/v1/auth/2fa/setup
   * Get 2FA setup details (QR code, secret)
   */
  router.post('/2fa/setup', async (req: Request, res: Response) => {
    try {
      const { session_id } = req.body;
      
      if (!session_id) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'Session ID is required'
        });
      }
      
      const result = await authService.setup2FA(session_id);
      res.json(result);
    } catch (error: any) {
      console.error('2FA setup error:', error);
      res.status(400).json({
        success: false,
        error: 'invalid_session',
        message: error.message || 'Invalid or expired session'
      });
    }
  });
  
  /**
   * POST /api/v1/auth/2fa/verify-setup
   * Verify 2FA setup with TOTP code
   */
  router.post('/2fa/verify-setup', async (req: Request, res: Response) => {
    try {
      const { session_id, code, device_info, trust_device } = req.body;
      
      if (!session_id || !code) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'Session ID and code are required'
        });
      }
      
      const deviceInfoExtended = {
        ...getDeviceInfo(req),
        ...device_info
      };
      
      const result = await authService.verify2FASetup(
        session_id,
        code,
        deviceInfoExtended,
        trust_device !== false
      );
      
      res.json(result);
    } catch (error: any) {
      console.error('2FA verify setup error:', error);
      res.status(400).json({
        success: false,
        error: 'invalid_code',
        message: error.message || 'Invalid verification code'
      });
    }
  });
  
  /**
   * POST /api/v1/auth/2fa/complete
   * Complete 2FA verification for existing user
   */
  router.post('/2fa/complete', async (req: Request, res: Response) => {
    try {
      const { session_id, code, is_backup_code, device_info, trust_device } = req.body;
      
      if (!session_id || !code) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'Session ID and code are required'
        });
      }
      
      const deviceInfoExtended = {
        ...getDeviceInfo(req),
        ...device_info
      };
      
      const result = await authService.complete2FA(
        session_id,
        code,
        is_backup_code || false,
        deviceInfoExtended,
        trust_device !== false
      );
      
      res.json(result);
    } catch (error: any) {
      console.error('2FA complete error:', error);
      res.status(400).json({
        success: false,
        error: 'invalid_code',
        message: error.message || 'Invalid verification code'
      });
    }
  });
  
  /**
   * POST /api/v1/auth/refresh
   * Refresh access token
   */
  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      const { refresh_token } = req.body;
      
      if (!refresh_token) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'Refresh token is required'
        });
      }
      
      const deviceInfo = getDeviceInfo(req);
      const result = await authService.refreshAccessToken(refresh_token, deviceInfo);
      
      res.json(result);
    } catch (error: any) {
      console.error('Refresh error:', error);
      
      if (error.message === 'token_expired') {
        return res.status(401).json({
          success: false,
          error: 'token_expired',
          message: 'Refresh token expired'
        });
      }
      
      res.status(401).json({
        success: false,
        error: 'invalid_token',
        message: error.message || 'Invalid refresh token'
      });
    }
  });
  
  /**
   * POST /api/v1/auth/revoke
   * Revoke refresh token (logout)
   */
  router.post('/revoke', async (req: Request, res: Response) => {
    try {
      const { refresh_token } = req.body;
      
      if (!refresh_token) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'Refresh token is required'
        });
      }
      
      await authService.revokeRefreshToken(refresh_token);
      
      res.json({
        success: true,
        message: 'Session revoked successfully'
      });
    } catch (error: any) {
      console.error('Revoke error:', error);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: 'Failed to revoke session'
      });
    }
  });
  
  /**
   * POST /api/v1/auth/revoke-all
   * Revoke all sessions (requires 2FA)
   */
  router.post('/revoke-all', requireAuth, async (req: Request, res: Response) => {
    try {
      const { code } = req.body;
      const userId = (req as any).userId;
      
      if (!code) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: '2FA code is required'
        });
      }
      
      const count = await authService.revokeAllRefreshTokens(userId, code);
      
      res.json({
        success: true,
        revoked_count: count,
        message: 'All sessions revoked. You have been signed out everywhere.'
      });
    } catch (error: any) {
      console.error('Revoke all error:', error);
      res.status(400).json({
        success: false,
        error: 'invalid_code',
        message: error.message || 'Invalid verification code'
      });
    }
  });
  
  /**
   * POST /api/v1/auth/2fa/disable
   * Disable 2FA (requires TOTP code)
   */
  router.post('/2fa/disable', requireAuth, async (req: Request, res: Response) => {
    try {
      const { code } = req.body;
      const userId = (req as any).userId;
      
      if (!code) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'Verification code is required'
        });
      }
      
      await authService.disable2FA(userId, code);
      
      res.json({
        success: true,
        message: '2FA disabled. You can re-enable it anytime in settings.'
      });
    } catch (error: any) {
      console.error('Disable 2FA error:', error);
      res.status(400).json({
        success: false,
        error: 'invalid_code',
        message: error.message || 'Invalid verification code'
      });
    }
  });
  
  /**
   * POST /api/v1/auth/2fa/backup-codes/regenerate
   * Regenerate backup codes
   */
  router.post('/2fa/backup-codes/regenerate', requireAuth, async (req: Request, res: Response) => {
    try {
      const { code } = req.body;
      const userId = (req as any).userId;
      
      if (!code) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'Verification code is required'
        });
      }
      
      const backupCodes = await authService.regenerateBackupCodes(userId, code);
      
      res.json({
        success: true,
        backup_codes: backupCodes,
        message: 'All previous backup codes have been invalidated'
      });
    } catch (error: any) {
      console.error('Regenerate backup codes error:', error);
      res.status(400).json({
        success: false,
        error: 'invalid_code',
        message: error.message || 'Invalid verification code'
      });
    }
  });
  
  /**
   * GET /api/v1/auth/devices
   * Get trusted devices
   */
  router.get('/devices', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const devices = await authService.getTrustedDevices(userId);
      
      res.json({
        devices
      });
    } catch (error: any) {
      console.error('Get devices error:', error);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: 'Failed to retrieve devices'
      });
    }
  });
  
  /**
   * PATCH /api/v1/auth/devices/:id
   * Update device name
   */
  router.patch('/devices/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const deviceId = parseInt(req.params.id, 10);
      const { name } = req.body;
      
      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'Device name is required'
        });
      }
      
      await authService.updateDeviceName(userId, deviceId, name);
      
      res.json({
        success: true,
        message: 'Device name updated'
      });
    } catch (error: any) {
      console.error('Update device error:', error);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: 'Failed to update device'
      });
    }
  });
  
  /**
   * DELETE /api/v1/auth/devices/:id
   * Revoke device trust
   */
  router.delete('/devices/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const deviceId = parseInt(req.params.id, 10);
      const { code } = req.body;
      
      if (!code) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: '2FA code is required'
        });
      }
      
      await authService.revokeDeviceTrust(userId, deviceId, code);
      
      res.json({
        success: true,
        message: 'Device trust revoked. Next login will require 2FA.'
      });
    } catch (error: any) {
      console.error('Revoke device error:', error);
      res.status(400).json({
        success: false,
        error: 'invalid_code',
        message: error.message || 'Invalid verification code'
      });
    }
  });
  
  /**
   * POST /api/v1/user/email/request-change
   * Request email change
   */
  router.post('/user/email/request-change', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { new_email, code } = req.body;
      
      if (!new_email || !code) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'New email and verification code are required'
        });
      }
      
      await authService.requestEmailChange(userId, new_email, code);
      
      res.json({
        success: true,
        message: 'Email change requested. Check both old and new emails for confirmation links.'
      });
    } catch (error: any) {
      console.error('Request email change error:', error);
      res.status(400).json({
        success: false,
        error: 'invalid_request',
        message: error.message || 'Failed to request email change'
      });
    }
  });
  
  /**
   * GET /api/v1/user/email/confirm-change
   * Confirm old email
   */
  router.get('/user/email/confirm-change', async (req: Request, res: Response) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'Token is required'
        });
      }
      
      const result = await authService.confirmOldEmail(token);
      res.json(result);
    } catch (error: any) {
      console.error('Confirm old email error:', error);
      res.status(400).json({
        success: false,
        error: 'invalid_token',
        message: error.message || 'Invalid or expired token'
      });
    }
  });
  
  /**
   * GET /api/v1/user/email/verify-new
   * Verify new email
   */
  router.get('/user/email/verify-new', async (req: Request, res: Response) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'Token is required'
        });
      }
      
      const result = await authService.verifyNewEmail(token);
      res.json(result);
    } catch (error: any) {
      console.error('Verify new email error:', error);
      res.status(400).json({
        success: false,
        error: 'invalid_token',
        message: error.message || 'Invalid or expired token'
      });
    }
  });
  
  /**
   * POST /api/v1/user/email/cancel-change
   * Cancel email change
   */
  router.post('/user/email/cancel-change', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { code } = req.body;
      
      if (!code) {
        return res.status(400).json({
          success: false,
          error: 'invalid_request',
          message: 'Verification code is required'
        });
      }
      
      await authService.cancelEmailChange(userId, code);
      
      res.json({
        success: true,
        message: 'Email change cancelled'
      });
    } catch (error: any) {
      console.error('Cancel email change error:', error);
      res.status(400).json({
        success: false,
        error: 'invalid_code',
        message: error.message || 'Invalid verification code'
      });
    }
  });
  
  return router;
}

export default createAuthRoutes;
