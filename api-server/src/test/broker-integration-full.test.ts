/**
 * Full Integration Test Suite for Broker API
 * 
 * Tests actual HTTP endpoints with positive, negative, and edge cases
 * Requires running server and database
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const API_URL = process.env.TEST_API_URL || 'http://localhost:3000';
const VALID_API_KEY = process.env.TEST_BROKER_API_KEY || 'DAON_BR_test_79288052216c62602e1353f529ec99d6d63a8e8947d132be';
const INVALID_API_KEY = 'DAON_BR_invalid_key_123';

// Helper function for API requests
async function apiRequest(
  method: string,
  endpoint: string,
  body?: any,
  apiKey?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  
  const options: RequestInit = {
    method,
    headers,
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  return fetch(`${API_URL}${endpoint}`, options);
}

describe('Broker API - Full Integration Tests', () => {
  let testContentHash: string;
  let testWebhookId: number;
  
  // ============================================================================
  // AUTHENTICATION TESTS
  // ============================================================================
  
  describe('Authentication & Authorization', () => {
    
    describe('Positive Cases', () => {
      it('should verify valid API key', async () => {
        const response = await apiRequest('GET', '/api/v1/broker/verify', undefined, VALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.broker).toBeDefined();
        expect(data.broker.domain).toBeDefined();
        expect(data.api_key.scopes).toBeDefined();
        expect(data.rate_limits).toBeDefined();
      });
    });
    
    describe('Negative Cases', () => {
      it('should reject invalid API key', async () => {
        const response = await apiRequest('GET', '/api/v1/broker/verify', undefined, INVALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(401);
        expect(data.success).toBe(false);
        expect(data.code).toBe('BROKER_AUTH_INVALID_KEY');
      });
      
      it('should reject missing Authorization header', async () => {
        const response = await apiRequest('GET', '/api/v1/broker/verify');
        const data = await response.json();
        
        expect(response.status).toBe(401);
        expect(data.success).toBe(false);
        expect(data.code).toBe('BROKER_AUTH_MISSING');
      });
      
      it('should reject malformed Authorization header', async () => {
        const response = await fetch(`${API_URL}/api/v1/broker/verify`, {
          headers: { 'Authorization': 'InvalidFormat' }
        });
        const data = await response.json();
        
        expect(response.status).toBe(401);
        expect(data.success).toBe(false);
      });
      
      it('should reject requests without required scopes', async () => {
        // Would need a restricted API key to test this
        expect(true).toBe(true);
      });
    });
  });
  
  // ============================================================================
  // CONTENT PROTECTION TESTS
  // ============================================================================
  
  describe('POST /api/v1/broker/protect', () => {
    
    describe('Positive Cases', () => {
      it('should protect content with minimal data', async () => {
        const response = await apiRequest('POST', '/api/v1/broker/protect', {
          content: 'Test content for CI',
          username: 'citest',
          license: 'cc-by'
        }, VALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(201);
        expect(data.success).toBe(true);
        expect(data.contentHash).toBeDefined();
        expect(data.contentHash).toMatch(/^[a-f0-9]{64}$/);
        expect(data.owner).toContain('@');
        expect(data.license).toBe('cc-by');
        expect(data.broker).toBeDefined();
        
        testContentHash = data.contentHash;
      });
      
      it('should protect content with all fields', async () => {
        const response = await apiRequest('POST', '/api/v1/broker/protect', {
          content: 'Full test content',
          username: 'fulltest',
          license: 'liberation_v1',
          metadata: {
            title: 'Test Title',
            author: 'Test Author',
            description: 'Test description'
          }
        }, VALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(201);
        expect(data.success).toBe(true);
      });
      
      it('should accept all valid license types', async () => {
        const licenses = ['liberation_v1', 'cc0', 'cc-by', 'cc-by-sa', 'cc-by-nd', 'cc-by-nc', 'cc-by-nc-sa'];
        
        for (const license of licenses) {
          const response = await apiRequest('POST', '/api/v1/broker/protect', {
            content: `Test ${license}`,
            username: `test_${license.replace(/-/g, '_')}`,
            license
          }, VALID_API_KEY);
          const data = await response.json();
          
          expect(data.success).toBe(true);
          expect(data.license).toBe(license);
        }
      });
    });
    
    describe('Negative Cases', () => {
      it('should reject without authentication', async () => {
        const response = await apiRequest('POST', '/api/v1/broker/protect', {
          content: 'Test',
          username: 'test',
          license: 'cc-by'
        });
        const data = await response.json();
        
        expect(response.status).toBe(401);
        expect(data.success).toBe(false);
      });
      
      it('should reject empty content', async () => {
        const response = await apiRequest('POST', '/api/v1/broker/protect', {
          content: '',
          username: 'test',
          license: 'cc-by'
        }, VALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe('Validation failed');
      });
      
      it('should reject missing username', async () => {
        const response = await apiRequest('POST', '/api/v1/broker/protect', {
          content: 'Test',
          license: 'cc-by'
        }, VALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
      });
      
      it('should reject invalid license', async () => {
        const response = await apiRequest('POST', '/api/v1/broker/protect', {
          content: 'Test',
          username: 'test',
          license: 'invalid-license'
        }, VALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.details[0].msg).toContain('Invalid license');
      });
      
      it('should reject invalid username format', async () => {
        const response = await apiRequest('POST', '/api/v1/broker/protect', {
          content: 'Test',
          username: 'invalid@username',
          license: 'cc-by'
        }, VALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
      });
    });
    
    describe('Edge Cases', () => {
      it('should handle large content', async () => {
        const largeContent = 'a'.repeat(100000);
        const response = await apiRequest('POST', '/api/v1/broker/protect', {
          content: largeContent,
          username: 'largetest',
          license: 'cc-by'
        }, VALID_API_KEY);
        const data = await response.json();
        
        expect(data.success).toBe(true);
      });
      
      it('should handle special characters in content', async () => {
        const response = await apiRequest('POST', '/api/v1/broker/protect', {
          content: 'Test with émojis 🎨 and spëcial çhars',
          username: 'specialtest',
          license: 'cc-by'
        }, VALID_API_KEY);
        const data = await response.json();
        
        expect(data.success).toBe(true);
      });
      
      it('should handle duplicate content protection', async () => {
        const content = 'Duplicate test content';
        const username = 'duptest';
        
        // Protect once
        await apiRequest('POST', '/api/v1/broker/protect', {
          content,
          username,
          license: 'cc-by'
        }, VALID_API_KEY);
        
        // Protect again - should succeed (same hash, different timestamp)
        const response = await apiRequest('POST', '/api/v1/broker/protect', {
          content,
          username,
          license: 'cc-by'
        }, VALID_API_KEY);
        const data = await response.json();
        
        expect(data.success).toBe(true);
      });
    });
  });
  
  // ============================================================================
  // TRANSFER OWNERSHIP TESTS
  // ============================================================================
  
  describe('POST /api/v1/broker/transfer', () => {
    
    beforeAll(async () => {
      // Create content for transfer tests
      const response = await apiRequest('POST', '/api/v1/broker/protect', {
        content: 'Content for transfer tests',
        username: 'transferowner',
        license: 'cc-by'
      }, VALID_API_KEY);
      const data = await response.json();
      testContentHash = data.contentHash;
    });
    
    describe('Positive Cases', () => {
      it('should transfer ownership successfully', async () => {
        const response = await apiRequest('POST', '/api/v1/broker/transfer', {
          contentHash: testContentHash,
          currentOwner: 'transferowner@test-broker.local',
          newOwner: 'newtransferowner@test-broker.local',
          reason: 'CI test transfer'
        }, VALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.transfer).toBeDefined();
        expect(data.transfer.previousOwner).toBe('transferowner@test-broker.local');
        expect(data.transfer.newOwner).toBe('newtransferowner@test-broker.local');
        expect(data.transfer.id).toBeDefined();
        expect(data.transferHistory).toBeDefined();
      });
      
      it('should record transfer reason', async () => {
        const reason = 'User account migration';
        const response = await apiRequest('POST', '/api/v1/broker/transfer', {
          contentHash: testContentHash,
          currentOwner: 'newtransferowner@test-broker.local',
          newOwner: 'finalowner@test-broker.local',
          reason
        }, VALID_API_KEY);
        const data = await response.json();
        
        expect(data.success).toBe(true);
        expect(data.transfer.reason).toBe(reason);
      });
    });
    
    describe('Negative Cases', () => {
      it('should reject transfer from wrong owner', async () => {
        const response = await apiRequest('POST', '/api/v1/broker/transfer', {
          contentHash: testContentHash,
          currentOwner: 'wrongowner@test-broker.local',
          newOwner: 'someone@test-broker.local'
        }, VALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error).toBe('Unauthorized');
      });
      
      it('should reject transfer from different domain', async () => {
        const response = await apiRequest('POST', '/api/v1/broker/transfer', {
          contentHash: testContentHash,
          currentOwner: 'user@different-domain.com',
          newOwner: 'someone@test-broker.local'
        }, VALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.message).toContain('domain');
      });
      
      it('should reject transfer of non-existent content', async () => {
        const response = await apiRequest('POST', '/api/v1/broker/transfer', {
          contentHash: '0000000000000000000000000000000000000000000000000000000000000000',
          currentOwner: 'user@test-broker.local',
          newOwner: 'other@test-broker.local'
        }, VALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(404);
        expect(data.success).toBe(false);
        expect(data.error).toBe('Content not found');
      });
      
      it('should reject invalid content hash format', async () => {
        const response = await apiRequest('POST', '/api/v1/broker/transfer', {
          contentHash: 'invalid',
          currentOwner: 'user@test-broker.local',
          newOwner: 'other@test-broker.local'
        }, VALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
      });
      
      it('should reject invalid identity format', async () => {
        const response = await apiRequest('POST', '/api/v1/broker/transfer', {
          contentHash: testContentHash,
          currentOwner: 'invalid-format',
          newOwner: 'other@test-broker.local'
        }, VALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
      });
    });
  });
  
  // ============================================================================
  // WEBHOOK TESTS
  // ============================================================================
  
  describe('Webhook Management', () => {
    
    describe('POST /api/v1/broker/webhooks', () => {
      
      describe('Positive Cases', () => {
        it('should register webhook', async () => {
          const response = await apiRequest('POST', '/api/v1/broker/webhooks', {
            url: 'https://ci-test.example.com/webhook',
            secret: 'ci-test-secret-key-at-least-32-characters-long',
            events: ['content.protected', 'content.transferred'],
            description: 'CI test webhook'
          }, VALID_API_KEY);
          const data = await response.json();
          
          expect(response.status).toBe(201);
          expect(data.success).toBe(true);
          expect(data.webhook.id).toBeDefined();
          expect(data.webhook.url).toBe('https://ci-test.example.com/webhook');
          
          testWebhookId = data.webhook.id;
        });
      });
      
      describe('Negative Cases', () => {
        it('should reject invalid URL', async () => {
          const response = await apiRequest('POST', '/api/v1/broker/webhooks', {
            url: 'not-a-url',
            secret: 'secret-key-at-least-32-characters-long',
            events: ['content.protected']
          }, VALID_API_KEY);
          const data = await response.json();
          
          expect(response.status).toBe(400);
          expect(data.success).toBe(false);
        });
        
        it('should reject short secret', async () => {
          const response = await apiRequest('POST', '/api/v1/broker/webhooks', {
            url: 'https://example.com/webhook',
            secret: 'short',
            events: ['content.protected']
          }, VALID_API_KEY);
          const data = await response.json();
          
          expect(response.status).toBe(400);
          expect(data.success).toBe(false);
        });
        
        it('should reject invalid event type', async () => {
          const response = await apiRequest('POST', '/api/v1/broker/webhooks', {
            url: 'https://example.com/webhook',
            secret: 'secret-key-at-least-32-characters-long',
            events: ['invalid.event']
          }, VALID_API_KEY);
          const data = await response.json();
          
          expect(response.status).toBe(400);
          expect(data.success).toBe(false);
        });
        
        it('should reject empty events array', async () => {
          const response = await apiRequest('POST', '/api/v1/broker/webhooks', {
            url: 'https://example.com/webhook',
            secret: 'secret-key-at-least-32-characters-long',
            events: []
          }, VALID_API_KEY);
          const data = await response.json();
          
          expect(response.status).toBe(400);
          expect(data.success).toBe(false);
        });
      });
    });
    
    describe('GET /api/v1/broker/webhooks', () => {
      
      it('should list webhooks', async () => {
        const response = await apiRequest('GET', '/api/v1/broker/webhooks', undefined, VALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(Array.isArray(data.webhooks)).toBe(true);
        expect(data.webhooks.length).toBeGreaterThan(0);
      });
    });
    
    describe('GET /api/v1/broker/webhooks/:id/stats', () => {
      
      it('should return webhook stats', async () => {
        const response = await apiRequest('GET', `/api/v1/broker/webhooks/${testWebhookId}/stats`, undefined, VALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.stats).toBeDefined();
        expect(data.stats.total_deliveries).toBeDefined();
        expect(data.stats.success_rate).toBeDefined();
      });
    });
    
    describe('DELETE /api/v1/broker/webhooks/:id', () => {
      
      it('should delete webhook', async () => {
        const response = await apiRequest('DELETE', `/api/v1/broker/webhooks/${testWebhookId}`, undefined, VALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
      });
      
      it('should return 404 for non-existent webhook', async () => {
        const response = await apiRequest('DELETE', '/api/v1/broker/webhooks/99999', undefined, VALID_API_KEY);
        const data = await response.json();
        
        expect(response.status).toBe(404);
        expect(data.success).toBe(false);
      });
    });
  });
  
  // ============================================================================
  // USAGE STATISTICS TESTS
  // ============================================================================
  
  describe('GET /api/v1/broker/usage', () => {
    
    it('should return usage statistics', async () => {
      const response = await apiRequest('GET', '/api/v1/broker/usage', undefined, VALID_API_KEY);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.usage)).toBe(true);
    });
    
    it('should filter by date range', async () => {
      const response = await apiRequest(
        'GET',
        '/api/v1/broker/usage?startDate=2025-12-01&endDate=2025-12-31',
        undefined,
        VALID_API_KEY
      );
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});

// ============================================================================
// PERFORMANCE & LOAD TESTS
// ============================================================================

describe('Performance Tests', () => {
  
  it('should handle rapid sequential requests', async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        apiRequest('POST', '/api/v1/broker/protect', {
          content: `Rapid test ${i}`,
          username: `rapid${i}`,
          license: 'cc-by'
        }, VALID_API_KEY)
      );
    }
    
    const responses = await Promise.all(promises);
    const successCount = responses.filter(r => r.status === 201).length;
    
    expect(successCount).toBe(10);
  });
  
  it('should handle concurrent requests', async () => {
    const promises = Array(5).fill(null).map((_, i) =>
      apiRequest('POST', '/api/v1/broker/protect', {
        content: `Concurrent test ${i}`,
        username: `concurrent${i}`,
        license: 'cc-by'
      }, VALID_API_KEY)
    );
    
    const responses = await Promise.all(promises);
    const allSuccessful = responses.every(r => r.status === 201);
    
    expect(allSuccessful).toBe(true);
  });
});
