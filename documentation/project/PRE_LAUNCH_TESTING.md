# Pre-Launch Testing & Hardening Plan

**Purpose**: Stress test, penetration test, and harden infrastructure BEFORE public launch, then wipe and start fresh with a clean blockchain.

**Status**: Pre-launch testing phase  
**Timeline**: 1-2 weeks before public launch  
**Goal**: Find and fix all issues with test data, then launch with pristine blockchain

---

## 🎯 Testing Philosophy

**"Break it now, fix it now, launch it perfect"**

Since you haven't launched publicly yet, this is the PERFECT time to:
1. ✅ Run aggressive performance tests against live infrastructure
2. ✅ Try to break your system (find vulnerabilities)
3. ✅ Fix any issues discovered
4. ✅ Document your limits and scaling needs
5. ✅ **Wipe everything clean**
6. ✅ Launch with fresh genesis block and production-ready infrastructure

---

## 📋 Testing Phases

### Phase 1: Performance Testing (Days 1-3)
**Test against live production infrastructure**

### Phase 2: Security Testing (Days 4-6)
**Penetration testing and vulnerability assessment**

### Phase 3: Chaos Engineering (Days 7-8)
**Break things intentionally to test recovery**

### Phase 4: Fix & Harden (Days 9-12)
**Address all findings**

### Phase 5: Wipe & Relaunch (Day 13)
**Clean slate for production launch**

---

## Phase 1: Performance Testing Against Live Infrastructure

### Load Test: Normal Traffic Simulation

**Scenario**: 100 concurrent creators protecting content

**Tool**: k6 (already popular for load testing)

**Script**: `load-test-production.js`
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics
const protectionErrors = new Counter('protection_errors');
const verificationErrors = new Counter('verification_errors');
const protectionDuration = new Trend('protection_duration');

export const options = {
  stages: [
    { duration: '2m', target: 20 },   // Warm up
    { duration: '5m', target: 100 },  // Ramp to 100 users
    { duration: '10m', target: 100 }, // Stay at 100 users
    { duration: '5m', target: 200 },  // Spike to 200
    { duration: '5m', target: 200 },  // Stay at 200
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% under 1s
    http_req_failed: ['rate<0.05'],    // Less than 5% errors
    protection_duration: ['p(95)<2000'], // Protection under 2s
  },
};

export default function() {
  const baseUrl = __ENV.API_URL || 'https://api.daon.network';
  
  // Protect content
  const protectPayload = JSON.stringify({
    content: `Load test content ${__VU}-${__ITER}-${Date.now()}`,
    metadata: {
      title: `Test Work ${__VU}-${__ITER}`,
      author: `Test User ${__VU}`,
      tags: ['load-test', 'performance']
    },
    license: 'liberation_v1'
  });
  
  const protectStart = Date.now();
  const protectRes = http.post(`${baseUrl}/api/v1/protect`, protectPayload, {
    headers: { 'Content-Type': 'application/json' },
  });
  
  const protectCheck = check(protectRes, {
    'protection status 201': (r) => r.status === 201,
    'protection has hash': (r) => r.json('contentHash') !== undefined,
    'protection response time OK': (r) => r.timings.duration < 2000,
  });
  
  if (!protectCheck) {
    protectionErrors.add(1);
  }
  
  protectionDuration.add(Date.now() - protectStart);
  
  if (protectRes.status === 201) {
    const hash = protectRes.json('contentHash');
    
    // Wait a bit (simulate user behavior)
    sleep(1);
    
    // Verify content
    const verifyRes = http.get(`${baseUrl}/api/v1/verify/${hash}`);
    
    const verifyCheck = check(verifyRes, {
      'verification status 200': (r) => r.status === 200,
      'verification is valid': (r) => r.json('isValid') === true,
      'verification response time OK': (r) => r.timings.duration < 500,
    });
    
    if (!verifyCheck) {
      verificationErrors.add(1);
    }
  }
  
  // Random think time (1-5 seconds)
  sleep(Math.random() * 4 + 1);
}
```

**Run it**:
```bash
# Install k6
brew install k6  # macOS
# or: sudo apt install k6  # Ubuntu

# Run against production
k6 run --env API_URL=https://api.daon.network load-test-production.js

# Save results
k6 run --out json=results.json load-test-production.js
```

**What to watch**:
- API response times
- Database CPU/memory usage
- Blockchain block creation rate
- Redis hit rates
- Container resource usage
- Network bandwidth

**Success criteria**:
- ✅ 100 concurrent users: <1s response time
- ✅ 200 concurrent users: <2s response time
- ✅ Error rate: <5%
- ✅ No crashes or restarts
- ✅ Database connections stable
- ✅ Memory usage stable (no leaks)

---

### Stress Test: Find Breaking Point

**Scenario**: Keep increasing load until something breaks

```javascript
export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '2m', target: 300 },
    { duration: '2m', target: 500 },
    { duration: '2m', target: 1000 },
    { duration: '2m', target: 1500 },  // Keep pushing
    { duration: '2m', target: 2000 },  // Until it breaks
  ],
};
```

**Goal**: Find your limits
- At what point do errors start?
- What breaks first? (API? Database? Blockchain?)
- How does system degrade? (graceful or catastrophic?)
- What's your maximum sustainable load?

**Document findings**:
```
Max sustained users: XXX
Breaking point: XXX users
First bottleneck: [API/DB/Blockchain/Network]
Degradation pattern: [graceful/sudden]
Recovery time: XX minutes
```

---

### Soak Test: Long-term Stability

**Scenario**: Moderate load for 24-48 hours

```javascript
export const options = {
  vus: 50,           // 50 concurrent users
  duration: '24h',   // Run for 24 hours
};
```

**What to monitor**:
- Memory leaks (memory should stabilize, not grow)
- Database connection leaks
- File descriptor leaks
- Disk space usage
- Log file sizes

**Check every 4 hours**:
```bash
# Memory usage
ssh USER@SERVER 'docker stats --no-stream'

# Database connections
ssh USER@SERVER 'docker exec daon-postgres psql -U daon_api -c "SELECT count(*) FROM pg_stat_activity;"'

# Disk space
ssh USER@SERVER 'df -h'

# Container restarts
ssh USER@SERVER 'docker ps -a --filter "status=restarting"'
```

**Success criteria**:
- ✅ No memory growth over 24h
- ✅ No performance degradation
- ✅ No container restarts
- ✅ Stable database connections
- ✅ No error accumulation

---

### Bulk Operation Test: AO3 Migration Simulation

**Scenario**: Simulate 100 creators each uploading 50 fanfics

```javascript
export const options = {
  scenarios: {
    bulk_migration: {
      executor: 'per-vu-iterations',
      vus: 100,
      iterations: 1,  // Each VU does this once
      maxDuration: '30m',
    },
  },
};

export default function() {
  const baseUrl = __ENV.API_URL || 'https://api.daon.network';
  
  // Create 50 works
  const works = Array(50).fill().map((_, i) => ({
    content: `Fanfic ${__VU}-${i} content...`,
    metadata: {
      title: `Fanfic ${i} by User ${__VU}`,
      author: `User ${__VU}`,
      fandom: 'Test Fandom',
      originalUrl: `https://ao3.org/works/test-${__VU}-${i}`
    }
  }));
  
  // Bulk protect
  const res = http.post(`${baseUrl}/api/v1/protect/bulk`, JSON.stringify({
    works,
    license: 'liberation_v1'
  }), {
    headers: { 'Content-Type': 'application/json' },
    timeout: '60s',  // Bulk operations can take time
  });
  
  check(res, {
    'bulk protection succeeded': (r) => r.status === 200,
    'all 50 protected': (r) => r.json('protected') === 50,
  });
}
```

**Result**: 5,000 works protected simultaneously

**What to check**:
- Database write performance
- Blockchain transaction queue
- API timeout handling
- Memory spikes during bulk operations

---

## Phase 2: Security Testing (Penetration Testing)

### Basic Security Checks

**1. Rate Limiting Test**
```bash
# Try to overwhelm with rapid requests
for i in {1..1000}; do
  curl -X POST https://api.daon.network/api/v1/protect \
    -H "Content-Type: application/json" \
    -d '{"content":"spam"}' &
done

# Should see 429 Too Many Requests after threshold
```

**Expected**: Rate limit kicks in, blocks excessive requests

---

**2. Input Validation Test**
```bash
# Test SQL injection attempts
curl -X POST https://api.daon.network/api/v1/protect \
  -d '{"content":"test'; DROP TABLE content_registry;--"}'

# Test XSS attempts
curl -X POST https://api.daon.network/api/v1/protect \
  -d '{"content":"<script>alert(1)</script>"}'

# Test massive payloads
dd if=/dev/zero bs=1M count=100 | curl -X POST https://api.daon.network/api/v1/protect --data-binary @-

# Test invalid JSON
curl -X POST https://api.daon.network/api/v1/protect \
  -d 'not json at all{{{['
```

**Expected**: All rejected gracefully with proper errors

---

**3. Authentication/Authorization Test**
```bash
# Try to access admin endpoints (if any)
curl https://api.daon.network/admin
curl https://api.daon.network/metrics

# Try path traversal
curl https://api.daon.network/api/v1/../../../etc/passwd

# Try accessing internal services
curl https://api.daon.network:5432
curl https://api.daon.network:6379
curl https://api.daon.network:26657
```

**Expected**: Unauthorized/Not Found, internal services not exposed

---

**4. HTTPS/TLS Test**
```bash
# Check SSL certificate
echo | openssl s_client -connect api.daon.network:443 -servername api.daon.network 2>/dev/null | openssl x509 -noout -dates

# Check for weak ciphers
nmap --script ssl-enum-ciphers -p 443 api.daon.network

# Check HTTP → HTTPS redirect
curl -I http://api.daon.network
# Should redirect to https://
```

**Expected**: Valid cert, strong ciphers only, HTTP redirects to HTTPS

---

### Professional Penetration Testing Tools

**1. OWASP ZAP (Free)**
```bash
# Install
docker pull owasp/zap2docker-stable

# Run automated scan
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://api.daon.network

# Full scan (more thorough)
docker run -t owasp/zap2docker-stable zap-full-scan.py \
  -t https://api.daon.network
```

**2. Nikto (Web server scanner)**
```bash
nikto -h https://api.daon.network
```

**3. SQLmap (SQL injection)**
```bash
sqlmap -u "https://api.daon.network/api/v1/verify/*" \
  --level=5 --risk=3
```

**4. Nmap (Port scanning)**
```bash
nmap -sV -sC YOUR_SERVER_IP

# Check for unnecessary open ports
# Should only see: 22 (SSH), 80 (HTTP redirect), 443 (HTTPS)
# All other ports should be firewalled
```

---

### Blockchain-Specific Security Tests

**1. Double-spend attempt**
```bash
# Try to protect same content twice simultaneously
curl -X POST https://api.daon.network/api/v1/protect \
  -d '{"content":"duplicate test"}' &
curl -X POST https://api.daon.network/api/v1/protect \
  -d '{"content":"duplicate test"}' &

# Should handle gracefully (one creates, one returns existing)
```

**2. Invalid blockchain transactions**
```bash
# Try to verify non-existent hash
curl https://api.daon.network/api/v1/verify/0000000000000000000000000000000000000000000000000000000000000000

# Try malformed hash
curl https://api.daon.network/api/v1/verify/notahash
```

**3. Blockchain node attack**
```bash
# Try to connect as malicious peer (from different machine)
# Should fail if peer validation is enabled
```

---

## Phase 3: Chaos Engineering

### Test Infrastructure Resilience

**1. Kill random containers**
```bash
# Stop API container
ssh USER@SERVER 'docker stop daon-api-1'

# Does load balancer route to api-2 and api-3?
# Does api-1 restart automatically?

# Stop blockchain
ssh USER@SERVER 'docker stop daon-blockchain'

# Does API return 503 gracefully?
# Does blockchain restart?
```

**2. Fill up disk**
```bash
# Create large file to consume disk
ssh USER@SERVER 'dd if=/dev/zero of=/opt/bigfile bs=1M count=10000'

# Does system handle low disk gracefully?
# Do logs show warnings?
# Can you still deploy after cleanup?
```

**3. Exhaust database connections**
```bash
# Open 100 connections and hold them
for i in {1..100}; do
  psql -h localhost -U daon_api -d daon_production &
done

# Does API handle connection pool exhaustion?
# Do new requests queue or fail gracefully?
```

**4. Slow network simulation**
```bash
# Add latency
ssh USER@SERVER 'tc qdisc add dev eth0 root netem delay 500ms'

# Does system handle slow responses?
# Do timeouts work correctly?

# Remove latency after test
ssh USER@SERVER 'tc qdisc del dev eth0 root'
```

**5. Memory pressure**
```bash
# Start memory-hungry process
ssh USER@SERVER 'stress-ng --vm 4 --vm-bytes 75% --timeout 60s'

# Does OOM killer trigger?
# Do containers with memory limits handle it?
# Does system recover?
```

---

## Phase 4: Fix & Harden

### Based on Test Findings

**Common issues to address**:

1. **Rate limiting too low/high**
   - Adjust based on load test results
   - Different limits for different endpoints

2. **Response timeouts**
   - Increase if legitimate requests timeout
   - Add timeout handling for slow blockchain

3. **Resource limits**
   - Adjust container memory/CPU based on stress tests
   - Add autoscaling if needed

4. **Security hardening**
   - Close unnecessary ports
   - Add IP whitelisting for admin functions
   - Strengthen TLS configuration
   - Add request size limits

5. **Monitoring gaps**
   - Add alerts for metrics that showed issues
   - Add dashboards for key indicators

6. **Database optimization**
   - Add indexes for slow queries
   - Tune connection pool sizes
   - Set up read replicas if needed

7. **Backup & recovery**
   - Test blockchain backup
   - Test database backup
   - Document recovery procedures

---

## Phase 5: Wipe & Fresh Start

### Complete Data Wipe Procedure

**WHY**: Start production with:
- ✅ Clean genesis block (no test data)
- ✅ Fresh database (no test content)
- ✅ Known good state
- ✅ Proper block 0 timestamp
- ✅ Production validator keys

**When**: After all tests pass and hardening complete

### Step-by-Step Wipe Process

**1. Backup current configuration**
```bash
# SSH to server
ssh USER@SERVER

# Backup docker-compose and .env
cp /opt/daon-source/docker-compose.yml /opt/backups/
cp /opt/daon-source/.env /opt/backups/
```

**2. Stop all services**
```bash
cd /opt/daon-source
docker compose down
```

**3. Wipe blockchain data**
```bash
# Remove all blockchain data
sudo rm -rf /opt/daon-database/blockchain/*

# Verify empty
ls -la /opt/daon-database/blockchain/
# Should be empty or only have lost+found
```

**4. Wipe database**
```bash
# Drop and recreate database
docker compose up -d postgres

# Wait for postgres
sleep 5

# Drop database
docker exec daon-postgres psql -U daon_api -c "DROP DATABASE daon_production;"

# Recreate
docker exec daon-postgres psql -U daon_api -c "CREATE DATABASE daon_production;"

# Or wipe data directory
docker compose down
sudo rm -rf /opt/daon-database/postgres/*
```

**5. Clear Redis cache**
```bash
docker compose up -d redis
docker exec daon-redis redis-cli FLUSHALL
```

**6. Generate NEW validator keys**
```bash
# Remove old keys
rm -rf ~/.daon

# Blockchain will auto-initialize with NEW keys on first start
# IMPORTANT: Backup these new keys!
```

**7. Update genesis timestamp (optional)**
```bash
# Edit genesis to have current timestamp
# This makes block 0 align with launch date
```

**8. Fresh start**
```bash
cd /opt/daon-source
docker compose up -d

# Monitor initialization
docker logs -f daon-blockchain

# Should see:
# 🔧 First run detected - initializing blockchain...
# ✅ Blockchain initialized!
# 🚀 Starting blockchain...
```

**9. Verify clean state**
```bash
# Check stats (should be 0)
curl https://api.daon.network/api/v1/stats

# Should show:
# "totalProtected": 0

# Check blockchain height (should be 0 or 1)
docker exec daon-blockchain daond status | jq .SyncInfo.latest_block_height
```

**10. BACKUP production keys**
```bash
# Backup validator keys (CRITICAL!)
scp USER@SERVER:/opt/daon-database/blockchain/config/priv_validator_key.json ~/backups/prod-validator-key.json
scp USER@SERVER:/opt/daon-database/blockchain/config/node_key.json ~/backups/prod-node-key.json

# Store securely (1Password, encrypted USB, safe, etc.)
# If you lose these, you lose your validator!
```

---

## Pre-Launch Checklist

### Before Public Launch

- [ ] Performance tests completed (100+ users, <1s response)
- [ ] Stress test completed (breaking point documented)
- [ ] Soak test completed (24h+ no issues)
- [ ] Bulk operation test completed (5000+ works handled)
- [ ] Security tests completed (OWASP ZAP, Nikto, manual tests)
- [ ] Penetration test findings addressed
- [ ] Chaos tests completed (recovery verified)
- [ ] All hardening implemented
- [ ] Monitoring and alerts configured
- [ ] Backup procedures tested
- [ ] **Data wiped and fresh start completed**
- [ ] Production validator keys backed up securely
- [ ] Documentation updated
- [ ] Team trained on procedures
- [ ] Incident response plan ready

### Launch Day Verification

- [ ] All services healthy
- [ ] Blockchain at genesis (height 0-1)
- [ ] Database empty (totalProtected: 0)
- [ ] Redis empty
- [ ] Monitoring dashboards showing green
- [ ] SSL certificate valid
- [ ] DNS pointing correctly
- [ ] Load balancer working
- [ ] First test protection succeeds
- [ ] First verification succeeds
- [ ] Performance acceptable

---

## Monitoring During Testing

### Key Metrics Dashboard

**Create Grafana dashboard or monitor**:

```bash
# API Metrics
curl http://localhost:9090/metrics | grep http_

# System Metrics
ssh USER@SERVER 'docker stats --no-stream'

# Database Metrics
ssh USER@SERVER 'docker exec daon-postgres psql -U daon_api -c "
SELECT 
  count(*) as active_connections,
  max_conn,
  max_conn - count(*) as available_connections
FROM pg_stat_activity, (SELECT setting::int AS max_conn FROM pg_settings WHERE name='"'max_connections'"') max
GROUP BY max_conn;
"'

# Blockchain Metrics  
curl http://localhost:26657/status | jq '.result.sync_info'
```

**Watch for**:
- Response times trending up
- Error rates increasing
- Memory usage climbing
- Database connections maxing out
- Disk space decreasing
- Log errors accumulating

---

## Expected Timeline

```
Week 1: Testing
├─ Mon-Tue: Load/Stress/Soak tests
├─ Wed-Thu: Security/Pen tests
└─ Fri: Chaos engineering

Week 2: Hardening & Launch
├─ Mon-Wed: Fix issues, harden infrastructure
├─ Thu: Complete data wipe, fresh start
├─ Fri: Final verification, launch prep
└─ Weekend/Mon: PUBLIC LAUNCH 🚀
```

---

## Test Data vs Production Data

### Test Phase (Now)
- Fill with junk data
- Break things intentionally
- Try exploits
- Push to limits
- **Outcome**: Learn your system's capabilities and limits

### After Wipe (Launch)
- Clean genesis
- Real creator content
- Real licenses
- Real protection
- **Outcome**: Production-ready system with confidence

---

## Success Definition

**You're ready to launch when**:

1. ✅ Can handle 200+ concurrent users smoothly
2. ✅ No security vulnerabilities found (or all patched)
3. ✅ System recovers gracefully from failures
4. ✅ 24-hour soak test shows no leaks or degradation
5. ✅ All monitoring and alerts working
6. ✅ Data wiped and fresh blockchain initialized
7. ✅ Team confident in system stability

**Then**: Launch to public! 🎉

---

Want me to create the load testing scripts next?
