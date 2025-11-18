# DAON Infrastructure Testing Guide

**Purpose**: Verify that your production infrastructure is working correctly after deployment.

---

## Testing Levels

### Level 1: Smoke Tests (Post-Deployment - CRITICAL)
**When**: Immediately after every deployment  
**Time**: ~2 minutes  
**Goal**: Verify all services are alive and responding

### Level 2: Integration Tests (API ↔ Services)
**When**: After smoke tests pass  
**Time**: ~5 minutes  
**Goal**: Verify services communicate correctly

### Level 3: End-to-End Tests (User Journeys)
**When**: Before marking deployment as stable  
**Time**: ~10 minutes  
**Goal**: Verify complete user workflows work

### Level 4: Performance Tests (Load/Stress)
**When**: Weekly or before major releases  
**Time**: ~30-60 minutes  
**Goal**: Ensure system handles expected load

---

## Level 1: Smoke Tests (CRITICAL)

### Automated Script: `smoke-test.sh`

Run this **immediately after deployment**:

```bash
./smoke-test.sh https://api.daon.network
```

**What it checks**:

#### 1. Service Health Checks
```bash
# All containers running?
docker compose ps | grep -q "Up (healthy)"

# API responding?
curl -f https://api.daon.network/health

# Database connection?
docker exec daon-postgres pg_isready -U daon_api

# Redis connection?
docker exec daon-redis redis-cli ping

# Blockchain RPC?
docker exec daon-blockchain daond status
```

#### 2. Basic API Functionality
```bash
# API documentation accessible?
curl https://api.daon.network/api/v1

# Can protect content?
curl -X POST https://api.daon.network/api/v1/protect \
  -H "Content-Type: application/json" \
  -d '{"content":"smoke test"}'

# Can verify content?
curl https://api.daon.network/api/v1/verify/[hash]

# Can get stats?
curl https://api.daon.network/api/v1/stats
```

#### 3. Security Headers Present
```bash
# Check security headers
curl -I https://api.daon.network/health | grep -i "x-frame-options\|x-content-type-options\|strict-transport-security"
```

#### 4. Resource Limits Working
```bash
# Check memory usage under limit
docker stats daon-api-1 --no-stream | awk '{print $4}' | grep -v MEM

# Check CPU usage reasonable
docker stats daon-blockchain --no-stream | awk '{print $3}' | grep -v CPU
```

**Success Criteria**:
- ✅ All health checks return 200 OK
- ✅ All services show "healthy" status
- ✅ API can protect and verify content
- ✅ No container restarts in last 5 minutes
- ✅ All security headers present

**If smoke tests fail**: STOP - Do not proceed. Fix the issue first.

---

## Level 2: Integration Tests

### Test Suite: API ↔ Database

**Test**: Content persistence
```javascript
// 1. Protect content via API
const response = await protectContent("test content");

// 2. Verify stored in database
const dbRecord = await db.query("SELECT * FROM content WHERE hash = $1", [hash]);

// 3. Verify returned via API
const verifyResponse = await verifyContent(hash);

// Assert: All three match
assert(response.hash === dbRecord.hash === verifyResponse.hash);
```

### Test Suite: API ↔ Blockchain

**Test**: Blockchain transaction recording
```javascript
// 1. Protect content via API (triggers blockchain tx)
const response = await protectContent("blockchain test");

// 2. Wait for blockchain confirmation
await sleep(10000); // Block time

// 3. Query blockchain directly
const txResult = await queryBlockchain(response.txHash);

// Assert: Transaction exists on chain
assert(txResult.success === true);
assert(txResult.contentHash === response.contentHash);
```

**Test**: Blockchain sync with multiple API instances
```javascript
// 1. Send request to API instance 1
const response1 = await fetch("http://localhost:3001/api/v1/protect", ...);

// 2. Query from API instance 2
const response2 = await fetch("http://localhost:3002/api/v1/verify/" + hash);

// Assert: Both see same data (blockchain is source of truth)
assert(response2.isValid === true);
```

### Test Suite: API ↔ Redis Cache

**Test**: Cache hit rate
```javascript
// 1. Verify content (cold - should hit DB/blockchain)
const start1 = Date.now();
await verifyContent(hash);
const time1 = Date.now() - start1;

// 2. Verify same content (warm - should hit cache)
const start2 = Date.now();
await verifyContent(hash);
const time2 = Date.now() - start2;

// Assert: Cache is faster
assert(time2 < time1 / 2);
```

**Test**: Cache invalidation
```javascript
// 1. Get stats (cached)
const stats1 = await getStats();

// 2. Protect new content (invalidates cache)
await protectContent("invalidate cache");

// 3. Get stats again (should be updated)
const stats2 = await getStats();

// Assert: Total protected increased
assert(stats2.totalProtected === stats1.totalProtected + 1);
```

### Test Suite: Load Balancing

**Test**: Requests distributed across instances
```javascript
const responses = [];
for (let i = 0; i < 30; i++) {
  const response = await fetch("https://api.daon.network/health");
  const instanceId = response.headers.get("x-instance-id");
  responses.push(instanceId);
}

// Count instances that received requests
const instances = new Set(responses);

// Assert: All 3 instances received requests
assert(instances.size === 3);
assert(instances.has("api-1"));
assert(instances.has("api-2"));
assert(instances.has("api-3"));
```

---

## Level 3: End-to-End Tests

### User Journey 1: First-Time Creator

```javascript
describe("First-time creator protects content", () => {
  test("Complete workflow", async () => {
    // 1. Creator visits docs site
    const docs = await fetch("https://docs.daon.network");
    assert(docs.status === 200);

    // 2. Creator protects their first fanfic
    const content = "My first fanfiction...";
    const protection = await fetch("https://api.daon.network/api/v1/protect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        metadata: {
          title: "My First Fanfic",
          author: "NewCreator",
          fandom: "Test Fandom"
        },
        license: "liberation_v1"
      })
    });

    assert(protection.status === 201);
    const result = await protection.json();
    
    // 3. Creator receives hash and verification URL
    assert(result.contentHash);
    assert(result.verificationUrl);
    
    // 4. Creator can verify protection immediately
    const verification = await fetch(result.verificationUrl);
    assert(verification.status === 200);
    
    const verifyResult = await verification.json();
    assert(verifyResult.isValid === true);
    assert(verifyResult.license === "liberation_v1");
    
    // 5. Creator can see protection in stats
    const stats = await fetch("https://api.daon.network/api/v1/stats");
    const statsData = await stats.json();
    assert(statsData.stats.byLicense.liberation_v1 > 0);
  });
});
```

### User Journey 2: Bulk Protection (AO3 Migration)

```javascript
describe("Creator migrates AO3 works", () => {
  test("Bulk protect 50 works", async () => {
    // Simulate AO3 export with 50 works
    const works = Array(50).fill().map((_, i) => ({
      content: `Work ${i} content...`,
      metadata: {
        title: `Work ${i}`,
        author: "BulkCreator",
        originalUrl: `https://ao3.org/works/${i}`
      }
    }));

    // Bulk protect
    const response = await fetch("https://api.daon.network/api/v1/protect/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        works,
        license: "liberation_v1"
      })
    });

    assert(response.status === 200);
    const result = await response.json();
    
    // All 50 should be protected
    assert(result.protected === 50);
    assert(result.results.length === 50);
    
    // All should have hashes
    result.results.forEach(r => {
      assert(r.contentHash);
      assert(r.verificationUrl);
    });
  });
});
```

### User Journey 3: Verification by Third Party

```javascript
describe("AI scraper verifies license", () => {
  test("AI can check if content is protected", async () => {
    // 1. AI scraper finds content hash in webpage
    const contentHash = "abc123..."; // From content meta tag
    
    // 2. AI queries verification endpoint
    const response = await fetch(`https://api.daon.network/api/v1/verify/${contentHash}`);
    const result = await response.json();
    
    // 3. AI reads license terms
    assert(result.isValid === true);
    assert(result.license);
    
    if (result.license === "liberation_v1") {
      // AI knows: Can use for training
      console.log("✅ Content licensed for AI training");
    } else if (result.license === "cc-by-nc") {
      // AI knows: Cannot use commercially
      console.log("⚠️ Non-commercial license - skip");
    }
  });
});
```

---

## Level 4: Performance Tests

### Load Test: Normal Traffic

**Tool**: k6 or Apache Bench

**Scenario**: Simulate 100 concurrent creators
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 100, // 100 virtual users
  duration: '5m', // Run for 5 minutes
};

export default function() {
  // Protect content
  const protectRes = http.post('https://api.daon.network/api/v1/protect', 
    JSON.stringify({
      content: `Test content ${__VU}-${__ITER}`,
      metadata: { title: 'Load Test' }
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  check(protectRes, {
    'protect: status 201': (r) => r.status === 201,
    'protect: response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  const hash = protectRes.json('contentHash');
  
  // Verify content
  const verifyRes = http.get(`https://api.daon.network/api/v1/verify/${hash}`);
  
  check(verifyRes, {
    'verify: status 200': (r) => r.status === 200,
    'verify: response time < 200ms': (r) => r.timings.duration < 200,
  });
  
  sleep(1);
}
```

**Success Criteria**:
- ✅ 95th percentile response time < 500ms
- ✅ Error rate < 0.1%
- ✅ All API instances handling requests
- ✅ Database connections stable
- ✅ No memory leaks (memory usage stable)

### Stress Test: Peak Load

**Scenario**: Black Friday / Major Event
```javascript
export const options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 500 },  // Spike to 500 users
    { duration: '5m', target: 500 },  // Stay at 500
    { duration: '2m', target: 1000 }, // Spike to 1000
    { duration: '3m', target: 1000 }, // Stay at 1000
    { duration: '2m', target: 0 },    // Ramp down
  ],
};
```

**Success Criteria**:
- ✅ System remains stable at 500 concurrent users
- ✅ Graceful degradation at 1000 users (slower but no crashes)
- ✅ Auto-recovery after spike

### Soak Test: Long-term Stability

**Scenario**: Run for 24 hours at moderate load
```javascript
export const options = {
  vus: 50,
  duration: '24h',
};
```

**Success Criteria**:
- ✅ No memory leaks (memory stable after 24h)
- ✅ No database connection leaks
- ✅ No performance degradation over time
- ✅ Logs show no accumulating errors

---

## Monitoring During Tests

### Key Metrics to Watch

**System Resources**:
```bash
# CPU usage
docker stats --no-stream

# Memory usage
free -h

# Disk I/O
iostat -x 1

# Network traffic
iftop
```

**Application Metrics**:
```bash
# Request rate
curl http://localhost:9090/metrics | grep http_requests_total

# Response times
curl http://localhost:9090/metrics | grep http_request_duration_seconds

# Error rate
curl http://localhost:9090/metrics | grep http_requests_total | grep "status=\"5"
```

**Database Health**:
```bash
# Connection pool
docker exec daon-postgres psql -U daon_api -d daon_production \
  -c "SELECT count(*) FROM pg_stat_activity WHERE datname='daon_production';"

# Query performance
docker exec daon-postgres psql -U daon_api -d daon_production \
  -c "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

**Blockchain Health**:
```bash
# Block height increasing?
docker exec daon-blockchain daond status | jq .SyncInfo.latest_block_height

# Peer connections
docker exec daon-blockchain daond status | jq .SyncInfo.peers
```

---

## Test Implementation Plan

### Phase 1: Smoke Tests (Week 1)
- [ ] Create `smoke-test.sh` script
- [ ] Add to deployment workflow
- [ ] Set up notifications (Slack/Discord) for failures

### Phase 2: Integration Tests (Week 2)
- [ ] Create API ↔ Database tests
- [ ] Create API ↔ Blockchain tests
- [ ] Create API ↔ Redis tests
- [ ] Run manually after deployments

### Phase 3: E2E Tests (Week 3)
- [ ] Script creator journey tests
- [ ] Script bulk protection tests
- [ ] Script third-party verification tests
- [ ] Run before marking deployment stable

### Phase 4: Performance Tests (Week 4)
- [ ] Set up k6
- [ ] Create load test scripts
- [ ] Create stress test scripts
- [ ] Run weekly, document baselines

---

## Test Data Management

### Test Database
```sql
-- Separate test database
CREATE DATABASE daon_test;

-- Reset between test runs
TRUNCATE TABLE content_registry CASCADE;
```

### Test Blockchain
```bash
# Use testnet for integration tests
docker run -d --name daon-testnet \
  -e CHAIN_ID=daon-testnet-1 \
  daon-blockchain:latest
```

### Cleanup After Tests
```bash
# Remove test data
docker exec daon-postgres psql -U daon_api -d daon_test \
  -c "DELETE FROM content_registry WHERE metadata->>'test' = 'true';"

# Clear Redis test keys
docker exec daon-redis redis-cli FLUSHDB
```

---

## Success Criteria Summary

**Smoke Tests** (2 min):
- All services healthy
- Basic API operations work

**Integration Tests** (5 min):
- Services communicate correctly
- Data persists properly
- Cache works

**E2E Tests** (10 min):
- Complete user workflows succeed
- Multi-instance setup works

**Performance Tests** (1 hour):
- Handles 100+ concurrent users
- Response times acceptable
- No memory leaks

**When all pass**: ✅ Deployment is STABLE and PRODUCTION-READY

---

## Next Steps

1. Create smoke test script first (highest priority)
2. Run smoke tests after next deployment
3. Document baseline metrics
4. Gradually add integration and E2E tests
5. Schedule weekly performance tests

Want me to create the `smoke-test.sh` script now?
