/**
 * DAON Broker Service
 * 
 * Handles broker authentication, validation, and security
 * Production-grade implementation with full security controls
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
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
    new winston.transports.File({ filename: 'logs/broker-security.log', level: 'warn' })
  ]
});

export interface Broker {
  id: number;
  domain: string;
  name: string;
  certification_tier: 'community' | 'standard' | 'enterprise';
  certification_status: 'pending' | 'active' | 'suspended' | 'revoked';
  enabled: boolean;
  rate_limit_per_hour: number;
  rate_limit_per_day: number;
  require_signature: boolean;
  public_key?: string;
}

export interface BrokerApiKey {
  id: number;
  broker_id: number;
  key_prefix: string;
  scopes: string[];
  expires_at?: Date;
  revoked_at?: Date;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining_hourly: number;
  remaining_daily: number;
  reset_hourly: Date;
  reset_daily: Date;
}

export interface SecurityEvent {
  broker_id: number;
  event_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  ip_address?: string;
  endpoint?: string;
  request_data?: any;
  auto_action?: string;
}

export class BrokerService {
  private db: DatabaseClient;
  private BCRYPT_ROUNDS = 12;
  private KEY_PREFIX_LENGTH = 16;
  
  constructor(db: DatabaseClient) {
    this.db = db;
  }

  /**
   * Authenticate broker by API key
   * Validates key, checks expiration, and verifies broker status
   */
  async authenticateBroker(apiKey: string): Promise<{ broker: Broker; apiKey: BrokerApiKey } | null> {
    try {
      // Extract prefix (first 16 chars)
      const prefix = apiKey.substring(0, this.KEY_PREFIX_LENGTH);
      
      // Look up key by prefix for faster query
      const result = await this.db.query(`
        SELECT 
          bak.id, bak.broker_id, bak.key_hash, bak.key_prefix, bak.scopes,
          bak.expires_at, bak.revoked_at, bak.last_used_at,
          b.id as broker_id, b.domain, b.name, b.certification_tier,
          b.certification_status, b.enabled, b.rate_limit_per_hour,
          b.rate_limit_per_day, b.require_signature, b.public_key,
          b.suspended_at, b.revoked_at as broker_revoked_at
        FROM broker_api_keys bak
        JOIN brokers b ON bak.broker_id = b.id
        WHERE bak.key_prefix = $1
          AND bak.revoked_at IS NULL
        LIMIT 1
      `, [prefix]);

      if (result.rows.length === 0) {
        logger.warn(`Broker authentication failed: Invalid API key prefix: ${prefix}`);
        return null;
      }

      const row = result.rows[0];
      
      // Verify key hash using bcrypt
      const isValidKey = await bcrypt.compare(apiKey, row.key_hash);
      
      if (!isValidKey) {
        logger.warn(`Broker authentication failed: Invalid API key hash for prefix: ${prefix}`);
        await this.logSecurityEvent({
          broker_id: row.broker_id,
          event_type: 'invalid_api_key',
          severity: 'medium',
          description: 'Invalid API key hash provided',
        });
        return null;
      }

      // Check if key is expired
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        logger.warn(`Broker authentication failed: Expired API key for broker ${row.domain}`);
        await this.logSecurityEvent({
          broker_id: row.broker_id,
          event_type: 'expired_api_key',
          severity: 'low',
          description: 'Attempted to use expired API key',
        });
        return null;
      }

      // Check broker status
      if (!row.enabled) {
        logger.warn(`Broker authentication failed: Broker ${row.domain} is disabled`);
        return null;
      }

      if (row.certification_status !== 'active') {
        logger.warn(`Broker authentication failed: Broker ${row.domain} status is ${row.certification_status}`);
        return null;
      }

      if (row.suspended_at) {
        logger.warn(`Broker authentication failed: Broker ${row.domain} is suspended`);
        return null;
      }

      if (row.broker_revoked_at) {
        logger.warn(`Broker authentication failed: Broker ${row.domain} is revoked`);
        return null;
      }

      // Update last used timestamp
      await this.db.query(`
        UPDATE broker_api_keys 
        SET last_used_at = NOW(),
            total_requests = total_requests + 1
        WHERE id = $1
      `, [row.id]);

      const broker: Broker = {
        id: row.broker_id,
        domain: row.domain,
        name: row.name,
        certification_tier: row.certification_tier,
        certification_status: row.certification_status,
        enabled: row.enabled,
        rate_limit_per_hour: row.rate_limit_per_hour,
        rate_limit_per_day: row.rate_limit_per_day,
        require_signature: row.require_signature,
        public_key: row.public_key,
      };

      const apiKeyData: BrokerApiKey = {
        id: row.id,
        broker_id: row.broker_id,
        key_prefix: row.key_prefix,
        scopes: row.scopes,
        expires_at: row.expires_at ? new Date(row.expires_at) : undefined,
        revoked_at: row.revoked_at ? new Date(row.revoked_at) : undefined,
      };

      logger.info(`Broker authenticated successfully: ${broker.domain} (${broker.certification_tier})`);

      return { broker, apiKey: apiKeyData };
    } catch (error) {
      logger.error('Broker authentication error:', error);
      throw error;
    }
  }

  /**
   * Check and enforce rate limits for broker
   */
  async checkRateLimit(brokerId: number, endpoint: string): Promise<RateLimitResult> {
    const now = new Date();
    const hourBucket = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    const dayBucket = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    try {
      // Get broker limits
      const brokerResult = await this.db.query(`
        SELECT rate_limit_per_hour, rate_limit_per_day
        FROM brokers
        WHERE id = $1
      `, [brokerId]);

      if (brokerResult.rows.length === 0) {
        throw new Error('Broker not found');
      }

      const { rate_limit_per_hour, rate_limit_per_day } = brokerResult.rows[0];

      // Get or create hourly bucket
      const hourlyResult = await this.db.query(`
        INSERT INTO broker_rate_limits (broker_id, time_bucket, bucket_type, request_count)
        VALUES ($1, $2, 'hour', 1)
        ON CONFLICT (broker_id, time_bucket, bucket_type)
        DO UPDATE SET 
          request_count = broker_rate_limits.request_count + 1,
          last_request_at = NOW()
        RETURNING request_count
      `, [brokerId, hourBucket]);

      const hourlyCount = hourlyResult.rows[0].request_count;

      // Get or create daily bucket
      const dailyResult = await this.db.query(`
        INSERT INTO broker_rate_limits (broker_id, time_bucket, bucket_type, request_count)
        VALUES ($1, $2, 'day', 1)
        ON CONFLICT (broker_id, time_bucket, bucket_type)
        DO UPDATE SET 
          request_count = broker_rate_limits.request_count + 1,
          last_request_at = NOW()
        RETURNING request_count
      `, [brokerId, dayBucket]);

      const dailyCount = dailyResult.rows[0].request_count;

      // Check limits
      const hourlyAllowed = hourlyCount <= rate_limit_per_hour;
      const dailyAllowed = dailyCount <= rate_limit_per_day;
      const allowed = hourlyAllowed && dailyAllowed;

      if (!allowed) {
        logger.warn(`Rate limit exceeded for broker ${brokerId}: hourly=${hourlyCount}/${rate_limit_per_hour}, daily=${dailyCount}/${rate_limit_per_day}`);
        
        await this.logSecurityEvent({
          broker_id: brokerId,
          event_type: 'rate_limit_exceeded',
          severity: hourlyCount > rate_limit_per_hour * 1.5 ? 'high' : 'medium',
          description: `Rate limit exceeded: hourly=${hourlyCount}/${rate_limit_per_hour}, daily=${dailyCount}/${rate_limit_per_day}`,
          endpoint,
          auto_action: hourlyCount > rate_limit_per_hour * 2 ? 'temp_suspend' : 'rate_limit',
        });
      }

      const resetHourly = new Date(hourBucket);
      resetHourly.setHours(resetHourly.getHours() + 1);

      const resetDaily = new Date(dayBucket);
      resetDaily.setDate(resetDaily.getDate() + 1);

      return {
        allowed,
        remaining_hourly: Math.max(0, rate_limit_per_hour - hourlyCount),
        remaining_daily: Math.max(0, rate_limit_per_day - dailyCount),
        reset_hourly: resetHourly,
        reset_daily: resetDaily,
      };
    } catch (error) {
      logger.error('Rate limit check error:', error);
      throw error;
    }
  }

  /**
   * Verify Ed25519 signature from broker
   */
  async verifySignature(
    broker: Broker,
    payload: any,
    signature: string
  ): Promise<boolean> {
    if (!broker.require_signature) {
      return true; // Signature not required for this broker
    }

    if (!broker.public_key) {
      logger.error(`Broker ${broker.domain} requires signature but has no public key`);
      return false;
    }

    if (!signature) {
      logger.warn(`Broker ${broker.domain} requires signature but none provided`);
      return false;
    }

    try {
      // Create canonical payload string (sorted JSON)
      const canonicalPayload = JSON.stringify(payload, Object.keys(payload).sort());
      
      // Verify Ed25519 signature
      const publicKey = crypto.createPublicKey({
        key: Buffer.from(broker.public_key, 'base64'),
        format: 'der',
        type: 'spki',
      });

      const isValid = crypto.verify(
        null, // Ed25519 doesn't use a digest algorithm
        Buffer.from(canonicalPayload, 'utf-8'),
        publicKey,
        Buffer.from(signature, 'base64')
      );

      if (!isValid) {
        logger.warn(`Invalid signature from broker ${broker.domain}`);
        await this.logSecurityEvent({
          broker_id: broker.id,
          event_type: 'invalid_signature',
          severity: 'high',
          description: 'Cryptographic signature verification failed',
          auto_action: 'none',
        });
      }

      return isValid;
    } catch (error) {
      logger.error(`Signature verification error for broker ${broker.domain}:`, error);
      await this.logSecurityEvent({
        broker_id: broker.id,
        event_type: 'signature_verification_error',
        severity: 'high',
        description: `Signature verification threw error: ${error.message}`,
      });
      return false;
    }
  }

  /**
   * Create or get federated identity
   */
  async getFederatedIdentity(
    username: string,
    domain: string,
    brokerId: number
  ): Promise<number> {
    try {
      // Validate username format
      if (!/^[a-zA-Z0-9_-]{1,255}$/.test(username)) {
        throw new Error('Invalid username format');
      }

      const result = await this.db.query(`
        INSERT INTO federated_identities (username, domain, broker_id, verified, verified_at, verification_method)
        VALUES ($1, $2, $3, true, NOW(), 'broker_signature')
        ON CONFLICT (username, domain)
        DO UPDATE SET 
          verified = true,
          verified_at = NOW(),
          active = true
        RETURNING id
      `, [username, domain, brokerId]);

      return result.rows[0].id;
    } catch (error) {
      logger.error('Federated identity creation error:', error);
      throw error;
    }
  }

  /**
   * Log security event
   */
  async logSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      await this.db.query(`
        INSERT INTO broker_security_events (
          broker_id, event_type, severity, description,
          ip_address, endpoint, request_data, auto_action,
          manual_review_required, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `, [
        event.broker_id,
        event.event_type,
        event.severity,
        event.description,
        event.ip_address || null,
        event.endpoint || null,
        event.request_data ? JSON.stringify(event.request_data) : null,
        event.auto_action || 'none',
        event.severity === 'critical' || event.severity === 'high',
      ]);

      // Auto-suspend on critical events
      if (event.auto_action === 'temp_suspend') {
        await this.db.query(`
          UPDATE brokers
          SET suspended_at = NOW(),
              suspend_reason = $2
          WHERE id = $1 AND suspended_at IS NULL
        `, [event.broker_id, `Auto-suspended: ${event.description}`]);
        
        logger.error(`BROKER AUTO-SUSPENDED: Broker ID ${event.broker_id} - ${event.description}`);
      }
    } catch (error) {
      logger.error('Failed to log security event:', error);
      // Don't throw - logging failures shouldn't break the main flow
    }
  }

  /**
   * Generate new API key for broker
   * Returns unhashed key (only time it's visible)
   */
  async generateApiKey(
    brokerId: number,
    keyName: string,
    scopes: string[] = ['broker:register'],
    expiresInDays?: number
  ): Promise<string> {
    try {
      // Generate secure random key
      const key = `DAON_BR_${crypto.randomBytes(32).toString('hex')}`;
      const prefix = key.substring(0, this.KEY_PREFIX_LENGTH);
      const keyHash = await bcrypt.hash(key, this.BCRYPT_ROUNDS);

      const expiresAt = expiresInDays 
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      await this.db.query(`
        INSERT INTO broker_api_keys (
          broker_id, key_hash, key_prefix, key_name, scopes, expires_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [brokerId, keyHash, prefix, keyName, scopes, expiresAt]);

      logger.info(`Generated new API key for broker ${brokerId}: ${keyName}`);

      return key; // Return unhashed key - only time it's visible!
    } catch (error) {
      logger.error('API key generation error:', error);
      throw error;
    }
  }

  /**
   * Revoke API key
   */
  async revokeApiKey(keyId: number, reason: string): Promise<void> {
    await this.db.query(`
      UPDATE broker_api_keys
      SET revoked_at = NOW(),
          revoke_reason = $2
      WHERE id = $1
    `, [keyId, reason]);

    logger.warn(`API key revoked: ${keyId} - ${reason}`);
  }

  /**
   * Log API usage for analytics
   */
  async logApiUsage(
    brokerId: number,
    apiKeyId: number,
    endpoint: string,
    method: string,
    statusCode: number,
    responseTimeMs: number,
    contentHash?: string,
    federatedIdentity?: string,
    success?: boolean,
    errorMessage?: string,
    ipAddress?: string,
    userAgent?: string,
    signatureValid?: boolean
  ): Promise<void> {
    try {
      await this.db.query(`
        INSERT INTO broker_api_usage (
          broker_id, api_key_id, endpoint, method, status_code,
          response_time_ms, content_hash, federated_identity,
          success, error_message, ip_address, user_agent,
          signature_valid, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      `, [
        brokerId, apiKeyId, endpoint, method, statusCode,
        responseTimeMs, contentHash, federatedIdentity,
        success, errorMessage, ipAddress, userAgent, signatureValid
      ]);
    } catch (error) {
      logger.error('Failed to log API usage:', error);
      // Don't throw - logging failures shouldn't break the main flow
    }
  }
}
