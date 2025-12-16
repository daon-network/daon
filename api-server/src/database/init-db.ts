/**
 * Database Initialization Script
 * 
 * Run this to set up the database schema from schema.sql
 */

import { DatabaseClient } from './client.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDatabase() {
  console.log('🔧 Initializing DAON database...\n');
  
  const db = new DatabaseClient();
  
  try {
    // Test connection
    console.log('1. Testing database connection...');
    const result = await db.query('SELECT NOW()');
    console.log('   ✅ Connected to database');
    console.log(`   📅 Server time: ${result.rows[0].now}\n`);
    
    // Read schema file
    console.log('2. Reading schema file...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    console.log(`   ✅ Loaded schema (${schema.length} bytes)\n`);
    
    // Execute schema
    console.log('3. Creating tables...');
    await db.query(schema);
    console.log('   ✅ Schema executed successfully\n');
    
    // Verify tables
    console.log('4. Verifying tables...');
    const tables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('   ✅ Created tables:');
    tables.rows.forEach(row => {
      console.log(`      - ${row.table_name}`);
    });
    console.log('');
    
    // Test encryption key
    console.log('5. Checking configuration...');
    if (!process.env.TOTP_ENCRYPTION_KEY) {
      console.log('   ⚠️  WARNING: TOTP_ENCRYPTION_KEY not set');
      console.log('   Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    } else if (process.env.TOTP_ENCRYPTION_KEY.length !== 64) {
      console.log('   ⚠️  WARNING: TOTP_ENCRYPTION_KEY must be 64 hex characters');
    } else {
      console.log('   ✅ TOTP_ENCRYPTION_KEY configured');
    }
    
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-change-in-production') {
      console.log('   ⚠️  WARNING: JWT_SECRET not set or using default');
    } else if (process.env.JWT_SECRET.length < 32) {
      console.log('   ⚠️  WARNING: JWT_SECRET should be at least 32 characters');
    } else {
      console.log('   ✅ JWT_SECRET configured');
    }
    
    console.log('\n✅ Database initialization complete!\n');
    console.log('Next steps:');
    console.log('  1. Configure SMTP settings in .env for magic links');
    console.log('  2. Generate encryption key if not already set');
    console.log('  3. Start the server: npm run dev\n');
    
  } catch (error: any) {
    console.error('\n❌ Database initialization failed:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Tip: Make sure PostgreSQL is running');
      console.error('   Start with: brew services start postgresql');
      console.error('   Or: sudo systemctl start postgresql');
    } else if (error.message.includes('database') && error.message.includes('does not exist')) {
      console.error('\n💡 Tip: Create the database first');
      console.error('   Run: createdb daon_api');
    } else if (error.message.includes('password authentication failed')) {
      console.error('\n💡 Tip: Check DATABASE_URL in .env');
      console.error('   Format: postgresql://user:password@localhost:5432/daon_api');
    }
    
    process.exit(1);
  } finally {
    await db.disconnect();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initDatabase().catch(console.error);
}

export default initDatabase;
