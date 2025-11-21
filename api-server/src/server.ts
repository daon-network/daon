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

// Load environment variables
dotenv.config();

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
      'GET /api/v1/stats': 'Get protection statistics'
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
    .isIn(['liberation_v1', 'cc0', 'cc-by', 'cc-by-sa'])
    .withMessage('Invalid license type'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { content, metadata = {}, license = 'liberation_v1' } = req.body;
    
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

// Start server only if not in test mode or if explicitly required
if (process.env.NODE_ENV !== 'test' && !process.env.SKIP_SERVER_START) {
  app.listen(PORT, () => {
    logger.info(`🚀 DAON API Server running on port ${PORT}`);
    logger.info(`📊 Health check: http://localhost:${PORT}/health`);
    logger.info(`📖 API docs: http://localhost:${PORT}/api/v1`);
    logger.info(`⛓️  Blockchain: ${blockchainEnabled ? 'Connected' : 'Demo mode'}`);
    logger.info(`🛡️  Creator protection is now active!`);
  });
}

export default app;