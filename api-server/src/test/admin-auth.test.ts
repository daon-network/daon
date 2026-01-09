/**
 * Tests for Admin Authentication Middleware
 * 
 * Comprehensive test coverage for admin-only endpoint protection
 */

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import { Request, Response, NextFunction } from 'express';
import { requireAdminAuth, logAdminAction } from '../auth/admin-middleware.js';
import { DatabaseClient } from '../database/client.js';
import { generateAccessToken } from '../utils/jwt.js';

// Mock database client
function createMockDb(queryResponses: Map<string, any> = new Map()): DatabaseClient {
  return {
    query: mock.fn((sql: string, params?: any[]) => {
      for (const [pattern, response] of queryResponses.entries()) {
        if (sql.includes(pattern)) {
          return Promise.resolve(response);
        }
      }
      return Promise.resolve({ rows: [] });
    }),
    end: mock.fn(() => Promise.resolve()),
  } as unknown as DatabaseClient;
}

// Helper to create mock Request
function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    headers: {},
    body: {},
    path: '/api/v1/broker/register',
    ip: '127.0.0.1',
    ...overrides,
  };
}

// Helper to create mock Response
function createMockResponse(): Partial<Response> & {
  statusCode?: number;
  jsonData?: any;
} {
  const res: any = {
    statusCode: 200,
    jsonData: null,
    status: function(code: number) {
      this.statusCode = code;
      return this;
    },
    json: function(data: any) {
      this.jsonData = data;
      return this;
    },
  };
  return res;
}

describe('Admin Authentication Middleware', () => {
  let originalEnv: NodeJS.ProcessEnv;
  
  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.LOG_LEVEL = 'error'; // Suppress logs during tests
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  describe('requireAdminAuth - Authorization Header Validation', () => {
    test('should reject request without Authorization header', async () => {
      const db = createMockDb();
      const middleware = requireAdminAuth(db);
      const req = createMockRequest();
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonData?.code, 'ADMIN_AUTH_MISSING');
      assert.equal(next.mock.calls.length, 0);
    });

    test('should reject invalid Authorization format (missing Bearer)', async () => {
      const db = createMockDb();
      const middleware = requireAdminAuth(db);
      const req = createMockRequest({
        headers: { authorization: 'InvalidToken123' },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonData?.code, 'ADMIN_AUTH_MISSING');
    });
  });

  describe('requireAdminAuth - Token Validation', () => {
    test('should reject invalid JWT token', async () => {
      const db = createMockDb();
      const middleware = requireAdminAuth(db);
      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid-token' },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonData?.code, 'ADMIN_TOKEN_INVALID');
      assert.equal(next.mock.calls.length, 0);
    });

    test('should reject token for non-existent user', async () => {
      const token = generateAccessToken(9999); // User doesn't exist
      const db = createMockDb(new Map([
        ['SELECT id, email', { rows: [] }] // User not found
      ]));
      
      const middleware = requireAdminAuth(db);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonData?.code, 'ADMIN_USER_NOT_FOUND');
      assert.equal(next.mock.calls.length, 0);
    });
  });

  describe('requireAdminAuth - Admin Permission Checks', () => {
    test('should reject non-admin user by ID', async () => {
      const userId = 123;
      const token = generateAccessToken(userId);
      
      const db = createMockDb(new Map([
        ['SELECT id, email', {
          rows: [{
            id: userId,
            email: 'user@example.com',
            created_at: new Date()
          }]
        }],
        ['INSERT INTO admin_security_events', { rows: [] }]
      ]));
      
      // No admin IDs configured
      delete process.env.ADMIN_USER_IDS;
      delete process.env.ADMIN_EMAIL_DOMAINS;
      
      const middleware = requireAdminAuth(db);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 403);
      assert.equal(res.jsonData?.code, 'ADMIN_INSUFFICIENT_PERMISSIONS');
      assert.equal(next.mock.calls.length, 0);
    });

    test('should accept admin user by ID', async () => {
      const userId = 1;
      const token = generateAccessToken(userId);
      
      const db = createMockDb(new Map([
        ['SELECT id, email', {
          rows: [{
            id: userId,
            email: 'admin@example.com',
            created_at: new Date()
          }]
        }]
      ]));
      
      // Configure user 1 as admin (clear other env vars first)
      delete process.env.ADMIN_EMAIL_DOMAINS;
      process.env.ADMIN_USER_IDS = '1';
      
      const middleware = requireAdminAuth(db);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(next.mock.calls.length, 1);
      assert.equal(req.userId, userId);
      assert.ok(req.adminUser);
      assert.equal(req.adminUser.is_admin, true);
    });

    test('should accept admin user by email domain', async () => {
      const userId = 5;
      const token = generateAccessToken(userId);
      
      const db = createMockDb(new Map([
        ['SELECT id, email', {
          rows: [{
            id: userId,
            email: 'alice@daon.io',
            created_at: new Date()
          }]
        }]
      ]));
      
      // Configure daon.io as admin domain (clear other env vars first)
      delete process.env.ADMIN_USER_IDS;
      process.env.ADMIN_EMAIL_DOMAINS = 'daon.io';
      
      const middleware = requireAdminAuth(db);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(next.mock.calls.length, 1);
      assert.equal(req.userId, userId);
      assert.equal(req.adminUser?.email, 'alice@daon.io');
    });

    test('should accept multiple admin user IDs', async () => {
      const userId = 42;
      const token = generateAccessToken(userId);
      
      const db = createMockDb(new Map([
        ['SELECT id, email', {
          rows: [{
            id: userId,
            email: 'admin@example.com',
            created_at: new Date()
          }]
        }]
      ]));
      
      // Configure multiple admin IDs (clear other env vars first)
      delete process.env.ADMIN_EMAIL_DOMAINS;
      process.env.ADMIN_USER_IDS = '1,42,100';
      
      const middleware = requireAdminAuth(db);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(next.mock.calls.length, 1);
      assert.equal(req.userId, userId);
    });
  });

  describe('requireAdminAuth - Security Event Logging', () => {
    test('should log security event for unauthorized access attempt', async () => {
      const userId = 123;
      const token = generateAccessToken(userId);
      
      let securityEventLogged = false;
      const db = {
        query: mock.fn(async (sql: string) => {
          if (sql.includes('SELECT id, email')) {
            return { rows: [{ id: userId, email: 'user@example.com' }] };
          }
          if (sql.includes('admin_security_events')) {
            securityEventLogged = true;
            return { rows: [] };
          }
          return { rows: [] };
        }),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;
      
      const middleware = requireAdminAuth(db);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
        path: '/api/v1/broker/register',
        ip: '192.168.1.100'
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(securityEventLogged, true, 'Security event should be logged');
    });
  });

  describe('logAdminAction', () => {
    test('should log admin action successfully', async () => {
      let actionLogged = false;
      let loggedDetails: any = null;
      
      const db = {
        query: mock.fn(async (sql: string, params?: any[]) => {
          if (sql.includes('admin_audit_log')) {
            actionLogged = true;
            loggedDetails = {
              user_id: params?.[0],
              action_type: params?.[1],
              resource_type: params?.[2],
              resource_id: params?.[3],
              details: params?.[4],
              ip_address: params?.[5]
            };
            return { rows: [] };
          }
          return { rows: [] };
        }),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;

      await logAdminAction(db, {
        user_id: 1,
        action_type: 'create',
        resource_type: 'broker',
        resource_id: 42,
        details: { domain: 'ao3.org', tier: 'standard' },
        ip_address: '127.0.0.1'
      });

      assert.equal(actionLogged, true);
      assert.equal(loggedDetails.user_id, 1);
      assert.equal(loggedDetails.action_type, 'create');
      assert.equal(loggedDetails.resource_type, 'broker');
      assert.equal(loggedDetails.resource_id, '42');
      assert.ok(loggedDetails.details);
    });

    test('should not throw on logging failure', async () => {
      const db = {
        query: mock.fn(() => Promise.reject(new Error('Database error'))),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;

      // Should not throw
      await logAdminAction(db, {
        user_id: 1,
        action_type: 'create',
        resource_type: 'broker',
        resource_id: 1,
      });

      assert.ok(true); // If we get here, no error was thrown
    });
  });

  describe('requireAdminAuth - Edge Cases', () => {
    test('should handle user with no email', async () => {
      const userId = 10;
      const token = generateAccessToken(userId);
      
      const db = createMockDb(new Map([
        ['SELECT id, email', {
          rows: [{
            id: userId,
            email: null, // No email
            created_at: new Date()
          }]
        }],
        ['INSERT INTO admin_security_events', { rows: [] }]
      ]));
      
      process.env.ADMIN_EMAIL_DOMAINS = 'daon.io';
      
      const middleware = requireAdminAuth(db);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 403);
      assert.equal(res.jsonData?.code, 'ADMIN_INSUFFICIENT_PERMISSIONS');
    });

    test('should handle empty ADMIN_USER_IDS env var', async () => {
      const userId = 1;
      const token = generateAccessToken(userId);
      
      const db = createMockDb(new Map([
        ['SELECT id, email', {
          rows: [{
            id: userId,
            email: 'user@example.com',
            created_at: new Date()
          }]
        }],
        ['INSERT INTO admin_security_events', { rows: [] }]
      ]));
      
      process.env.ADMIN_USER_IDS = '';
      process.env.ADMIN_EMAIL_DOMAINS = '';
      
      const middleware = requireAdminAuth(db);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = createMockResponse();
      const next = mock.fn();

      await middleware(req as Request, res as Response, next as NextFunction);

      assert.equal(res.statusCode, 403);
    });
  });
});
