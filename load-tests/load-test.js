// k6 Load Test for DAON API
// Tests normal traffic patterns with 100-200 concurrent users
//
// Usage:
//   k6 run --env API_URL=https://api.daon.network load-test.js
//   k6 run --out json=results.json load-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// Custom metrics
const protectionErrors = new Counter('protection_errors');
const verificationErrors = new Counter('verification_errors');
const protectionDuration = new Trend('protection_duration_ms');
const verificationDuration = new Trend('verification_duration_ms');
const successRate = new Rate('success_rate');

export const options = {
  stages: [
    { duration: '2m', target: 20 },   // Warm up to 20 users
    { duration: '3m', target: 100 },  // Ramp up to 100 users
    { duration: '10m', target: 100 }, // Stay at 100 users for 10 minutes
    { duration: '3m', target: 200 },  // Spike to 200 users
    { duration: '5m', target: 200 },  // Stay at 200 for 5 minutes
    { duration: '2m', target: 0 },    // Ramp down
  ],
  
  thresholds: {
    // 95% of requests should complete within 1s
    http_req_duration: ['p(95)<1000'],
    
    // Less than 5% of requests should fail
    http_req_failed: ['rate<0.05'],
    
    // Protection should complete within 2s for 95% of requests
    protection_duration_ms: ['p(95)<2000'],
    
    // Verification should be fast (under 500ms for 95%)
    verification_duration_ms: ['p(95)<500'],
    
    // At least 95% success rate
    success_rate: ['rate>0.95'],
  },
};

export default function() {
  const baseUrl = __ENV.API_URL || 'http://localhost:3000';
  
  // Simulate realistic content
  const contentTypes = ['fanfiction', 'artwork', 'music', 'video', 'writing'];
  const fandoms = ['Test Fandom A', 'Test Fandom B', 'Test Fandom C'];
  const licenses = ['liberation_v1', 'cc0', 'cc-by', 'cc-by-sa'];
  
  const contentType = contentTypes[Math.floor(Math.random() * contentTypes.length)];
  const fandom = fandoms[Math.floor(Math.random() * fandoms.length)];
  const license = licenses[Math.floor(Math.random() * licenses.length)];
  
  // Generate unique content
  const content = `Load test ${contentType} by user ${__VU}, iteration ${__ITER}, time ${Date.now()}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`;
  
  const protectPayload = JSON.stringify({
    content: content,
    metadata: {
      title: `Test ${contentType} ${__VU}-${__ITER}`,
      author: `Test User ${__VU}`,
      type: contentType,
      fandom: fandom,
      tags: ['load-test', contentType, fandom],
      description: 'Generated for load testing purposes'
    },
    license: license
  });
  
  // 1. Protect content
  const protectStart = new Date().getTime();
  const protectRes = http.post(`${baseUrl}/api/v1/protect`, protectPayload, {
    headers: { 
      'Content-Type': 'application/json',
    },
    tags: { name: 'ProtectContent' },
  });
  const protectEnd = new Date().getTime();
  protectionDuration.add(protectEnd - protectStart);
  
  const protectSuccess = check(protectRes, {
    'protection status 201 or 200': (r) => r.status === 201 || r.status === 200,
    'protection has contentHash': (r) => r.json('contentHash') !== undefined && r.json('contentHash') !== null,
    'protection has verificationUrl': (r) => r.json('verificationUrl') !== undefined,
    'protection response time OK': (r) => r.timings.duration < 3000,
  });
  
  if (!protectSuccess) {
    protectionErrors.add(1);
    successRate.add(0);
    console.error(`Protection failed for VU ${__VU} iteration ${__ITER}: ${protectRes.status}`);
    return; // Don't try to verify if protection failed
  }
  
  const hash = protectRes.json('contentHash');
  
  // Simulate user waiting/reading (1-3 seconds)
  sleep(Math.random() * 2 + 1);
  
  // 2. Verify content
  const verifyStart = new Date().getTime();
  const verifyRes = http.get(`${baseUrl}/api/v1/verify/${hash}`, {
    tags: { name: 'VerifyContent' },
  });
  const verifyEnd = new Date().getTime();
  verificationDuration.add(verifyEnd - verifyStart);
  
  const verifySuccess = check(verifyRes, {
    'verification status 200': (r) => r.status === 200,
    'verification is valid': (r) => r.json('isValid') === true,
    'verification has correct hash': (r) => r.json('contentHash') === hash,
    'verification response time OK': (r) => r.timings.duration < 1000,
  });
  
  if (!verifySuccess) {
    verificationErrors.add(1);
    successRate.add(0);
    console.error(`Verification failed for hash ${hash}: ${verifyRes.status}`);
  } else {
    successRate.add(1);
  }
  
  // 3. Occasionally check stats (10% of users)
  if (Math.random() < 0.1) {
    const statsRes = http.get(`${baseUrl}/api/v1/stats`, {
      tags: { name: 'GetStats' },
    });
    
    check(statsRes, {
      'stats status 200': (r) => r.status === 200,
      'stats has totalProtected': (r) => r.json('stats.totalProtected') !== undefined,
    });
  }
  
  // Simulate realistic user behavior (random wait 2-6 seconds)
  sleep(Math.random() * 4 + 2);
}

export function handleSummary(data) {
  return {
    'summary.json': JSON.stringify(data),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const summary = [
    '================== LOAD TEST SUMMARY ==================',
    `Test Duration: ${data.state.testRunDurationMs / 1000}s`,
    '',
    '--- HTTP Requests ---',
    `Total Requests: ${data.metrics.http_reqs.values.count}`,
    `Request Rate: ${data.metrics.http_reqs.values.rate.toFixed(2)} req/s`,
    `Failed Requests: ${data.metrics.http_req_failed.values.rate.toFixed(2)}%`,
    '',
    '--- Response Times ---',
    `Avg Response Time: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms`,
    `p95 Response Time: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`,
    `p99 Response Time: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms`,
    `Max Response Time: ${data.metrics.http_req_duration.values.max.toFixed(2)}ms`,
    '',
    '--- Protection Operations ---',
    `Avg Protection Time: ${data.metrics.protection_duration_ms.values.avg.toFixed(2)}ms`,
    `p95 Protection Time: ${data.metrics.protection_duration_ms.values['p(95)'].toFixed(2)}ms`,
    `Protection Errors: ${data.metrics.protection_errors.values.count}`,
    '',
    '--- Verification Operations ---',
    `Avg Verification Time: ${data.metrics.verification_duration_ms.values.avg.toFixed(2)}ms`,
    `p95 Verification Time: ${data.metrics.verification_duration_ms.values['p(95)'].toFixed(2)}ms`,
    `Verification Errors: ${data.metrics.verification_errors.values.count}`,
    '',
    '--- Overall Success ---',
    `Success Rate: ${(data.metrics.success_rate.values.rate * 100).toFixed(2)}%`,
    '',
    '--- Thresholds ---',
  ];
  
  // Add threshold results
  Object.entries(data.thresholds).forEach(([name, threshold]) => {
    const status = threshold.ok ? '✅ PASS' : '❌ FAIL';
    summary.push(`${status}: ${name}`);
  });
  
  summary.push('=====================================================');
  
  return summary.join('\n');
}
