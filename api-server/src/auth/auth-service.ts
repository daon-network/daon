/**
 * Authentication Service
 * 
 * Core service for handling authentication flows including:
 * - Magic link generation and verification
 * - 2FA setup and verification
 * - Token management (access + refresh)
 * - Device trust management
 */

import crypto from 'crypto';
import { DatabaseClient } from '../database/client.js';
import { generateAccessToken, generateRefreshToken, getAccessTokenLifetime, getRefreshTokenLifetime } from '../utils/jwt.js';
import { generateTotpSecret, verifyTotpCode, generateTotpUrl, formatTotpSecret } from '../utils/totp.js';
import { generateQRCodeUrl } from '../utils/qr-code.js';
import { generateBackupCodes, hashBackupCodes, verifyBackupCode, markBackupCodeUsed } from '../utils/backup-codes.js';
import { encryptTotpSecret, decryptTotpSecret } from '../utils/encryption.js';
import { sendMagicLinkEmail, sendEmailChangeConfirmation, sendEmailChangeVerification, sendNewDeviceNotification } from '../utils/email.js';

const DEVICE_TRUST_LIFETIME = parseInt(process.env.DEVICE_TRUST_LIFETIME || '2592000', 10); // 30 days
const MAGIC_LINK_LIFETIME = 1800; // 30 minutes
const TEMP_SESSION_LIFETIME = 300; // 5 minutes

export interface DeviceInfo {
  user_agent: string;
  ip: string;
  screen?: string;
  timezone?: string;
  device_id?: string;
  device_fingerprint?: string;
}

export interface AuthResult {
  requires_2fa: boolean;
  session_id?: string;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  backup_codes?: string[];
  user?: {
    id: number;
    email?: string;
    username?: string;
    totp_enabled: boolean;
  };
}

export class AuthService {
  constructor(private db: DatabaseClient) {}
  
  /**
   * Generate and send magic link for email authentication
   */
  async sendMagicLink(email: string): Promise<{ success: boolean; message: string }> {
    // Find or create user
    let user = await this.db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    
    let userId: number;
    if (user.rows.length === 0) {
      // Create new user
      const result = await this.db.query(
        'INSERT INTO users (email, email_verified, created_at) VALUES ($1, FALSE, NOW()) RETURNING id',
        [email]
      );
      userId = result.rows[0].id;
    } else {
      userId = user.rows[0].id;
    }
    
    // Generate magic link token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + MAGIC_LINK_LIFETIME * 1000);
    
    // Store magic link
    const magicLinkResult = await this.db.query(
      'INSERT INTO magic_links (user_id, token, email, expires_at, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
      [userId, token, email, expiresAt]
    );
    const magicLinkId = magicLinkResult.rows[0].id;
    
    // Send email with magic link
    try {
      await sendMagicLinkEmail(email, token, magicLinkId);
    } catch (error) {
      console.error('Failed to send magic link email:', error);
      // Don't fail the request if email fails - status tracked in database
    }
    
    // Log activity
    await this.logActivity(userId, 'magic_link_sent', 'user', userId);
    
    return {
      success: true,
      message: 'Magic link sent! Check your email.'
    };
  }
  
  /**
   * Verify magic link token and determine if 2FA is required
   */
  async verifyMagicLink(token: string, deviceInfo: DeviceInfo): Promise<AuthResult> {
    // Verify token
    const result = await this.db.query(
      'SELECT ml.user_id, ml.email, u.totp_enabled FROM magic_links ml JOIN users u ON ml.user_id = u.id WHERE ml.token = $1 AND ml.expires_at > NOW() AND ml.used_at IS NULL',
      [token]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Invalid or expired magic link');
    }
    
    const { user_id: userId, email, totp_enabled } = result.rows[0];
    
    // Mark magic link as used
    await this.db.query(
      'UPDATE magic_links SET used_at = NOW() WHERE token = $1',
      [token]
    );
    
    // Check if device is trusted
    const deviceId = deviceInfo.device_id || '';
    const deviceFingerprint = deviceInfo.device_fingerprint || '';
    
    const trustedDevice = await this.db.query(
      'SELECT id FROM trusted_devices WHERE user_id = $1 AND (device_id = $2 OR device_fingerprint = $3) AND trusted_until > NOW() AND revoked_at IS NULL',
      [userId, deviceId, deviceFingerprint]
    );
    
    // If 2FA enabled and device not trusted, require 2FA
    if (totp_enabled && trustedDevice.rows.length === 0) {
      // Create temporary session
      const sessionId = await this.createTempSession(userId, '2fa_verify');
      
      return {
        requires_2fa: true,
        session_id: sessionId,
        user: {
          id: userId,
          email,
          username: email.split('@')[0],
          totp_enabled: true
        }
      };
    }
    
    // If 2FA not enabled, require setup
    if (!totp_enabled) {
      const sessionId = await this.createTempSession(userId, '2fa_setup');
      
      return {
        requires_2fa: true,
        session_id: sessionId,
        user: {
          id: userId,
          email,
          username: email.split('@')[0],
          totp_enabled: false
        }
      };
    }
    
    // Device trusted, issue tokens
    return await this.issueTokens(userId, deviceInfo, true);
  }
  
  /**
   * Setup 2FA for new user
   */
  async setup2FA(sessionId: string): Promise<{
    secret: string;
    qr_code: string;
    manual_entry_key: string;
    issuer: string;
    account_name: string;
  }> {
    // Verify session
    const session = await this.verifyTempSession(sessionId, '2fa_setup');
    
    // Get user email
    const user = await this.db.query(
      'SELECT email FROM users WHERE id = $1',
      [session.user_id]
    );
    
    if (user.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const email = user.rows[0].email;
    
    // Generate TOTP secret
    const secret = generateTotpSecret();
    const otpauthUrl = generateTotpUrl(secret, email);
    const qrCode = await generateQRCodeUrl(otpauthUrl);
    
    // Store secret in session for verification
    await this.db.query(
      'UPDATE temp_sessions SET flow_data = $1 WHERE session_id = $2',
      [JSON.stringify({ totp_secret: secret }), sessionId]
    );
    
    return {
      secret,
      qr_code: qrCode,
      manual_entry_key: formatTotpSecret(secret),
      issuer: process.env.TOTP_ISSUER || 'DAON',
      account_name: email
    };
  }
  
  /**
   * Verify 2FA setup and enable 2FA for user
   */
  async verify2FASetup(
    sessionId: string,
    code: string,
    deviceInfo: DeviceInfo,
    trustDevice: boolean = true
  ): Promise<AuthResult> {
    // Verify session
    const session = await this.verifyTempSession(sessionId, '2fa_setup');
    
    // Get secret from session
    const flowData = session.flow_data as { totp_secret: string };
    if (!flowData || !flowData.totp_secret) {
      throw new Error('Invalid session state');
    }
    
    // Verify code
    if (!verifyTotpCode(flowData.totp_secret, code)) {
      await this.incrementSessionAttempts(sessionId);
      throw new Error('Invalid verification code');
    }
    
    // Generate backup codes
    const backupCodes = generateBackupCodes(10);
    const hashedCodes = await hashBackupCodes(backupCodes);
    
    // Encrypt secret and enable 2FA
    const encryptedSecret = encryptTotpSecret(flowData.totp_secret);
    await this.db.query(
      'UPDATE users SET totp_secret = $1, totp_enabled = TRUE, totp_enabled_at = NOW(), backup_codes_hash = $2 WHERE id = $3',
      [encryptedSecret, JSON.stringify(hashedCodes), session.user_id]
    );
    
    // Mark session as complete
    await this.completeTempSession(sessionId);
    
    // Log activity
    await this.logActivity(session.user_id, '2fa_setup_completed', 'user', session.user_id);
    
    // Issue tokens
    const result = await this.issueTokens(session.user_id, deviceInfo, trustDevice);
    
    return {
      ...result,
      backup_codes: backupCodes // Only time we return plaintext codes
    };
  }
  
  /**
   * Complete 2FA verification (existing user, new device)
   */
  async complete2FA(
    sessionId: string,
    code: string,
    isBackupCode: boolean,
    deviceInfo: DeviceInfo,
    trustDevice: boolean = true
  ): Promise<AuthResult> {
    // Verify session
    const session = await this.verifyTempSession(sessionId, '2fa_verify');
    
    // Get user's TOTP secret and backup codes
    const user = await this.db.query(
      'SELECT totp_secret, backup_codes_hash FROM users WHERE id = $1 AND totp_enabled = TRUE',
      [session.user_id]
    );
    
    if (user.rows.length === 0) {
      throw new Error('2FA not enabled for user');
    }
    
    const { totp_secret, backup_codes_hash } = user.rows[0];
    
    if (isBackupCode) {
      // Verify backup code
      const hashedCodes = JSON.parse(backup_codes_hash);
      const index = await verifyBackupCode(code, hashedCodes);
      
      if (index === -1) {
        await this.incrementSessionAttempts(sessionId);
        throw new Error('Invalid backup code');
      }
      
      // Mark code as used
      const updatedCodes = markBackupCodeUsed(hashedCodes, index);
      await this.db.query(
        'UPDATE users SET backup_codes_hash = $1 WHERE id = $2',
        [JSON.stringify(updatedCodes), session.user_id]
      );
      
      await this.logActivity(session.user_id, 'backup_code_used', 'user', session.user_id);
    } else {
      // Verify TOTP code
      const secret = decryptTotpSecret(totp_secret);
      if (!verifyTotpCode(secret, code)) {
        await this.incrementSessionAttempts(sessionId);
        throw new Error('Invalid verification code');
      }
      
      await this.logActivity(session.user_id, '2fa_verified', 'user', session.user_id);
    }
    
    // Mark session as complete
    await this.completeTempSession(sessionId);
    
    // Issue tokens
    return await this.issueTokens(session.user_id, deviceInfo, trustDevice);
  }
  
  /**
   * Issue access and refresh tokens
   */
  private async issueTokens(
    userId: number,
    deviceInfo: DeviceInfo,
    trustDevice: boolean
  ): Promise<AuthResult> {
    // Generate tokens
    const accessToken = generateAccessToken(userId);
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + getRefreshTokenLifetime() * 1000);
    
    // Store refresh token
    await this.db.query(
      'INSERT INTO refresh_tokens (token, user_id, device_id, device_fingerprint, device_info, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
      [refreshToken, userId, deviceInfo.device_id, deviceInfo.device_fingerprint, JSON.stringify(deviceInfo), expiresAt]
    );
    
    // Create trusted device if requested
    if (trustDevice) {
      await this.trustDevice(userId, deviceInfo);
    }
    
    // Get user info
    const user = await this.db.query(
      'SELECT email, username, totp_enabled FROM users WHERE id = $1',
      [userId]
    );
    
    // Update last login
    await this.db.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [userId]
    );
    
    await this.logActivity(userId, 'login', 'user', userId, deviceInfo);
    
    return {
      requires_2fa: false,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: getAccessTokenLifetime(),
      user: {
        id: userId,
        email: user.rows[0].email,
        username: user.rows[0].username,
        totp_enabled: user.rows[0].totp_enabled
      }
    };
  }
  
  /**
   * Create temporary session for 2FA flows
   */
  private async createTempSession(userId: number, flowType: string): Promise<string> {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TEMP_SESSION_LIFETIME * 1000);
    
    await this.db.query(
      'INSERT INTO temp_sessions (session_id, user_id, flow_type, expires_at, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [sessionId, userId, flowType, expiresAt]
    );
    
    return sessionId;
  }
  
  /**
   * Verify temporary session
   */
  private async verifyTempSession(sessionId: string, expectedFlowType: string): Promise<any> {
    const result = await this.db.query(
      'SELECT user_id, flow_type, flow_data, attempts, max_attempts FROM temp_sessions WHERE session_id = $1 AND expires_at > NOW() AND completed_at IS NULL',
      [sessionId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Invalid or expired session');
    }
    
    const session = result.rows[0];
    
    if (session.flow_type !== expectedFlowType) {
      throw new Error('Invalid session flow type');
    }
    
    if (session.attempts >= session.max_attempts) {
      throw new Error('Maximum attempts exceeded');
    }
    
    return session;
  }
  
  /**
   * Mark temporary session as complete
   */
  private async completeTempSession(sessionId: string): Promise<void> {
    await this.db.query(
      'UPDATE temp_sessions SET completed_at = NOW() WHERE session_id = $1',
      [sessionId]
    );
  }
  
  /**
   * Increment session attempt counter
   */
  private async incrementSessionAttempts(sessionId: string): Promise<void> {
    await this.db.query(
      'UPDATE temp_sessions SET attempts = attempts + 1 WHERE session_id = $1',
      [sessionId]
    );
  }
  
  /**
   * Trust a device
   */
  private async trustDevice(userId: number, deviceInfo: DeviceInfo): Promise<void> {
    const trustedUntil = new Date(Date.now() + DEVICE_TRUST_LIFETIME * 1000);
    const deviceName = this.generateDeviceName(deviceInfo.user_agent);
    
    // Upsert trusted device
    await this.db.query(
      `INSERT INTO trusted_devices (user_id, device_id, device_fingerprint, device_name, device_info, trusted_at, trusted_until)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)
       ON CONFLICT (user_id, device_id) DO UPDATE SET
         device_fingerprint = $3,
         device_info = $5,
         trusted_at = NOW(),
         trusted_until = $6,
         last_used_at = NOW(),
         revoked_at = NULL`,
      [userId, deviceInfo.device_id, deviceInfo.device_fingerprint, deviceName, JSON.stringify(deviceInfo), trustedUntil]
    );
    
    await this.logActivity(userId, 'device_trusted', 'device', null, deviceInfo);
  }
  
  /**
   * Generate friendly device name from user agent
   */
  private generateDeviceName(userAgent: string): string {
    if (userAgent.includes('Chrome')) return 'Chrome Browser';
    if (userAgent.includes('Firefox')) return 'Firefox Browser';
    if (userAgent.includes('Safari')) return 'Safari Browser';
    if (userAgent.includes('Edge')) return 'Edge Browser';
    if (userAgent.includes('iPhone')) return 'iPhone';
    if (userAgent.includes('iPad')) return 'iPad';
    if (userAgent.includes('Android')) return 'Android Device';
    return 'Unknown Device';
  }
  
  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string, deviceInfo: DeviceInfo): Promise<AuthResult> {
    // Verify refresh token exists and not expired
    const result = await this.db.query(
      'SELECT user_id, device_id, device_fingerprint FROM refresh_tokens WHERE token = $1 AND expires_at > NOW() AND revoked_at IS NULL',
      [refreshToken]
    );
    
    if (result.rows.length === 0) {
      throw new Error('token_expired');
    }
    
    const { user_id: userId, device_id: storedDeviceId, device_fingerprint: storedFingerprint } = result.rows[0];
    
    // Verify device matches (either device_id or fingerprint)
    const deviceMatches = 
      (deviceInfo.device_id && deviceInfo.device_id === storedDeviceId) ||
      (deviceInfo.device_fingerprint && deviceInfo.device_fingerprint === storedFingerprint);
    
    if (!deviceMatches) {
      throw new Error('device_mismatch');
    }
    
    // Check if device trust is still valid
    const trustedDevice = await this.db.query(
      'SELECT id FROM trusted_devices WHERE user_id = $1 AND (device_id = $2 OR device_fingerprint = $3) AND trusted_until > NOW() AND revoked_at IS NULL',
      [userId, deviceInfo.device_id, deviceInfo.device_fingerprint]
    );
    
    if (trustedDevice.rows.length === 0) {
      // Device trust expired, require 2FA
      const sessionId = await this.createTempSession(userId, '2fa_verify');
      const user = await this.db.query('SELECT email, username, totp_enabled FROM users WHERE id = $1', [userId]);
      
      return {
        requires_2fa: true,
        session_id: sessionId,
        user: {
          id: userId,
          email: user.rows[0].email,
          username: user.rows[0].username,
          totp_enabled: user.rows[0].totp_enabled
        }
      };
    }
    
    // Update last used timestamp
    await this.db.query(
      'UPDATE refresh_tokens SET last_used_at = NOW() WHERE token = $1',
      [refreshToken]
    );
    
    await this.db.query(
      'UPDATE trusted_devices SET last_used_at = NOW() WHERE user_id = $1 AND (device_id = $2 OR device_fingerprint = $3)',
      [userId, deviceInfo.device_id, deviceInfo.device_fingerprint]
    );
    
    // Generate new access token
    const accessToken = generateAccessToken(userId);
    
    // Optionally rotate refresh token
    let newRefreshToken = refreshToken;
    if (process.env.ENABLE_REFRESH_TOKEN_ROTATION === 'true') {
      newRefreshToken = generateRefreshToken();
      const expiresAt = new Date(Date.now() + getRefreshTokenLifetime() * 1000);
      
      await this.db.query(
        'INSERT INTO refresh_tokens (token, user_id, device_id, device_fingerprint, device_info, expires_at, rotated_from_token, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
        [newRefreshToken, userId, deviceInfo.device_id, deviceInfo.device_fingerprint, JSON.stringify(deviceInfo), expiresAt, refreshToken]
      );
      
      await this.db.query(
        'UPDATE refresh_tokens SET revoked_at = NOW(), revoke_reason = $1 WHERE token = $2',
        ['rotated', refreshToken]
      );
    }
    
    await this.logActivity(userId, 'access_token_refreshed', 'user', userId);
    
    const user = await this.db.query('SELECT email, username, totp_enabled FROM users WHERE id = $1', [userId]);
    
    return {
      requires_2fa: false,
      access_token: accessToken,
      refresh_token: newRefreshToken !== refreshToken ? newRefreshToken : undefined,
      token_type: 'Bearer',
      expires_in: getAccessTokenLifetime(),
      user: {
        id: userId,
        email: user.rows[0].email,
        username: user.rows[0].username,
        totp_enabled: user.rows[0].totp_enabled
      }
    };
  }
  
  /**
   * Revoke refresh token (logout)
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW(), revoke_reason = $1 WHERE token = $2',
      ['user_logout', refreshToken]
    );
  }
  
  /**
   * Revoke all refresh tokens for user (logout everywhere)
   */
  async revokeAllRefreshTokens(userId: number, totpCode: string): Promise<number> {
    // Verify 2FA code
    const user = await this.db.query(
      'SELECT totp_secret FROM users WHERE id = $1 AND totp_enabled = TRUE',
      [userId]
    );
    
    if (user.rows.length === 0) {
      throw new Error('2FA not enabled');
    }
    
    const secret = decryptTotpSecret(user.rows[0].totp_secret);
    if (!verifyTotpCode(secret, totpCode)) {
      throw new Error('Invalid verification code');
    }
    
    // Revoke all tokens
    const result = await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW(), revoke_reason = $1 WHERE user_id = $2 AND revoked_at IS NULL RETURNING id',
      ['user_revoked_all', userId]
    );
    
    await this.logActivity(userId, 'all_sessions_revoked', 'user', userId);
    
    return result.rows.length;
  }
  
  /**
   * Disable 2FA (requires current TOTP code)
   */
  async disable2FA(userId: number, totpCode: string): Promise<void> {
    // Verify current TOTP code
    const user = await this.db.query(
      'SELECT totp_secret FROM users WHERE id = $1 AND totp_enabled = TRUE',
      [userId]
    );
    
    if (user.rows.length === 0) {
      throw new Error('2FA not enabled');
    }
    
    const secret = decryptTotpSecret(user.rows[0].totp_secret);
    if (!verifyTotpCode(secret, totpCode)) {
      throw new Error('Invalid verification code');
    }
    
    // Disable 2FA
    await this.db.query(
      'UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, backup_codes_hash = NULL WHERE id = $1',
      [userId]
    );
    
    // Revoke all trusted devices
    await this.db.query(
      'UPDATE trusted_devices SET revoked_at = NOW(), revoke_reason = $1 WHERE user_id = $2',
      ['2fa_disabled', userId]
    );
    
    await this.logActivity(userId, '2fa_disabled', 'user', userId);
  }
  
  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(userId: number, totpCode: string): Promise<string[]> {
    // Verify current TOTP code
    const user = await this.db.query(
      'SELECT totp_secret FROM users WHERE id = $1 AND totp_enabled = TRUE',
      [userId]
    );
    
    if (user.rows.length === 0) {
      throw new Error('2FA not enabled');
    }
    
    const secret = decryptTotpSecret(user.rows[0].totp_secret);
    if (!verifyTotpCode(secret, totpCode)) {
      throw new Error('Invalid verification code');
    }
    
    // Generate new backup codes
    const backupCodes = generateBackupCodes(10);
    const hashedCodes = await hashBackupCodes(backupCodes);
    
    // Update database
    await this.db.query(
      'UPDATE users SET backup_codes_hash = $1 WHERE id = $2',
      [JSON.stringify(hashedCodes), userId]
    );
    
    await this.logActivity(userId, 'backup_codes_regenerated', 'user', userId);
    
    return backupCodes;
  }
  
  /**
   * Get user's trusted devices
   */
  async getTrustedDevices(userId: number): Promise<any[]> {
    const result = await this.db.query(
      'SELECT id, device_id, device_fingerprint, device_name, device_info, trusted_at, trusted_until, last_used_at FROM trusted_devices WHERE user_id = $1 AND revoked_at IS NULL ORDER BY last_used_at DESC',
      [userId]
    );
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.device_name,
      device_info: row.device_info,
      trusted_at: row.trusted_at,
      trusted_until: row.trusted_until,
      last_used_at: row.last_used_at,
      is_current: false // Will be set by endpoint based on current device
    }));
  }
  
  /**
   * Update device name
   */
  async updateDeviceName(userId: number, deviceId: number, name: string): Promise<void> {
    await this.db.query(
      'UPDATE trusted_devices SET device_name = $1 WHERE id = $2 AND user_id = $3',
      [name, deviceId, userId]
    );
  }
  
  /**
   * Revoke device trust
   */
  async revokeDeviceTrust(userId: number, deviceId: number, totpCode: string): Promise<void> {
    // Verify 2FA code
    const user = await this.db.query(
      'SELECT totp_secret FROM users WHERE id = $1 AND totp_enabled = TRUE',
      [userId]
    );
    
    if (user.rows.length === 0) {
      throw new Error('2FA not enabled');
    }
    
    const secret = decryptTotpSecret(user.rows[0].totp_secret);
    if (!verifyTotpCode(secret, totpCode)) {
      throw new Error('Invalid verification code');
    }
    
    // Revoke device
    await this.db.query(
      'UPDATE trusted_devices SET revoked_at = NOW(), revoke_reason = $1 WHERE id = $2 AND user_id = $3',
      ['user_revoked', deviceId, userId]
    );
    
    await this.logActivity(userId, 'device_trust_revoked', 'device', deviceId);
  }
  
  /**
   * Request email change
   */
  async requestEmailChange(userId: number, newEmail: string, totpCode: string): Promise<void> {
    // Verify 2FA code
    const user = await this.db.query(
      'SELECT email, totp_secret FROM users WHERE id = $1 AND totp_enabled = TRUE',
      [userId]
    );
    
    if (user.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const secret = decryptTotpSecret(user.rows[0].totp_secret);
    if (!verifyTotpCode(secret, totpCode)) {
      throw new Error('Invalid verification code');
    }
    
    const oldEmail = user.rows[0].email;
    
    // Generate tokens
    const oldEmailToken = crypto.randomBytes(32).toString('hex');
    const newEmailToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 86400 * 1000); // 24 hours
    
    // Store request
    await this.db.query(
      'INSERT INTO email_change_requests (user_id, old_email, new_email, old_email_token, new_email_token, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
      [userId, oldEmail, newEmail, oldEmailToken, newEmailToken, expiresAt]
    );
    
    // Send confirmation email to old address
    try {
      await sendEmailChangeConfirmation(oldEmail, newEmail, oldEmailToken);
    } catch (error) {
      console.error('Failed to send email change confirmation:', error);
    }
    
    await this.logActivity(userId, 'email_change_requested', 'user', userId, { old_email: oldEmail, new_email: newEmail });
  }
  
  /**
   * Confirm old email for email change
   */
  async confirmOldEmail(token: string): Promise<{ success: boolean; message: string }> {
    const result = await this.db.query(
      'SELECT id, user_id, new_email, new_email_token FROM email_change_requests WHERE old_email_token = $1 AND expires_at > NOW() AND old_email_confirmed_at IS NULL AND cancelled_at IS NULL',
      [token]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Invalid or expired token');
    }
    
    const { id, user_id: userId, new_email, new_email_token } = result.rows[0];
    
    // Mark old email as confirmed
    await this.db.query(
      'UPDATE email_change_requests SET old_email_confirmed_at = NOW() WHERE id = $1',
      [id]
    );
    
    // Send verification email to new address
    try {
      await sendEmailChangeVerification(new_email, new_email_token);
    } catch (error) {
      console.error('Failed to send email verification:', error);
    }
    
    return {
      success: true,
      message: 'Old email confirmed. Please check new email for verification link.'
    };
  }
  
  /**
   * Verify new email and complete email change
   */
  async verifyNewEmail(token: string): Promise<{ success: boolean; message: string }> {
    const result = await this.db.query(
      'SELECT id, user_id, old_email, new_email, old_email_confirmed_at FROM email_change_requests WHERE new_email_token = $1 AND expires_at > NOW() AND new_email_confirmed_at IS NULL AND cancelled_at IS NULL',
      [token]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Invalid or expired token');
    }
    
    const { id, user_id: userId, old_email, new_email, old_email_confirmed_at } = result.rows[0];
    
    if (!old_email_confirmed_at) {
      throw new Error('Old email not yet confirmed');
    }
    
    // Mark new email as confirmed
    await this.db.query(
      'UPDATE email_change_requests SET new_email_confirmed_at = NOW(), completed_at = NOW() WHERE id = $1',
      [id]
    );
    
    // Update user email
    await this.db.query(
      'UPDATE users SET email = $1 WHERE id = $2',
      [new_email, userId]
    );
    
    // TODO: Send notification to old email
    console.log(`Email changed from ${old_email} to ${new_email}`);
    
    await this.logActivity(userId, 'email_change_completed', 'user', userId, { old_email, new_email });
    
    return {
      success: true,
      message: 'Email changed successfully!'
    };
  }
  
  /**
   * Cancel email change
   */
  async cancelEmailChange(userId: number, totpCode: string): Promise<void> {
    // Verify 2FA code
    const user = await this.db.query(
      'SELECT totp_secret FROM users WHERE id = $1 AND totp_enabled = TRUE',
      [userId]
    );
    
    if (user.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const secret = decryptTotpSecret(user.rows[0].totp_secret);
    if (!verifyTotpCode(secret, totpCode)) {
      throw new Error('Invalid verification code');
    }
    
    // Cancel pending requests
    await this.db.query(
      'UPDATE email_change_requests SET cancelled_at = NOW() WHERE user_id = $1 AND completed_at IS NULL AND cancelled_at IS NULL',
      [userId]
    );
    
    await this.logActivity(userId, 'email_change_cancelled', 'user', userId);
  }
  
  /**
   * Log activity
   */
  private async logActivity(
    userId: number,
    action: string,
    entityType: string,
    entityId: number | null,
    metadata?: any
  ): Promise<void> {
    await this.db.query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, metadata, ip_address, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
      [userId, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null, metadata?.ip || null]
    );
  }
}
