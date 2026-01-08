# API Server Test Inventory

This document tracks all test files, their purpose, and coverage status.

## Test Quality Standards

Each test MUST:
1. **Assert actual behavior** - No `assert.ok(true)` or `expect(true).toBe(true)` placeholders
2. **Test one thing** - Single responsibility per test
3. **Be deterministic** - Same result every run
4. **Have meaningful names** - Describe what is being tested and expected outcome

## Test File Inventory

### Unit Tests (Mock dependencies, test isolated functions)

#### `broker-auth-middleware.test.ts`
**Status:** GOOD  
**Runner:** Node.js native test runner  
**Coverage:** Broker authentication middleware

| Test Group | Tests | Description |
|------------|-------|-------------|
| Authorization header validation | 4 | Missing header, invalid format, Bearer prefix |
| API key authentication | 3 | Invalid key, valid key, last_used update |
| Scope validation | 2 | Insufficient scopes, all required scopes |
| Rate limiting | 2 | Exceeded limits, rate limit headers |
| Signature verification | 3 | Missing signature, invalid signature, valid signature |
| Error handling | 1 | Service errors |
| requireBrokerDomain | 3 | No auth, wrong domain, correct domain |
| requireCertificationTier | 5 | No auth, insufficient tier, exact tier, higher tier |

#### `broker-service.test.ts`
**Status:** GOOD  
**Runner:** Node.js native test runner  
**Coverage:** BrokerService class methods

| Test Group | Tests | Description |
|------------|-------|-------------|
| authenticateBroker positive | 3 | Valid key, all tiers, update tracking |
| authenticateBroker negative | 7 | Invalid prefix, wrong hash, expired, disabled, non-active status, suspended, revoked |
| checkRateLimit positive | 2 | Within limits, at exact limit |
| checkRateLimit negative | 4 | Hourly exceeded, daily exceeded, security logging, non-existent broker |
| verifySignature positive | 2 | Not required, valid Ed25519 |
| verifySignature negative | 4 | Missing public key, missing signature, invalid signature, security logging |
| getFederatedIdentity positive | 3 | Create new, valid formats, upsert |
| getFederatedIdentity negative | 3 | Invalid chars, empty, too long |
| generateApiKey | 4 | Valid format, uniqueness, expiration, scopes |
| revokeApiKey | 1 | Revoke with reason |
| logSecurityEvent | 3 | All fields, auto-suspend, failure handling |
| logApiUsage | 2 | All parameters, failure handling |

#### `admin-auth.test.ts`
**Status:** GOOD  
**Runner:** Node.js native test runner  
**Coverage:** Admin authentication middleware

| Test Group | Tests | Description |
|------------|-------|-------------|
| Authorization header | 2 | Missing header, invalid format |
| Token validation | 2 | Invalid JWT, non-existent user |
| Admin permission | 4 | Non-admin rejected, admin by ID, admin by domain, multiple IDs |
| Security logging | 1 | Unauthorized attempts logged |
| logAdminAction | 2 | Successful logging, failure handling |
| Edge cases | 2 | Null email, empty env vars |

#### `duplicate-detection.test.ts`
**Status:** GOOD  
**Runner:** Node.js native test runner  
**Coverage:** Content duplicate detection utilities

| Test Group | Tests | Description |
|------------|-------|-------------|
| Exact hash | 1 | SHA256 consistency and uniqueness |
| Normalized hash | 3 | Whitespace, case, punctuation normalization |
| Perceptual hash | 2 | Generation, similarity detection |
| Hamming distance | 1 | Distance calculation |
| Similarity check | 1 | Threshold comparison |
| Comprehensive check | 4 | Exact match, normalized match, perceptual match, no match |
| All hashes | 1 | Generate all hash types |
| Real-world scenarios | 2 | Formatting changes, similar stories |

### Integration Tests (Real HTTP requests, may need DB)

#### `broker-endpoints.integration.test.ts`
**Status:** GOOD  
**Runner:** Node.js native test runner  
**Coverage:** HTTP endpoint tests with supertest

| Test Group | Tests | Description |
|------------|-------|-------------|
| POST /broker/protect positive | 5 | Valid auth, broker info, duplicates, rate headers, all licenses |
| POST /broker/protect negative | 8 | No auth, invalid key, malformed header, missing fields, invalid username, invalid license, rate limit, missing Bearer |
| POST /broker/register | 1 | Admin-only (verified blocked) |
| GET /broker/verify | 2 | Valid and invalid keys |
| GET /broker/usage | 2 | Stats and date filtering |
| POST /broker/transfer | 3 | Transfer flow, no auth, non-existent |
| Security | 3 | Headers, malformed JSON, large payloads |
| Performance | 1 | Response time |
| Content validation | 2 | Various content types, consistent hashes |
| Metadata | 2 | Optional fields, missing metadata |

#### `broker-registration.integration.test.ts`
**Status:** GOOD  
**Runner:** Node.js native test runner  
**Coverage:** Admin-protected broker registration

| Test Group | Tests | Description |
|------------|-------|-------------|
| Security | 6 | No auth, invalid token, non-admin, missing fields, invalid domain, invalid tier, invalid email |
| Functional | 1 | Valid admin request |

#### `broker-integration-full.test.ts`
**Status:** NEEDS REVIEW  
**Runner:** Jest  
**Coverage:** Full HTTP flow tests (requires live server)

| Test Group | Tests | Issues |
|------------|-------|--------|
| Authentication | 4 | 1 placeholder (scope test) |
| Content protection | 9 | Good |
| Transfer ownership | 7 | Good |
| Webhook management | 9 | Good |
| Usage statistics | 2 | Good |
| Performance | 2 | Good |

#### `broker-endpoints-ci.test.ts`
**Status:** NEEDS CLEANUP  
**Runner:** Jest  
**Coverage:** CI pipeline tests

| Test Group | Status | Issues |
|------------|--------|--------|
| Broker verification | GOOD | Real tests |
| Content protection | MIXED | Some placeholders in edge cases |
| Transfer ownership | BAD | ALL tests are placeholders |
| Webhook management | GOOD | Real tests |
| Usage statistics | BAD | Placeholders |
| Webhook delivery | BAD | Placeholders |
| Security tests | MIXED | Some real, some placeholders |

### Files NOT in test suite (untracked):
- `backup-codes.test.ts`
- `encryption.test.ts`
- `jwt.test.ts`
- `totp.test.ts`

## Test Gaps

1. **Transfer ownership** - No real tests for POST /broker/transfer endpoint
2. **Usage statistics** - No real tests for GET /broker/usage endpoint  
3. **Webhook delivery** - No tests for actual HTTP delivery
4. **Admin broker registration** - Limited functional tests (needs DB)

## Running Tests

```bash
# All tests
npm test

# Node.js native test runner only
npm run test:node

# Jest tests only
npm run test:jest

# Specific file
node --test dist/test/broker-service.test.js
```

## Adding New Tests

1. Choose runner based on test type:
   - Unit tests with mocking: Node.js native (`node:test`)
   - Integration tests needing supertest: Node.js native
   - Tests requiring Jest features: Jest

2. Follow naming convention: `{feature}.test.ts` or `{feature}.integration.test.ts`

3. Add entry to this inventory document

4. Ensure all assertions test actual behavior, not just `true`
