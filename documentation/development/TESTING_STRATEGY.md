# DAON Testing Strategy

## Overview

Comprehensive testing strategy for DAON network covering unit tests, integration tests, end-to-end tests, performance testing, and security testing.

## Testing Pyramid

```
                     ▲
                    /E2E\           (10%) - Full system scenarios
                   /─────\
                  /  Int   \        (30%) - Service integration
                 /───────────\
                /    Unit      \    (60%) - Component logic
               /─────────────────\
```

## 1. Unit Tests

### API Server (`api-server/src/test/`)

**Current Coverage:**
- ✅ Health checks
- ✅ Content protection endpoints
- ✅ Bulk protection
- ✅ Content verification
- ✅ Statistics endpoints
- ✅ Error handling
- ✅ Security validation

**Run tests:**
```bash
cd api-server
npm test              # Quick health test
npm run test-full     # All tests
```

**Add more unit tests for:**
- [ ] Rate limiting edge cases
- [ ] Authentication/API keys (when implemented)
- [ ] Database connection failures
- [ ] Redis cache failures
- [ ] Blockchain RPC failures

### Blockchain Core (`daon-core/`)

**Current Coverage:**
- ✅ Genesis initialization
- ✅ Keeper logic
- ✅ Query params
- ✅ Message handling

**Run tests:**
```bash
cd daon-core
go test ./...
go test -v ./x/contentregistry/...
```

**Add more unit tests for:**
- [ ] Content hash validation
- [ ] License validation
- [ ] Duplicate protection detection
- [ ] State transitions
- [ ] Permissions and ownership

### SDKs

**Node.js SDK:**
```bash
cd sdks/node
npm test
```

**Python SDK:**
```bash
cd sdks/python
pytest
```

**Go SDK:**
```bash
cd sdks/go
go test -v ./...
```

**Ruby SDK:**
```bash
cd sdks/ruby
bundle exec rspec
```

## 2. Integration Tests

### API → Database Integration

**Test file:** `api-server/src/test/integration/database.test.js` (CREATE THIS)

```javascript
describe('API → Database Integration', () => {
  test('should persist content protection to database');
  test('should handle database connection failures gracefully');
  test('should use Redis cache for lookups');
  test('should fallback to database when cache misses');
  test('should handle concurrent protections without duplicates');
});
```

### API → Blockchain Integration

**Test file:** `api-server/src/test/integration/blockchain.test.js` (CREATE THIS)

```javascript
describe('API → Blockchain Integration', () => {
  test('should submit protection transaction to blockchain');
  test('should verify transaction was committed');
  test('should retrieve protection from blockchain');
  test('should handle blockchain node downtime');
  test('should retry failed transactions');
});
```

### SDK → API Integration

**Test file:** `integration-tests/sdk-api.test.js` (CREATE THIS)

```javascript
describe('SDK → API Integration', () => {
  test('Node.js SDK can protect content via API');
  test('Python SDK can verify content via API');
  test('Go SDK can query statistics via API');
  test('Ruby SDK handles API rate limiting');
  test('All SDKs produce identical hashes for same content');
});
```

## 3. End-to-End Tests

### Full Creator Journey

**Test file:** `e2e-tests/creator-journey.test.js` (CREATE THIS)

**Scenarios:**
```javascript
describe('Creator Journey E2E', () => {
  test('Creator protects single work via browser extension', async () => {
    // 1. Creator writes content
    // 2. Clicks browser extension
    // 3. Selects Liberation License
    // 4. Protection submitted to API
    // 5. Transaction committed to blockchain
    // 6. Creator receives verification URL
    // 7. Creator can verify content via public URL
  });

  test('Creator bulk-protects 50 works via Python script', async () => {
    // 1. Creator has CSV of works
    // 2. Runs bulk protection script
    // 3. All 50 works protected
    // 4. Progress bar shows completion
    // 5. Summary report generated
  });

  test('AI company verifies license before training', async () => {
    // 1. AI scraper encounters protected content
    // 2. Checks content hash via API
    // 3. Receives Liberation License details
    // 4. Respects prohibition on AI training
    // 5. Logs compliance event
  });
});
```

### Multi-DC Scenarios

**Test file:** `e2e-tests/multi-dc.test.js` (CREATE THIS)

```javascript
describe('Multi-DC E2E', () => {
  test('Content protected in US is verifiable in EU');
  test('DC1 failure auto-routes traffic to DC2');
  test('Blockchain syncs across all DCs');
  test('Database replication works correctly');
  test('Load balancer routes by geography');
});
```

## 4. Performance Testing

### Load Tests

**Tool:** Apache JMeter, k6, or Artillery

**Test file:** `performance-tests/load-test.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 100 },   // Ramp up
    { duration: '5m', target: 1000 },  // Steady load
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% requests < 500ms
    http_req_failed: ['rate<0.01'],    // <1% failures
  },
};

export default function () {
  const payload = JSON.stringify({
    content: `Test work ${Date.now()}`,
    license: 'liberation_v1',
  });

  const response = http.post('https://api.daon.network/api/v1/protect', payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(response, {
    'status is 201': (r) => r.status === 201,
    'has contentHash': (r) => JSON.parse(r.body).contentHash !== undefined,
  });

  sleep(1);
}
```

**Run:**
```bash
k6 run performance-tests/load-test.js
```

**Target Metrics:**
- **Throughput:** 1000 protections/second
- **Latency:** p95 < 500ms, p99 < 1000ms
- **Error rate:** < 0.1%
- **Concurrent users:** 10,000+

### Stress Tests

```javascript
export const options = {
  stages: [
    { duration: '2m', target: 5000 },   // Beyond normal load
    { duration: '5m', target: 10000 },  // Stress level
    { duration: '2m', target: 0 },      // Recovery
  ],
};
```

**Verify:**
- System degrades gracefully
- No memory leaks
- Database connections don't exhaust
- Circuit breakers trigger appropriately

### Soak Tests

```javascript
export const options = {
  stages: [
    { duration: '5m', target: 500 },    // Ramp up
    { duration: '24h', target: 500 },   // Sustained load
    { duration: '5m', target: 0 },      // Ramp down
  },
};
```

**Verify:**
- No memory leaks over 24 hours
- No performance degradation
- Logs don't fill disk
- Database performance remains stable

## 5. Security Testing

### Vulnerability Scanning

**Tools:**
- `npm audit` - Node.js dependencies
- `safety` - Python dependencies
- `bundler-audit` - Ruby dependencies
- `govulncheck` - Go dependencies

**Run automatically:**
```bash
# Already in GitHub Actions workflow
npm audit
safety check
bundle audit
go list -json -m all | nancy sleuth
```

### Penetration Testing

**Test file:** `security-tests/pentest.test.js`

**Scenarios:**
```javascript
describe('Security Penetration Tests', () => {
  test('SQL injection attempts fail', async () => {
    const malicious = "'; DROP TABLE protections; --";
    const res = await protect({ content: malicious });
    expect(res.status).toBe(201); // Safely escaped
  });

  test('XSS attempts fail', async () => {
    const xss = '<script>alert("xss")</script>';
    const res = await protect({ content: xss });
    expect(res.body.contentHash).toBe(sha256(xss)); // Hashed, not executed
  });

  test('Rate limiting prevents brute force', async () => {
    const requests = Array(1000).fill().map(() => 
      protect({ content: 'spam' })
    );
    const results = await Promise.all(requests);
    const limited = results.filter(r => r.status === 429);
    expect(limited.length).toBeGreaterThan(900); // Most blocked
  });

  test('Cannot enumerate protected content', async () => {
    // Attempt to guess content hashes
    // Timing attacks should not reveal existence
  });

  test('Headers include security protections', async () => {
    const res = await fetch('https://api.daon.network/health');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Strict-Transport-Security')).toBeTruthy();
  });
});
```

### Blockchain Security

**Test file:** `security-tests/blockchain.test.js`

```javascript
describe('Blockchain Security', () => {
  test('Cannot double-spend protections');
  test('Cannot forge content hashes');
  test('Cannot manipulate timestamps');
  test('Validator signatures verified');
  test('Consensus requires 2/3+ validators');
});
```

## 6. Smoke Tests (Post-Deployment)

**Run after every deployment to verify production:**

```bash
#!/bin/bash
# smoke-tests/post-deploy.sh

API_URL="${1:-https://api.daon.network}"

echo "🔥 Running smoke tests against $API_URL"

# Test 1: Health check
echo "1. Health check..."
curl -f "$API_URL/health" || exit 1

# Test 2: API documentation
echo "2. API documentation..."
curl -f "$API_URL/api/v1" | jq .name || exit 1

# Test 3: Protect content
echo "3. Content protection..."
HASH=$(curl -X POST "$API_URL/api/v1/protect" \
  -H "Content-Type: application/json" \
  -d '{"content":"Smoke test","license":"liberation_v1"}' \
  | jq -r .contentHash)
[ -n "$HASH" ] || exit 1

# Test 4: Verify content
echo "4. Content verification..."
curl -f "$API_URL/api/v1/verify/$HASH" | jq .isValid || exit 1

# Test 5: Statistics
echo "5. Statistics..."
curl -f "$API_URL/api/v1/stats" | jq .stats.totalProtected || exit 1

# Test 6: Blockchain RPC
echo "6. Blockchain RPC..."
curl -f "http://localhost:26657/status" | jq .result.node_info.network || exit 1

echo "✅ All smoke tests passed!"
```

**Add to GitHub Actions:**
```yaml
- name: Smoke Tests
  run: |
    ./smoke-tests/post-deploy.sh https://api.daon.network
    sleep 30
    ./smoke-tests/post-deploy.sh https://api.daon.network
```

## 7. Chaos Testing

**Simulate failures to test resilience:**

**Test file:** `chaos-tests/failures.test.js`

```javascript
describe('Chaos Engineering', () => {
  test('API survives database crash', async () => {
    // 1. Stop PostgreSQL
    // 2. API requests fail gracefully with 503
    // 3. No crashes or memory leaks
    // 4. Restart PostgreSQL
    // 5. API auto-recovers within 30s
  });

  test('API survives Redis crash', async () => {
    // 1. Stop Redis
    // 2. API continues (slower, no cache)
    // 3. Restart Redis
    // 4. Cache rebuilds automatically
  });

  test('API survives blockchain node crash', async () => {
    // 1. Stop blockchain container
    // 2. Protection requests queue or fail gracefully
    // 3. Verification requests use cached data
    // 4. Restart blockchain
    // 5. Queued requests process
  });

  test('System survives network partition', async () => {
    // Simulate DC1 ↔ DC2 network split
    // Verify both DCs continue operating
    // Verify blockchain consensus maintained
  });

  test('System survives CPU spike', async () => {
    // Generate CPU load on API server
    // Verify rate limiting prevents cascade
    // Verify auto-scaling triggers (if configured)
  });
});
```

## 8. Regression Tests

**Prevent bugs from reappearing:**

```javascript
describe('Regression Tests', () => {
  test('BUG-001: Duplicate protections create unique entries', async () => {
    // Bug: Duplicate content created multiple blockchain entries
    // Fix: Check hash before submitting
    // Test: Verify fix persists
  });

  test('BUG-002: Unicode content hashes correctly', async () => {
    // Bug: Emoji content caused hash inconsistency
    // Fix: UTF-8 normalization
    // Test: Verify emoji, CJK, RTL text
    const emoji = '👩‍💻 Creating amazing content! 🎨';
    const hash1 = await protect({ content: emoji });
    const hash2 = await protect({ content: emoji });
    expect(hash1.contentHash).toBe(hash2.contentHash);
  });

  // Add test for every bug fixed
});
```

## 9. Test Automation

### CI/CD Integration

**GitHub Actions workflow:** `.github/workflows/test.yml`

```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: API Unit Tests
        run: |
          cd api-server
          npm ci
          npm run test-full

      - name: Blockchain Unit Tests
        run: |
          cd daon-core
          go test -v ./...

  integration-tests:
    needs: unit-tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
      redis:
        image: redis:7
      blockchain:
        image: daonnetwork/validator:latest
    steps:
      - name: Run Integration Tests
        run: npm run test:integration

  e2e-tests:
    needs: integration-tests
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Staging
        run: ./deploy-staging.sh
      - name: Run E2E Tests
        run: npm run test:e2e
      - name: Cleanup Staging
        if: always()
        run: ./cleanup-staging.sh
```

### Test Coverage

**Measure coverage:**
```bash
# API coverage
cd api-server
npm install --save-dev c8
npx c8 npm run test-full

# Go coverage
cd daon-core
go test -cover ./...
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

**Target coverage:**
- **Overall:** > 80%
- **Critical paths:** > 95% (protection, verification, blockchain submission)
- **Error handling:** > 90%

## 10. Test Data Management

### Test Fixtures

**Location:** `test-data/fixtures/`

```javascript
// test-data/fixtures/content.js
export const fixtures = {
  validContent: {
    short: 'A haiku about code',
    medium: 'A short story about...',
    long: '...full novel text...',
    unicode: '日本語コンテンツ 🎌',
    special: 'Content with\nnewlines\tand\ttabs',
  },
  
  validMetadata: {
    minimal: { title: 'Test Work' },
    complete: {
      title: 'The Complete Work',
      author: 'Test Author',
      created: '2025-01-01',
      genre: 'Science Fiction',
      language: 'en',
    },
  },

  validLicenses: [
    'liberation_v1',
    'cc0',
    'cc-by',
    'cc-by-sa',
    'cc-by-nd',
    'cc-by-nc',
    'cc-by-nc-sa',
    'cc-by-nc-nd',
  ],
};
```

### Test Database

**Setup test database:**
```sql
-- test-data/schema.sql
CREATE DATABASE daon_test;
CREATE USER daon_test WITH PASSWORD 'test';
GRANT ALL ON DATABASE daon_test TO daon_test;
```

**Seed test data:**
```bash
# test-data/seed.sh
psql -U daon_test -d daon_test -f test-data/seed.sql
```

## 11. Testing Checklist

### Before Every Release:

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Security scan shows no high/critical vulns
- [ ] Performance tests meet SLAs
- [ ] Smoke tests pass in staging
- [ ] Regression tests pass
- [ ] Test coverage > 80%
- [ ] No flaky tests (all stable)
- [ ] Documentation updated

### Before Major Release:

- [ ] All checklist items above
- [ ] Chaos tests pass
- [ ] Soak test (24h) completed
- [ ] Penetration test conducted
- [ ] Multi-DC test scenarios pass
- [ ] Backward compatibility verified
- [ ] Migration tests (if schema changes)
- [ ] Rollback tested

## 12. Test Monitoring

### Test Metrics Dashboard

**Track:**
- Test execution time (should not increase)
- Test pass rate (should be > 99%)
- Flaky test count (should be 0)
- Coverage trend (should increase)
- Time to fix failing tests (should decrease)

### Alerts

**Set up alerts for:**
- Test suite failing > 2 runs in a row
- Coverage drops below 75%
- More than 3 flaky tests
- E2E tests fail in production

## Next Steps

1. **Immediate (Week 1):**
   - [ ] Run existing tests: `npm test`, `go test ./...`
   - [ ] Review test coverage: `npx c8 npm run test-full`
   - [ ] Set up test CI/CD workflow
   - [ ] Create smoke test script

2. **Short-term (Month 1):**
   - [ ] Write integration tests (API ↔ DB, API ↔ Blockchain)
   - [ ] Write first E2E test (creator journey)
   - [ ] Set up k6 load testing
   - [ ] Achieve 80% code coverage

3. **Medium-term (Quarter 1):**
   - [ ] Complete E2E test suite
   - [ ] Implement chaos testing
   - [ ] Performance benchmarks established
   - [ ] Security penetration test completed

4. **Long-term (Ongoing):**
   - [ ] Add regression test for every bug
   - [ ] Monitor test metrics
   - [ ] Regular security audits
   - [ ] Continuous performance monitoring

---

**Remember:** Good tests are an investment. They catch bugs early, enable confident deployments, and document expected behavior.

**Start small, test often, automate everything.**
