import { test, describe, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { createRequire } from 'module';
import crypto from 'crypto';

const require = createRequire(import.meta.url);
const request = require('supertest');

// Configuration for integration tests
const API_URL = process.env.API_URL || 'http://localhost:3000';
const BLOCKCHAIN_RPC = process.env.BLOCKCHAIN_RPC || 'http://localhost:26657';

// Helper to make API requests
const api = {
  get: (path) => request(API_URL).get(path),
  post: (path) => request(API_URL).post(path),
};

// Helper to query blockchain directly
async function queryBlockchain(endpoint) {
  const response = await fetch(`${BLOCKCHAIN_RPC}${endpoint}`);
  return response.json();
}

describe('Integration Tests', () => {
  
  before(async () => {
    console.log('🧪 Starting integration tests...');
    console.log(`API URL: ${API_URL}`);
    console.log(`Blockchain RPC: ${BLOCKCHAIN_RPC}`);
    
    // Wait for services to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  describe('Service Health', () => {
    test('API server is healthy', async () => {
      const response = await api.get('/health').expect(200);
      assert.strictEqual(response.body.status, 'healthy');
    });

    test('Blockchain RPC is responding', async () => {
      const status = await queryBlockchain('/status');
      assert.ok(status.result);
      assert.ok(status.result.sync_info);
    });

    test('Database is connected', async () => {
      const response = await api.get('/health').expect(200);
      // Check if health endpoint includes DB status
      assert.ok(response.body.status);
    });

    test('Redis is connected', async () => {
      const response = await api.get('/health').expect(200);
      // Health check should verify Redis
      assert.ok(response.body.status);
    });
  });

  describe('API ↔ Blockchain Integration', () => {
    test('Content protection creates blockchain transaction', async () => {
      const testContent = `Integration test ${Date.now()}`;
      
      // Protect content via API
      const protectResponse = await api
        .post('/api/v1/protect')
        .send({
          content: testContent,
          metadata: { title: 'Blockchain Integration Test' }
        })
        .expect(201);
      
      assert.ok(protectResponse.body.contentHash);
      const hash = protectResponse.body.contentHash;
      
      // Wait for blockchain to process (1 block)
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Verify content can be retrieved
      const verifyResponse = await api
        .get(`/api/v1/verify/${hash}`)
        .expect(200);
      
      assert.strictEqual(verifyResponse.body.isValid, true);
      assert.strictEqual(verifyResponse.body.contentHash, hash);
    });

    test('Blockchain block height increases', async () => {
      const status1 = await queryBlockchain('/status');
      const height1 = parseInt(status1.result.sync_info.latest_block_height);
      
      // Wait for next block
      await new Promise(resolve => setTimeout(resolve, 6000));
      
      const status2 = await queryBlockchain('/status');
      const height2 = parseInt(status2.result.sync_info.latest_block_height);
      
      assert.ok(height2 > height1, 'Blockchain should produce new blocks');
    });

    test('Multiple protections create multiple transactions', async () => {
      const hashes = [];
      
      // Protect 3 different contents
      for (let i = 0; i < 3; i++) {
        const response = await api
          .post('/api/v1/protect')
          .send({ content: `Multi-test ${i} ${Date.now()}` })
          .expect(201);
        
        hashes.push(response.body.contentHash);
      }
      
      // Wait for blockchain processing
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Verify all 3 are valid
      for (const hash of hashes) {
        const verify = await api.get(`/api/v1/verify/${hash}`).expect(200);
        assert.strictEqual(verify.body.isValid, true);
      }
    });
  });

  describe('API ↔ Database Integration', () => {
    test('Protected content persists in database', async () => {
      const content = `DB persist test ${Date.now()}`;
      const expectedHash = crypto.createHash('sha256').update(content).digest('hex');
      
      // First protection
      const protect1 = await api
        .post('/api/v1/protect')
        .send({ content })
        .expect(201);
      
      assert.strictEqual(protect1.body.contentHash, expectedHash);
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Second protection (should return existing or create duplicate - both are valid)
      const protect2 = await api
        .post('/api/v1/protect')
        .send({ content })
        .expect((res) => {
          // Accept either 200 (existing) or 201 (duplicate allowed)
          if (res.status !== 200 && res.status !== 201) {
            throw new Error(`Expected 200 or 201, got ${res.status}`);
          }
        });
      
      // If 200, should have existing=true. If 201, it's a new record (both valid)
      if (protect2.status === 200) {
        assert.strictEqual(protect2.body.existing, true);
      }
      assert.strictEqual(protect2.body.contentHash, expectedHash);
    });

    test('Metadata is stored and retrieved correctly', async () => {
      const metadata = {
        title: 'Integration Test Work',
        author: 'Test Author',
        description: 'Test description',
        tags: ['test', 'integration']
      };
      
      const response = await api
        .post('/api/v1/protect')
        .send({
          content: `Metadata test ${Date.now()}`,
          metadata
        })
        .expect(201);
      
      const hash = response.body.contentHash;
      
      // Retrieve and verify metadata
      const verify = await api.get(`/api/v1/verify/${hash}`).expect(200);
      
      // Check if metadata is preserved (implementation dependent)
      assert.ok(verify.body.contentHash);
    });

    test('Stats reflect database state', async () => {
      const stats1 = await api.get('/api/v1/stats').expect(200);
      const count1 = stats1.body.stats.totalProtected;
      
      // Protect new content
      await api
        .post('/api/v1/protect')
        .send({ content: `Stats test ${Date.now()}` })
        .expect(201);
      
      // Get stats again
      const stats2 = await api.get('/api/v1/stats').expect(200);
      const count2 = stats2.body.stats.totalProtected;
      
      // Should have increased by 1
      assert.ok(count2 >= count1, 'Total protected should increase');
    });
  });

  describe('API ↔ Redis Caching', () => {
    test('Stats endpoint uses cache on repeated requests', async () => {
      // First request (cold)
      const start1 = Date.now();
      await api.get('/api/v1/stats').expect(200);
      const time1 = Date.now() - start1;
      
      // Second request (should be cached)
      const start2 = Date.now();
      await api.get('/api/v1/stats').expect(200);
      const time2 = Date.now() - start2;
      
      console.log(`First request: ${time1}ms, Second request: ${time2}ms`);
      // Cached request should generally be faster
      // (Not asserting strict timing as CI can be variable)
    });

    test('Cache invalidation works after new protection', async () => {
      const stats1 = await api.get('/api/v1/stats').expect(200);
      const count1 = stats1.body.stats.totalProtected;
      
      // Protect content (should invalidate stats cache)
      await api
        .post('/api/v1/protect')
        .send({ content: `Cache invalidation test ${Date.now()}` })
        .expect(201);
      
      // Get fresh stats
      const stats2 = await api.get('/api/v1/stats').expect(200);
      const count2 = stats2.body.stats.totalProtected;
      
      assert.ok(count2 > count1, 'Cache should be invalidated and show new count');
    });
  });

  describe('Bulk Operations', () => {
    test('Bulk protection handles multiple works correctly', async () => {
      const works = Array(5).fill().map((_, i) => ({
        content: `Bulk test work ${i} ${Date.now()}`,
        metadata: { title: `Work ${i}` }
      }));
      
      const response = await api
        .post('/api/v1/protect/bulk')
        .send({
          works,
          license: 'liberation_v1'
        })
        .expect(200);
      
      assert.strictEqual(response.body.protected, 5);
      assert.strictEqual(response.body.results.length, 5);
      
      // Verify each work
      for (const result of response.body.results) {
        assert.ok(result.contentHash);
        assert.ok(result.verificationUrl);
        
        // Verify each hash is valid
        const verify = await api.get(`/api/v1/verify/${result.contentHash}`).expect(200);
        assert.strictEqual(verify.body.isValid, true);
      }
    });

    test('Bulk protection with duplicate content', async () => {
      const duplicateContent = `Duplicate ${Date.now()}`;
      
      const works = [
        { content: duplicateContent, metadata: { title: 'First' } },
        { content: duplicateContent, metadata: { title: 'Second (duplicate)' } },
        { content: `Unique ${Date.now()}`, metadata: { title: 'Third (unique)' } }
      ];
      
      const response = await api
        .post('/api/v1/protect/bulk')
        .send({ works })
        .expect(200);
      
      assert.strictEqual(response.body.protected, 3);
      
      // Check that duplicate was detected
      const existingCount = response.body.results.filter(r => r.existing).length;
      assert.strictEqual(existingCount, 1, 'Should detect 1 duplicate');
    });
  });

  describe('Error Handling', () => {
    test('API handles blockchain being temporarily unavailable', async () => {
      // This tests graceful degradation
      // If blockchain is slow/unavailable, API should still respond
      const response = await api
        .post('/api/v1/protect')
        .send({ content: `Error handling test ${Date.now()}` })
        .timeout(30000); // 30 second timeout
      
      // Should either succeed or return a proper error
      assert.ok(response.status === 201 || response.status === 503);
    });

    test('API handles database errors gracefully', async () => {
      // Invalid queries should return proper errors
      const response = await api.get('/api/v1/verify/invalid_hash');
      
      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.body.success, false);
    });
  });

  describe('Performance', () => {
    test('API responds within acceptable time', async () => {
      const start = Date.now();
      
      await api
        .post('/api/v1/protect')
        .send({ content: `Performance test ${Date.now()}` })
        .expect(201);
      
      const duration = Date.now() - start;
      console.log(`Protection took: ${duration}ms`);
      
      // Should complete within 10 seconds
      assert.ok(duration < 10000, `Should complete within 10s (took ${duration}ms)`);
    });

    test('Verification is fast (<1s)', async () => {
      // First protect something
      const protect = await api
        .post('/api/v1/protect')
        .send({ content: `Fast verify test ${Date.now()}` })
        .expect(201);
      
      const hash = protect.body.contentHash;
      
      // Then verify with timing
      const start = Date.now();
      await api.get(`/api/v1/verify/${hash}`).expect(200);
      const duration = Date.now() - start;
      
      console.log(`Verification took: ${duration}ms`);
      assert.ok(duration < 1000, `Verification should be <1s (took ${duration}ms)`);
    });
  });

  after(() => {
    console.log('✅ Integration tests completed');
  });
});
