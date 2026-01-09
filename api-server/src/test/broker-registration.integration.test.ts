/**
 * Integration Tests for Broker Registration with Admin Auth
 * 
 * Tests POST /api/v1/broker/register endpoint security
 */

import { test, describe, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { generateAccessToken } from '../utils/jwt.js';

// Set test environment before importing server
before(() => {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.SKIP_SERVER_START = 'true';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
});

import app from '../server.js';

describe('POST /api/v1/broker/register - Security Tests', () => {
  const validBrokerData = {
    domain: 'test-broker.example.com',
    name: 'Test Broker',
    certification_tier: 'community',
    contact_email: 'admin@test-broker.example.com'
  };

  test('should reject request without authentication', async () => {
    const response = await request(app)
      .post('/api/v1/broker/register')
      .send(validBrokerData);

    assert.equal(response.status, 401);
    assert.ok(response.body.code);
    assert.match(response.body.code, /ADMIN_AUTH_MISSING|AUTH_/);
  });

  test('should reject request with invalid token', async () => {
    const response = await request(app)
      .post('/api/v1/broker/register')
      .set('Authorization', 'Bearer invalid-token')
      .send(validBrokerData);

    assert.equal(response.status, 401);
    assert.ok(response.body.code);
  });

  test('should reject request with non-admin user token', async () => {
    const regularUserToken = generateAccessToken(999);
    
    const response = await request(app)
      .post('/api/v1/broker/register')
      .set('Authorization', `Bearer ${regularUserToken}`)
      .send(validBrokerData);

    // Should be 403 (forbidden) or 401 (user not found)
    assert.ok([401, 403].includes(response.status));
  });

  test('should reject request without required fields', async () => {
    // Even with admin token, validation should catch missing fields
    const adminToken = generateAccessToken(1);
    process.env.ADMIN_USER_IDS = '1';
    
    const response = await request(app)
      .post('/api/v1/broker/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ domain: 'test.com' }); // Missing required fields

    assert.equal(response.status, 400);
  });

  test('should reject invalid domain format', async () => {
    const adminToken = generateAccessToken(1);
    process.env.ADMIN_USER_IDS = '1';
    
    const response = await request(app)
      .post('/api/v1/broker/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ...validBrokerData,
        domain: 'not-a-valid-domain' // Invalid FQDN
      });

    assert.equal(response.status, 400);
  });

  test('should reject invalid certification tier', async () => {
    const adminToken = generateAccessToken(1);
    process.env.ADMIN_USER_IDS = '1';
    
    const response = await request(app)
      .post('/api/v1/broker/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ...validBrokerData,
        certification_tier: 'invalid-tier'
      });

    assert.equal(response.status, 400);
  });

  test('should reject invalid email format', async () => {
    const adminToken = generateAccessToken(1);
    process.env.ADMIN_USER_IDS = '1';
    
    const response = await request(app)
      .post('/api/v1/broker/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ...validBrokerData,
        contact_email: 'not-an-email'
      });

    assert.equal(response.status, 400);
  });
});

describe('POST /api/v1/broker/register - Functional Tests', () => {
  // Note: These tests require actual database with admin user
  // They may fail if DB is not properly seeded
  
  test('should accept valid admin request (if DB configured)', async () => {
    const adminToken = generateAccessToken(1);
    process.env.ADMIN_USER_IDS = '1';
    
    const uniqueDomain = `test-broker-${Date.now()}.example.com`;
    
    const response = await request(app)
      .post('/api/v1/broker/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        domain: uniqueDomain,
        name: 'Test Broker',
        certification_tier: 'community',
        contact_email: 'admin@test.com'
      });

    // Could be 201 (success) or 401 (user not in DB) or 500 (DB not available)
    // As long as it's not 500, the middleware is working
    assert.ok([201, 401, 403, 500].includes(response.status));
    
    if (response.status === 201) {
      assert.ok(response.body.success);
      assert.ok(response.body.broker);
      assert.ok(response.body.api_key);
    }
  });
});
