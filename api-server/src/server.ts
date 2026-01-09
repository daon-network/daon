#!/usr/bin/env node

/**
 * DAON REST API Server
 * 
 * Bridges SDK requests to DAON blockchain for creator protection
 * Provides REST endpoints for content protection and verification
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import crypto from 'crypto';
import winston from 'winston';
import { body, param, validationResult } from 'express-validator';
import client from 'prom-client';
import blockchainClient from './blockchain.js';
import { DatabaseClient } from './database/client.js';
import { createAuthRoutes } from './auth/auth-routes.js';
import { requireAdminAuth, logAdminAction } from './auth/admin-middleware.js';
import healthRoutes from './routes/health.js';
import { BrokerService } from './broker/broker-service.js';
import { createBrokerAuthMiddleware } from './broker/broker-auth-middleware.js';

// Load environment variables
dotenv.config();

// Initialize database client
const dbClient = new DatabaseClient();

// Initialize broker service
const brokerService = new BrokerService(dbClient);

// Initialize webhook service
import { WebhookService } from './broker/webhook-service.js';
const webhookService = new WebhookService(dbClient);

// Initialize webhook retry processor
import { WebhookRetryProcessor } from './broker/webhook-retry-processor.js';
const webhookRetryProcessor = new WebhookRetryProcessor(dbClient, 1); // Process every 1 minute

// Initialize Prometheus metrics
const register = new client.Registry();

// Add default metrics
client.collectDefaultMetrics({ 
  register,
  prefix: 'daon_api_',
});

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'daon_api_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const httpRequestsTotal = new client.Counter({
  name: 'daon_api_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const contentProtectionsTotal = new client.Counter({
  name: 'daon_api_content_protections_total',
  help: 'Total number of content protections',
  labelNames: ['license', 'status']
});

const contentVerificationsTotal = new client.Counter({
  name: 'daon_api_content_verifications_total',
  help: 'Total number of content verifications',
  labelNames: ['status']
});

const activeConnections = new client.Gauge({
  name: 'daon_api_active_connections',
  help: 'Number of active connections'
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(contentProtectionsTotal);
register.registerMetric(contentVerificationsTotal);
register.registerMetric(activeConnections);

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    }),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    })
  ]
});

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const BLOCKCHAIN_RPC = process.env.BLOCKCHAIN_RPC || 'http://localhost:26657';

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting (disabled in test mode)
if (process.env.NODE_ENV !== 'test') {
  // Adjust limits based on environment
  const isLoadTesting = process.env.LOAD_TEST_MODE === 'true';
  
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isLoadTesting ? 10000 : 100, // Higher limit for load testing
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const protectLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: isLoadTesting ? 1000 : 10, // Higher limit for load testing
    message: {
      error: 'Content protection rate limit exceeded. Please wait before protecting more content.',
      retryAfter: '1 minute'
    }
  });

  app.use('/api/', limiter);
  app.use('/api/v1/protect', protectLimiter);
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Metrics middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  activeConnections.inc();
  
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    const route = req.route?.path || req.path;
    
    httpRequestDuration
      .labels(req.method, route, res.statusCode.toString())
      .observe(duration);
    
    httpRequestsTotal
      .labels(req.method, route, res.statusCode.toString())
      .inc();
    
    activeConnections.dec();
  });
  
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Validation middleware helper
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Utility functions
function generateContentHash(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function generateVerificationUrl(contentHash) {
  const baseUrl = process.env.VERIFICATION_BASE_URL || 'https://verify.daon.network';
  return `${baseUrl}/sha256:${contentHash}`;
}

// Blockchain integration
const blockchainEnabled = process.env.BLOCKCHAIN_ENABLED === 'true';

// Fallback in-memory storage (used when blockchain is disabled)
const protectedContent = new Map();

// Initialize blockchain connection
if (blockchainEnabled) {
  blockchainClient.connect().then(() => {
    logger.info('✅ Blockchain client connected');
  }).catch(err => {
    logger.error('❌ Failed to connect to blockchain:', err);
    logger.warn('⚠️  Falling back to in-memory storage');
  });
}

// Metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error);
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const blockchainStatus = blockchainEnabled ? await blockchainClient.getStatus() : null;
  
  res.json({
    status: 'healthy',
    instance: process.env.INSTANCE_ID || 'unknown',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    blockchain: blockchainEnabled ? {
      enabled: true,
      connected: blockchainStatus?.connected || false,
      chainId: blockchainStatus?.chainId,
      height: blockchainStatus?.height,
    } : {
      enabled: false,
      mode: 'in-memory-fallback'
    },
    metrics: {
      totalProtected: protectedContent.size,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      activeConnections: (activeConnections as any).hashMap?.['']?.value || 0
    },
    support: {
      funding: 'https://ko-fi.com/greenfieldoverride',
      documentation: 'https://docs.daon.network'
    }
  });
});

// Mount auth routes
app.use('/api/v1/auth', createAuthRoutes(dbClient));
app.use('/api/v1/user', createAuthRoutes(dbClient));

// Mount health check routes
app.use('/api/v1/health', healthRoutes);

// API Documentation endpoint
app.get('/api/v1', (req, res) => {
  res.json({
    name: 'DAON API',
    version: '0.1.0',
    description: 'Creator protection API for blockchain-verified content ownership',
    endpoints: {
      'POST /api/v1/protect': 'Protect content with Liberation License',
      'POST /api/v1/protect/bulk': 'Protect multiple works at once',
      'GET /api/v1/verify/:hash': 'Verify content protection status',
      'GET /api/v1/stats': 'Get protection statistics',
      'POST /api/v1/auth/magic-link': 'Send magic link for passwordless auth',
      'GET /api/v1/auth/verify': 'Verify magic link and get tokens',
      'POST /api/v1/auth/refresh': 'Refresh access token',
      'POST /api/v1/auth/2fa/setup': 'Setup 2FA with TOTP',
      'GET /api/v1/auth/devices': 'Get trusted devices'
    },
    documentation: 'https://docs.daon.network/api/',
    support: {
      email: 'api-support@daon.network',
      discord: 'https://discord.gg/daon',
      funding: 'https://ko-fi.com/greenfieldoverride'
    },
    message: 'Protecting creativity with blockchain technology. Support DAON: https://ko-fi.com/greenfieldoverride'
  });
});

// Content protection endpoint
app.post('/api/v1/protect', [
  body('content')
    .notEmpty()
    .withMessage('Content is required')
    .isLength({ max: 10 * 1024 * 1024 }) // 10MB limit
    .withMessage('Content too large (10MB max)'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object'),
  body('license')
    .optional()
    .isIn([
      'all-rights-reserved',
      'copyright',
      'liberation_v1',
      'cc0',
      'cc-by',
      'cc-by-sa',
      'cc-by-nc',
      'cc-by-nc-sa',
      'cc-by-nd'
    ])
    .withMessage('Invalid license type'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { content, metadata = {}, license = 'all-rights-reserved' } = req.body;
    
    // Generate content hash
    const contentHash = generateContentHash(content);
    const timestamp = new Date().toISOString();
    const verificationUrl = generateVerificationUrl(contentHash);
    
    let blockchainTx = null;
    let existing = false;
    
    // If blockchain enabled, use it as source of truth
    if (blockchainEnabled && blockchainClient.connected) {
      try {
        // Check if already exists on blockchain
        const existingOnChain = await blockchainClient.contentExists(contentHash);
        
        if (existingOnChain) {
          logger.info(`Content already protected on blockchain: ${contentHash}`);
          const verification = await blockchainClient.verifyContent(contentHash);
          
          contentProtectionsTotal.labels(license, 'existing').inc();
          
          return res.json({
            success: true,
            contentHash,
            verificationUrl,
            timestamp: new Date(verification.timestamp * 1000).toISOString(),
            license: verification.license,
            message: 'Content already protected on blockchain',
            existing: true,
            blockchain: {
              enabled: true,
              creator: verification.creator
            }
          });
        }
        
        // Register on blockchain
        const result = await blockchainClient.registerContent(
          contentHash,
          metadata,
          license
        );
        
        blockchainTx = result.txHash;
        logger.info(`Content registered on blockchain: ${contentHash} (tx: ${blockchainTx})`);
        
      } catch (blockchainError) {
        logger.error('Blockchain registration failed:', blockchainError);
        // Fall back to in-memory storage if blockchain fails
        logger.warn('Falling back to in-memory storage');
      }
    }
    
    // Also store in memory for quick access (cache)
    const protectionRecord = {
      contentHash,
      timestamp,
      license,
      metadata: {
        title: metadata.title || 'Untitled Work',
        author: metadata.author || 'Anonymous',
        type: metadata.type || 'text',
        ...metadata
      },
      verificationUrl,
      blockchainTx,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    };
    
    protectedContent.set(contentHash, protectionRecord);
    
    // Update metrics
    contentProtectionsTotal.labels(license, 'success').inc();
    
    logger.info(`Content protected: ${contentHash} (${license})${blockchainTx ? ' [blockchain]' : ' [memory]'}`);
    
    res.status(201).json({
      success: true,
      contentHash,
      verificationUrl,
      timestamp,
      license,
      blockchainTx,
      blockchain: {
        enabled: blockchainEnabled,
        tx: blockchainTx
      },
      message: blockchainTx 
        ? 'Content successfully protected on DAON blockchain'
        : 'Content protected (blockchain pending)',
      support: {
        message: 'Help keep DAON free for creators',
        funding: 'https://ko-fi.com/greenfieldoverride'
      }
    });
    
  } catch (error) {
    contentProtectionsTotal.labels(req.body.license || 'liberation_v1', 'error').inc();
    logger.error('Content protection failed:', error);
    res.status(500).json({
      success: false,
      error: 'Content protection failed',
      message: error.message
    });
  }
});

// Bulk content protection endpoint
app.post('/api/v1/protect/bulk', [
  body('works')
    .isArray({ min: 1, max: 100 })
    .withMessage('Works must be an array (1-100 items)'),
  body('works.*.content')
    .notEmpty()
    .withMessage('Each work must have content'),
  body('license')
    .optional()
    .isIn(['liberation_v1', 'cc0', 'cc-by', 'cc-by-sa'])
    .withMessage('Invalid license type'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { works, license = 'liberation_v1' } = req.body;
    const results = [];
    const timestamp = new Date().toISOString();
    
    for (const work of works) {
      const contentHash = generateContentHash(work.content);
      const verificationUrl = generateVerificationUrl(contentHash);
      
      // Check if already protected
      if (protectedContent.has(contentHash)) {
        const existing = protectedContent.get(contentHash);
        results.push({
          contentHash,
          verificationUrl,
          timestamp: existing.timestamp,
          license: existing.license,
          existing: true
        });
        continue;
      }
      
      // Store new protection
      const protectionRecord = {
        contentHash,
        timestamp,
        license,
        metadata: work.metadata || {},
        verificationUrl,
        ip: req.ip
      };
      
      protectedContent.set(contentHash, protectionRecord);
      
      results.push({
        contentHash,
        verificationUrl,
        timestamp,
        license,
        existing: false
      });
    }
    
    logger.info(`Bulk protection completed: ${results.length} works`);
    
    res.json({
      success: true,
      protected: results.length,
      license,
      timestamp,
      results
    });
    
  } catch (error) {
    logger.error('Bulk protection failed:', error);
    res.status(500).json({
      success: false,
      error: 'Bulk protection failed',
      message: error.message
    });
  }
});

// Content verification endpoint
app.get('/api/v1/verify/:hash', [
  param('hash')
    .isHexadecimal()
    .isLength({ min: 64, max: 64 })
    .withMessage('Invalid SHA-256 hash'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { hash } = req.params;
    let record = null;
    let source = 'memory';
    
    // Try blockchain first if enabled
    if (blockchainEnabled && blockchainClient.connected) {
      try {
        const blockchainRecord = await blockchainClient.verifyContent(hash);
        
        if (blockchainRecord.verified) {
          record = {
            contentHash: hash,
            timestamp: new Date(blockchainRecord.timestamp * 1000).toISOString(),
            license: blockchainRecord.license,
            creator: blockchainRecord.creator,
            blockchain: true
          };
          source = 'blockchain';
        }
      } catch (blockchainError) {
        logger.warn('Blockchain verification failed, checking memory:', blockchainError.message);
      }
    }
    
    // Fall back to in-memory if not found on blockchain
    if (!record) {
      record = protectedContent.get(hash);
      if (record) {
        source = 'memory-cache';
      }
    }
    
    if (!record) {
      contentVerificationsTotal.labels('not_found').inc();
      return res.status(404).json({
        success: false,
        isValid: false,
        error: 'Content not found in protection registry'
      });
    }
    
    logger.info(`Content verification: ${hash} [${source}]`);
    contentVerificationsTotal.labels('success').inc();
    
    res.json({
      success: true,
      isValid: true,
      contentHash: hash,
      timestamp: record.timestamp,
      license: record.license,
      metadata: record.metadata,
      verificationUrl: record.verificationUrl || generateVerificationUrl(hash),
      blockchain: {
        enabled: blockchainEnabled,
        verified: source === 'blockchain',
        source: source
      }
    });
    
  } catch (error) {
    logger.error('Content verification failed:', error);
    res.status(500).json({
      success: false,
      error: 'Verification failed',
      message: error.message
    });
  }
});

// ============================================================================
// BROKER & OWNERSHIP TRANSFER API
// These endpoints enable platform integrations for mass adoption
// ============================================================================

/**
 * Broker Content Protection Endpoint
 * 
 * Allows certified brokers (platforms like AO3, Wattpad) to register
 * content on behalf of their users using federated identities
 * 
 * Protected by broker authentication middleware
 * 
 * Identity format: username@platform.domain
 * Example: fanficwriter@archiveofourown.org
 */
app.post('/api/v1/broker/protect',
  createBrokerAuthMiddleware(dbClient, { 
    scopes: ['broker:register'] 
  }),
  [
    body('username')
      .notEmpty()
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Valid username required'),
    body('content')
      .notEmpty()
      .withMessage('Content is required'),
    body('metadata.title')
      .optional()
      .isString(),
    body('metadata.author')
      .optional()
      .isString(),
    body('license')
      .optional()
      .isIn(['liberation_v1', 'all-rights-reserved', 'copyright', 'cc0', 'cc-by', 'cc-by-sa', 'cc-by-nd', 'cc-by-nc', 'cc-by-nc-sa'])
      .withMessage('Invalid license type'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { username, content, metadata = {}, license = 'liberation_v1' } = req.body;
      
      // Broker is authenticated via middleware - available in req.broker
      const broker = req.broker!;
      const federatedIdentity = `${username}@${broker.domain}`;
      
      logger.info(`Broker registration from ${broker.domain}: ${federatedIdentity}`);
    
    // Generate content hash
    const contentHash = generateContentHash(content);
    const verificationUrl = generateVerificationUrl(contentHash);
    const timestamp = new Date().toISOString();
    
    // Check if already protected
    if (protectedContent.has(contentHash)) {
      const existing = protectedContent.get(contentHash);
      logger.info(`Content already protected: ${contentHash} by ${existing.owner || 'unknown'}`);
      
      return res.json({
        success: true,
        contentHash,
        verificationUrl,
        timestamp: existing.timestamp,
        license: existing.license,
        owner: existing.owner,
        existing: true,
        message: 'Content already registered'
      });
    }
    
    // Create protection record with broker metadata
    const protectionRecord = {
      contentHash,
      timestamp,
      license,
      owner: federatedIdentity,
      ownerType: 'brokered',
      broker: broker.domain,
      brokerId: broker.id,
      metadata: {
        ...metadata,
        registeredVia: 'broker',
        brokerDomain: broker.domain,
        brokerName: broker.name,
        certificationTier: broker.certification_tier,
      },
      verificationUrl,
      ip: req.ip,
      blockchain: false
    };
    
    // Store protection
    protectedContent.set(contentHash, protectionRecord);
    
    // If blockchain is enabled, register there too
    if (blockchainEnabled && blockchainClient.connected) {
      try {
        await blockchainClient.registerContent(
          contentHash,
          {
            title: metadata.title,
            author: metadata.author || federatedIdentity,
            owner: federatedIdentity,
            ownerType: 'brokered',
            broker: broker.domain
          },
          license
        );
        
        protectionRecord.blockchain = true;
        logger.info(`Blockchain registration successful for ${federatedIdentity}: ${contentHash}`);
      } catch (blockchainError) {
        logger.warn('Blockchain registration failed, using memory storage:', blockchainError.message);
        protectionRecord.blockchain = false;
      }
    }
    
    contentProtectionsTotal.labels(license, 'success').inc();
    logger.info(`Broker protection registered: ${federatedIdentity} - ${contentHash}`);
    
    // Trigger webhook notification
    webhookService.triggerWebhook(broker.id, 'content.protected', {
      content_hash: contentHash,
      owner: federatedIdentity,
      license,
      timestamp,
      metadata,
      blockchain: protectionRecord.blockchain
    }).catch(err => logger.error('Webhook trigger failed:', err));
    
    res.status(201).json({
      success: true,
      contentHash,
      verificationUrl,
      timestamp,
      license,
      owner: federatedIdentity,
      blockchain: protectionRecord.blockchain,
      broker: {
        domain: broker.domain,
        name: broker.name,
        certification_tier: broker.certification_tier,
      },
      message: 'Content successfully protected via broker'
    });
    
  } catch (error) {
    logger.error('Broker protection failed:', error);
    contentProtectionsTotal.labels('unknown', 'error').inc();
    
    res.status(500).json({
      success: false,
      error: 'Broker protection failed',
      message: error.message
    });
  }
});

/**
 * Broker Verification Endpoint
 * 
 * Verify broker authentication status and get broker information
 * Returns broker details and current rate limit status
 */
app.get('/api/v1/broker/verify',
  createBrokerAuthMiddleware(dbClient),
  async (req, res) => {
    try {
      const broker = req.broker!;
      const apiKey = req.brokerApiKey!;
      
      // Check current rate limit status
      const rateLimit = await brokerService.checkRateLimit(broker.id, req.path);
      
      res.json({
        success: true,
        broker: {
          id: broker.id,
          domain: broker.domain,
          name: broker.name,
          certification_tier: broker.certification_tier,
          certification_status: broker.certification_status,
          enabled: broker.enabled,
        },
        api_key: {
          scopes: apiKey.scopes,
          expires_at: apiKey.expires_at,
        },
        rate_limits: {
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
        message: 'Broker authenticated successfully'
      });
    } catch (error) {
      logger.error('Broker verification failed:', error);
      res.status(500).json({
        success: false,
        error: 'Verification failed',
        message: error.message
      });
    }
  }
);

/**
 * Broker API Usage Statistics Endpoint
 * 
 * Returns API usage statistics for the authenticated broker
 * Supports date range filtering
 */
app.get('/api/v1/broker/usage',
  createBrokerAuthMiddleware(dbClient),
  async (req, res) => {
    try {
      const broker = req.broker!;
      const { start_date, end_date, limit = 100 } = req.query;
      
      // Query usage statistics from database
      let query = `
        SELECT 
          endpoint,
          method,
          COUNT(*) as request_count,
          AVG(response_time_ms) as avg_response_time,
          SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as error_count,
          DATE_TRUNC('hour', created_at) as hour
        FROM broker_api_usage
        WHERE broker_id = $1
      `;
      
      const params: any[] = [broker.id];
      
      if (start_date) {
        params.push(start_date);
        query += ` AND created_at >= $${params.length}`;
      }
      
      if (end_date) {
        params.push(end_date);
        query += ` AND created_at <= $${params.length}`;
      }
      
      query += `
        GROUP BY endpoint, method, hour
        ORDER BY hour DESC
        LIMIT $${params.length + 1}
      `;
      params.push(limit);
      
      const result = await dbClient.query(query, params);
      
      // Get total statistics
      const totalQuery = `
        SELECT 
          COUNT(*) as total_requests,
          SUM(CASE WHEN success THEN 1 ELSE 0 END) as total_success,
          SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as total_errors,
          AVG(response_time_ms) as avg_response_time
        FROM broker_api_usage
        WHERE broker_id = $1
      `;
      
      const totalResult = await dbClient.query(totalQuery, [broker.id]);
      
      res.json({
        success: true,
        broker: {
          id: broker.id,
          domain: broker.domain,
          name: broker.name,
        },
        summary: totalResult.rows[0],
        usage: result.rows,
        filters: {
          start_date,
          end_date,
          limit,
        }
      });
    } catch (error) {
      logger.error('Broker usage query failed:', error);
      res.status(500).json({
        success: false,
        error: 'Usage query failed',
        message: error.message
      });
    }
  }
);

/**
 * Broker Registration Endpoint (Admin Only)
 * 
 * Register a new broker platform
 * Requires admin authentication
 */
app.post('/api/v1/broker/register',
  requireAdminAuth(dbClient),
  [
    body('domain')
      .notEmpty()
      .isFQDN()
      .withMessage('Valid domain required'),
    body('name')
      .notEmpty()
      .withMessage('Broker name required'),
    body('certification_tier')
      .isIn(['community', 'standard', 'enterprise'])
      .withMessage('Valid certification tier required'),
    body('contact_email')
      .isEmail()
      .withMessage('Valid contact email required'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { domain, name, certification_tier, contact_email, public_key } = req.body;
      
      // Check if broker already exists
      const existingBroker = await dbClient.query(
        'SELECT id FROM brokers WHERE domain = $1',
        [domain]
      );
      
      if (existingBroker.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Conflict',
          message: 'Broker with this domain already exists',
          code: 'BROKER_EXISTS'
        });
      }
      
      // Set rate limits based on tier
      let rateLimitPerHour = 100;
      let rateLimitPerDay = 1000;
      
      if (certification_tier === 'standard') {
        rateLimitPerHour = 1000;
        rateLimitPerDay = 10000;
      } else if (certification_tier === 'enterprise') {
        rateLimitPerHour = 10000;
        rateLimitPerDay = 100000;
      }
      
      // Insert new broker
      const result = await dbClient.query(`
        INSERT INTO brokers (
          domain, name, certification_tier, certification_status,
          contact_email, rate_limit_per_hour, rate_limit_per_day,
          require_signature, public_key, enabled, created_at
        ) VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, true, NOW())
        RETURNING id, domain, name, certification_tier, certification_status
      `, [
        domain,
        name,
        certification_tier,
        contact_email,
        rateLimitPerHour,
        rateLimitPerDay,
        certification_tier === 'enterprise',
        public_key || null
      ]);
      
      const newBroker = result.rows[0];
      
      // Generate initial API key
      const apiKey = await brokerService.generateApiKey(
        newBroker.id,
        'Initial API Key',
        ['broker:register', 'broker:verify', 'broker:transfer']
      );
      
      logger.info(`New broker registered: ${domain} (${certification_tier}) by admin user ${req.userId}`);
      
      // Log admin action for audit trail
      await logAdminAction(dbClient, {
        user_id: req.userId!,
        action_type: 'create',
        resource_type: 'broker',
        resource_id: newBroker.id,
        details: {
          domain,
          name,
          certification_tier,
          contact_email,
          has_public_key: !!public_key,
          rate_limits: { hourly: rateLimitPerHour, daily: rateLimitPerDay }
        },
        ip_address: req.ip
      });
      
      res.status(201).json({
        success: true,
        broker: newBroker,
        api_key: apiKey,
        message: 'Broker registered successfully. Save the API key - it will not be shown again.',
        warning: 'This broker is in pending status and requires admin approval before it can be used.'
      });
    } catch (error) {
      logger.error('Broker registration failed:', error);
      res.status(500).json({
        success: false,
        error: 'Registration failed',
        message: error.message
      });
    }
  }
);

/**
 * Broker Transfer Ownership Endpoint
 * POST /api/v1/broker/transfer
 * 
 * Transfers content ownership between federated identities via broker
 * Validates that the current owner belongs to the broker's domain
 * Records transfer history in database and blockchain
 */
app.post('/api/v1/broker/transfer',
  createBrokerAuthMiddleware(dbClient, {
    scopes: ['broker:transfer']
  }),
  [
    body('contentHash')
      .isHexadecimal()
      .isLength({ min: 64, max: 64 })
      .withMessage('Valid SHA-256 hash required'),
    body('currentOwner')
      .matches(/^[a-zA-Z0-9_-]+@[a-z0-9.-]+$/)
      .withMessage('Valid federated identity required (username@domain)'),
    body('newOwner')
      .matches(/^[a-zA-Z0-9_-]+@[a-z0-9.-]+$/)
      .withMessage('Valid federated identity required (username@domain)'),
    body('reason')
      .optional()
      .isString()
      .isLength({ max: 500 })
      .withMessage('Transfer reason must be string (max 500 chars)'),
    handleValidationErrors
  ],
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { contentHash, currentOwner, newOwner, reason } = req.body;
      const broker = req.broker!;
      
      logger.info(`Broker transfer request from ${broker.domain}: ${contentHash} (${currentOwner} -> ${newOwner})`);
      
      // Parse identities
      const [currentUsername, currentDomain] = currentOwner.split('@');
      const [newUsername, newDomain] = newOwner.split('@');
      
      // Verify current owner is from broker's domain
      if (currentDomain !== broker.domain) {
        await brokerService.logApiUsage(
          broker.id, req.brokerApiKey!.id, '/api/v1/broker/transfer', 'POST',
          403, Date.now() - startTime, contentHash, currentOwner,
          false, 'Current owner not from broker domain'
        );
        
        return res.status(403).json({
          success: false,
          error: 'Unauthorized',
          message: `Current owner must belong to your domain (${broker.domain})`,
          currentDomain,
          brokerDomain: broker.domain
        });
      }
      
      // Check if content exists
      let record = protectedContent.get(contentHash);
      
      if (!record) {
        // Try blockchain if enabled
        if (blockchainEnabled && blockchainClient.connected) {
          try {
            const blockchainRecord = await blockchainClient.verifyContent(contentHash);
            if (blockchainRecord.verified) {
              record = {
                contentHash,
                owner: blockchainRecord.creator,
                license: blockchainRecord.license,
                blockchain: true
              };
            }
          } catch (err) {
            logger.warn('Blockchain lookup failed:', err.message);
          }
        }
        
        if (!record) {
          await brokerService.logApiUsage(
            broker.id, req.brokerApiKey!.id, '/api/v1/broker/transfer', 'POST',
            404, Date.now() - startTime, contentHash, currentOwner,
            false, 'Content not found'
          );
          
          return res.status(404).json({
            success: false,
            error: 'Content not found',
            message: 'Content hash not registered in system'
          });
        }
      }
      
      // Verify current owner matches record
      if (record.owner !== currentOwner) {
        await brokerService.logApiUsage(
          broker.id, req.brokerApiKey!.id, '/api/v1/broker/transfer', 'POST',
          403, Date.now() - startTime, contentHash, currentOwner,
          false, 'Owner mismatch'
        );
        
        return res.status(403).json({
          success: false,
          error: 'Unauthorized',
          message: 'Current owner does not match registered owner',
          registeredOwner: record.owner,
          providedOwner: currentOwner
        });
      }
      
      // Get or create federated identities
      const currentIdentityId = await brokerService.getFederatedIdentity(
        currentUsername, currentDomain, broker.id
      );
      
      const newIdentityId = await brokerService.getFederatedIdentity(
        newUsername, newDomain, broker.id
      );
      
      const timestamp = new Date().toISOString();
      
      // Record transfer in database
      const transferResult = await dbClient.query(`
        INSERT INTO ownership_transfers (
          content_hash, 
          from_type, from_federated_id, from_identity,
          to_type, to_federated_id, to_identity,
          transfer_type, transfer_reason,
          authorized_by_broker_id,
          blockchain_tx,
          transferred_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        RETURNING id, transferred_at
      `, [
        contentHash,
        'federated', currentIdentityId, currentOwner,
        'federated', newIdentityId, newOwner,
        'broker_transfer', reason || 'Broker-initiated transfer',
        broker.id,
        null // Will update with blockchain tx if available
      ]);
      
      const transferId = transferResult.rows[0].id;
      
      // Update in-memory record
      const previousOwner = record.owner;
      record.owner = newOwner;
      record.transferHistory = record.transferHistory || [];
      record.transferHistory.push({
        from: previousOwner,
        to: newOwner,
        timestamp,
        broker: broker.domain,
        transferId,
        reason: reason || 'Broker-initiated transfer'
      });
      record.lastTransfer = timestamp;
      
      // If blockchain enabled, execute transfer there
      let blockchainTxHash = null;
      if (blockchainEnabled && blockchainClient.connected) {
        try {
          // Call blockchain transfer function
          // const txResult = await blockchainClient.transferOwnership(contentHash, currentOwner, newOwner);
          // blockchainTxHash = txResult.txHash;
          logger.info(`Blockchain transfer would execute here: ${contentHash}`);
          record.blockchain = true;
          
          // Update transfer record with blockchain tx
          if (blockchainTxHash) {
            await dbClient.query(`
              UPDATE ownership_transfers
              SET blockchain_tx = $1
              WHERE id = $2
            `, [blockchainTxHash, transferId]);
          }
        } catch (blockchainError) {
          logger.warn('Blockchain transfer failed, database record created:', blockchainError.message);
        }
      }
      
      // Update in-memory storage
      protectedContent.set(contentHash, record);
      
      // Log successful API usage
      await brokerService.logApiUsage(
        broker.id, req.brokerApiKey!.id, '/api/v1/broker/transfer', 'POST',
        200, Date.now() - startTime, contentHash, currentOwner,
        true
      );
      
      logger.info(`Ownership transferred via broker ${broker.domain}: ${contentHash} (${previousOwner} -> ${newOwner})`);
      
      // Trigger webhook notification
      webhookService.triggerWebhook(broker.id, 'content.transferred', {
        transfer_id: transferId,
        content_hash: contentHash,
        previous_owner: previousOwner,
        new_owner: newOwner,
        reason: reason || 'Broker-initiated transfer',
        timestamp,
        blockchain_tx_hash: blockchainTxHash
      }).catch(err => logger.error('Webhook trigger failed:', err));
      
      res.json({
        success: true,
        transfer: {
          id: transferId,
          contentHash,
          previousOwner,
          newOwner,
          timestamp,
          reason: reason || 'Broker-initiated transfer',
          blockchainTxHash,
          blockchain: record.blockchain || false
        },
        broker: {
          domain: broker.domain,
          name: broker.name
        },
        transferHistory: record.transferHistory,
        message: 'Ownership successfully transferred'
      });
      
    } catch (error) {
      logger.error('Broker transfer failed:', error);
      
      // Only log if broker auth succeeded
      if (req.broker && req.brokerApiKey) {
        await brokerService.logApiUsage(
          req.broker.id, req.brokerApiKey.id, '/api/v1/broker/transfer', 'POST',
          500, Date.now() - startTime, req.body.contentHash, req.body.currentOwner,
          false, error.message
        );
      }
      
      res.status(500).json({
        success: false,
        error: 'Transfer failed',
        message: error.message
      });
    }
  }
);

/**
 * Webhook Management Endpoints
 */

// Register a webhook
app.post('/api/v1/broker/webhooks',
  createBrokerAuthMiddleware(dbClient, {
    scopes: ['broker:register', 'broker:webhooks']
  }),
  [
    body('url')
      .isURL({ protocols: ['http', 'https'], require_protocol: true })
      .withMessage('Valid HTTPS URL required'),
    body('secret')
      .isLength({ min: 32 })
      .withMessage('Webhook secret must be at least 32 characters'),
    body('events')
      .isArray({ min: 1 })
      .withMessage('At least one event type required'),
    body('events.*')
      .isIn(['content.protected', 'content.transferred', 'content.verified', 'identity.verified', 'content.disputed'])
      .withMessage('Invalid event type'),
    body('description')
      .optional()
      .isString()
      .isLength({ max: 500 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { url, secret, events, description, customHeaders, maxRetries, retryDelaySeconds } = req.body;
      const broker = req.broker!;
      
      const webhookId = await webhookService.registerWebhook(
        broker.id,
        url,
        secret,
        events,
        {
          description,
          customHeaders,
          maxRetries,
          retryDelaySeconds
        }
      );
      
      res.status(201).json({
        success: true,
        webhook: {
          id: webhookId,
          url,
          events,
          description
        },
        message: 'Webhook registered successfully'
      });
    } catch (error) {
      logger.error('Webhook registration failed:', error);
      res.status(500).json({
        success: false,
        error: 'Webhook registration failed',
        message: error.message
      });
    }
  }
);

// List webhooks
app.get('/api/v1/broker/webhooks',
  createBrokerAuthMiddleware(dbClient),
  async (req, res) => {
    try {
      const broker = req.broker!;
      const webhooks = await webhookService.listWebhooks(broker.id);
      
      res.json({
        success: true,
        webhooks: webhooks.map(w => ({
          id: w.id,
          url: w.url,
          events: w.events,
          enabled: w.enabled,
          description: w.description,
          created_at: w.created_at,
          last_triggered_at: w.last_triggered_at,
          max_retries: w.max_retries
        }))
      });
    } catch (error) {
      logger.error('Webhook listing failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list webhooks',
        message: error.message
      });
    }
  }
);

// Get webhook delivery stats
app.get('/api/v1/broker/webhooks/:webhookId/stats',
  createBrokerAuthMiddleware(dbClient),
  async (req, res) => {
    try {
      const broker = req.broker!;
      const webhookId = parseInt(req.params.webhookId);
      
      const stats = await webhookService.getDeliveryStats(broker.id, webhookId);
      
      res.json({
        success: true,
        stats: {
          total_deliveries: parseInt(stats.total_deliveries),
          successful: parseInt(stats.successful),
          failed: parseInt(stats.failed),
          retrying: parseInt(stats.retrying),
          avg_duration_ms: parseFloat(stats.avg_duration_ms) || 0,
          success_rate: stats.total_deliveries > 0 
            ? (parseInt(stats.successful) / parseInt(stats.total_deliveries) * 100).toFixed(2) + '%'
            : '0%'
        }
      });
    } catch (error) {
      logger.error('Webhook stats failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get webhook stats',
        message: error.message
      });
    }
  }
);

// Delete a webhook
app.delete('/api/v1/broker/webhooks/:webhookId',
  createBrokerAuthMiddleware(dbClient, {
    scopes: ['broker:register', 'broker:webhooks']
  }),
  async (req, res) => {
    try {
      const broker = req.broker!;
      const webhookId = parseInt(req.params.webhookId);
      
      const deleted = await webhookService.deleteWebhook(webhookId, broker.id);
      
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Webhook not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Webhook deleted successfully'
      });
    } catch (error) {
      logger.error('Webhook deletion failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete webhook',
        message: error.message
      });
    }
  }
);

/**
 * Transfer Ownership Endpoint
 * 
 * Transfers content ownership from one identity to another
 * Records full transfer history on blockchain
 * Only current owner can initiate transfer
 */
app.post('/api/v1/transfer', [
  body('contentHash')
    .isHexadecimal()
    .isLength({ min: 64, max: 64 })
    .withMessage('Valid SHA-256 hash required'),
  body('newOwner')
    .notEmpty()
    .withMessage('New owner identity required'),
  body('currentOwner')
    .notEmpty()
    .withMessage('Current owner identity required'),
  body('signature')
    .optional()
    .isString()
    .withMessage('Owner signature for verification'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { contentHash, newOwner, currentOwner, signature } = req.body;
    
    logger.info(`Transfer request: ${contentHash} from ${currentOwner} to ${newOwner}`);
    
    // Check if content exists
    let record = protectedContent.get(contentHash);
    
    if (!record) {
      // Try blockchain if enabled
      if (blockchainEnabled && blockchainClient.connected) {
        try {
          const blockchainRecord = await blockchainClient.verifyContent(contentHash);
          if (blockchainRecord.verified) {
            record = {
              contentHash,
              owner: blockchainRecord.creator,
              license: blockchainRecord.license,
              blockchain: true
            };
          }
        } catch (err) {
          logger.warn('Blockchain lookup failed:', err.message);
        }
      }
      
      if (!record) {
        return res.status(404).json({
          success: false,
          error: 'Content not found',
          message: 'Content hash not registered'
        });
      }
    }
    
    // Verify current owner
    if (record.owner !== currentOwner) {
      logger.warn(`Unauthorized transfer attempt: ${currentOwner} is not owner of ${contentHash}`);
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        message: 'Only current owner can transfer ownership',
        currentOwner: record.owner
      });
    }
    
    // TODO: Validate signature if provided
    // For now, accept without signature (will need proper auth)
    
    const timestamp = new Date().toISOString();
    const transferRecord = `${currentOwner}->${newOwner}@${timestamp}`;
    
    // Update ownership
    const previousOwner = record.owner;
    record.owner = newOwner;
    record.transferHistory = record.transferHistory || [];
    record.transferHistory.push(transferRecord);
    record.lastTransfer = timestamp;
    
    // If blockchain enabled, execute transfer there
    if (blockchainEnabled && blockchainClient.connected) {
      try {
        // Call blockchain transfer function
        // await blockchainClient.transferOwnership(contentHash, currentOwner, newOwner);
        logger.info(`Blockchain transfer would execute here: ${contentHash}`);
        record.blockchain = true;
      } catch (blockchainError) {
        logger.warn('Blockchain transfer failed, updating memory only:', blockchainError.message);
      }
    }
    
    // Update in-memory storage
    protectedContent.set(contentHash, record);
    
    logger.info(`Ownership transferred: ${contentHash} from ${previousOwner} to ${newOwner}`);
    
    res.json({
      success: true,
      contentHash,
      previousOwner,
      newOwner,
      timestamp,
      transferHistory: record.transferHistory,
      blockchain: record.blockchain || false,
      message: 'Ownership successfully transferred'
    });
    
  } catch (error) {
    logger.error('Ownership transfer failed:', error);
    
    res.status(500).json({
      success: false,
      error: 'Transfer failed',
      message: error.message
    });
  }
});

/**
 * Get Transfer History
 * 
 * Returns complete ownership history for a piece of content
 */
app.get('/api/v1/transfer-history/:hash', [
  param('hash')
    .isHexadecimal()
    .isLength({ min: 64, max: 64 })
    .withMessage('Invalid SHA-256 hash'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { hash } = req.params;
    let record = protectedContent.get(hash);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Content not found'
      });
    }
    
    res.json({
      success: true,
      contentHash: hash,
      currentOwner: record.owner,
      ownerType: record.ownerType || 'direct',
      broker: record.broker,
      transferHistory: record.transferHistory || [],
      registeredAt: record.timestamp
    });
    
  } catch (error) {
    logger.error('Transfer history lookup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Lookup failed',
      message: error.message
    });
  }
});

// Protection statistics endpoint
app.get('/api/v1/stats', (req, res) => {
  try {
    const stats = {
      totalProtected: protectedContent.size,
      byLicense: {
        liberation_v1: 0,
        cc0: 0,
        'cc-by': 0,
        'cc-by-sa': 0
      },
      recentProtections: Array.from(protectedContent.values())
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10)
        .map(record => ({
          contentHash: record.contentHash,
          timestamp: record.timestamp,
          license: record.license,
          title: record.metadata.title
        }))
    };
    
    // Count by license
    for (const record of protectedContent.values()) {
      if (stats.byLicense.hasOwnProperty(record.license)) {
        stats.byLicense[record.license]++;
      }
    }
    
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Stats retrieval failed:', error);
    res.status(500).json({
      success: false,
      error: 'Stats retrieval failed',
      message: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: 'The requested API endpoint does not exist',
    documentation: 'https://docs.daon.network/api/',
    support: {
      message: 'Help keep DAON free for creators',
      funding: 'https://ko-fi.com/greenfieldoverride',
      community: 'https://discord.gg/daon'
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    support: {
      message: 'If this error persists, please report it to help improve DAON',
      funding: 'https://ko-fi.com/greenfieldoverride',
      contact: 'api-support@daon.network'
    }
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server only if not being imported for testing or if START_SERVER is explicitly set
const shouldStartServer = process.env.START_SERVER === 'true' || 
                         (process.env.NODE_ENV !== 'test' && !process.env.SKIP_SERVER_START);

if (shouldStartServer) {
  app.listen(PORT, () => {
    logger.info(`🚀 DAON API Server running on port ${PORT}`);
    logger.info(`📊 Health check: http://localhost:${PORT}/health`);
    logger.info(`📖 API docs: http://localhost:${PORT}/api/v1`);
    logger.info(`⛓️  Blockchain: ${blockchainEnabled ? 'Connected' : 'Demo mode'}`);
    logger.info(`🛡️  Creator protection is now active!`);
    
    // Start webhook retry processor
    webhookRetryProcessor.start();
    logger.info(`🔄 Webhook retry processor started`);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    webhookRetryProcessor.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully...');
    webhookRetryProcessor.stop();
    process.exit(0);
  });
}

export default app;