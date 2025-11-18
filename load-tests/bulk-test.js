// k6 Bulk Operation Test for DAON API
// Simulates AO3 migration - 100 users each uploading 50 works
//
// Usage:
//   k6 run --env API_URL=https://api.daon.network bulk-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const bulkProtectionTime = new Trend('bulk_protection_time_ms');
const bulkProtectionErrors = new Counter('bulk_protection_errors');
const totalWorksProtected = new Counter('total_works_protected');

export const options = {
  scenarios: {
    bulk_migration: {
      executor: 'per-vu-iterations',
      vus: 100,           // 100 concurrent users
      iterations: 1,      // Each user does this once
      maxDuration: '30m', // Max 30 minutes
    },
  },
  
  thresholds: {
    // Bulk operations can take longer
    bulk_protection_time_ms: ['p(95)<60000'], // 95% under 60 seconds
    http_req_failed: ['rate<0.1'],            // Less than 10% errors
  },
};

export default function() {
  const baseUrl = __ENV.API_URL || 'http://localhost:3000';
  const worksPerUser = 50;
  
  console.log(`[VU ${__VU}] Starting bulk protection of ${worksPerUser} works...`);
  
  // Generate 50 works
  const works = [];
  for (let i = 0; i < worksPerUser; i++) {
    works.push({
      content: `Fanfiction work ${i + 1} by user ${__VU}. This is a test work for bulk protection during load testing. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Chapter 1...`,
      metadata: {
        title: `Test Fanfic ${i + 1} by User ${__VU}`,
        author: `Test User ${__VU}`,
        fandom: 'Test Fandom',
        rating: 'General',
        tags: ['test', 'load-test', 'bulk-migration'],
        wordCount: Math.floor(Math.random() * 5000) + 1000,
        chapters: Math.floor(Math.random() * 10) + 1,
        originalUrl: `https://ao3.org/works/test-${__VU}-${i}`
      }
    });
  }
  
  const payload = JSON.stringify({
    works: works,
    license: 'liberation_v1'
  });
  
  // Perform bulk protection
  const start = new Date().getTime();
  const res = http.post(`${baseUrl}/api/v1/protect/bulk`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '120s', // 2 minute timeout for bulk operations
  });
  const duration = new Date().getTime() - start;
  
  bulkProtectionTime.add(duration);
  
  const success = check(res, {
    'bulk protection status 200': (r) => r.status === 200,
    'bulk protection completed': (r) => r.json('success') === true,
    'all works protected': (r) => r.json('protected') === worksPerUser,
    'has results array': (r) => Array.isArray(r.json('results')),
    'results count matches': (r) => r.json('results')?.length === worksPerUser,
  });
  
  if (success) {
    totalWorksProtected.add(worksPerUser);
    const protected = res.json('protected');
    const existing = res.json('results')?.filter(r => r.existing).length || 0;
    console.log(`[VU ${__VU}] ✅ Protected ${protected} works (${existing} existing) in ${duration}ms`);
  } else {
    bulkProtectionErrors.add(1);
    console.error(`[VU ${__VU}] ❌ Bulk protection failed: ${res.status} - ${res.body}`);
  }
  
  // Small delay between users
  sleep(Math.random() * 2 + 1);
}

export function handleSummary(data) {
  const totalVUs = 100;
  const worksPerVU = 50;
  const expectedTotal = totalVUs * worksPerVU;
  const actualTotal = data.metrics.total_works_protected?.values.count || 0;
  const errors = data.metrics.bulk_protection_errors?.values.count || 0;
  
  console.log('\n================== BULK TEST RESULTS ==================');
  console.log(`Expected Works: ${expectedTotal}`);
  console.log(`Protected Works: ${actualTotal}`);
  console.log(`Success Rate: ${(actualTotal / expectedTotal * 100).toFixed(2)}%`);
  console.log(`Failed Bulk Operations: ${errors}`);
  console.log('');
  console.log(`Avg Bulk Time: ${data.metrics.bulk_protection_time_ms?.values.avg.toFixed(2)}ms`);
  console.log(`p95 Bulk Time: ${data.metrics.bulk_protection_time_ms?.values['p(95)'].toFixed(2)}ms`);
  console.log(`Max Bulk Time: ${data.metrics.bulk_protection_time_ms?.values.max.toFixed(2)}ms`);
  console.log('========================================================\n');
  
  if (actualTotal === expectedTotal) {
    console.log('✅ ALL WORKS PROTECTED SUCCESSFULLY!');
  } else {
    console.log(`⚠️  Some works failed to protect: ${expectedTotal - actualTotal} missing`);
  }
  
  return {
    'bulk-test-results.json': JSON.stringify(data),
  };
}
