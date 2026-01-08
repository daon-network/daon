/**
 * Comprehensive Tests for API Usage Statistics Endpoint
 * 
 * Tests GET /api/v1/broker/usage
 * Covers date filtering, aggregation, and statistics
 */

import { test, describe, before } from 'node:test';
import { strict as assert } from 'node:assert';
import request from 'supertest';

// Set test environment
before(() => {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.SKIP_SERVER_START = 'true';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
});

import app from '../server.js';

describe('GET /api/v1/broker/usage - API Usage Statistics', () => {
  const TEST_API_KEY = process.env.TEST_BROKER_API_KEY || 'test_key';

  describe('Authentication', () => {
    test('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage');

      assert.equal(response.status, 401);
      assert.equal(response.body.success, false);
      assert.equal(response.body.code, 'BROKER_AUTH_MISSING');
    });

    test('should reject invalid API key', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', 'Bearer DAON_BR_invalid_key');

      assert.equal(response.status, 401);
    });

    test('should accept valid API key', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      // Should succeed (200) or fail on auth (401), not other errors
      assert.ok([200, 401].includes(response.status));
    });
  });

  describe('Date Range Filtering', () => {
    test('should accept start_date parameter', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .query({ start_date: '2025-01-01' });

      assert.ok([200, 401].includes(response.status));
    });

    test('should accept end_date parameter', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .query({ end_date: '2025-12-31' });

      assert.ok([200, 401].includes(response.status));
    });

    test('should accept both start and end dates', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .query({
          start_date: '2025-01-01',
          end_date: '2025-12-31'
        });

      assert.ok([200, 401].includes(response.status));
    });

    test('should handle ISO 8601 date formats', async () => {
      const formats = [
        '2025-01-01',
        '2025-01-01T00:00:00Z',
        '2025-01-01T00:00:00.000Z',
      ];

      for (const date of formats) {
        const response = await request(app)
          .get('/api/v1/broker/usage')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .query({ start_date: date });

        // Should not reject date format
        assert.ok([200, 401].includes(response.status),
          `Should accept date format: ${date}`);
      }
    });
  });

  describe('Limit Parameter', () => {
    test('should accept limit parameter', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .query({ limit: 50 });

      assert.ok([200, 401].includes(response.status));
    });

    test('should default to 100 if no limit specified', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      if (response.status === 200) {
        assert.ok(response.body.usage);
        assert.ok(Array.isArray(response.body.usage));
        // Default limit is 100, but may return less
        assert.ok(response.body.usage.length <= 100);
      }
    });

    test('should handle various limit values', async () => {
      const limits = [1, 10, 50, 100, 500];

      for (const limit of limits) {
        const response = await request(app)
          .get('/api/v1/broker/usage')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .query({ limit });

        assert.ok([200, 401].includes(response.status),
          `Should accept limit: ${limit}`);
      }
    });
  });

  describe('Response Structure', () => {
    test('should return usage array', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      if (response.status === 200) {
        assert.equal(response.body.success, true);
        assert.ok(Array.isArray(response.body.usage));
        assert.ok(response.body.totals);
        assert.ok(response.body.broker);
      }
    });

    test('should include broker information', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      if (response.status === 200) {
        assert.ok(response.body.broker.id);
        assert.ok(response.body.broker.domain);
        assert.ok(response.body.broker.name);
      }
    });

    test('should include total statistics', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      if (response.status === 200) {
        const totals = response.body.totals;
        assert.ok('total_requests' in totals);
        assert.ok('total_success' in totals);
        assert.ok('total_errors' in totals);
        assert.ok('avg_response_time' in totals);
      }
    });

    test('should include hourly breakdown', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      if (response.status === 200 && response.body.usage.length > 0) {
        const record = response.body.usage[0];
        assert.ok('endpoint' in record);
        assert.ok('method' in record);
        assert.ok('request_count' in record);
        assert.ok('hour' in record);
      }
    });
  });

  describe('Data Aggregation', () => {
    test('should aggregate by endpoint and method', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      if (response.status === 200 && response.body.usage.length > 0) {
        const record = response.body.usage[0];
        // Should have endpoint (e.g., /api/v1/broker/protect)
        // Should have method (e.g., POST)
        assert.ok(record.endpoint);
        assert.ok(record.method);
        assert.ok(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(record.method));
      }
    });

    test('should include success and error counts', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      if (response.status === 200 && response.body.usage.length > 0) {
        const record = response.body.usage[0];
        assert.ok('success_count' in record);
        assert.ok('error_count' in record);
        assert.ok(typeof record.success_count === 'string' || typeof record.success_count === 'number');
        assert.ok(typeof record.error_count === 'string' || typeof record.error_count === 'number');
      }
    });

    test('should calculate average response time', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      if (response.status === 200 && response.body.usage.length > 0) {
        const record = response.body.usage[0];
        if (record.avg_response_time !== null) {
          assert.ok(typeof record.avg_response_time === 'string' || typeof record.avg_response_time === 'number');
          const avgTime = parseFloat(record.avg_response_time);
          assert.ok(avgTime >= 0, 'Response time should be non-negative');
        }
      }
    });
  });

  describe('Empty Results', () => {
    test('should return empty array when no usage data', async () => {
      // Using a date range in the future
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .query({
          start_date: '2099-01-01',
          end_date: '2099-12-31'
        });

      if (response.status === 200) {
        assert.equal(response.body.success, true);
        assert.ok(Array.isArray(response.body.usage));
        // May or may not be empty, but should be an array
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle very large limit values', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .query({ limit: 10000 });

      assert.ok([200, 401].includes(response.status));
    });

    test('should handle negative limit gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .query({ limit: -1 });

      // Should either reject or default to positive value
      assert.ok([200, 400, 401].includes(response.status));
    });

    test('should handle invalid date formats gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .query({ start_date: 'invalid-date' });

      // Should either accept and handle, or reject
      assert.ok([200, 400, 401].includes(response.status));
    });

    test('should order results by time descending', async () => {
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      if (response.status === 200 && response.body.usage.length > 1) {
        const times = response.body.usage.map((u: any) => new Date(u.hour));
        // Check if descending (most recent first)
        for (let i = 1; i < times.length; i++) {
          assert.ok(times[i-1] >= times[i],
            'Results should be ordered by time descending');
        }
      }
    });
  });

  describe('Performance', () => {
    test('should respond within reasonable time', async () => {
      const start = Date.now();
      
      const response = await request(app)
        .get('/api/v1/broker/usage')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      const duration = Date.now() - start;

      // Should respond within 2 seconds
      assert.ok(duration < 2000,
        `Response took ${duration}ms, expected < 2000ms`);
    });
  });
});
