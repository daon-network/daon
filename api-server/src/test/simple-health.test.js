import { test, describe, before } from 'node:test';
import { strict as assert } from 'node:assert';
import { createRequire } from 'module';

// Set test environment before importing server
before(() => {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.SKIP_SERVER_START = 'true';
});

import app from '../server.js';

const require = createRequire(import.meta.url);
const request = require('supertest');

describe('Essential Health Tests', () => {
  test('Health endpoint returns 200', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    assert.strictEqual(response.body.status, 'healthy');
    assert.ok(response.body.timestamp);
    assert.strictEqual(response.body.version, '1.0.0');
  });

  test('API documentation endpoint works', async () => {
    const response = await request(app)
      .get('/api/v1')
      .expect(200);

    assert.strictEqual(response.body.name, 'DAON API');
    assert.ok(response.body.endpoints);
  });

  test('Security headers are present', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    assert.ok(response.headers['x-content-type-options']);
    assert.ok(response.headers['x-frame-options']);
  });
});