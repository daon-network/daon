/**
 * Tests for Broker Authentication Middleware
 * 
 * Comprehensive test coverage for broker API authentication,
 * rate limiting, signature verification, and security controls
 */

import { test, describe, beforeEach, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import { Request, Response, NextFunction } from 'express';
import {
  createBrokerAuthMiddleware,
  requireBrokerDomain,
  requireCertificationTier,
} from '../broker/broker-auth-middleware.js';
import { BrokerService, Broker, BrokerApiKey, RateLimitResult } from '../broker/broker-service.js';
import { DatabaseClient } from '../database/client.js';

// Mock DatabaseClient
const mockDb = {
  query: mock.fn(() => Promise.resolve({ rows: [] })),
  end: mock.fn(() => Promise.resolve()),
} as unknown as DatabaseClient;

// Helper to create mock Request
function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    headers: {},
    body: {},
    path: '/api/v1/broker/test',
    ip: '127.0.0.1',
    ...overrides,
  };
}

// Helper to create mock Response
function createMockResponse(): Partial<Response> & { 
  statusCode?: number;
  jsonData?: any;
  headers?: Record<string, string>;
} {
  const res: any = {
    statusCode: 200,
    jsonData: null,
    headers: {},
    status: function(code: number) {
      this.statusCode = code;
      return this;
    },
    json: function(data: any) {
      this.jsonData = data;
      return this;
    },
    set: function(headers: Record<string, string>) {
      this.headers = { ...this.headers, ...headers };
      return this;
    },
  };
  return res;
}

// Mock broker data
const mockBroker: Broker = {
  id: 1,
  domain: 'ao3.org',
  name: 'Archive of Our Own',
  certification_tier: 'standard',
  certification_status: 'active',
  enabled: true,
  rate_limit_per_hour: 1000,
  rate_limit_per_day: 10000,
  require_signature: false,
  public_key: undefined,
};

const mockApiKey: BrokerApiKey = {
  id: 1,
  broker_id: 1,
  key_prefix: 'daon_test_key_1',
  scopes: ['broker:register', 'broker:verify', 'broker:transfer'],
  expires_at: new Date(Date.now() + 86400000), // 24 hours from now
  revoked_at: undefined,
};

const mockRateLimit: RateLimitResult = {
  allowed: true,
  remaining_hourly: 999,
  remaining_daily: 9999,
  reset_hourly: new Date(Date.now() + 3600000),
  reset_daily: new Date(Date.now() + 86400000),
};

describe('Broker Authentication Middleware', () => {
  beforeEach(() => {
    process.env.LOG_LEVEL = 'error'; // Suppress logs during tests
  });

  describe('createBrokerAuthMiddleware - Authorization header validation', () => {
    test('should reject request without Authorization header', async () => {
      const middleware = createBrokerAuthMiddleware(mockDb);
      const req = createMockRequest();
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonData?.success, false);
      assert.equal(res.jsonData?.code, 'BROKER_AUTH_MISSING');
      assert.equal(next.mock.calls.length, 0);
    });

    test('should allow request without Authorization if not required', async () => {
      const middleware = createBrokerAuthMiddleware(mockDb, { required: false });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(next.mock.calls.length, 1);
    });

    test('should reject invalid Authorization format (missing Bearer)', async () => {
      const middleware = createBrokerAuthMiddleware(mockDb);
      const req = createMockRequest({
        headers: { authorization: 'daon_test_key_123456' },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonData?.code, 'BROKER_AUTH_INVALID_FORMAT');
    });

    test('should reject invalid Authorization format (extra parts)', async () => {
      const middleware = createBrokerAuthMiddleware(mockDb);
      const req = createMockRequest({
        headers: { authorization: 'Bearer key extra_part' },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonData?.code, 'BROKER_AUTH_INVALID_FORMAT');
    });
  });

  describe('createBrokerAuthMiddleware - API key authentication', () => {
    test('should reject invalid API key', async () => {
      // Mock BrokerService to return null (invalid key)
      const originalAuth = BrokerService.prototype.authenticateBroker;
      BrokerService.prototype.authenticateBroker = mock.fn(() => Promise.resolve(null));

      const middleware = createBrokerAuthMiddleware(mockDb);
      const req = createMockRequest({
        headers: { authorization: 'Bearer daon_invalid_key_123' },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonData?.code, 'BROKER_AUTH_INVALID_KEY');
      assert.equal(next.mock.calls.length, 0);

      BrokerService.prototype.authenticateBroker = originalAuth;
    });

    test('should authenticate valid API key', async () => {
      // Mock BrokerService methods
      const originalAuth = BrokerService.prototype.authenticateBroker;
      const originalRate = BrokerService.prototype.checkRateLimit;
      
      BrokerService.prototype.authenticateBroker = mock.fn(() => Promise.resolve({
        broker: mockBroker,
        apiKey: mockApiKey,
      }));
      BrokerService.prototype.checkRateLimit = mock.fn(() => Promise.resolve(mockRateLimit));

      const middleware = createBrokerAuthMiddleware(mockDb);
      const req = createMockRequest({
        headers: { authorization: 'Bearer daon_test_key_123456' },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(next.mock.calls.length, 1);
      assert.deepEqual(req.broker, mockBroker);
      assert.deepEqual(req.brokerApiKey, mockApiKey);

      BrokerService.prototype.authenticateBroker = originalAuth;
      BrokerService.prototype.checkRateLimit = originalRate;
    });

    test('should add rate limit headers on successful auth', async () => {
      const originalAuth = BrokerService.prototype.authenticateBroker;
      const originalRate = BrokerService.prototype.checkRateLimit;
      
      BrokerService.prototype.authenticateBroker = mock.fn(() => Promise.resolve({
        broker: mockBroker,
        apiKey: mockApiKey,
      }));
      BrokerService.prototype.checkRateLimit = mock.fn(() => Promise.resolve(mockRateLimit));

      const middleware = createBrokerAuthMiddleware(mockDb);
      const req = createMockRequest({
        headers: { authorization: 'Bearer daon_test_key_123456' },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.headers?.['X-RateLimit-Limit-Hourly'], '1000');
      assert.equal(res.headers?.['X-RateLimit-Limit-Daily'], '10000');
      assert.equal(res.headers?.['X-RateLimit-Remaining-Hourly'], '999');
      assert.equal(res.headers?.['X-RateLimit-Remaining-Daily'], '9999');

      BrokerService.prototype.authenticateBroker = originalAuth;
      BrokerService.prototype.checkRateLimit = originalRate;
    });
  });

  describe('createBrokerAuthMiddleware - Scope validation', () => {
    test('should reject request with insufficient scopes', async () => {
      const originalAuth = BrokerService.prototype.authenticateBroker;
      
      BrokerService.prototype.authenticateBroker = mock.fn(() => Promise.resolve({
        broker: mockBroker,
        apiKey: { ...mockApiKey, scopes: ['broker:verify'] }, // Only verify scope
      }));

      const middleware = createBrokerAuthMiddleware(mockDb, {
        scopes: ['broker:register', 'broker:transfer'], // Requires register & transfer
      });
      const req = createMockRequest({
        headers: { authorization: 'Bearer daon_test_key_123456' },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 403);
      assert.equal(res.jsonData?.code, 'BROKER_AUTH_INSUFFICIENT_SCOPES');
      assert.deepEqual(res.jsonData?.required_scopes, ['broker:register', 'broker:transfer']);
      assert.equal(next.mock.calls.length, 0);

      BrokerService.prototype.authenticateBroker = originalAuth;
    });

    test('should accept request with all required scopes', async () => {
      const originalAuth = BrokerService.prototype.authenticateBroker;
      const originalRate = BrokerService.prototype.checkRateLimit;
      
      BrokerService.prototype.authenticateBroker = mock.fn(() => Promise.resolve({
        broker: mockBroker,
        apiKey: mockApiKey, // Has all scopes
      }));
      BrokerService.prototype.checkRateLimit = mock.fn(() => Promise.resolve(mockRateLimit));

      const middleware = createBrokerAuthMiddleware(mockDb, {
        scopes: ['broker:register', 'broker:verify'],
      });
      const req = createMockRequest({
        headers: { authorization: 'Bearer daon_test_key_123456' },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(next.mock.calls.length, 1);

      BrokerService.prototype.authenticateBroker = originalAuth;
      BrokerService.prototype.checkRateLimit = originalRate;
    });
  });

  describe('createBrokerAuthMiddleware - Rate limiting', () => {
    test('should reject request when hourly rate limit exceeded', async () => {
      const originalAuth = BrokerService.prototype.authenticateBroker;
      const originalRate = BrokerService.prototype.checkRateLimit;
      
      BrokerService.prototype.authenticateBroker = mock.fn(() => Promise.resolve({
        broker: mockBroker,
        apiKey: mockApiKey,
      }));
      
      const exceededRateLimit = {
        allowed: false,
        remaining_hourly: 0,
        remaining_daily: 5000,
        reset_hourly: new Date(Date.now() + 1800000), // 30 min
        reset_daily: new Date(Date.now() + 43200000),
      };
      BrokerService.prototype.checkRateLimit = mock.fn(() => Promise.resolve(exceededRateLimit));

      const middleware = createBrokerAuthMiddleware(mockDb);
      const req = createMockRequest({
        headers: { authorization: 'Bearer daon_test_key_123456' },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 429);
      assert.equal(res.jsonData?.code, 'BROKER_RATE_LIMIT_EXCEEDED');
      assert.ok(res.headers?.['Retry-After']);
      assert.equal(next.mock.calls.length, 0);

      BrokerService.prototype.authenticateBroker = originalAuth;
      BrokerService.prototype.checkRateLimit = originalRate;
    });

    test('should include rate limit info in 429 response', async () => {
      const originalAuth = BrokerService.prototype.authenticateBroker;
      const originalRate = BrokerService.prototype.checkRateLimit;
      
      BrokerService.prototype.authenticateBroker = mock.fn(() => Promise.resolve({
        broker: mockBroker,
        apiKey: mockApiKey,
      }));
      
      const exceededRateLimit = {
        allowed: false,
        remaining_hourly: 0,
        remaining_daily: 5000,
        reset_hourly: new Date(Date.now() + 1800000),
        reset_daily: new Date(Date.now() + 43200000),
      };
      BrokerService.prototype.checkRateLimit = mock.fn(() => Promise.resolve(exceededRateLimit));

      const middleware = createBrokerAuthMiddleware(mockDb);
      const req = createMockRequest({
        headers: { authorization: 'Bearer daon_test_key_123456' },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.jsonData?.rate_limit?.hourly?.limit, 1000);
      assert.equal(res.jsonData?.rate_limit?.hourly?.remaining, 0);
      assert.equal(res.jsonData?.rate_limit?.daily?.limit, 10000);
      assert.equal(res.jsonData?.rate_limit?.daily?.remaining, 5000);

      BrokerService.prototype.authenticateBroker = originalAuth;
      BrokerService.prototype.checkRateLimit = originalRate;
    });
  });

  describe('createBrokerAuthMiddleware - Signature verification', () => {
    test('should reject request without signature when required by broker', async () => {
      const originalAuth = BrokerService.prototype.authenticateBroker;
      const originalRate = BrokerService.prototype.checkRateLimit;
      
      const brokerWithSignature = {
        ...mockBroker,
        require_signature: true,
      };
      
      BrokerService.prototype.authenticateBroker = mock.fn(() => Promise.resolve({
        broker: brokerWithSignature,
        apiKey: mockApiKey,
      }));
      BrokerService.prototype.checkRateLimit = mock.fn(() => Promise.resolve(mockRateLimit));

      const middleware = createBrokerAuthMiddleware(mockDb);
      const req = createMockRequest({
        headers: { authorization: 'Bearer daon_test_key_123456' },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 403);
      assert.equal(res.jsonData?.code, 'BROKER_SIGNATURE_MISSING');
      assert.equal(next.mock.calls.length, 0);

      BrokerService.prototype.authenticateBroker = originalAuth;
      BrokerService.prototype.checkRateLimit = originalRate;
    });

    test('should reject request with invalid signature', async () => {
      const originalAuth = BrokerService.prototype.authenticateBroker;
      const originalRate = BrokerService.prototype.checkRateLimit;
      const originalVerify = BrokerService.prototype.verifySignature;
      
      const brokerWithSignature = {
        ...mockBroker,
        require_signature: true,
      };
      
      BrokerService.prototype.authenticateBroker = mock.fn(() => Promise.resolve({
        broker: brokerWithSignature,
        apiKey: mockApiKey,
      }));
      BrokerService.prototype.checkRateLimit = mock.fn(() => Promise.resolve(mockRateLimit));
      BrokerService.prototype.verifySignature = mock.fn(() => Promise.resolve(false)); // Invalid

      const middleware = createBrokerAuthMiddleware(mockDb);
      const req = createMockRequest({
        headers: {
          authorization: 'Bearer daon_test_key_123456',
          'x-daon-signature': 'invalid_signature_here',
        },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 403);
      assert.equal(res.jsonData?.code, 'BROKER_SIGNATURE_INVALID');

      BrokerService.prototype.authenticateBroker = originalAuth;
      BrokerService.prototype.checkRateLimit = originalRate;
      BrokerService.prototype.verifySignature = originalVerify;
    });

    test('should accept request with valid signature', async () => {
      const originalAuth = BrokerService.prototype.authenticateBroker;
      const originalRate = BrokerService.prototype.checkRateLimit;
      const originalVerify = BrokerService.prototype.verifySignature;
      
      const brokerWithSignature = {
        ...mockBroker,
        require_signature: true,
      };
      
      BrokerService.prototype.authenticateBroker = mock.fn(() => Promise.resolve({
        broker: brokerWithSignature,
        apiKey: mockApiKey,
      }));
      BrokerService.prototype.checkRateLimit = mock.fn(() => Promise.resolve(mockRateLimit));
      BrokerService.prototype.verifySignature = mock.fn(() => Promise.resolve(true)); // Valid

      const middleware = createBrokerAuthMiddleware(mockDb);
      const req = createMockRequest({
        headers: {
          authorization: 'Bearer daon_test_key_123456',
          'x-daon-signature': 'valid_signature_here',
        },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(next.mock.calls.length, 1);

      BrokerService.prototype.authenticateBroker = originalAuth;
      BrokerService.prototype.checkRateLimit = originalRate;
      BrokerService.prototype.verifySignature = originalVerify;
    });
  });

  describe('createBrokerAuthMiddleware - Error handling', () => {
    test('should handle authentication service errors', async () => {
      const originalAuth = BrokerService.prototype.authenticateBroker;
      
      BrokerService.prototype.authenticateBroker = mock.fn(() => 
        Promise.reject(new Error('Database connection failed'))
      );

      const middleware = createBrokerAuthMiddleware(mockDb);
      const req = createMockRequest({
        headers: { authorization: 'Bearer daon_test_key_123456' },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 500);
      assert.equal(res.jsonData?.code, 'BROKER_AUTH_ERROR');
      assert.equal(next.mock.calls.length, 0);

      BrokerService.prototype.authenticateBroker = originalAuth;
    });
  });

  describe('requireBrokerDomain', () => {
    test('should reject request without broker authentication', () => {
      const middleware = requireBrokerDomain('ao3.org');
      const req = createMockRequest();
      const res = createMockResponse();
      const next = mock.fn();

      middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonData?.code, 'BROKER_AUTH_REQUIRED');
      assert.equal(next.mock.calls.length, 0);
    });

    test('should reject request from wrong domain', () => {
      const middleware = requireBrokerDomain('wattpad.com');
      const req = createMockRequest();
      req.broker = mockBroker; // ao3.org
      const res = createMockResponse();
      const next = mock.fn();

      middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 403);
      assert.equal(res.jsonData?.code, 'BROKER_DOMAIN_MISMATCH');
      assert.equal(next.mock.calls.length, 0);
    });

    test('should accept request from correct domain', () => {
      const middleware = requireBrokerDomain('ao3.org');
      const req = createMockRequest();
      req.broker = mockBroker; // ao3.org
      const res = createMockResponse();
      const next = mock.fn();

      middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(next.mock.calls.length, 1);
    });
  });

  describe('requireCertificationTier', () => {
    test('should reject request without broker authentication', () => {
      const middleware = requireCertificationTier('standard');
      const req = createMockRequest();
      const res = createMockResponse();
      const next = mock.fn();

      middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonData?.code, 'BROKER_AUTH_REQUIRED');
    });

    test('should reject broker with insufficient tier', () => {
      const middleware = requireCertificationTier('enterprise');
      const req = createMockRequest();
      req.broker = mockBroker; // standard tier
      const res = createMockResponse();
      const next = mock.fn();

      middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 403);
      assert.equal(res.jsonData?.code, 'BROKER_TIER_INSUFFICIENT');
      assert.ok(res.jsonData?.message?.includes('enterprise'));
      assert.ok(res.jsonData?.message?.includes('standard'));
    });

    test('should accept broker with exact tier', () => {
      const middleware = requireCertificationTier('standard');
      const req = createMockRequest();
      req.broker = mockBroker; // standard tier
      const res = createMockResponse();
      const next = mock.fn();

      middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(next.mock.calls.length, 1);
    });

    test('should accept broker with higher tier', () => {
      const middleware = requireCertificationTier('community');
      const req = createMockRequest();
      req.broker = mockBroker; // standard tier (higher than community)
      const res = createMockResponse();
      const next = mock.fn();

      middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(next.mock.calls.length, 1);
    });

    test('should reject community tier for standard requirements', () => {
      const communityBroker = {
        ...mockBroker,
        certification_tier: 'community' as const,
      };
      const middleware = requireCertificationTier('standard');
      const req = createMockRequest();
      req.broker = communityBroker;
      const res = createMockResponse();
      const next = mock.fn();

      middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 403);
      assert.equal(res.jsonData?.code, 'BROKER_TIER_INSUFFICIENT');
    });
  });
});
