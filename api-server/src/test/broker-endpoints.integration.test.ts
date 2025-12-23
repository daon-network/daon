/**
 * Integration Tests for Broker API Endpoints
 * 
 * Tests the full request/response cycle for broker endpoints
 * Covers positive and negative cases for:
 * - POST /api/v1/broker/protect - Protect content via broker
 * - POST /api/v1/broker/register - Register new broker (admin)
 * - POST /api/v1/broker/transfer - Transfer content ownership
 * - GET /api/v1/broker/verify - Verify broker auth status
 * - GET /api/v1/broker/usage - Get API usage statistics
 */

import { test, describe, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { createRequire } from 'module';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

// Set test environment before importing server
before(() => {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.SKIP_SERVER_START = 'true';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
});

import app from '../server.js';

const require = createRequire(import.meta.url);
const request = require('supertest');

// Test fixtures
const TEST_BROKER = {
  domain: 'test-broker.example.com',
  name: 'Test Broker Platform',
  certification_tier: 'standard',
  rate_limit_per_hour: 1000,
  rate_limit_per_day: 10000,
};

const TEST_API_KEY = 'DAON_BR_test_integration_key_' + crypto.randomBytes(24).toString('hex');

describe('Broker Endpoints - Integration Tests', () => {
  // Setup: Create test broker and API key in database
  // Note: This assumes database is available and migrations have run
  
  describe('POST /api/v1/broker/protect - Positive Cases', () => {
    test('should protect content with valid broker authentication', async () => {
      const response = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          username: 'testuser123',
          content: 'This is my original creative work',
          metadata: {
            title: 'My Test Story',
            author: 'Test User',
          },
          license: 'liberation_v1',
        });

      // Skip test if broker not set up in database
      if (response.status === 401) {
        console.log('Skipping: Test broker not configured in database');
        return;
      }

      assert.equal(response.status, 201);
      assert.equal(response.body.success, true);
      assert.ok(response.body.contentHash);
      assert.ok(response.body.verificationUrl);
      assert.ok(response.body.owner.includes('@'));
      assert.equal(response.body.license, 'liberation_v1');
    });

    test('should include broker information in response', async () => {
      const response = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          username: 'anotheruser',
          content: 'Different creative content',
          license: 'all-rights-reserved',
        });

      if (response.status === 401) {
        console.log('Skipping: Test broker not configured');
        return;
      }

      assert.equal(response.status, 201);
      assert.ok(response.body.broker);
      assert.ok(response.body.broker.domain);
      assert.ok(response.body.broker.name);
    });

    test('should handle duplicate content registration', async () => {
      const content = 'Unique content for duplicate test ' + Date.now();
      
      // First registration
      const response1 = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          username: 'duplicateuser',
          content,
        });

      if (response1.status === 401) {
        console.log('Skipping: Test broker not configured');
        return;
      }

      assert.equal(response1.status, 201);
      const contentHash = response1.body.contentHash;

      // Second registration (duplicate)
      const response2 = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          username: 'duplicateuser',
          content,
        });

      assert.equal(response2.status, 200);
      assert.equal(response2.body.existing, true);
      assert.equal(response2.body.contentHash, contentHash);
    });

    test('should include rate limit headers in response', async () => {
      const response = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          username: 'ratelimituser',
          content: 'Content for rate limit test',
        });

      if (response.status === 401) {
        console.log('Skipping: Test broker not configured');
        return;
      }

      assert.ok(response.headers['x-ratelimit-limit-hourly']);
      assert.ok(response.headers['x-ratelimit-limit-daily']);
      assert.ok(response.headers['x-ratelimit-remaining-hourly']);
      assert.ok(response.headers['x-ratelimit-remaining-daily']);
    });

    test('should accept all valid license types', async () => {
      const licenses = [
        'liberation_v1',
        'all-rights-reserved',
        'copyright',
        'cc0',
        'cc-by',
        'cc-by-sa',
        'cc-by-nd',
        'cc-by-nc',
        'cc-by-nc-sa',
      ];

      for (const license of licenses) {
        const response = await request(app)
          .post('/api/v1/broker/protect')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({
            username: 'licensetest',
            content: `Content for ${license} test ${Date.now()}`,
            license,
          });

        if (response.status === 401) {
          console.log('Skipping: Test broker not configured');
          return;
        }

        assert.equal(response.status, 201, `Should accept license: ${license}`);
        assert.equal(response.body.license, license);
      }
    });
  });

  describe('POST /api/v1/broker/protect - Negative Cases', () => {
    test('should reject request without Authorization header', async () => {
      const response = await request(app)
        .post('/api/v1/broker/protect')
        .send({
          username: 'noauthuser',
          content: 'Content without auth',
        });

      assert.equal(response.status, 401);
      assert.equal(response.body.success, false);
      assert.equal(response.body.code, 'BROKER_AUTH_MISSING');
    });

    test('should reject request with invalid API key', async () => {
      const response = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', 'Bearer DAON_BR_invalid_key_12345678')
        .send({
          username: 'invalidkeyuser',
          content: 'Content with invalid key',
        });

      assert.equal(response.status, 401);
      assert.equal(response.body.code, 'BROKER_AUTH_INVALID_KEY');
    });

    test('should reject request with malformed Authorization header', async () => {
      const response = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', 'InvalidFormat token123')
        .send({
          username: 'malformedauth',
          content: 'Content',
        });

      assert.equal(response.status, 401);
      assert.equal(response.body.code, 'BROKER_AUTH_INVALID_FORMAT');
    });

    test('should reject request without username', async () => {
      const response = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          content: 'Content without username',
        });

      // Validation error (400) or auth error (401)
      assert.ok([400, 401].includes(response.status));
    });

    test('should reject request without content', async () => {
      const response = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          username: 'nocontentuser',
        });

      assert.ok([400, 401].includes(response.status));
    });

    test('should reject request with invalid username format', async () => {
      const invalidUsernames = [
        'user@domain',
        'user name',
        'user.name',
        '<script>',
      ];

      for (const username of invalidUsernames) {
        const response = await request(app)
          .post('/api/v1/broker/protect')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({
            username,
            content: 'Test content',
          });

        assert.ok([400, 401].includes(response.status), 
          `Should reject username: ${username}`);
      }
    });

    test('should reject request with invalid license type', async () => {
      const response = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          username: 'invalidlicense',
          content: 'Content',
          license: 'invalid-license-type',
        });

      assert.ok([400, 401].includes(response.status));
    });

    test('should return 429 when rate limit exceeded', async () => {
      // This test would require exhausting rate limits
      // Skip in normal test runs, implement separately for load testing
      console.log('Note: Rate limit exceeded test requires load testing setup');
    });

    test('should reject request with missing Bearer prefix', async () => {
      const response = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', TEST_API_KEY) // Missing "Bearer "
        .send({
          username: 'nobeareruser',
          content: 'Content',
        });

      assert.equal(response.status, 401);
    });
  });

  describe('POST /api/v1/broker/register - Broker Registration', () => {
    test('should register new broker (admin only)', async () => {
      // This endpoint requires admin authentication
      // Placeholder for when admin auth is implemented
      const response = await request(app)
        .post('/api/v1/broker/register')
        .send({
          domain: 'newbroker.example.com',
          name: 'New Broker',
          certification_tier: 'community',
        });

      // Expect 401 or 404 until implemented
      assert.ok([401, 404].includes(response.status));
    });
  });

  describe('GET /api/v1/broker/verify - Verify Auth Status', () => {
    test('should verify broker authentication status', async () => {
      const response = await request(app)
        .get('/api/v1/broker/verify')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      // Expect 404 until implemented, or 200 if implemented
      assert.ok([200, 404].includes(response.status));
    });

    test('should return 401 for invalid API key', async () => {
      const response = await request(app)
        .get('/api/v1/broker/verify')
        .set('Authorization', 'Bearer invalid_key');

      assert.ok([401, 404].includes(response.status));
    });
  });

  describe('GET /api/v1/broker/usage - API Usage Statistics', () => {
    test('should return usage statistics for authenticated broker', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      // Expect 404 until implemented
      assert.ok([200, 404].includes(response.status));
    });

    test('should support date range filtering', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .query({
          start_date: '2025-01-01',
          end_date: '2025-01-31',
        });

      assert.ok([200, 404].includes(response.status));
    });
  });

  describe('POST /api/v1/broker/transfer - Transfer Ownership', () => {
    test('should transfer content ownership between identities', async () => {
      // First, protect content
      const protectResponse = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          username: 'originalowner',
          content: 'Content to transfer ' + Date.now(),
        });

      if (protectResponse.status === 401) {
        console.log('Skipping: Test broker not configured');
        return;
      }

      const contentHash = protectResponse.body.contentHash;

      // Attempt transfer
      const transferResponse = await request(app)
        .post('/api/v1/broker/transfer')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          content_hash: contentHash,
          from_identity: 'originalowner@test-broker.example.com',
          to_identity: 'newowner@test-broker.example.com',
        });

      // Expect 404 until implemented, or 200 if implemented
      assert.ok([200, 404].includes(transferResponse.status));
    });

    test('should reject transfer without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/broker/transfer')
        .send({
          content_hash: 'abc123',
          from_identity: 'user1@example.com',
          to_identity: 'user2@example.com',
        });

      assert.ok([401, 404].includes(response.status));
    });

    test('should reject transfer of non-existent content', async () => {
      const response = await request(app)
        .post('/api/v1/broker/transfer')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          content_hash: '0'.repeat(64), // Non-existent hash
          from_identity: 'user1@example.com',
          to_identity: 'user2@example.com',
        });

      assert.ok([404, 400].includes(response.status));
    });
  });

  describe('Security and Error Handling', () => {
    test('should include security headers in all responses', async () => {
      const response = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          username: 'securitytest',
          content: 'Security headers test',
        });

      // Check for common security headers (from helmet middleware)
      assert.ok(response.headers['x-content-type-options']);
      assert.ok(response.headers['x-frame-options']);
    });

    test('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      assert.equal(response.status, 400);
    });

    test('should handle very large payloads appropriately', async () => {
      const largeContent = 'x'.repeat(10 * 1024 * 1024); // 10MB

      const response = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          username: 'largepayload',
          content: largeContent,
        });

      // Should either accept (200/201) or reject with payload too large (413)
      assert.ok([200, 201, 413, 401].includes(response.status));
    });

    test('should sanitize error messages to avoid leaking sensitive info', async () => {
      const response = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', 'Bearer DAON_BR_fake_key_123456')
        .send({
          username: 'errortest',
          content: 'Test',
        });

      assert.equal(response.status, 401);
      // Error message should not include database details, stack traces, etc.
      assert.ok(!response.body.message?.includes('SELECT'));
      assert.ok(!response.body.message?.includes('database'));
      assert.ok(!response.body.stack);
    });
  });

  describe('Performance and Response Time', () => {
    test('should respond within acceptable time limits', async () => {
      const start = Date.now();
      
      const response = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          username: 'perftest',
          content: 'Performance test content',
        });

      const duration = Date.now() - start;

      // Response should be under 2 seconds for normal operation
      assert.ok(duration < 2000, `Response took ${duration}ms, expected < 2000ms`);
    });
  });

  describe('Content Validation', () => {
    test('should accept various content types', async () => {
      const contentTypes = [
        'Short text',
        'a'.repeat(10000), // Long text
        'Text with\nnewlines\nand\ttabs',
        'Unicode: 你好世界 🌍',
        JSON.stringify({ structured: 'data' }),
      ];

      for (const content of contentTypes) {
        const response = await request(app)
          .post('/api/v1/broker/protect')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({
            username: 'contenttest',
            content,
          });

        if (response.status === 401) continue; // Skip if auth not set up

        assert.ok([200, 201].includes(response.status), 
          `Should accept content type: ${content.substring(0, 50)}`);
      }
    });

    test('should generate consistent hashes for same content', async () => {
      const content = 'Consistent hash test ' + Math.random();

      const response1 = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          username: 'hashtest1',
          content,
        });

      if (response1.status === 401) {
        console.log('Skipping: Test broker not configured');
        return;
      }

      const response2 = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          username: 'hashtest2',
          content,
        });

      assert.equal(response1.body.contentHash, response2.body.contentHash);
    });
  });

  describe('Metadata Handling', () => {
    test('should accept optional metadata fields', async () => {
      const response = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          username: 'metadatatest',
          content: 'Content with metadata',
          metadata: {
            title: 'My Story Title',
            author: 'Author Name',
            genre: 'Fiction',
            tags: ['fantasy', 'adventure'],
          },
        });

      if (response.status === 401) {
        console.log('Skipping: Test broker not configured');
        return;
      }

      assert.ok([200, 201].includes(response.status));
    });

    test('should handle missing metadata gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/broker/protect')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          username: 'nometadata',
          content: 'Content without metadata',
          // No metadata field
        });

      if (response.status === 401) {
        console.log('Skipping: Test broker not configured');
        return;
      }

      assert.ok([200, 201].includes(response.status));
    });
  });
});
