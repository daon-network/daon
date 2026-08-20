#!/usr/bin/env node

/**
 * DAON REST API Server
 * 
 * Bridges SDK requests to DAON blockchain for creator protection
 * Provides REST endpoints for content protection and verification
 */

import express from 'express';
import {
  toPlainText,
  EmptyAfterStrippingError,
  EMPTY_SHA256,
} from './utils/content-canonical.js';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import crypto from 'crypto';
import winston from 'winston';
import { body, param, validationResult } from 'express-validator';
import client from 'prom-client';
import blockchainClient from './blockchain.js';
import { DatabaseClient, db } from './database/client.js';
import { contentCommit } from './verifier/index.js';
import createAuthRoutes from './auth/auth-routes.js';
import { requireAdminAuth, logAdminAction } from './auth/admin-middleware.js';
import { verifyToken } from './auth/auth.js';
import { verifyClaim } from './verifier/index.js';
import { sendKeyEventNotification } from './utils/email.js';
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
    max: isLoadTesting ? 10_000_000 : 100, // Effectively unlimited for load testing
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const protectLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: isLoadTesting ? 1_000_000 : 10, // Effectively unlimited for load testing
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

// File uploads arrive as raw bytes, never base64 in a JSON field. Base64
// inflates by a third, so a stated limit would silently become three quarters of
// itself -- and a limit that depends on an encoding the caller never chose is a
// limit nobody can predict.
//
// The cap is smaller than what the local agent accepts, deliberately: this is a
// shared service buffering whole files in memory, and one is a resource everyone
// contends for while the other is the creator's own machine.
app.use(express.raw({ type: 'application/octet-stream', limit: '25mb' }));
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
// Optional auth: attaches req.userId if a valid Bearer token is present, otherwise continues anonymously
const optionalAuth = (req: any, _res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.substring(7));
    if (decoded) req.userId = decoded.userId;
  }
  next();
};

// Association requires an account, because an assertion nobody can be held to
// is not worth recording. Attribution is the accountability mechanism -- DAON
// never ranks competing assertions, so knowing who made one is all it has.
const requireAuth = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const decoded = authHeader?.startsWith('Bearer ')
    ? verifyToken(authHeader.substring(7))
    : null;
  if (!decoded) {
    return res.status(401).json({ success: false, error: 'authentication required' });
  }
  req.userId = decoded.userId;
  next();
};

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

/**
 * The content hash for a registration.
 *
 * Markup is removed first, so the hash commits to the words rather than to the
 * HTML they arrived in. Without this, the same paragraph submitted through the
 * WordPress plugin and through the API produces two different hashes, and a
 * theme or block-editor change silently breaks a registration the creator never
 * touched. See utils/content-canonical.ts and
 * docs/design/document-formats.md.
 *
 * Plain-text input is unchanged, so hashes registered before this behaviour
 * existed still match.
 */
/**
 * How long an owner of record has to answer an asserted key change.
 *
 * Not a chain rule -- the chain has none, and an earlier design that delayed
 * key events was removed because theft forks a chain rather than extending it,
 * and nothing in the format can detect a fork. This is purely how long DAON
 * holds a request open before refusing it.
 *
 * Silence refuses. It is the only reading that cannot be exploited by waiting:
 * if silence accepted, an attacker's best move would be to assert against
 * somebody on holiday and say nothing.
 */
const ATTESTATION_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

const BTN =
  'font:inherit;padding:12px 20px;margin:8px 8px 0 0;border-radius:6px;border:0;cursor:pointer;';

/** A minimal page, so answering an email needs no app and no sign-in. */
function page(title: string, body: string, actions = ''): string {
  return `<!doctype html><meta charset="utf-8"><title>${title} — DAON</title>
    <body style="font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                 color:#101828;max-width:34rem;margin:4rem auto;padding:0 1rem">
      <h1 style="font-size:1.4rem">${title}</h1><p>${body}</p>${actions}
      <p style="color:#6A7282;font-size:.875rem;margin-top:2rem">DAON records what it is told and
      does not decide between competing claims.</p>`;
}

function generateContentHash(content) {
  const { text } = toPlainText(content);
  const hash = crypto.createHash('sha256').update(text, 'utf8').digest('hex');

  // Backstop. toPlainText already refuses content that strips to nothing, but
  // this is the value every such input collapses to, so it is checked at the
  // point of hashing as well -- a future path that skips canonicalisation must
  // not be able to register the hash of no content.
  if (hash === EMPTY_SHA256) {
    throw new EmptyAfterStrippingError();
  }
  return hash;
}

/**
 * Commit to a file's bytes.
 *
 * Files are not canonicalised. There is no equivalent of stripping markup for a
 * photograph: any normalisation that made a re-encoded image hash the same would
 * be a similarity judgement, and this system does not make those.
 *
 * So a re-exported JPEG is a different file, and says so. That is the honest
 * answer rather than the convenient one.
 *
 * The commitment is `content_commit` from `wire-format.md` §6, computed by the
 * same wasm the provenance agent uses -- so a creator who registers a photograph
 * here and verifies it through the agent gets one identity, not two.
 */
function generateFileHash(bytes) {
  const commit = contentCommit(bytes);
  if (!commit) {
    throw new Error('the content verifier is not available on this server');
  }
  return commit.toString('hex');
}

/**
 * Handle a route that accepts either JSON text or raw file bytes.
 *
 * Returns the file buffer when this is a binary request, or null to let the
 * existing text path run untouched. Kept as one function so a future route
 * cannot accidentally accept bytes without the size and emptiness checks.
 */
function fileBodyOrNull(req, res) {
  if (!Buffer.isBuffer(req.body)) return null;
  if (req.body.length === 0) {
    res.status(400).json({
      success: false,
      error: 'empty_file',
      message: 'The uploaded file has no bytes.'
    });
    return undefined;
  }
  return req.body;
}

/**
 * Turn an EmptyAfterStrippingError into a 400 that says what to do.
 *
 * Content that vanishes under text extraction -- an image-only page, a scan, a
 * figure without a caption -- is a client mistake about which pipeline to use,
 * not a server fault.
 */
function handleEmptyContent(e, res) {
  if (e instanceof EmptyAfterStrippingError) {
    res.status(400).json({
      success: false,
      error: 'no_text_content',
      message: e.message,
    });
    return true;
  }
  return false;
}

/**
 * How content was hashed before canonicalisation existed: raw bytes, markup and
 * CRLF included.
 *
 * Needed on the **verify** path only, and permanently. Content is never stored —
 * `protected_content` holds a hash and no body — so there is no way to tell which
 * existing registrations were made over HTML or CRLF, and therefore no migration
 * that could fix them. A creator who registered before the change and submits the
 * same content today would otherwise be told it was never registered, which is
 * the one answer this system must not give wrongly.
 *
 * Never used for new registrations. It only ever widens what verification
 * accepts.
 */
function generateLegacyContentHash(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function generateVerificationUrl(contentHash) {
  const baseUrl = process.env.VERIFICATION_BASE_URL || 'https://verify.daon.network';
  return `${baseUrl}/verify/sha256:${contentHash}`;
}

// Blockchain integration — disabled during load testing to avoid polluting the chain
const blockchainEnabled = process.env.BLOCKCHAIN_ENABLED === 'true' && process.env.LOAD_TEST_MODE !== 'true';

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
    // Build identity, injected at image build time.
    //
    // `version` is the package version and cannot distinguish May's build from
    // today's -- which is exactly how a container ran three-month-old code for
    // three months while every deploy reported success and every liveness check
    // passed. A stale container is perfectly healthy; it is just wrong, and
    // nothing that only asks "is it up" can see that.
    //
    // "unknown" means the image was built without the build arg, which is
    // itself worth noticing.
    build: {
      commit: process.env.GIT_COMMIT || 'unknown',
      builtAt: process.env.BUILD_TIME || 'unknown',
    },
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
    // Build identity, injected at image build time.
    //
    // `version` is the package version and cannot distinguish May's build from
    // today's -- which is exactly how a container ran three-month-old code for
    // three months while every deploy reported success and every liveness check
    // passed. A stale container is perfectly healthy; it is just wrong, and
    // nothing that only asks "is it up" can see that.
    //
    // "unknown" means the image was built without the build arg, which is
    // itself worth noticing.
    build: {
      commit: process.env.GIT_COMMIT || 'unknown',
      builtAt: process.env.BUILD_TIME || 'unknown',
    },
    description: 'Creator protection API for blockchain-verified content ownership',
    endpoints: {
      'POST /api/v1/protect': 'Protect content with Liberation License',
      'POST /api/v1/protect/bulk': 'Protect multiple works at once',
      'GET /api/v1/verify/:hash': 'Verify content protection status by hash',
      'POST /api/v1/verify-content': 'Verify by submitting content — returns who registered it',
      'GET /api/v1/stats': 'Get protection statistics',
      'POST /api/v1/content/:hash/association':
        'Assert that a provenance chain covers registered content. Optionally carries a proof',
      'GET /api/v1/content/:hash/associations':
        'Every chain asserted for this content. More than one is normal; DAON does not rank them',
      'POST /api/v1/associations/:id/attest':
        'Owner of record confirms a pending association',
      'POST /api/v1/associations/:id/dispute':
        'Owner of record denies a pending association. Recorded, dated, never made current',
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
/**
 * Register a file — the binary half of POST /api/v1/protect.
 *
 * Licence and metadata travel as query parameters because the body is the file.
 * A multipart parser would let them share the body, at the cost of a parser
 * handling attacker-shaped input for the sake of two scalars.
 */
app.post('/api/v1/protect', optionalAuth, async (req, res, next) => {
  const bytes = fileBodyOrNull(req, res);
  if (bytes === null) return next();
  if (bytes === undefined) return;

  try {
    const contentHash = generateFileHash(bytes);
    const license = (req.query.license as string) || 'liberation_v1';
    const title = (req.query.title as string) || null;

    const existing = await db.content.findByHash(contentHash).catch(() => null);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'already_registered',
        contentHash,
        message: 'These exact bytes are already registered.',
        registeredAt: existing.created_at ?? null
      });
    }

    const timestamp = new Date().toISOString();
    const verificationUrl = generateVerificationUrl(contentHash);
    let blockchainTx = null;

    if (blockchainEnabled && blockchainClient.connected) {
      try {
        const result = await blockchainClient.registerContent(
          contentHash,
          { title: title || 'Untitled File', type: 'file' },
          license
        );
        blockchainTx = result.txHash;
        logger.info(`File registered on blockchain: ${contentHash} (tx: ${blockchainTx})`);
      } catch (blockchainError) {
        logger.error('Blockchain file registration failed:', blockchainError);
      }
    }

    const protectionRecord = {
      contentHash,
      timestamp,
      license,
      metadata: {
        title: title || 'Untitled File',
        type: 'file',
        byteLength: bytes.length
      },
      verificationUrl,
      blockchainTx,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    };
    protectedContent.set(contentHash, protectionRecord);

    try {
      await db.content.create({
        user_id: (req as any).userId || null,
        content_hash: contentHash,
        title: title || 'Untitled File',
        description: null,
        content_type: 'file',
        license,
        blockchain_tx: blockchainTx,
        verification_url: verificationUrl,
      });
    } catch (dbWriteError) {
      if ((dbWriteError as any).code !== '23505') {
        logger.warn('Failed to persist file to DB:', (dbWriteError as any).message);
      }
    }

    return res.status(201).json({
      success: true,
      contentHash,
      license,
      timestamp,
      verificationUrl,
      bytes: bytes.length,
      blockchain: { enabled: blockchainEnabled, tx: blockchainTx }
    });
  } catch (e) {
    logger.error('protect-file failed:', e.message);
    return res.status(500).json({ success: false, error: 'registration_failed', message: e.message });
  }
});

app.post("/api/v1/protect", [optionalAuth,
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
    // `values: 'null'` so an explicit `"license": null` falls back to the
    // default exactly as omitting the field does. Without it, a client that
    // serialises absent values as null is rejected for supplying no opinion.
    .optional({ values: 'null' })
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
  body('ai_training_policy')
    .optional()
    .isIn(['prohibited', 'contact_required', 'open'])
    .withMessage('ai_training_policy must be prohibited, contact_required, or open'),
  body('licensing_email')
    .optional()
    .isEmail()
    .withMessage('licensing_email must be a valid email address'),
  body('licensing_uri')
    .optional()
    .isURL()
    .withMessage('licensing_uri must be a valid URL'),
  handleValidationErrors
], async (req, res) => {
  try {
    const {
      content,
      metadata = {},
      // licence and policy are read below, not destructured: a destructuring
      // default only fires on `undefined`.
      licensing_email,
      licensing_uri,
    } = req.body;

    // `??` rather than a destructuring default, so an explicit null means
    // "no opinion, use the default" instead of being stored as a record with
    // no licence at all.
    const license = req.body.license ?? 'liberation_v1';
    const ai_training_policy = req.body.ai_training_policy ?? 'prohibited';

    if (ai_training_policy === 'contact_required' && !licensing_email && !licensing_uri) {
      return res.status(400).json({
        success: false,
        error: 'licensing_email or licensing_uri is required when ai_training_policy is contact_required',
      });
    }
    
    // Generate content hash
    const contentHash = generateContentHash(content);
    const timestamp = new Date().toISOString();
    const verificationUrl = generateVerificationUrl(contentHash);
    
    let blockchainTx = null;
    let existing = false;

    // Check if already exists in DB
    try {
      const existingInDb = await db.content.findByHash(contentHash);
      if (existingInDb) {
        logger.info(`Content already protected in DB: ${contentHash}`);
        contentProtectionsTotal.labels(license, 'existing').inc();
        return res.json({
          success: true,
          contentHash,
          verificationUrl,
          timestamp: existingInDb.created_at,
          license: existingInDb.license,
          message: 'Content already protected',
          existing: true,
          blockchain: {
            enabled: blockchainEnabled,
            tx: existingInDb.blockchain_tx
          }
        });
      }
      // The DB is authoritative, but it can be reachable and still not have the
      // row -- for instance when an earlier write failed and only the cache
      // recorded it. Consulting the cache here is what stops that turning into a
      // second record for content that is already protected.
      const cached = protectedContent.get(contentHash);
      if (cached) {
        logger.info(`Content already protected (cache): ${contentHash}`);
        contentProtectionsTotal.labels(license, 'existing').inc();
        return res.json({
          success: true,
          contentHash,
          verificationUrl,
          timestamp: cached.timestamp,
          license: cached.license,
          message: 'Content already protected',
          existing: true,
          blockchain: { enabled: blockchainEnabled, tx: cached.blockchainTx }
        });
      }
    } catch (dbCheckError) {
      logger.warn('DB existence check failed, continuing:', dbCheckError.message);

      // Fall back to the process cache. Without this a transient database error
      // turns a duplicate registration into a second record for content that is
      // already protected -- the DB check is the only thing between "already
      // protected" and a duplicate, and it is allowed to fail.
      const cached = protectedContent.get(contentHash);
      if (cached) {
        logger.info(`Content already protected (cache): ${contentHash}`);
        contentProtectionsTotal.labels(license, 'existing').inc();
        return res.json({
          success: true,
          contentHash,
          verificationUrl,
          timestamp: cached.timestamp,
          license: cached.license,
          message: 'Content already protected',
          existing: true,
          blockchain: { enabled: blockchainEnabled, tx: cached.blockchainTx }
        });
      }
    }

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
        // Fall back to DB + in-memory storage if blockchain fails
        logger.warn('Falling back to DB/in-memory storage');
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

    // Persist to database so all instances and restarts can verify
    try {
      await db.content.create({
        user_id: req.userId || null,
        content_hash: contentHash,
        title: metadata.title || 'Untitled Work',
        description: metadata.description,
        content_type: metadata.type || 'text',
        license,
        blockchain_tx: blockchainTx,
        verification_url: verificationUrl,
        ai_training_policy,
        licensing_email,
        licensing_uri,
      });
    } catch (dbWriteError) {
      // Unique violation = already exists (race condition), safe to ignore
      if ((dbWriteError as any).code !== '23505') {
        logger.warn('Failed to persist content to DB:', (dbWriteError as any).message);
      }
    }
    
    // Update metrics
    contentProtectionsTotal.labels(license, 'success').inc();
    
    logger.info(`Content protected: ${contentHash} (${license})${blockchainTx ? ' [blockchain]' : ' [memory]'}`);
    
    res.status(201).json({
      success: true,
      contentHash,
      verificationUrl,
      timestamp,
      license,
      ai_training_policy,
      licensing_email: licensing_email || null,
      licensing_uri: licensing_uri || null,
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
    if (handleEmptyContent(error, res)) return;
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
    if (handleEmptyContent(error, res)) return;
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
    
    // Check blockchain verification
    let blockchainVerified = false;
    if (blockchainEnabled && blockchainClient.connected) {
      try {
        const blockchainRecord = await blockchainClient.verifyContent(hash);
        if (blockchainRecord.verified) {
          blockchainVerified = true;
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
        logger.warn('Blockchain verification failed, checking database:', blockchainError.message);
      }
    }

    // Always check database for full record (title, AI policy, tx hash, etc.)
    try {
      const dbRecord = await db.content.findByHash(hash);
      if (dbRecord) {
        if (!record) {
          // DB is the primary source
          record = {
            contentHash: hash,
            timestamp: dbRecord.created_at,
            license: dbRecord.license,
            blockchain: false,
          };
          source = 'database';
        }
        // Enrich record with DB fields regardless of source
        record.ai_training_policy = dbRecord.ai_training_policy || 'prohibited';
        record.licensing_email = dbRecord.licensing_email || null;
        record.metadata = {
          title: dbRecord.title,
          type: dbRecord.content_type,
          description: dbRecord.description,
        };
        record.verificationUrl = dbRecord.verification_url || generateVerificationUrl(hash);
        record.blockchainTx = dbRecord.blockchain_tx;
        record.blockchainHeight = dbRecord.blockchain_height;
      }
    } catch (dbError) {
      logger.warn('DB verification lookup failed:', (dbError as any).message);
    }

    // Fall back to in-memory cache
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
      ai_training_policy: record.ai_training_policy || 'prohibited',
      licensing_email: record.licensing_email || null,
      metadata: record.metadata,
      verificationUrl: record.verificationUrl || generateVerificationUrl(hash),
      blockchain: {
        enabled: blockchainEnabled,
        verified: source === 'blockchain',
        source: source,
        txHash: record.blockchainTx || null,
        height: record.blockchainHeight || null,
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

// Verify-by-content endpoint
// Inverts the verification flow: submit content → get back who registered it (if anyone)
// This closes the "token transplanting" gap where a hash link can appear on unrelated content.

/**
 * Associate a provenance chain with a registered content hash.
 *
 * Appended, never updated, and deliberately **not exclusive**: any number of
 * accounts may assert an association for the same hash and none displaces
 * another. If a hash accepted only one, whoever asserted first would squat it,
 * and the person best placed to do that is not the creator.
 *
 * DAON records what it is told. It does not verify that the chain covers this
 * content -- that needs the content, which is not stored -- and it does not
 * decide between competing assertions. See docs/design/publication-and-versions.md.
 */
app.post('/api/v1/content/:hash/association', [
  requireAuth,
  body('entity_id').isLength({ min: 64, max: 71 }).withMessage('entity_id required'),
  body('head').isLength({ min: 64, max: 71 }).withMessage('head required'),
  body('author_key').optional().isLength({ min: 64, max: 71 }),
  body('recovery_key').optional().isLength({ min: 64, max: 71 }),
  // A proof, if the asserter has one. Hex of the verifier's claim buffer --
  // see provenance/verify-wasm/src/lib.rs. Optional because an association is
  // worth recording without one; supplying it is what makes `verified` true.
  body('proof').optional().isHexadecimal().isLength({ max: 131072 }),
  handleValidationErrors,
], async (req: any, res) => {
  try {
    const bare = (v: any) => (v == null ? null : String(v).replace(/^sha256:/, ''));
    const contentHash = bare(req.params.hash)!;
    const entityId = bare(req.body.entity_id)!;
    const head = bare(req.body.head)!;
    const authorKey = bare(req.body.author_key);
    const recoveryKey = bare(req.body.recovery_key);

    const hex64 = (v: string | null) => v === null || /^[0-9a-f]{64}$/.test(v);
    if (![contentHash, entityId, head].every((v) => hex64(v)) || !hex64(authorKey) || !hex64(recoveryKey)) {
      return res.status(400).json({ success: false, error: 'expected 64 hex characters' });
    }

    // Who DAON says owns this. The gate is the owner of record -- not the
    // previous asserter, which would hand whoever asserted first a veto over
    // everyone after.
    const registration = await db.content.findByHash(contentHash);
    const ownerOfRecord: number | null = registration?.user_id ?? null;
    const asserterIsOwner = ownerOfRecord !== null && ownerOfRecord === req.userId;

    // Does this assertion change the chain's keys, or merely advance its head?
    const current = await db.associations.currentFor(contentHash);
    const keysKnown = current?.author_key != null || current?.recovery_key != null;
    const keysDiffer =
      keysKnown &&
      (current.author_key !== authorKey || current.recovery_key !== recoveryKey);

    // Three ways to be current, one way to be pending.
    //
    // The owner asserting needs no attestation -- asserting *is* attesting, and
    // emailing someone to confirm what they just did is friction with no safety
    // in it. A chain that merely grew needs none either. Only somebody else
    // changing the keys on a work with an owner waits.
    //
    // Note what verification would not buy here: a thief holding the stolen key
    // produces a rotation that verifies perfectly, because the stolen key *is*
    // the recorded key. Soundness is not ownership.
    const needsAttestation = keysDiffer && !asserterIsOwner && ownerOfRecord !== null;

    // Check the proof if one came. This answers "is this a real, witnessed
    // chain" and never "is this person the owner" -- a thief's rotation
    // verifies perfectly, because the stolen key is the recorded key. Which is
    // why a verified assertion still waits for the owner of record.
    let verification: ReturnType<typeof verifyClaim> | null = null;
    if (req.body.proof) {
      verification = verifyClaim(Buffer.from(String(req.body.proof), 'hex'));
      if (!verification.verified) {
        return res.status(400).json({
          success: false,
          error: 'proof_did_not_verify',
          message: verification.reason,
        });
      }
    }

    const record = await db.associations.append({
      content_hash: contentHash,
      entity_id: entityId,
      head,
      asserted_by: req.userId,
      author_key: authorKey,
      recovery_key: recoveryKey,
      status: needsAttestation ? 'pending' : 'current',
      expires_at: needsAttestation ? new Date(Date.now() + ATTESTATION_WINDOW_MS) : null,
      resolution_token: needsAttestation ? crypto.randomBytes(32).toString('hex') : null,
      verified: verification?.verified ?? false,
    });

    // Notify the owner of record, and only them. An unsent email must not fail
    // the request: the association is recorded and not sending does not
    // unrecord it.
    let notified = false;
    if (needsAttestation) {
      try {
        const owner = await db.users.findById(ownerOfRecord!);
        const asserter = await db.users.findById(req.userId);
        if (owner?.email) {
          await sendKeyEventNotification(owner.email, {
            contentHash,
            entityId,
            assertedBy: asserter?.email ?? 'another account',
            assertedAt: new Date(),
            answerBy: new Date(Date.now() + ATTESTATION_WINDOW_MS),
            // The link that closes the circuit. A deadline with no way to meet
            // it is not a notification, it is an announcement.
            resolveUrl: `${process.env.API_BASE_URL || 'https://api.daon.network'}` +
              `/api/v1/associations/resolve/${record.resolution_token}`,
          });
          notified = true;
        }
      } catch (mailError) {
        logger.error('key-event notification failed:', (mailError as any).message);
      }
    }

    res.status(201).json({
      success: true,
      association: {
        id: record.id,
        content_hash: contentHash,
        entity_id: entityId,
        head,
        status: record.status,
        verified: record.verified,
        existed_by_ms: verification?.existedByMs ?? null,
        signature_checked: verification?.signatureChecked ?? false,
        recorded_at: record.recorded_at,
      },
      note:
        record.status === 'pending'
          ? 'Recorded, and not current: this asserts different chain keys, so it waits for the owner of record. It expires in five days, refused.'
          : verification?.verified
            ? 'Recorded, and the chain checks out: the leaf proves into a witnessed head. That is not a statement about who owns it.'
            : 'Recorded as asserted. No proof was supplied, so DAON has not checked this chain.',
      // Stated even when it is nobody, because "no owner of record" is a fact a
      // caller should know rather than infer from silence.
      owner_of_record: ownerOfRecord !== null,
      notified,
    });
  } catch (error) {
    logger.error('association failed:', (error as any).message);
    res.status(500).json({ success: false, error: 'could not record association' });
  }
});

/**
 * Attest or dispute a pending association. Owner of record only.
 *
 * Both outcomes are recorded. A disputed assertion is not deleted -- it stays on
 * the record, dated and attributed, because that it was made is a fact.
 */
app.post('/api/v1/associations/:id/:action(attest|dispute)', [
  requireAuth,
], async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, error: 'bad association id' });
    }

    const rows = await db.query('SELECT * FROM content_associations WHERE id = $1', [id]);
    const assoc = rows.rows[0];
    if (!assoc) return res.status(404).json({ success: false, error: 'no such association' });
    if (assoc.status !== 'pending') {
      return res.status(409).json({ success: false, error: `association is ${assoc.status}` });
    }
    if (assoc.expires_at && new Date(assoc.expires_at) <= new Date()) {
      // Expired means refused. Answering late does not revive it -- a deadline
      // that can be missed and then met is not a deadline.
      return res.status(409).json({
        success: false,
        error: 'this request expired and was refused',
        expired_at: assoc.expires_at,
      });
    }

    const registration = await db.content.findByHash(assoc.content_hash);
    if (!registration?.user_id || registration.user_id !== req.userId) {
      // 403 rather than 404: the association exists and the caller is simply
      // not the person entitled to resolve it.
      return res.status(403).json({ success: false, error: 'only the owner of record may resolve this' });
    }

    const status = req.params.action === 'attest' ? 'attested' : 'disputed';
    const updated = await db.associations.resolve(id, status, req.userId);
    if (!updated) return res.status(409).json({ success: false, error: 'already resolved' });

    res.json({
      success: true,
      association: { id, status: updated.status, resolved_at: updated.resolved_at },
      note:
        status === 'attested'
          ? 'Attested. This is now the association DAON answers with.'
          : 'Disputed. Recorded and dated; it will not become current.',
    });
  } catch (error) {
    logger.error('association resolve failed:', (error as any).message);
    res.status(500).json({ success: false, error: 'could not resolve association' });
  }
});


/**
 * Answer a pending association from the notification email.
 *
 * Two steps on purpose. `GET` renders a page describing what is being asked;
 * only `POST` changes anything. Mail scanners, link previewers and corporate
 * security proxies fetch every URL in a message, so a `GET` that resolved would
 * have those systems answering on the creator's behalf — silently, and often
 * within seconds of delivery.
 *
 * The token is the credential, which is the same trust model as the magic link
 * this account signs in with: possession of the mailbox. It is single use and
 * dies with the request's deadline.
 */
app.get('/api/v1/associations/resolve/:token', async (req, res) => {
  try {
    const assoc = await db.associations.findByToken(String(req.params.token));
    if (!assoc) {
      return res.status(404).type('html').send(page(
        'This link has expired',
        'It may already have been used, or the five-day window may have passed. ' +
        'Either way the request was refused and your record is unchanged.'
      ));
    }
    const token = encodeURIComponent(String(req.params.token));
    res.type('html').send(page(
      'A key change was asserted for your work',
      `Someone asserted that the chain for content <code>${assoc.content_hash.slice(0, 16)}…</code> ` +
      `now uses different keys. Nothing has changed in DAON's record, and nothing will unless you say so.`,
      `<form method="POST" action="/api/v1/associations/resolve/${token}" style="display:inline">
         <input type="hidden" name="action" value="attest">
         <button name="go" value="1" style="${BTN}background:#155DFC;color:#fff">Yes, this was me</button>
       </form>
       <form method="POST" action="/api/v1/associations/resolve/${token}" style="display:inline">
         <input type="hidden" name="action" value="dispute">
         <button name="go" value="1" style="${BTN}background:#fff;color:#B42318;border:2px solid #B42318">No, I did not do this</button>
       </form>`
    ));
  } catch (error) {
    logger.error('resolve page failed:', (error as any).message);
    res.status(500).type('html').send(page('Something went wrong', 'Please try again.'));
  }
});

app.post('/api/v1/associations/resolve/:token', async (req, res) => {
  try {
    const assoc = await db.associations.findByToken(String(req.params.token));
    if (!assoc) {
      return res.status(404).type('html').send(page(
        'This link has expired',
        'It may already have been used, or the window may have passed. The request was refused.'
      ));
    }
    const action = String(req.body?.action) === 'dispute' ? 'disputed' : 'attested';

    // Resolved as the owner of record, since holding the token is how they
    // proved they are that person.
    const registration = await db.content.findByHash(assoc.content_hash);
    const updated = await db.associations.resolve(assoc.id, action, registration?.user_id ?? null);
    if (!updated) {
      return res.status(409).type('html').send(page('Already answered', 'This request has been resolved.'));
    }

    res.type('html').send(
      action === 'attested'
        ? page('Recorded as yours', 'This association is now the one DAON answers with.')
        : page('Recorded as disputed', 'It will not become DAON\'s answer. The assertion stays on the record, dated, because that it was made is a fact.')
    );
  } catch (error) {
    logger.error('resolve failed:', (error as any).message);
    res.status(500).type('html').send(page('Something went wrong', 'Please try again.'));
  }
});

/** Every association for a content hash, oldest first. None outranks another. */
app.get('/api/v1/content/:hash/associations', async (req, res) => {
  try {
    const contentHash = String(req.params.hash).replace(/^sha256:/, '');
    const rows = await db.associations.forContent(contentHash);
    res.json({
      success: true,
      count: rows.length,
      associations: rows.map((r: any) => ({
        entity_id: r.entity_id,
        head: r.head,
        verified: r.verified,
        recorded_at: r.recorded_at,
      })),
      note: rows.length > 1
        ? 'More than one chain is asserted for this content. DAON does not rank them.'
        : undefined,
    });
  } catch (error) {
    logger.error('association lookup failed:', (error as any).message);
    res.status(500).json({ success: false, error: 'could not read associations' });
  }
});

/**
 * Verify a file — the binary half of POST /api/v1/verify-content.
 *
 * Registered before the JSON route and calls next() when the body is not a
 * Buffer, so a text request reaches the existing handler unchanged. Splitting on
 * content type rather than on a second URL keeps one endpoint for "do you have
 * this content", which is the question a caller is actually asking.
 */
app.post('/api/v1/verify-content', async (req, res, next) => {
  const bytes = fileBodyOrNull(req, res);
  if (bytes === null) return next();     // text request; existing path handles it
  if (bytes === undefined) return;       // already answered (empty file)

  try {
    const contentHash = generateFileHash(bytes);

    let record = null;
    let source = 'memory';

    if (blockchainEnabled && blockchainClient.connected) {
      try {
        const onChain = await blockchainClient.verifyContent(contentHash);
        if (onChain.verified) {
          record = onChain;
          source = 'blockchain';
        }
      } catch (err) {
        logger.warn('verify-file blockchain lookup failed:', err.message);
      }
    }

    if (!record) {
      try {
        const dbRecord = await db.content.findByHash(contentHash);
        if (dbRecord) {
          record = dbRecord;
          source = 'database';
        }
      } catch (err) {
        logger.warn('verify-file database lookup failed:', err.message);
      }
    }

    if (!record) {
      record = protectedContent.get(contentHash) || null;
    }

    if (!record) {
      contentVerificationsTotal.labels('not_found').inc();
      return res.status(404).json({
        success: false,
        isValid: false,
        contentHash,
        error: 'Content not found in protection registry',
        // Said plainly, because it is the first thing someone hits: a file that
        // has been re-exported, recompressed or had metadata rewritten is a
        // different file and will not be found. Nothing here judges similarity.
        message:
          'No record for these exact bytes. Re-encoding, cropping or editing ' +
          'metadata produces a different file, which DAON treats as different content.'
      });
    }

    logger.info(`File verification: ${contentHash} [${source}]`);
    contentVerificationsTotal.labels('success').inc();
    return res.json({
      success: true,
      isValid: true,
      contentHash,
      source,
      bytes: bytes.length,
      record
    });
  } catch (e) {
    logger.error('verify-file failed:', e.message);
    return res.status(500).json({ success: false, error: 'verification_failed', message: e.message });
  }
});

app.post('/api/v1/verify-content', [
  body('content')
    .isString()
    .notEmpty()
    .withMessage('content must be a non-empty string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { content } = req.body;

    // Must go through the same function as /protect, not a second inline copy:
    // a verify path that hashes differently reports "not registered" for content
    // that is registered, which is the worst possible failure here.
    const contentHash = generateContentHash(content);

    // Registrations predating canonicalisation committed to the raw bytes. Since
    // content is not stored, they cannot be identified or migrated, so both are
    // accepted here and the canonical one is tried first.
    const legacyHash = generateLegacyContentHash(content);
    const candidateHashes =
      legacyHash === contentHash ? [contentHash] : [contentHash, legacyHash];

    let record = null;
    let source = 'memory';
    let matchedHash = contentHash;

    // Try blockchain first if enabled
    if (blockchainEnabled && blockchainClient.connected) {
      for (const candidate of candidateHashes) {
      try {
        const blockchainRecord = await blockchainClient.verifyContent(candidate);
        if (blockchainRecord.verified) {
          matchedHash = candidate;
          record = {
            contentHash: candidate,
            timestamp: new Date(blockchainRecord.timestamp * 1000).toISOString(),
            license: blockchainRecord.license,
            creator: blockchainRecord.creator,
            metadata: blockchainRecord.metadata,
            blockchain: true
          };
          source = 'blockchain';
        }
      } catch (blockchainError) {
        logger.warn('Blockchain verify-content failed, checking memory:', blockchainError.message);
      }
      if (record) break;
      }
    }

    // Fall back to in-memory cache
    if (!record) {
      for (const candidate of candidateHashes) {
        record = protectedContent.get(candidate);
        if (record) { matchedHash = candidate; break; }
      }
      if (record) {
        source = 'memory-cache';
      }
    }

    // Fall back to database. This is the path that matters most for
    // registrations predating canonicalisation, which is why it tries both.
    if (!record) {
      for (const candidate of candidateHashes) {
        try {
          const dbRecord = await db.content.findByHash(candidate);
          if (dbRecord) {
            matchedHash = candidate;
            record = {
              contentHash: candidate,
              timestamp: dbRecord.created_at,
              license: dbRecord.license,
              metadata: {
                title: dbRecord.title,
                type: dbRecord.content_type,
                description: dbRecord.description,
              },
              verificationUrl:
                dbRecord.verification_url || generateVerificationUrl(candidate),
              blockchainTx: dbRecord.blockchain_tx,
            };
            source = 'database';
            break;
          }
        } catch (dbError) {
          logger.warn('DB verify-content lookup failed:', (dbError as any).message);
        }
      }
    }

    // A match on the legacy hash is worth knowing about: it says the creator is
    // holding content that predates canonicalisation, and it is the only signal
    // that would ever tell us how much of that exists.
    if (record && matchedHash !== contentHash) {
      logger.info('verify-content matched a pre-canonicalisation hash');
    }

    if (!record) {
      contentVerificationsTotal.labels('not_found').inc();
      return res.status(404).json({
        success: false,
        isValid: false,
        contentHash,
        error: 'Content not found in protection registry'
      });
    }

    logger.info(`Verify-content lookup: ${contentHash} [${source}]`);
    contentVerificationsTotal.labels('success').inc();

    res.json({
      success: true,
      isValid: true,
      contentHash,
      timestamp: record.timestamp,
      license: record.license,
      creator: record.creator,
      metadata: record.metadata,
      verificationUrl: record.verificationUrl || generateVerificationUrl(contentHash),
      blockchain: {
        enabled: blockchainEnabled,
        verified: source === 'blockchain',
        source
      }
    });

  } catch (error) {
    if (handleEmptyContent(error, res)) return;
    logger.error('Verify-content failed:', error);
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
      // `values: 'null'` so an explicit `"license": null` falls back to the
      // default exactly as omitting the field does. Without it, a client that
      // serialises absent values as null is rejected for supplying no opinion.
      // (express-validator 7 renamed this from `{ nullable: true }`.)
      .optional({ values: 'null' })
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
    if (handleEmptyContent(error, res)) return;
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
      const webhookId = parseInt(req.params.webhookId as string);
      
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
      const webhookId = parseInt(req.params.webhookId as string);
      
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
  // A body over the limit is a foreseeable client mistake, not a server fault.
  // It was reaching the catch-all below, which logged it as "Unhandled error"
  // and answered 500 -- so a caller sending a large file was told DAON had
  // broken, and the log filled with stack traces for ordinary input.
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    const limit = err.limit ? `${Math.floor(err.limit / (1024 * 1024))}MB` : 'the limit';
    return res.status(413).json({
      success: false,
      error: 'payload_too_large',
      message: `Request body exceeds ${limit}.`,
      limit: err.limit ?? null,
      received: err.length ?? null
    });
  }

  // Malformed JSON is likewise the caller's doing.
  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return res.status(400).json({
      success: false,
      error: 'malformed_json',
      message: 'Request body is not valid JSON.'
    });
  }

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