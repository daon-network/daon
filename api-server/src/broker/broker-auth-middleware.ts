/**
 * Broker Authentication Middleware
 * 
 * Authenticates broker API requests and enforces rate limits
 * Production-grade implementation with comprehensive security
 */

import { Request, Response, NextFunction } from 'express';
import { BrokerService, Broker, BrokerApiKey } from './broker-service.js';
import { DatabaseClient } from '../database/client.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

// Extend Express Request type to include broker info
declare global {
  namespace Express {
    interface Request {
      broker?: Broker;
      brokerApiKey?: BrokerApiKey;
    }
  }
}

export interface BrokerAuthOptions {
  required?: boolean;  // If false, proceed even if no broker auth (for optional broker endpoints)
  requireSignature?: boolean;  // Require cryptographic signature
  scopes?: string[];  // Required scopes (e.g., ['broker:register', 'broker:transfer'])
}

/**
 * Create broker authentication middleware
 */
export function createBrokerAuthMiddleware(
  db: DatabaseClient,
  options: BrokerAuthOptions = {}
) {
  const {
    required = true,
    requireSignature = false,
    scopes = []
  } = options;

  const brokerService = new BrokerService(db);

  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    try {
      // Extract API key from Authorization header
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        if (!required) {
          return next();
        }
        
        logger.warn('Broker auth failed: No Authorization header', {
          ip: req.ip,
          path: req.path,
        });
        
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Authorization header required. Format: Authorization: Bearer <api_key>',
          code: 'BROKER_AUTH_MISSING'
        });
      }

      // Parse Bearer token
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        logger.warn('Broker auth failed: Invalid Authorization format', {
          ip: req.ip,
          path: req.path,
        });
        
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Invalid Authorization header format. Expected: Bearer <api_key>',
          code: 'BROKER_AUTH_INVALID_FORMAT'
        });
      }

      const apiKey = parts[1];

      // Authenticate broker
      const authResult = await brokerService.authenticateBroker(apiKey);
      
      if (!authResult) {
        logger.warn('Broker authentication failed: Invalid API key', {
          ip: req.ip,
          path: req.path,
          key_prefix: apiKey.substring(0, 16),
        });
        
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Invalid API key',
          code: 'BROKER_AUTH_INVALID_KEY'
        });
      }

      const { broker, apiKey: apiKeyData } = authResult;

      // Check required scopes
      if (scopes.length > 0) {
        const hasRequiredScopes = scopes.every(scope => 
          apiKeyData.scopes.includes(scope)
        );
        
        if (!hasRequiredScopes) {
          logger.warn('Broker auth failed: Insufficient scopes', {
            broker_id: broker.id,
            broker_domain: broker.domain,
            required_scopes: scopes,
            actual_scopes: apiKeyData.scopes,
          });
          
          return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Insufficient permissions for this operation',
            required_scopes: scopes,
            code: 'BROKER_AUTH_INSUFFICIENT_SCOPES'
          });
        }
      }

      // Check rate limits
      const rateLimit = await brokerService.checkRateLimit(
        broker.id,
        req.path
      );

      if (!rateLimit.allowed) {
        logger.warn('Broker rate limit exceeded', {
          broker_id: broker.id,
          broker_domain: broker.domain,
          path: req.path,
          hourly_remaining: rateLimit.remaining_hourly,
          daily_remaining: rateLimit.remaining_daily,
        });
        
        return res.status(429)
          .set({
            'X-RateLimit-Limit-Hourly': broker.rate_limit_per_hour.toString(),
            'X-RateLimit-Limit-Daily': broker.rate_limit_per_day.toString(),
            'X-RateLimit-Remaining-Hourly': rateLimit.remaining_hourly.toString(),
            'X-RateLimit-Remaining-Daily': rateLimit.remaining_daily.toString(),
            'X-RateLimit-Reset-Hourly': rateLimit.reset_hourly.toISOString(),
            'X-RateLimit-Reset-Daily': rateLimit.reset_daily.toISOString(),
            'Retry-After': Math.ceil((rateLimit.reset_hourly.getTime() - Date.now()) / 1000).toString(),
          })
          .json({
            success: false,
            error: 'Too Many Requests',
            message: 'Rate limit exceeded',
            rate_limit: {
              hourly: {
                limit: broker.rate_limit_per_hour,
                remaining: rateLimit.remaining_hourly,
                reset: rateLimit.reset_hourly,
              },
              daily: {
                limit: broker.rate_limit_per_day,
                remaining: rateLimit.remaining_daily,
                reset: rateLimit.reset_daily,
              }
            },
            code: 'BROKER_RATE_LIMIT_EXCEEDED'
          });
      }

      // Verify signature if required
      if (requireSignature || broker.require_signature) {
        const signature = req.headers['x-daon-signature'] as string;
        
        if (!signature) {
          logger.warn('Broker signature missing', {
            broker_id: broker.id,
            broker_domain: broker.domain,
          });
          
          return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Cryptographic signature required. Include X-DAON-Signature header.',
            code: 'BROKER_SIGNATURE_MISSING'
          });
        }

        const isValidSignature = await brokerService.verifySignature(
          broker,
          req.body,
          signature
        );

        if (!isValidSignature) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Invalid cryptographic signature',
            code: 'BROKER_SIGNATURE_INVALID'
          });
        }
      }

      // Attach broker info to request
      req.broker = broker;
      req.brokerApiKey = apiKeyData;

      // Add rate limit headers to response
      res.set({
        'X-RateLimit-Limit-Hourly': broker.rate_limit_per_hour.toString(),
        'X-RateLimit-Limit-Daily': broker.rate_limit_per_day.toString(),
        'X-RateLimit-Remaining-Hourly': rateLimit.remaining_hourly.toString(),
        'X-RateLimit-Remaining-Daily': rateLimit.remaining_daily.toString(),
        'X-RateLimit-Reset-Hourly': rateLimit.reset_hourly.toISOString(),
        'X-RateLimit-Reset-Daily': rateLimit.reset_daily.toISOString(),
      });

      const duration = Date.now() - startTime;
      logger.info('Broker authenticated successfully', {
        broker_id: broker.id,
        broker_domain: broker.domain,
        path: req.path,
        duration_ms: duration,
      });

      next();
      
    } catch (error) {
      logger.error('Broker authentication error:', {
        error: error.message,
        stack: error.stack,
        ip: req.ip,
        path: req.path,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Authentication system error',
        code: 'BROKER_AUTH_ERROR'
      });
    }
  };
}

/**
 * Middleware to require specific broker
 * Use after createBrokerAuthMiddleware
 */
export function requireBrokerDomain(domain: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.broker) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Broker authentication required',
        code: 'BROKER_AUTH_REQUIRED'
      });
    }

    if (req.broker.domain !== domain) {
      logger.warn('Broker domain mismatch', {
        required: domain,
        actual: req.broker.domain,
        broker_id: req.broker.id,
      });
      
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `This endpoint requires broker domain: ${domain}`,
        code: 'BROKER_DOMAIN_MISMATCH'
      });
    }

    next();
  };
}

/**
 * Middleware to require specific certification tier
 * Use after createBrokerAuthMiddleware
 */
export function requireCertificationTier(
  minTier: 'community' | 'standard' | 'enterprise'
) {
  const tierLevels = {
    community: 1,
    standard: 2,
    enterprise: 3,
  };

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.broker) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Broker authentication required',
        code: 'BROKER_AUTH_REQUIRED'
      });
    }

    const brokerTierLevel = tierLevels[req.broker.certification_tier];
    const requiredTierLevel = tierLevels[minTier];

    if (brokerTierLevel < requiredTierLevel) {
      logger.warn('Broker certification tier insufficient', {
        broker_id: req.broker.id,
        broker_domain: req.broker.domain,
        broker_tier: req.broker.certification_tier,
        required_tier: minTier,
      });
      
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `This endpoint requires ${minTier} tier or higher. Your tier: ${req.broker.certification_tier}`,
        code: 'BROKER_TIER_INSUFFICIENT'
      });
    }

    next();
  };
}
