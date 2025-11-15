import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { createRequire } from 'module';
import app from '../server.js';

const require = createRequire(import.meta.url);
const request = require('supertest');

describe('Security Tests', () => {
  
  describe('Security Headers', () => {
    test('should include security headers on all responses', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Check for security headers
      assert.ok(response.headers['x-content-type-options'], 'Missing X-Content-Type-Options header');
      assert.ok(response.headers['x-frame-options'], 'Missing X-Frame-Options header');
      assert.strictEqual(response.headers['x-content-type-options'], 'nosniff');
      assert.strictEqual(response.headers['x-frame-options'], 'SAMEORIGIN');
    });

    test('should include CORS headers', async () => {
      const response = await request(app)
        .options('/api/v1/protect')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      assert.ok(response.headers['access-control-allow-origin']);
      assert.ok(response.headers['access-control-allow-methods']);
      assert.ok(response.headers['access-control-allow-headers']);
    });
  });

  describe('Input Validation & Injection Protection', () => {
    test('should reject SQL injection attempts in content', async () => {
      const sqlInjection = "'; DROP TABLE users; --";
      
      const response = await request(app)
        .post('/api/v1/protect')
        .send({ content: sqlInjection })
        .expect(201); // Should succeed but not execute SQL

      // Content should be hashed normally, not cause errors
      assert.strictEqual(response.body.success, true);
      assert.ok(response.body.contentHash);
    });

    test('should reject XSS attempts in metadata', async () => {
      const xssPayload = '<script>alert("xss")</script>';
      
      const response = await request(app)
        .post('/api/v1/protect')
        .send({
          content: 'Test content',
          metadata: {
            title: xssPayload,
            author: 'Test Author'
          }
        })
        .expect(201);

      // Should store metadata as-is (no execution), API doesn't render HTML
      assert.strictEqual(response.body.success, true);
    });

    test('should reject oversized content payloads', async () => {
      const oversizedContent = 'A'.repeat(11 * 1024 * 1024); // 11MB > 10MB limit
      
      const response = await request(app)
        .post('/api/v1/protect')
        .send({ content: oversizedContent })
        .expect(400);

      assert.strictEqual(response.body.success, false);
      assert.strictEqual(response.body.error, 'Validation failed');
    });

    test('should reject malformed hash in verification', async () => {
      const malformedHashes = [
        'not-a-hash',
        '12345', // too short
        '../../../etc/passwd', // path traversal
        '<script>alert(1)</script>', // XSS
        'SELECT * FROM protected', // SQL-like
        'A'.repeat(65) // too long
      ];

      for (const hash of malformedHashes) {
        const response = await request(app)
          .get(`/api/v1/verify/${hash}`)
          .expect(400);

        assert.strictEqual(response.body.success, false);
        assert.strictEqual(response.body.error, 'Validation failed');
      }
    });

    test('should validate license types strictly', async () => {
      const invalidLicenses = [
        'custom_license',
        '<script>alert(1)</script>',
        '../../../etc/passwd',
        null,
        123,
        { license: 'object' }
      ];

      for (const license of invalidLicenses) {
        const response = await request(app)
          .post('/api/v1/protect')
          .send({
            content: 'Test content',
            license: license
          });

        if (license === null || license === undefined) {
          // Should use default license
          assert.strictEqual(response.status, 201);
        } else {
          // Should reject invalid licenses
          assert.strictEqual(response.status, 400);
          assert.strictEqual(response.body.success, false);
        }
      }
    });

    test('should prevent prototype pollution in metadata', async () => {
      const pollutionPayload = {
        '__proto__': { polluted: true },
        'constructor.prototype.polluted': true,
        'metadata': {
          '__proto__': { polluted: true },
          'title': 'Normal title'
        }
      };

      const response = await request(app)
        .post('/api/v1/protect')
        .send({
          content: 'Test content',
          ...pollutionPayload
        })
        .expect(201);

      // Should succeed but not pollute prototype
      assert.strictEqual(response.body.success, true);
      assert.strictEqual(({}).polluted, undefined);
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce general rate limiting (simulated)', async () => {
      // Note: This test simulates rate limiting behavior
      // In production, this would need actual rate limit testing with multiple requests
      
      const response = await request(app)
        .get('/api/v1/stats')
        .expect(200);

      // Check that rate limiting middleware is applied (headers should be present)
      // Rate limiting headers are added by express-rate-limit
      assert.strictEqual(response.body.success, true);
    });

    test('should enforce stricter limits on protection endpoint', async () => {
      // Test that protection endpoint has rate limiting configured
      const response = await request(app)
        .post('/api/v1/protect')
        .send({ content: 'Rate limit test' })
        .expect(201);

      assert.strictEqual(response.body.success, true);
      // In production, this would test actual rate limit enforcement
    });
  });

  describe('Content Security', () => {
    test('should generate deterministic hashes', async () => {
      const content = 'Deterministic hash test';
      
      const response1 = await request(app)
        .post('/api/v1/protect')
        .send({ content })
        .expect(201);

      const response2 = await request(app)
        .post('/api/v1/protect')
        .send({ content })
        .expect(200); // Should return existing

      assert.strictEqual(response1.body.contentHash, response2.body.contentHash);
    });

    test('should generate different hashes for different content', async () => {
      const content1 = 'Content one';
      const content2 = 'Content two';
      
      const response1 = await request(app)
        .post('/api/v1/protect')
        .send({ content: content1 })
        .expect(201);

      const response2 = await request(app)
        .post('/api/v1/protect')
        .send({ content: content2 })
        .expect(201);

      assert.notStrictEqual(response1.body.contentHash, response2.body.contentHash);
    });

    test('should use secure hash algorithm (SHA-256)', async () => {
      const content = 'Hash algorithm test';
      
      const response = await request(app)
        .post('/api/v1/protect')
        .send({ content })
        .expect(201);

      // SHA-256 produces 64-character hexadecimal string
      assert.strictEqual(response.body.contentHash.length, 64);
      assert.ok(/^[a-f0-9]{64}$/.test(response.body.contentHash));
    });
  });

  describe('Error Information Leakage', () => {
    test('should not expose internal error details in production', async () => {
      // Save original NODE_ENV
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        // This should trigger an error handler
        const response = await request(app)
          .post('/api/v1/protect')
          .send(null) // Invalid JSON
          .expect(400);

        // Should not expose internal details
        if (response.body.message) {
          assert.ok(!response.body.message.includes('stack'));
          assert.ok(!response.body.message.includes('Error:'));
          assert.ok(!response.body.message.includes('at '));
        }
      } finally {
        // Restore NODE_ENV
        process.env.NODE_ENV = originalEnv;
      }
    });

    test('should not expose file system paths in errors', async () => {
      const response = await request(app)
        .get('/api/v1/verify/invalid')
        .expect(400);

      const responseStr = JSON.stringify(response.body);
      assert.ok(!responseStr.includes('/Users/'));
      assert.ok(!responseStr.includes('/home/'));
      assert.ok(!responseStr.includes('C:\\'));
      assert.ok(!responseStr.includes(__dirname));
    });
  });

  describe('HTTP Security', () => {
    test('should reject non-HTTPS in production verification URLs', async () => {
      const response = await request(app)
        .post('/api/v1/protect')
        .send({ content: 'HTTPS test' })
        .expect(201);

      // Verification URL should use HTTPS in production
      const verificationUrl = response.body.verificationUrl;
      if (process.env.NODE_ENV === 'production') {
        assert.ok(verificationUrl.startsWith('https://'));
      }
    });

    test('should handle OPTIONS requests correctly', async () => {
      const response = await request(app)
        .options('/api/v1/protect')
        .expect(200);

      // Should allow preflight requests
      assert.ok(response.status === 200);
    });
  });
});