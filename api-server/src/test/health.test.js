import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { createRequire } from 'module';
import app from '../server.js';

const require = createRequire(import.meta.url);
const request = require('supertest');

describe('Health Check Endpoint', () => {
  test('GET /health - should return healthy status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200)
      .expect('Content-Type', /json/);

    assert.strictEqual(response.body.status, 'healthy');
    assert.ok(response.body.timestamp);
    assert.strictEqual(response.body.version, '1.0.0');
    assert.ok(typeof response.body.blockchain === 'string');
  });

  test('Health check should include security headers', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    // Verify security headers are present
    assert.ok(response.headers['x-content-type-options']);
    assert.ok(response.headers['x-frame-options']);
  });

  test('Health check response time should be fast', async () => {
    const start = Date.now();
    await request(app)
      .get('/health')
      .expect(200);
    const duration = Date.now() - start;
    
    // Health check should respond within 100ms
    assert.ok(duration < 100, `Health check took too long: ${duration}ms`);
  });
});