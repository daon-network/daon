# Load Testing Scripts for DAON

Performance and stress testing scripts for pre-launch infrastructure testing.

## Prerequisites

### Install k6

**macOS**:
```bash
brew install k6
```

**Ubuntu/Debian**:
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Other**: https://k6.io/docs/get-started/installation/

## Test Scripts

### 1. Load Test (`load-test.js`)

**Purpose**: Simulate normal production traffic

**Scenario**:
- 100 concurrent users for 10 minutes
- Spike to 200 users for 5 minutes
- Tests protect, verify, and stats endpoints

**Run**:
```bash
# Against production
k6 run --env API_URL=https://api.daon.network load-test.js

# Against local
k6 run load-test.js

# Save results
k6 run --out json=load-results.json load-test.js
```

**Success Criteria**:
- ✅ 95% of requests < 1s
- ✅ Error rate < 5%
- ✅ Protection operations < 2s (p95)
- ✅ Verification operations < 500ms (p95)

---

### 2. Stress Test (`stress-test.js`)

**Purpose**: Find the breaking point

**Scenario**:
- Gradually increase from 100 → 1500 users
- No strict thresholds (expect failures)
- Find where system breaks

**Run**:
```bash
k6 run --env API_URL=https://api.daon.network stress-test.js
```

**Monitor**:
- At what load do errors start?
- What breaks first? (API, DB, Blockchain)
- How does it degrade? (graceful or crash)

---

### 3. Bulk Test (`bulk-test.js`)

**Purpose**: Test AO3 migration scenario

**Scenario**:
- 100 users each upload 50 works
- 5,000 total works protected
- Tests bulk endpoint under load

**Run**:
```bash
k6 run --env API_URL=https://api.daon.network bulk-test.js
```

**Success Criteria**:
- ✅ All 5,000 works protected
- ✅ 95% of bulk operations < 60s
- ✅ Error rate < 10%

---

## Monitoring During Tests

### Server-side Monitoring

**Watch docker stats**:
```bash
ssh USER@SERVER 'watch -n 1 docker stats'
```

**Watch logs**:
```bash
ssh USER@SERVER 'docker logs -f daon-api-1'
ssh USER@SERVER 'docker logs -f daon-blockchain'
```

**Database connections**:
```bash
ssh USER@SERVER 'watch -n 5 "docker exec daon-postgres psql -U daon_api -c \"SELECT count(*) FROM pg_stat_activity;\""'
```

**Blockchain status**:
```bash
ssh USER@SERVER 'watch -n 5 "docker exec daon-blockchain daond status | jq .SyncInfo"'
```

### Metrics to Track

1. **Response Times**
   - Average, p95, p99, max
   - Should stay consistent under load

2. **Error Rates**
   - Should be < 5% for normal load
   - Note when errors start (breaking point)

3. **Throughput**
   - Requests per second
   - Should scale linearly up to a point

4. **Resource Usage**
   - CPU, Memory, Disk I/O
   - Identify bottlenecks

5. **Database**
   - Connection count
   - Query performance
   - Write throughput

6. **Blockchain**
   - Block creation rate
   - Transaction queue size
   - Sync status

---

## Interpreting Results

### Good Results

```
✅ 95% of requests < 1s
✅ Error rate < 5%
✅ Memory stable (no growth over time)
✅ No container restarts
✅ Database connections stable
✅ All thresholds passing
```

### Warning Signs

```
⚠️  Response times trending up
⚠️  Error rate 5-10%
⚠️  Memory slowly growing
⚠️  Database connections near max
⚠️  Some thresholds failing
```

### System Breakdown

```
❌ Response times > 5s
❌ Error rate > 50%
❌ Container restarts
❌ Database connection exhausted
❌ Out of memory errors
```

---

## Example Test Session

### Pre-test Checklist

```bash
# 1. Verify system is healthy
curl https://api.daon.network/health

# 2. Check baseline metrics
ssh USER@SERVER 'docker stats --no-stream'

# 3. Clear old test data (optional)
ssh USER@SERVER 'docker exec daon-redis redis-cli FLUSHDB'

# 4. Start monitoring
ssh USER@SERVER 'docker stats'  # In separate terminal
```

### Run Tests

```bash
# 1. Load test (25 minutes)
k6 run --env API_URL=https://api.daon.network load-test.js

# Wait 10 minutes for system to stabilize

# 2. Bulk test (30 minutes)
k6 run --env API_URL=https://api.daon.network bulk-test.js

# Wait 10 minutes for system to stabilize

# 3. Stress test (25 minutes)
k6 run --env API_URL=https://api.daon.network stress-test.js
```

### Post-test Analysis

```bash
# Check for errors in logs
ssh USER@SERVER 'docker logs daon-api-1 --since 1h | grep -i error'

# Verify services still healthy
curl https://api.daon.network/health

# Check database health
ssh USER@SERVER 'docker exec daon-postgres psql -U daon_api -c "SELECT count(*) FROM pg_stat_activity;"'

# Review results
cat load-results.json | jq '.metrics.http_req_duration'
```

---

## Advanced: Custom Test Scenarios

### Sustained Load (Soak Test)

```javascript
export const options = {
  vus: 50,
  duration: '24h',
};
```

### Spike Test

```javascript
export const options = {
  stages: [
    { duration: '10s', target: 100 },   // Quick ramp
    { duration: '1m', target: 1000 },   // Sudden spike
    { duration: '3m', target: 1000 },   // Hold spike
    { duration: '10s', target: 100 },   // Quick recovery
    { duration: '5m', target: 100 },    // Normal load
  ],
};
```

---

## Troubleshooting

### Test hangs or times out

**Cause**: Server overwhelmed  
**Solution**: Reduce VUs or increase ramp time

### High error rates immediately

**Cause**: Server not ready or misconfigured  
**Solution**: Check health endpoint, verify URL

### k6 process crashes

**Cause**: Too many VUs for client machine  
**Solution**: Reduce VUs or run from more powerful machine

### Inconsistent results

**Cause**: Network jitter, server load variation  
**Solution**: Run multiple times, average results

---

## Results Documentation Template

```markdown
## Load Test Results - [DATE]

**Environment**: Production
**API URL**: https://api.daon.network
**Duration**: 25 minutes

### Metrics

| Metric | Result | Threshold | Status |
|--------|--------|-----------|--------|
| Avg Response Time | XXXms | <500ms | ✅/❌ |
| p95 Response Time | XXXms | <1000ms | ✅/❌ |
| Error Rate | X.XX% | <5% | ✅/❌ |
| Throughput | XXX req/s | - | - |

### Resource Usage

- CPU: Peak XX%
- Memory: Peak XXX MB
- Database Connections: Peak XX/100
- Blockchain Height: Started at XXX, ended at XXX

### Issues Found

1. [Description of any issues]
2. [Bottlenecks identified]

### Recommendations

1. [Performance improvements needed]
2. [Scaling considerations]
```

---

## Safety Notes

1. **Never run stress tests against production during launch period**
2. **Always have monitoring in place before testing**
3. **Be ready to kill tests if system becomes unstable**
4. **Have rollback plan if tests cause issues**
5. **Test during low-traffic periods when possible**

---

## Next Steps After Testing

1. Document findings in `TESTING_RESULTS.md`
2. Identify bottlenecks
3. Implement optimizations
4. Re-test to verify improvements
5. Set up alerts based on thresholds
6. **Wipe test data before launch** (see `PRE_LAUNCH_TESTING.md`)

---

For complete pre-launch testing strategy, see `PRE_LAUNCH_TESTING.md`
