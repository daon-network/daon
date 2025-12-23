/**
 * Comprehensive Tests for BrokerService
 * 
 * Covers all positive and negative use cases for:
 * - Broker authentication
 * - Rate limiting
 * - Signature verification
 * - Federated identity management
 * - API key generation and revocation
 * - Security event logging
 * - API usage tracking
 */

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { BrokerService, Broker, BrokerApiKey, RateLimitResult, SecurityEvent } from '../broker/broker-service.js';
import { DatabaseClient } from '../database/client.js';

// Helper to create mock database client
function createMockDb(queryResponses: Map<string, any> = new Map()): DatabaseClient {
  return {
    query: mock.fn((sql: string, params?: any[]) => {
      // Match queries by looking for key patterns
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

// Helper to generate Ed25519 key pair for testing
function generateEd25519KeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const privateKeyObj = privateKey;
  return { publicKeyBase64, privateKeyObj };
}

describe('BrokerService', () => {
  let originalEnv: NodeJS.ProcessEnv;
  
  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.LOG_LEVEL = 'error'; // Suppress logs during tests
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  describe('authenticateBroker - Positive Cases', () => {
    test('should authenticate valid API key successfully', async () => {
      const apiKey = 'DAON_BR_1234567890abcdef' + '0'.repeat(32);
      const keyHash = await bcrypt.hash(apiKey, 12);
      
      const mockResponses = new Map([
        ['broker_api_keys', {
          rows: [{
            id: 1,
            broker_id: 1,
            key_hash: keyHash,
            key_prefix: apiKey.substring(0, 16),
            scopes: ['broker:register', 'broker:verify'],
            expires_at: null,
            revoked_at: null,
            last_used_at: new Date(),
            domain: 'ao3.org',
            name: 'Archive of Our Own',
            certification_tier: 'standard',
            certification_status: 'active',
            enabled: true,
            rate_limit_per_hour: 1000,
            rate_limit_per_day: 10000,
            require_signature: false,
            public_key: null,
            suspended_at: null,
            broker_revoked_at: null,
          }]
        }],
        ['UPDATE broker_api_keys', { rows: [] }],
      ]);

      const db = createMockDb(mockResponses);
      const service = new BrokerService(db);

      const result = await service.authenticateBroker(apiKey);

      assert.ok(result);
      assert.equal(result.broker.domain, 'ao3.org');
      assert.equal(result.broker.certification_tier, 'standard');
      assert.deepEqual(result.apiKey.scopes, ['broker:register', 'broker:verify']);
    });

    test('should authenticate broker with all tiers (community, standard, enterprise)', async () => {
      const tiers = ['community', 'standard', 'enterprise'] as const;

      for (const tier of tiers) {
        const apiKey = 'DAON_BR_tier_test_' + tier + '0'.repeat(20);
        const keyHash = await bcrypt.hash(apiKey, 12);
        
        const mockResponses = new Map([
          ['broker_api_keys', {
            rows: [{
              id: 1,
              broker_id: 1,
              key_hash: keyHash,
              key_prefix: apiKey.substring(0, 16),
              scopes: ['broker:register'],
              expires_at: null,
              revoked_at: null,
              domain: `${tier}.example.com`,
              name: `${tier} Broker`,
              certification_tier: tier,
              certification_status: 'active',
              enabled: true,
              rate_limit_per_hour: 1000,
              rate_limit_per_day: 10000,
              require_signature: false,
              public_key: null,
              suspended_at: null,
              broker_revoked_at: null,
            }]
          }],
          ['UPDATE broker_api_keys', { rows: [] }],
        ]);

        const db = createMockDb(mockResponses);
        const service = new BrokerService(db);

        const result = await service.authenticateBroker(apiKey);

        assert.ok(result);
        assert.equal(result.broker.certification_tier, tier);
      }
    });

    test('should update last_used_at and total_requests on successful auth', async () => {
      const apiKey = 'DAON_BR_update_test' + '0'.repeat(32);
      const keyHash = await bcrypt.hash(apiKey, 12);
      
      const mockResponses = new Map([
        ['broker_api_keys', {
          rows: [{
            id: 42,
            broker_id: 1,
            key_hash: keyHash,
            key_prefix: apiKey.substring(0, 16),
            scopes: ['broker:register'],
            expires_at: null,
            revoked_at: null,
            domain: 'example.com',
            name: 'Example',
            certification_tier: 'standard',
            certification_status: 'active',
            enabled: true,
            rate_limit_per_hour: 1000,
            rate_limit_per_day: 10000,
            require_signature: false,
            public_key: null,
            suspended_at: null,
            broker_revoked_at: null,
          }]
        }],
        ['UPDATE broker_api_keys', { rows: [] }],
      ]);

      const db = createMockDb(mockResponses);
      const service = new BrokerService(db);

      await service.authenticateBroker(apiKey);

      // Verify UPDATE was called
      const allCalls = (db.query as any).mock.calls || [];
      const updateCalls = allCalls.filter((call: any) => 
        call && call.arguments && call.arguments[0] && call.arguments[0].includes('UPDATE broker_api_keys')
      );
      
      assert.ok(updateCalls.length > 0, 'UPDATE query should have been called');
    });
  });

  describe('authenticateBroker - Negative Cases', () => {
    test('should reject API key with invalid prefix (not found)', async () => {
      const db = createMockDb(new Map([
        ['broker_api_keys', { rows: [] }]
      ]));
      const service = new BrokerService(db);

      const result = await service.authenticateBroker('DAON_BR_invalid_key');

      assert.equal(result, null);
    });

    test('should reject API key with incorrect hash', async () => {
      const validApiKey = 'DAON_BR_correct_key' + '0'.repeat(32);
      const wrongApiKey = 'DAON_BR_wrong_key_here' + '0'.repeat(30);
      const keyHash = await bcrypt.hash(validApiKey, 12);
      
      const mockResponses = new Map([
        ['broker_api_keys', {
          rows: [{
            id: 1,
            broker_id: 1,
            key_hash: keyHash,
            key_prefix: wrongApiKey.substring(0, 16),
            scopes: ['broker:register'],
            expires_at: null,
            revoked_at: null,
            domain: 'example.com',
            name: 'Example',
            certification_tier: 'standard',
            certification_status: 'active',
            enabled: true,
            rate_limit_per_hour: 1000,
            rate_limit_per_day: 10000,
            require_signature: false,
            public_key: null,
            suspended_at: null,
            broker_revoked_at: null,
          }]
        }],
        ['broker_security_events', { rows: [] }],
      ]);

      const db = createMockDb(mockResponses);
      const service = new BrokerService(db);

      const result = await service.authenticateBroker(wrongApiKey);

      assert.equal(result, null);
      
      // Verify security event was logged
      const allCalls = (db.query as any).mock.calls || [];
      const securityEventCalls = allCalls.filter((call: any) =>
        call && call.arguments && call.arguments[0] && call.arguments[0].includes('broker_security_events')
      );
      assert.ok(securityEventCalls.length > 0, 'Security event should have been logged');
    });

    test('should reject expired API key', async () => {
      const apiKey = 'DAON_BR_expired_key' + '0'.repeat(32);
      const keyHash = await bcrypt.hash(apiKey, 12);
      const expiredDate = new Date(Date.now() - 86400000); // Yesterday
      
      const mockResponses = new Map([
        ['broker_api_keys', {
          rows: [{
            id: 1,
            broker_id: 1,
            key_hash: keyHash,
            key_prefix: apiKey.substring(0, 16),
            scopes: ['broker:register'],
            expires_at: expiredDate,
            revoked_at: null,
            domain: 'example.com',
            name: 'Example',
            certification_tier: 'standard',
            certification_status: 'active',
            enabled: true,
            rate_limit_per_hour: 1000,
            rate_limit_per_day: 10000,
            require_signature: false,
            public_key: null,
            suspended_at: null,
            broker_revoked_at: null,
          }]
        }],
        ['broker_security_events', { rows: [] }],
      ]);

      const db = createMockDb(mockResponses);
      const service = new BrokerService(db);

      const result = await service.authenticateBroker(apiKey);

      assert.equal(result, null);
    });

    test('should reject disabled broker', async () => {
      const apiKey = 'DAON_BR_disabled_broker' + '0'.repeat(28);
      const keyHash = await bcrypt.hash(apiKey, 12);
      
      const mockResponses = new Map([
        ['broker_api_keys', {
          rows: [{
            id: 1,
            broker_id: 1,
            key_hash: keyHash,
            key_prefix: apiKey.substring(0, 16),
            scopes: ['broker:register'],
            expires_at: null,
            revoked_at: null,
            domain: 'disabled.example.com',
            name: 'Disabled Broker',
            certification_tier: 'standard',
            certification_status: 'active',
            enabled: false, // DISABLED
            rate_limit_per_hour: 1000,
            rate_limit_per_day: 10000,
            require_signature: false,
            public_key: null,
            suspended_at: null,
            broker_revoked_at: null,
          }]
        }],
      ]);

      const db = createMockDb(mockResponses);
      const service = new BrokerService(db);

      const result = await service.authenticateBroker(apiKey);

      assert.equal(result, null);
    });

    test('should reject broker with non-active certification status', async () => {
      const statuses = ['pending', 'suspended', 'revoked'] as const;

      for (const status of statuses) {
        const apiKey = `DAON_BR_${status}_status` + '0'.repeat(30);
        const keyHash = await bcrypt.hash(apiKey, 12);
        
        const mockResponses = new Map([
          ['broker_api_keys', {
            rows: [{
              id: 1,
              broker_id: 1,
              key_hash: keyHash,
              key_prefix: apiKey.substring(0, 16),
              scopes: ['broker:register'],
              expires_at: null,
              revoked_at: null,
              domain: 'example.com',
              name: 'Example',
              certification_tier: 'standard',
              certification_status: status, // NOT 'active'
              enabled: true,
              rate_limit_per_hour: 1000,
              rate_limit_per_day: 10000,
              require_signature: false,
              public_key: null,
              suspended_at: null,
              broker_revoked_at: null,
            }]
          }],
        ]);

        const db = createMockDb(mockResponses);
        const service = new BrokerService(db);

        const result = await service.authenticateBroker(apiKey);

        assert.equal(result, null, `Should reject ${status} broker`);
      }
    });

    test('should reject suspended broker', async () => {
      const apiKey = 'DAON_BR_suspended_test' + '0'.repeat(29);
      const keyHash = await bcrypt.hash(apiKey, 12);
      
      const mockResponses = new Map([
        ['broker_api_keys', {
          rows: [{
            id: 1,
            broker_id: 1,
            key_hash: keyHash,
            key_prefix: apiKey.substring(0, 16),
            scopes: ['broker:register'],
            expires_at: null,
            revoked_at: null,
            domain: 'example.com',
            name: 'Example',
            certification_tier: 'standard',
            certification_status: 'active',
            enabled: true,
            rate_limit_per_hour: 1000,
            rate_limit_per_day: 10000,
            require_signature: false,
            public_key: null,
            suspended_at: new Date(), // SUSPENDED
            broker_revoked_at: null,
          }]
        }],
      ]);

      const db = createMockDb(mockResponses);
      const service = new BrokerService(db);

      const result = await service.authenticateBroker(apiKey);

      assert.equal(result, null);
    });

    test('should reject revoked broker', async () => {
      const apiKey = 'DAON_BR_revoked_test' + '0'.repeat(31);
      const keyHash = await bcrypt.hash(apiKey, 12);
      
      const mockResponses = new Map([
        ['broker_api_keys', {
          rows: [{
            id: 1,
            broker_id: 1,
            key_hash: keyHash,
            key_prefix: apiKey.substring(0, 16),
            scopes: ['broker:register'],
            expires_at: null,
            revoked_at: null,
            domain: 'example.com',
            name: 'Example',
            certification_tier: 'standard',
            certification_status: 'active',
            enabled: true,
            rate_limit_per_hour: 1000,
            rate_limit_per_day: 10000,
            require_signature: false,
            public_key: null,
            suspended_at: null,
            broker_revoked_at: new Date(), // REVOKED
          }]
        }],
      ]);

      const db = createMockDb(mockResponses);
      const service = new BrokerService(db);

      const result = await service.authenticateBroker(apiKey);

      assert.equal(result, null);
    });
  });

  describe('checkRateLimit - Positive Cases', () => {
    test('should allow request within rate limits', async () => {
      const mockResponses = new Map([
        ['SELECT rate_limit_per_hour', {
          rows: [{ rate_limit_per_hour: 1000, rate_limit_per_day: 10000 }]
        }],
        ['INSERT INTO broker_rate_limits', {
          rows: [{ request_count: 50 }] // Hourly
        }],
      ]);

      // Need to handle two INSERT calls (hourly and daily)
      let insertCallCount = 0;
      const db = {
        query: mock.fn(async (sql: string, params?: any[]) => {
          if (sql.includes('SELECT rate_limit_per_hour')) {
            return { rows: [{ rate_limit_per_hour: 1000, rate_limit_per_day: 10000 }] };
          }
          if (sql.includes('INSERT INTO broker_rate_limits')) {
            insertCallCount++;
            return { rows: [{ request_count: insertCallCount === 1 ? 50 : 500 }] };
          }
          return { rows: [] };
        }),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;

      const service = new BrokerService(db);
      const result = await service.checkRateLimit(1, '/api/v1/broker/protect');

      assert.equal(result.allowed, true);
      assert.equal(result.remaining_hourly, 950); // 1000 - 50
      assert.equal(result.remaining_daily, 9500); // 10000 - 500
      assert.ok(result.reset_hourly instanceof Date);
      assert.ok(result.reset_daily instanceof Date);
    });

    test('should return 0 remaining when at exact limit', async () => {
      let insertCallCount = 0;
      const db = {
        query: mock.fn(async (sql: string) => {
          if (sql.includes('SELECT rate_limit_per_hour')) {
            return { rows: [{ rate_limit_per_hour: 100, rate_limit_per_day: 1000 }] };
          }
          if (sql.includes('INSERT INTO broker_rate_limits')) {
            insertCallCount++;
            return { rows: [{ request_count: insertCallCount === 1 ? 100 : 1000 }] };
          }
          return { rows: [] };
        }),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;

      const service = new BrokerService(db);
      const result = await service.checkRateLimit(1, '/api/v1/broker/protect');

      assert.equal(result.allowed, true); // Still allowed at exactly the limit
      assert.equal(result.remaining_hourly, 0);
      assert.equal(result.remaining_daily, 0);
    });
  });

  describe('checkRateLimit - Negative Cases', () => {
    test('should reject request when hourly limit exceeded', async () => {
      let insertCallCount = 0;
      const db = {
        query: mock.fn(async (sql: string) => {
          if (sql.includes('SELECT rate_limit_per_hour')) {
            return { rows: [{ rate_limit_per_hour: 100, rate_limit_per_day: 1000 }] };
          }
          if (sql.includes('INSERT INTO broker_rate_limits')) {
            insertCallCount++;
            return { rows: [{ request_count: insertCallCount === 1 ? 150 : 500 }] };
          }
          if (sql.includes('broker_security_events')) {
            return { rows: [] };
          }
          return { rows: [] };
        }),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;

      const service = new BrokerService(db);
      const result = await service.checkRateLimit(1, '/api/v1/broker/protect');

      assert.equal(result.allowed, false);
      assert.equal(result.remaining_hourly, 0); // Max(0, 100 - 150)
    });

    test('should reject request when daily limit exceeded', async () => {
      let insertCallCount = 0;
      const db = {
        query: mock.fn(async (sql: string) => {
          if (sql.includes('SELECT rate_limit_per_hour')) {
            return { rows: [{ rate_limit_per_hour: 1000, rate_limit_per_day: 10000 }] };
          }
          if (sql.includes('INSERT INTO broker_rate_limits')) {
            insertCallCount++;
            return { rows: [{ request_count: insertCallCount === 1 ? 50 : 12000 }] };
          }
          if (sql.includes('broker_security_events')) {
            return { rows: [] };
          }
          return { rows: [] };
        }),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;

      const service = new BrokerService(db);
      const result = await service.checkRateLimit(1, '/api/v1/broker/protect');

      assert.equal(result.allowed, false);
      assert.equal(result.remaining_daily, 0);
    });

    test('should log security event when rate limit exceeded', async () => {
      let insertCallCount = 0;
      let securityEventLogged = false;
      
      const db = {
        query: mock.fn(async (sql: string) => {
          if (sql.includes('SELECT rate_limit_per_hour')) {
            return { rows: [{ rate_limit_per_hour: 100, rate_limit_per_day: 1000 }] };
          }
          if (sql.includes('INSERT INTO broker_rate_limits')) {
            insertCallCount++;
            return { rows: [{ request_count: insertCallCount === 1 ? 150 : 500 }] };
          }
          if (sql.includes('broker_security_events')) {
            securityEventLogged = true;
            return { rows: [] };
          }
          return { rows: [] };
        }),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;

      const service = new BrokerService(db);
      await service.checkRateLimit(1, '/api/v1/broker/protect');

      assert.equal(securityEventLogged, true);
    });

    test('should throw error for non-existent broker', async () => {
      const db = createMockDb(new Map([
        ['SELECT rate_limit_per_hour', { rows: [] }] // Broker not found
      ]));

      const service = new BrokerService(db);

      await assert.rejects(
        async () => service.checkRateLimit(999, '/api/v1/broker/protect'),
        /Broker not found/
      );
    });
  });

  describe('verifySignature - Positive Cases', () => {
    test('should return true when signature not required', async () => {
      const db = createMockDb();
      const service = new BrokerService(db);

      const broker: Broker = {
        id: 1,
        domain: 'example.com',
        name: 'Example',
        certification_tier: 'standard',
        certification_status: 'active',
        enabled: true,
        rate_limit_per_hour: 1000,
        rate_limit_per_day: 10000,
        require_signature: false, // Not required
      };

      const result = await service.verifySignature(broker, { test: 'data' }, 'any_signature');

      assert.equal(result, true);
    });

    test('should verify valid Ed25519 signature', async () => {
      const { publicKeyBase64, privateKeyObj } = generateEd25519KeyPair();
      
      const payload = { username: 'testuser', content: 'test content' };
      const canonicalPayload = JSON.stringify(payload, Object.keys(payload).sort());
      const signature = crypto.sign(null, Buffer.from(canonicalPayload, 'utf-8'), privateKeyObj);
      
      const db = createMockDb();
      const service = new BrokerService(db);

      const broker: Broker = {
        id: 1,
        domain: 'example.com',
        name: 'Example',
        certification_tier: 'enterprise',
        certification_status: 'active',
        enabled: true,
        rate_limit_per_hour: 1000,
        rate_limit_per_day: 10000,
        require_signature: true,
        public_key: publicKeyBase64,
      };

      const result = await service.verifySignature(
        broker,
        payload,
        signature.toString('base64')
      );

      assert.equal(result, true);
    });
  });

  describe('verifySignature - Negative Cases', () => {
    test('should return false when signature required but public key missing', async () => {
      const db = createMockDb();
      const service = new BrokerService(db);

      const broker: Broker = {
        id: 1,
        domain: 'example.com',
        name: 'Example',
        certification_tier: 'enterprise',
        certification_status: 'active',
        enabled: true,
        rate_limit_per_hour: 1000,
        rate_limit_per_day: 10000,
        require_signature: true,
        public_key: undefined, // Missing public key
      };

      const result = await service.verifySignature(broker, { test: 'data' }, 'signature');

      assert.equal(result, false);
    });

    test('should return false when signature required but not provided', async () => {
      const { publicKeyBase64 } = generateEd25519KeyPair();
      
      const db = createMockDb();
      const service = new BrokerService(db);

      const broker: Broker = {
        id: 1,
        domain: 'example.com',
        name: 'Example',
        certification_tier: 'enterprise',
        certification_status: 'active',
        enabled: true,
        rate_limit_per_hour: 1000,
        rate_limit_per_day: 10000,
        require_signature: true,
        public_key: publicKeyBase64,
      };

      const result = await service.verifySignature(broker, { test: 'data' }, '');

      assert.equal(result, false);
    });

    test('should return false for invalid signature', async () => {
      const { publicKeyBase64 } = generateEd25519KeyPair();
      
      const db = createMockDb(new Map([
        ['broker_security_events', { rows: [] }]
      ]));
      const service = new BrokerService(db);

      const broker: Broker = {
        id: 1,
        domain: 'example.com',
        name: 'Example',
        certification_tier: 'enterprise',
        certification_status: 'active',
        enabled: true,
        rate_limit_per_hour: 1000,
        rate_limit_per_day: 10000,
        require_signature: true,
        public_key: publicKeyBase64,
      };

      const result = await service.verifySignature(
        broker,
        { test: 'data' },
        Buffer.from('invalid_signature').toString('base64')
      );

      assert.equal(result, false);
    });

    test('should log security event for invalid signature', async () => {
      const { publicKeyBase64 } = generateEd25519KeyPair();
      let securityEventLogged = false;
      
      const db = {
        query: mock.fn(async (sql: string) => {
          if (sql.includes('broker_security_events')) {
            securityEventLogged = true;
            return { rows: [] };
          }
          return { rows: [] };
        }),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;
      
      const service = new BrokerService(db);

      const broker: Broker = {
        id: 1,
        domain: 'example.com',
        name: 'Example',
        certification_tier: 'enterprise',
        certification_status: 'active',
        enabled: true,
        rate_limit_per_hour: 1000,
        rate_limit_per_day: 10000,
        require_signature: true,
        public_key: publicKeyBase64,
      };

      await service.verifySignature(
        broker,
        { test: 'data' },
        Buffer.from('invalid_sig').toString('base64')
      );

      assert.equal(securityEventLogged, true);
    });
  });

  describe('getFederatedIdentity - Positive Cases', () => {
    test('should create new federated identity', async () => {
      const db = createMockDb(new Map([
        ['INSERT INTO federated_identities', {
          rows: [{ id: 42 }]
        }]
      ]));

      const service = new BrokerService(db);
      const identityId = await service.getFederatedIdentity('testuser', 'example.com', 1);

      assert.equal(identityId, 42);
    });

    test('should accept valid username formats', async () => {
      const validUsernames = [
        'user123',
        'test-user',
        'test_user',
        'User-Name_123',
        'a', // Single character
        'a'.repeat(255), // Max length
      ];

      for (const username of validUsernames) {
        const db = createMockDb(new Map([
          ['INSERT INTO federated_identities', {
            rows: [{ id: 1 }]
          }]
        ]));

        const service = new BrokerService(db);
        const result = await service.getFederatedIdentity(username, 'example.com', 1);

        assert.equal(result, 1, `Should accept username: ${username}`);
      }
    });

    test('should update existing identity on conflict', async () => {
      let updateCalled = false;
      const db = {
        query: mock.fn(async (sql: string) => {
          if (sql.includes('ON CONFLICT')) {
            updateCalled = true;
            return { rows: [{ id: 42 }] };
          }
          return { rows: [] };
        }),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;

      const service = new BrokerService(db);
      await service.getFederatedIdentity('existinguser', 'example.com', 1);

      assert.equal(updateCalled, true);
    });
  });

  describe('getFederatedIdentity - Negative Cases', () => {
    test('should reject invalid username with special characters', async () => {
      const invalidUsernames = [
        'user@domain', // @ symbol
        'user name', // space
        'user.name', // period
        'user#name', // hash
        'user$name', // dollar
        '<script>', // HTML
        'user🎉', // emoji
      ];

      for (const username of invalidUsernames) {
        const db = createMockDb();
        const service = new BrokerService(db);

        await assert.rejects(
          async () => service.getFederatedIdentity(username, 'example.com', 1),
          /Invalid username format/,
          `Should reject username: ${username}`
        );
      }
    });

    test('should reject empty username', async () => {
      const db = createMockDb();
      const service = new BrokerService(db);

      await assert.rejects(
        async () => service.getFederatedIdentity('', 'example.com', 1),
        /Invalid username format/
      );
    });

    test('should reject username longer than 255 characters', async () => {
      const db = createMockDb();
      const service = new BrokerService(db);

      await assert.rejects(
        async () => service.getFederatedIdentity('a'.repeat(256), 'example.com', 1),
        /Invalid username format/
      );
    });
  });

  describe('generateApiKey - Positive Cases', () => {
    test('should generate valid API key', async () => {
      const db = createMockDb(new Map([
        ['INSERT INTO broker_api_keys', { rows: [] }]
      ]));

      const service = new BrokerService(db);
      const apiKey = await service.generateApiKey(1, 'Test Key', ['broker:register']);

      assert.ok(apiKey.startsWith('DAON_BR_'));
      assert.equal(apiKey.length, 72); // DAON_BR_ (8) + 64 hex chars
    });

    test('should generate unique keys on each call', async () => {
      const db = createMockDb(new Map([
        ['INSERT INTO broker_api_keys', { rows: [] }]
      ]));

      const service = new BrokerService(db);
      const key1 = await service.generateApiKey(1, 'Key 1');
      const key2 = await service.generateApiKey(1, 'Key 2');

      assert.notEqual(key1, key2);
    });

    test('should set expiration when provided', async () => {
      let expiresAt: Date | null = null;
      const db = {
        query: mock.fn(async (sql: string, params?: any[]) => {
          if (sql.includes('INSERT INTO broker_api_keys')) {
            expiresAt = params?.[5]; // expires_at parameter
            return { rows: [] };
          }
          return { rows: [] };
        }),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;

      const service = new BrokerService(db);
      await service.generateApiKey(1, 'Expiring Key', ['broker:register'], 30);

      assert.ok(expiresAt instanceof Date);
    });

    test('should accept custom scopes', async () => {
      let savedScopes: string[] = [];
      const db = {
        query: mock.fn(async (sql: string, params?: any[]) => {
          if (sql.includes('INSERT INTO broker_api_keys')) {
            savedScopes = params?.[4]; // scopes parameter
            return { rows: [] };
          }
          return { rows: [] };
        }),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;

      const service = new BrokerService(db);
      await service.generateApiKey(1, 'Custom Scopes', ['broker:admin', 'broker:transfer']);

      assert.deepEqual(savedScopes, ['broker:admin', 'broker:transfer']);
    });
  });

  describe('revokeApiKey - Positive Cases', () => {
    test('should revoke API key with reason', async () => {
      let revokedKeyId: number | null = null;
      let revokeReason: string | null = null;
      
      const db = {
        query: mock.fn(async (sql: string, params?: any[]) => {
          if (sql.includes('UPDATE broker_api_keys')) {
            revokedKeyId = params?.[0];
            revokeReason = params?.[1];
            return { rows: [] };
          }
          return { rows: [] };
        }),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;

      const service = new BrokerService(db);
      await service.revokeApiKey(123, 'Security breach');

      assert.equal(revokedKeyId, 123);
      assert.equal(revokeReason, 'Security breach');
    });
  });

  describe('logSecurityEvent - Positive Cases', () => {
    test('should log security event with all fields', async () => {
      let loggedEvent: any = null;
      
      const db = {
        query: mock.fn(async (sql: string, params?: any[]) => {
          if (sql.includes('INSERT INTO broker_security_events')) {
            loggedEvent = {
              broker_id: params?.[0],
              event_type: params?.[1],
              severity: params?.[2],
              description: params?.[3],
              ip_address: params?.[4],
              endpoint: params?.[5],
            };
            return { rows: [] };
          }
          return { rows: [] };
        }),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;

      const service = new BrokerService(db);
      const event: SecurityEvent = {
        broker_id: 1,
        event_type: 'test_event',
        severity: 'medium',
        description: 'Test security event',
        ip_address: '192.168.1.1',
        endpoint: '/api/v1/test',
      };

      await service.logSecurityEvent(event);

      assert.deepEqual(loggedEvent, {
        broker_id: 1,
        event_type: 'test_event',
        severity: 'medium',
        description: 'Test security event',
        ip_address: '192.168.1.1',
        endpoint: '/api/v1/test',
      });
    });

    test('should auto-suspend broker on temp_suspend action', async () => {
      let brokerSuspended = false;
      
      const db = {
        query: mock.fn(async (sql: string, params?: any[]) => {
          if (sql.includes('INSERT INTO broker_security_events')) {
            return { rows: [] };
          }
          if (sql.includes('UPDATE brokers') && sql.includes('suspended_at')) {
            brokerSuspended = true;
            return { rows: [] };
          }
          return { rows: [] };
        }),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;

      const service = new BrokerService(db);
      await service.logSecurityEvent({
        broker_id: 1,
        event_type: 'excessive_rate_limit',
        severity: 'critical',
        description: 'Rate limit exceeded by 200%',
        auto_action: 'temp_suspend',
      });

      assert.equal(brokerSuspended, true);
    });

    test('should not throw on logging failure', async () => {
      const db = {
        query: mock.fn(() => Promise.reject(new Error('Database error'))),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;

      const service = new BrokerService(db);

      // Should not throw
      await service.logSecurityEvent({
        broker_id: 1,
        event_type: 'test',
        severity: 'low',
        description: 'Test',
      });

      assert.ok(true); // If we get here, no error was thrown
    });
  });

  describe('logApiUsage - Positive Cases', () => {
    test('should log API usage with all parameters', async () => {
      let loggedUsage: any = null;
      
      const db = {
        query: mock.fn(async (sql: string, params?: any[]) => {
          if (sql.includes('INSERT INTO broker_api_usage')) {
            loggedUsage = {
              broker_id: params?.[0],
              api_key_id: params?.[1],
              endpoint: params?.[2],
              method: params?.[3],
              status_code: params?.[4],
              response_time_ms: params?.[5],
              content_hash: params?.[6],
              federated_identity: params?.[7],
              success: params?.[8],
            };
            return { rows: [] };
          }
          return { rows: [] };
        }),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;

      const service = new BrokerService(db);
      await service.logApiUsage(
        1, // brokerId
        42, // apiKeyId
        '/api/v1/broker/protect',
        'POST',
        201,
        245, // response time
        'abc123def456',
        'user@example.com',
        true,
        undefined,
        '192.168.1.1',
        'DAON-SDK/1.0',
        true
      );

      assert.equal(loggedUsage.broker_id, 1);
      assert.equal(loggedUsage.api_key_id, 42);
      assert.equal(loggedUsage.endpoint, '/api/v1/broker/protect');
      assert.equal(loggedUsage.method, 'POST');
      assert.equal(loggedUsage.status_code, 201);
      assert.equal(loggedUsage.response_time_ms, 245);
    });

    test('should not throw on logging failure', async () => {
      const db = {
        query: mock.fn(() => Promise.reject(new Error('Database error'))),
        end: mock.fn(() => Promise.resolve()),
      } as unknown as DatabaseClient;

      const service = new BrokerService(db);

      // Should not throw
      await service.logApiUsage(1, 42, '/test', 'GET', 200, 100);

      assert.ok(true); // If we get here, no error was thrown
    });
  });
});
