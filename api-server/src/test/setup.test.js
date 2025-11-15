import { before, after, beforeEach } from 'node:test';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Test environment setup
before(() => {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.PORT = '0'; // Random port for tests
});

// Clean up after all tests
after(() => {
  console.log('✅ All tests completed');
});

export const TEST_CONFIG = {
  validContent: 'This is test content for creator protection',
  validMetadata: {
    title: 'Test Work',
    author: 'Test Creator',
    type: 'text',
    category: 'article'
  },
  validLicense: 'liberation_v1',
  maxContentSize: 10 * 1024 * 1024, // 10MB
  rateLimits: {
    general: 100, // per 15 minutes
    protection: 10 // per minute
  }
};

export const EXPECTED_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN'
};