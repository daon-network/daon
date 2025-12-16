import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection pool
let pool: pg.Pool | null = null;

/**
 * Initialize database connection pool
 */
export async function initDatabase(): Promise<pg.Pool> {
  if (pool) {
    return pool;
  }

  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Test connection
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }

  return pool;
}

/**
 * Run database schema initialization
 */
export async function initSchema(): Promise<void> {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  try {
    await pool.query(schemaSql);
    console.log('✅ Database schema initialized');
  } catch (error) {
    console.error('❌ Schema initialization failed:', error);
    throw error;
  }
}

/**
 * Get database pool (must call initDatabase first)
 */
export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return pool;
}

/**
 * Close database connections
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✅ Database connections closed');
  }
}

// Database query helpers
export const db = {
  /**
   * Query with parameterized values
   */
  async query<T = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
    const pool = getPool();
    return pool.query<T>(text, params);
  },

  /**
   * Get a client from the pool for transactions
   */
  async getClient(): Promise<pg.PoolClient> {
    const pool = getPool();
    return pool.connect();
  },

  /**
   * Execute a transaction
   */
  async transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // User operations
  users: {
    async create(data: {
      email?: string;
      discord_id?: string;
      google_id?: string;
      username?: string;
      blockchain_address?: string;
    }) {
      const result = await db.query(
        `INSERT INTO users (email, discord_id, google_id, username, blockchain_address, created_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         RETURNING *`,
        [data.email, data.discord_id, data.google_id, data.username, data.blockchain_address]
      );
      return result.rows[0];
    },

    async findByEmail(email: string) {
      const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      return result.rows[0];
    },

    async findByDiscordId(discordId: string) {
      const result = await db.query('SELECT * FROM users WHERE discord_id = $1', [discordId]);
      return result.rows[0];
    },

    async findByGoogleId(googleId: string) {
      const result = await db.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
      return result.rows[0];
    },

    async findById(id: number) {
      const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
      return result.rows[0];
    },

    async updateLastLogin(userId: number) {
      await db.query(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [userId]
      );
    },

    async verifyEmail(userId: number) {
      await db.query(
        'UPDATE users SET email_verified = TRUE WHERE id = $1',
        [userId]
      );
    },
  },

  // Magic link operations
  magicLinks: {
    async create(email: string, token: string, expiresAt: Date, userId?: number) {
      const result = await db.query(
        `INSERT INTO magic_links (email, token, expires_at, user_id, created_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING *`,
        [email, token, expiresAt, userId || null]
      );
      return result.rows[0];
    },

    async findByToken(token: string) {
      const result = await db.query(
        `SELECT * FROM magic_links WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP AND used_at IS NULL`,
        [token]
      );
      return result.rows[0];
    },

    async markUsed(token: string) {
      await db.query(
        'UPDATE magic_links SET used_at = CURRENT_TIMESTAMP WHERE token = $1',
        [token]
      );
    },
  },

  // Content operations
  content: {
    async create(data: {
      user_id: number;
      content_hash: string;
      normalized_hash?: string;
      perceptual_hash?: string;
      previous_version?: string;
      title?: string;
      description?: string;
      content_type?: string;
      license?: string;
      blockchain_tx?: string;
      blockchain_height?: number;
      verification_url?: string;
    }) {
      const result = await db.query(
        `INSERT INTO protected_content 
         (user_id, content_hash, normalized_hash, perceptual_hash, previous_version, 
          title, description, content_type, license, blockchain_tx, blockchain_height, 
          verification_url, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          data.user_id,
          data.content_hash,
          data.normalized_hash,
          data.perceptual_hash,
          data.previous_version,
          data.title,
          data.description,
          data.content_type,
          data.license || 'liberation_v1',
          data.blockchain_tx,
          data.blockchain_height,
          data.verification_url,
        ]
      );
      return result.rows[0];
    },

    async findByHash(contentHash: string) {
      const result = await db.query(
        'SELECT * FROM protected_content WHERE content_hash = $1',
        [contentHash]
      );
      return result.rows[0];
    },

    async findByNormalizedHash(normalizedHash: string) {
      const result = await db.query(
        'SELECT * FROM protected_content WHERE normalized_hash = $1',
        [normalizedHash]
      );
      return result.rows[0];
    },

    async findByPerceptualHash(perceptualHash: string) {
      const result = await db.query(
        'SELECT * FROM protected_content WHERE perceptual_hash = $1',
        [perceptualHash]
      );
      return result.rows[0];
    },

    async findByUserId(userId: number, limit = 100, offset = 0) {
      const result = await db.query(
        `SELECT * FROM protected_content 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
      return result.rows;
    },

    async getVersionHistory(contentHash: string) {
      const result = await db.query(
        `WITH RECURSIVE version_chain AS (
          -- Base case: start with the given content hash
          SELECT *, 1 as depth
          FROM protected_content
          WHERE content_hash = $1
          
          UNION ALL
          
          -- Recursive case: find previous versions
          SELECT pc.*, vc.depth + 1
          FROM protected_content pc
          INNER JOIN version_chain vc ON pc.content_hash = vc.previous_version
          WHERE vc.depth < 100
        )
        SELECT * FROM version_chain ORDER BY depth`,
        [contentHash]
      );
      return result.rows;
    },
  },

  // Duplicate detection operations
  duplicates: {
    async logDetection(data: {
      content_hash: string;
      normalized_hash?: string;
      perceptual_hash?: string;
      detection_level: 'exact' | 'normalized' | 'perceptual';
      original_content_id?: number;
      ip_address?: string;
      user_agent?: string;
    }) {
      await db.query(
        `INSERT INTO duplicate_detections 
         (content_hash, normalized_hash, perceptual_hash, detection_level, 
          original_content_id, ip_address, user_agent, detected_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [
          data.content_hash,
          data.normalized_hash,
          data.perceptual_hash,
          data.detection_level,
          data.original_content_id,
          data.ip_address,
          data.user_agent,
        ]
      );
    },

    async getStats(days = 30) {
      const result = await db.query(
        `SELECT detection_level, COUNT(*) as count
         FROM duplicate_detections
         WHERE detected_at > CURRENT_TIMESTAMP - INTERVAL '${days} days'
         GROUP BY detection_level`
      );
      return result.rows;
    },
  },

  // Activity logging
  activity: {
    async log(data: {
      user_id?: number;
      action: string;
      entity_type?: string;
      entity_id?: number;
      metadata?: any;
      ip_address?: string;
    }) {
      await db.query(
        `INSERT INTO activity_log 
         (user_id, action, entity_type, entity_id, metadata, ip_address, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [
          data.user_id,
          data.action,
          data.entity_type,
          data.entity_id,
          data.metadata ? JSON.stringify(data.metadata) : null,
          data.ip_address,
        ]
      );
    },

    async getRecentActivity(userId: number, limit = 50) {
      const result = await db.query(
        `SELECT * FROM activity_log 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [userId, limit]
      );
      return result.rows;
    },
  },
};

export default db;

/**
 * DatabaseClient class for auth service compatibility
 */
export class DatabaseClient {
  constructor() {
    // Initialize database on construction
    if (!pool) {
      initDatabase().catch(err => {
        console.error('Failed to initialize database:', err);
      });
    }
  }
  
  async query<T = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
    return db.query<T>(text, params);
  }
  
  async getClient(): Promise<pg.PoolClient> {
    return db.getClient();
  }
  
  async transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    return db.transaction<T>(callback);
  }
  
  async disconnect(): Promise<void> {
    return closeDatabase();
  }
}
