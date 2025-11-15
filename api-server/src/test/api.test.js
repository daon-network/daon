import { test, describe, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { createRequire } from 'module';
import app from '../server.js';
import { TEST_CONFIG } from './setup.test.js';

const require = createRequire(import.meta.url);
const request = require('supertest');
const crypto = require('crypto');

describe('API Endpoints', () => {
  
  describe('GET /api/v1 - API Documentation', () => {
    test('should return API documentation', async () => {
      const response = await request(app)
        .get('/api/v1')
        .expect(200)
        .expect('Content-Type', /json/);

      assert.strictEqual(response.body.name, 'DAON API');
      assert.strictEqual(response.body.version, '1.0.0');
      assert.ok(response.body.endpoints);
      assert.ok(response.body.documentation);
    });
  });

  describe('POST /api/v1/protect - Content Protection', () => {
    test('should protect valid content', async () => {
      const testContent = TEST_CONFIG.validContent;
      const response = await request(app)
        .post('/api/v1/protect')
        .send({
          content: testContent,
          metadata: TEST_CONFIG.validMetadata,
          license: TEST_CONFIG.validLicense
        })
        .expect(201)
        .expect('Content-Type', /json/);

      assert.strictEqual(response.body.success, true);
      assert.ok(response.body.contentHash);
      assert.strictEqual(response.body.contentHash.length, 64); // SHA-256 hash
      assert.ok(response.body.verificationUrl);
      assert.ok(response.body.timestamp);
      assert.strictEqual(response.body.license, TEST_CONFIG.validLicense);
    });

    test('should reject empty content', async () => {
      const response = await request(app)
        .post('/api/v1/protect')
        .send({
          content: '',
          metadata: TEST_CONFIG.validMetadata
        })
        .expect(400)
        .expect('Content-Type', /json/);

      assert.strictEqual(response.body.success, false);
      assert.strictEqual(response.body.error, 'Validation failed');
      assert.ok(response.body.details);
    });

    test('should reject invalid license', async () => {
      const response = await request(app)
        .post('/api/v1/protect')
        .send({
          content: TEST_CONFIG.validContent,
          license: 'invalid_license'
        })
        .expect(400);

      assert.strictEqual(response.body.success, false);
      assert.strictEqual(response.body.error, 'Validation failed');
    });

    test('should return existing protection for duplicate content', async () => {
      const testContent = 'Duplicate content test';
      
      // First protection
      const first = await request(app)
        .post('/api/v1/protect')
        .send({ content: testContent })
        .expect(201);

      // Second protection (duplicate)
      const second = await request(app)
        .post('/api/v1/protect')
        .send({ content: testContent })
        .expect(200);

      assert.strictEqual(second.body.existing, true);
      assert.strictEqual(second.body.contentHash, first.body.contentHash);
    });

    test('should generate correct SHA-256 hash', async () => {
      const testContent = 'Test content for hash verification';
      const expectedHash = crypto.createHash('sha256').update(testContent, 'utf8').digest('hex');
      
      const response = await request(app)
        .post('/api/v1/protect')
        .send({ content: testContent })
        .expect(201);

      assert.strictEqual(response.body.contentHash, expectedHash);
    });
  });

  describe('POST /api/v1/protect/bulk - Bulk Protection', () => {
    test('should protect multiple works', async () => {
      const works = [
        { content: 'First work', metadata: { title: 'Work 1' } },
        { content: 'Second work', metadata: { title: 'Work 2' } },
        { content: 'Third work', metadata: { title: 'Work 3' } }
      ];

      const response = await request(app)
        .post('/api/v1/protect/bulk')
        .send({
          works,
          license: 'liberation_v1'
        })
        .expect(200);

      assert.strictEqual(response.body.success, true);
      assert.strictEqual(response.body.protected, 3);
      assert.strictEqual(response.body.results.length, 3);
      
      // Verify each result has required fields
      response.body.results.forEach(result => {
        assert.ok(result.contentHash);
        assert.ok(result.verificationUrl);
        assert.ok(result.timestamp);
        assert.strictEqual(typeof result.existing, 'boolean');
      });
    });

    test('should reject empty works array', async () => {
      const response = await request(app)
        .post('/api/v1/protect/bulk')
        .send({
          works: [],
          license: 'liberation_v1'
        })
        .expect(400);

      assert.strictEqual(response.body.success, false);
      assert.strictEqual(response.body.error, 'Validation failed');
    });

    test('should reject too many works (>100)', async () => {
      const works = Array(101).fill().map((_, i) => ({
        content: `Work ${i}`,
        metadata: { title: `Work ${i}` }
      }));

      const response = await request(app)
        .post('/api/v1/protect/bulk')
        .send({ works })
        .expect(400);

      assert.strictEqual(response.body.success, false);
    });
  });

  describe('GET /api/v1/verify/:hash - Content Verification', () => {
    test('should verify protected content', async () => {
      const testContent = 'Content to verify';
      
      // First protect the content
      const protectResponse = await request(app)
        .post('/api/v1/protect')
        .send({ content: testContent })
        .expect(201);

      const hash = protectResponse.body.contentHash;

      // Then verify it
      const verifyResponse = await request(app)
        .get(`/api/v1/verify/${hash}`)
        .expect(200);

      assert.strictEqual(verifyResponse.body.success, true);
      assert.strictEqual(verifyResponse.body.isValid, true);
      assert.strictEqual(verifyResponse.body.contentHash, hash);
      assert.ok(verifyResponse.body.timestamp);
      assert.ok(verifyResponse.body.verificationUrl);
    });

    test('should return 404 for non-existent hash', async () => {
      const fakeHash = crypto.createHash('sha256').update('nonexistent', 'utf8').digest('hex');
      
      const response = await request(app)
        .get(`/api/v1/verify/${fakeHash}`)
        .expect(404);

      assert.strictEqual(response.body.success, false);
      assert.strictEqual(response.body.isValid, false);
      assert.ok(response.body.error);
    });

    test('should reject invalid hash format', async () => {
      const response = await request(app)
        .get('/api/v1/verify/invalid_hash')
        .expect(400);

      assert.strictEqual(response.body.success, false);
      assert.strictEqual(response.body.error, 'Validation failed');
    });

    test('should reject hash with wrong length', async () => {
      const shortHash = 'abcd1234';
      
      const response = await request(app)
        .get(`/api/v1/verify/${shortHash}`)
        .expect(400);

      assert.strictEqual(response.body.success, false);
    });
  });

  describe('GET /api/v1/stats - Statistics', () => {
    test('should return protection statistics', async () => {
      const response = await request(app)
        .get('/api/v1/stats')
        .expect(200);

      assert.strictEqual(response.body.success, true);
      assert.ok(response.body.stats);
      assert.ok(typeof response.body.stats.totalProtected === 'number');
      assert.ok(response.body.stats.byLicense);
      assert.ok(Array.isArray(response.body.stats.recentProtections));
      assert.ok(response.body.timestamp);
    });

    test('should include license breakdown', async () => {
      const response = await request(app)
        .get('/api/v1/stats')
        .expect(200);

      const byLicense = response.body.stats.byLicense;
      assert.ok('liberation_v1' in byLicense);
      assert.ok('cc0' in byLicense);
      assert.ok('cc-by' in byLicense);
      assert.ok('cc-by-sa' in byLicense);
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/nonexistent')
        .expect(404);

      assert.strictEqual(response.body.success, false);
      assert.ok(response.body.error);
      assert.ok(response.body.documentation);
    });

    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/protect')
        .set('Content-Type', 'application/json')
        .send('invalid json{');

      // May return 400 (malformed JSON) or 429 (rate limited) - both are acceptable
      assert.ok(response.status === 400 || response.status === 429);
      
      if (response.status === 429) {
        assert.ok(response.body.error.includes('rate limit'));
      }
    });
  });
});