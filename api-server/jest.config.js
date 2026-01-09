export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
    }],
  },
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '\\.integration\\.test\\.ts$',
    'broker-integration-full\\.test\\.ts$',
    'broker-auth-middleware\\.test\\.ts$',
    'broker-service\\.test\\.ts$',
    'broker-endpoints-ci\\.test\\.ts$',
    'duplicate-detection\\.test\\.ts$',
    'admin-auth\\.test\\.ts$',
    'broker-registration-admin\\.test\\.ts$',
    'transfer-endpoint\\.test\\.ts$',
    'usage-endpoint\\.test\\.ts$',
    'webhook-delivery\\.test\\.ts$'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/test/**',
    '!src/**/*.test.ts'
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  verbose: true
};
