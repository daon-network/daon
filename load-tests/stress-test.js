// k6 Stress Test for DAON API
// Pushes the system to find breaking point
//
// Usage:
//   k6 run --env API_URL=https://api.daon.network stress-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const errors = new Counter('errors');

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Baseline
    { duration: '2m', target: 300 },   // Push to 300
    { duration: '3m', target: 300 },   // Hold at 300
    { duration: '2m', target: 500 },   // Push to 500
    { duration: '3m', target: 500 },   // Hold at 500
    { duration: '2m', target: 1000 },  // Push to 1000
    { duration: '3m', target: 1000 },  // Hold at 1000
    { duration: '2m', target: 1500 },  // Push to 1500 (likely to break)
    { duration: '3m', target: 1500 },  // Try to hold
    { duration: '2m', target: 0 },     // Ramp down
  ],
  
  // No strict thresholds - we expect it to fail at some point
  thresholds: {
    http_req_duration: ['p(50)<5000'], // Relaxed threshold
  },
};

export default function() {
  const baseUrl = __ENV.API_URL || 'http://localhost:3000';
  
  const content = `Stress test ${__VU}-${__ITER}-${Date.now()}`;
  
  const res = http.post(`${baseUrl}/api/v1/protect`, JSON.stringify({
    content: content,
    metadata: { title: `Stress ${__VU}-${__ITER}` }
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  const success = check(res, {
    'status 2xx': (r) => r.status >= 200 && r.status < 300,
  });
  
  if (!success) {
    errors.add(1);
    console.log(`[${__VU}] Error at ${__ITER}: ${res.status} - VUs: ${__VU}`);
  }
  
  sleep(1);
}

export function handleSummary(data) {
  const errorCount = data.metrics.errors?.values.count || 0;
  const totalReqs = data.metrics.http_reqs?.values.count || 0;
  const errorRate = totalReqs > 0 ? (errorCount / totalReqs * 100).toFixed(2) : 0;
  
  console.log('\n================== STRESS TEST RESULTS ==================');
  console.log(`Total Requests: ${totalReqs}`);
  console.log(`Total Errors: ${errorCount}`);
  console.log(`Error Rate: ${errorRate}%`);
  console.log(`Avg Response Time: ${data.metrics.http_req_duration?.values.avg.toFixed(2)}ms`);
  console.log(`p95 Response Time: ${data.metrics.http_req_duration?.values['p(95)'].toFixed(2)}ms`);
  console.log(`Max Response Time: ${data.metrics.http_req_duration?.values.max.toFixed(2)}ms`);
  console.log('========================================================\n');
  
  return {
    'stress-test-results.json': JSON.stringify(data),
  };
}
