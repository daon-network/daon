/**
 * Add webhook scope to test broker API key
 */

import { DatabaseClient } from '../src/database/client.js';

async function addWebhookScope() {
  const db = new DatabaseClient();
  
  try {
    // Update existing API key to include webhook scopes
    const result = await db.query(`
      UPDATE broker_api_keys
      SET scopes = ARRAY['broker:register', 'broker:verify', 'broker:transfer', 'broker:webhooks']
      WHERE broker_id = 2
        AND key_prefix = 'DAON_BR_test_792'
      RETURNING id, scopes
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ API key updated with webhook scope');
      console.log('   Scopes:', result.rows[0].scopes);
    } else {
      console.log('❌ API key not found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.disconnect();
  }
}

addWebhookScope();
