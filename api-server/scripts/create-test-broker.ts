/**
 * Create a test broker for development/testing
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { DatabaseClient } from '../src/database/client.js';

async function createTestBroker() {
  const db = new DatabaseClient();
  
  try {
    // Generate a test API key
    const testKey = `DAON_BR_test_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = await bcrypt.hash(testKey, 12);
    const keyPrefix = testKey.substring(0, 16);
    
    console.log('Creating test broker...');
    
    // Insert broker
    const brokerResult = await db.query(`
      INSERT INTO brokers (
        domain, name, api_key_hash, contact_email,
        certification_tier, certification_status,
        rate_limit_per_hour, rate_limit_per_day,
        require_signature, enabled, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING id, domain, name, certification_tier
    `, [
      'test-broker.local',
      'Test Broker Platform',
      keyHash,
      'test@test-broker.local',
      'standard',
      'active',
      1000,
      10000,
      false,
      true
    ]);
    
    const broker = brokerResult.rows[0];
    console.log('✅ Broker created:', broker);
    
    // Insert API key into broker_api_keys table for our new system
    const keyResult = await db.query(`
      INSERT INTO broker_api_keys (
        broker_id, key_hash, key_prefix, key_name, scopes, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id
    `, [
      broker.id,
      keyHash,
      keyPrefix,
      'Test API Key',
      ['broker:register', 'broker:verify', 'broker:transfer']
    ]);
    
    console.log('✅ API key created in broker_api_keys table');
    console.log('\n🔑 TEST API KEY (save this):\n');
    console.log(testKey);
    console.log('\n📋 Test with:');
    console.log(`curl -X GET http://localhost:3000/api/v1/broker/verify \\`);
    console.log(`  -H "Authorization: Bearer ${testKey}"`);
    console.log('');
    
    await db.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await db.end();
    process.exit(1);
  }
}

createTestBroker();
