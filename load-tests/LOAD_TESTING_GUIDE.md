# Load Testing Guide

## Current Rate Limits

### Production (Normal Mode)
- **General API**: 100 requests per 15 minutes per IP
- **Content Protection**: 10 protections per minute per IP

### Load Test Mode
- **General API**: 10,000 requests per 15 minutes per IP
- **Content Protection**: 1,000 protections per minute per IP

## How to Run Load Tests

### Option 1: Enable Load Test Mode (Recommended for Staging)

On the server, set the environment variable:

```bash
# For temporary testing
docker stop daon-api-1 daon-api-2 daon-api-3
export LOAD_TEST_MODE=true
docker start daon-api-1 daon-api-2 daon-api-3
```

Or in docker-compose.yml:
```yaml
environment:
  LOAD_TEST_MODE: "true"
```

Then run your tests:
```bash
k6 run --env API_URL=https://api.daon.network load-test.js
```

**Important:** Turn off load test mode after testing:
```bash
docker stop daon-api-1 daon-api-2 daon-api-3
unset LOAD_TEST_MODE
docker start daon-api-1 daon-api-2 daon-api-3
```

### Option 2: Light Testing (Stays Within Limits)

Run tests that respect production rate limits:

```bash
# Light load - 5 users, verify endpoint only
k6 run --duration 2m --vus 5 \
  --env API_URL=https://api.daon.network \
  load-test-light.js

# Stats endpoint only (no rate limiting)
k6 run --duration 5m --vus 20 \
  --env API_URL=https://api.daon.network \
  stats-test.js
```

### Option 3: Use Multiple IPs

Distribute load across multiple machines/IPs:

```bash
# From machine 1
k6 run --vus 5 load-test.js

# From machine 2  
k6 run --vus 5 load-test.js

# From machine 3
k6 run --vus 5 load-test.js
```

## Best Practices

### 1. Never Run Full Load Tests in Production

- **DO**: Test in staging environment
- **DO**: Use load test mode flag
- **DON'T**: Disable rate limiting completely
- **DON'T**: Run stress tests during peak hours

### 2. Proper Load Test Workflow

```bash
# 1. Enable load test mode on staging
ssh deploy-bot@staging-server
cd /opt/daon
docker compose down
export LOAD_TEST_MODE=true
docker compose up -d

# 2. Run tests from local machine
k6 run --env API_URL=https://staging.api.daon.network load-test.js

# 3. Disable load test mode after testing
unset LOAD_TEST_MODE
docker compose restart
```

### 3. Monitoring During Tests

Always monitor these metrics:

```bash
# Watch container resources
watch docker stats

# Watch API logs
docker logs -f daon-api-1

# Watch Caddy logs
sudo journalctl -u caddy -f

# Check health
watch -n 1 'curl -s https://api.daon.network/health | jq'
```

### 4. Interpreting Results

**Good indicators:**
- ✅ Error rate < 5%
- ✅ p95 response time < 1s
- ✅ All instances receiving traffic
- ✅ No container restarts
- ✅ Memory stable

**Warning signs:**
- ⚠️ Error rate 5-10%
- ⚠️ Response times trending up
- ⚠️ Memory growing
- ⚠️ One instance getting all traffic

**Critical issues:**
- ❌ Error rate > 50%
- ❌ Container crashes
- ❌ Database connection errors
- ❌ Out of memory

## Production Rate Limit Recommendations

Based on expected usage:

### For Launch (Conservative)
```javascript
// General API
windowMs: 15 * 60 * 1000,  // 15 minutes
max: 100,                   // ~400 req/hour per user

// Content Protection  
windowMs: 60 * 1000,        // 1 minute
max: 10,                    // 10 works/minute per user
```

### For Growth Phase (Moderate)
```javascript
// General API
windowMs: 15 * 60 * 1000,  // 15 minutes
max: 500,                   // ~2000 req/hour per user

// Content Protection
windowMs: 60 * 1000,        // 1 minute
max: 50,                    // 50 works/minute per user
```

### For High Traffic (Relaxed)
```javascript
// General API
windowMs: 15 * 60 * 1000,  // 15 minutes  
max: 2000,                  // ~8000 req/hour per user

// Content Protection
windowMs: 60 * 1000,        // 1 minute
max: 200,                   // 200 works/minute per user
```

## API Key Based Rate Limiting (Future)

For authenticated users, consider implementing API key-based limits:

```javascript
// Premium users
max: 10000,

// Free users  
max: 100,

// Anonymous
max: 10,
```

## Emergency: Disable Rate Limiting

**Only in extreme emergencies:**

```bash
# Set NODE_ENV to test (disables ALL rate limiting)
# DO NOT DO THIS IN PRODUCTION!
export NODE_ENV=test
docker compose restart
```

## Sample Light Load Test

Create `load-tests/load-test-light.js`:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 5 },   // 5 users
    { duration: '2m', target: 5 },   // Hold 5 users
    { duration: '1m', target: 0 },   // Ramp down
  ],
};

export default function() {
  const baseUrl = __ENV.API_URL || 'http://localhost:3000';
  
  // Only verify and stats (no protection = no rate limit hit)
  const statsRes = http.get(`${baseUrl}/api/v1/stats`);
  check(statsRes, {
    'stats status 200': (r) => r.status === 200,
  });
  
  sleep(5); // Wait 5 seconds between requests
}
```

Run with:
```bash
k6 run --env API_URL=https://api.daon.network load-test-light.js
```

This stays well under rate limits:
- 5 users × 12 requests/minute = 60 requests/minute (under 100/15min limit)

## Troubleshooting

### "Too many requests" errors

**Cause**: Hit rate limit  
**Solution**: 
1. Enable LOAD_TEST_MODE for testing
2. Reduce VUs or increase sleep time
3. Use multiple IPs

### All requests to one instance

**Cause**: Other instances unhealthy  
**Solution**: Check `docker ps` and health endpoints

### High error rate but no rate limit messages

**Cause**: Database, blockchain, or other service issues  
**Solution**: Check logs: `docker logs daon-api-1`

## Summary

- ✅ Keep rate limits enabled in production
- ✅ Use LOAD_TEST_MODE flag for proper load testing
- ✅ Monitor metrics during tests
- ✅ Test in staging, not production
- ✅ Turn off load test mode after testing
- ❌ Never disable rate limits completely in production
