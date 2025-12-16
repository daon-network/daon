/**
 * Health Check Endpoints
 * 
 * Provides system health and email status monitoring
 */

import { Router, Request, Response } from 'express';
import { verifyEmailConfig } from '../utils/email';
import { DatabaseClient } from '../database/client';

const router = Router();
const db = new DatabaseClient();

/**
 * GET /health
 * Basic health check
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Check database connection
    await db.query('SELECT 1');
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        api: 'operational',
        database: 'operational'
      }
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * GET /health/email
 * Email system health check
 */
router.get('/email', async (req: Request, res: Response) => {
  try {
    const smtpConfigured = process.env.SMTP_USER && process.env.SMTP_PASS;
    const smtpVerified = smtpConfigured ? await verifyEmailConfig() : false;
    
    // Get recent email stats
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_sent,
        COUNT(CASE WHEN email_status = 'sent' THEN 1 END) as successful,
        COUNT(CASE WHEN email_status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN email_status = 'pending' THEN 1 END) as pending,
        MAX(email_sent_at) as last_email_sent
      FROM magic_links
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);
    
    const emailStats = stats.rows[0];
    
    res.json({
      status: smtpVerified ? 'operational' : 'degraded',
      timestamp: new Date().toISOString(),
      smtp: {
        configured: smtpConfigured,
        verified: smtpVerified,
        host: process.env.SMTP_HOST || 'not configured',
        port: process.env.SMTP_PORT || 'not configured'
      },
      statistics: {
        last_24h: {
          total: parseInt(emailStats.total_sent),
          successful: parseInt(emailStats.successful),
          failed: parseInt(emailStats.failed),
          pending: parseInt(emailStats.pending),
          success_rate: emailStats.total_sent > 0 
            ? `${((parseInt(emailStats.successful) / parseInt(emailStats.total_sent)) * 100).toFixed(1)}%`
            : 'N/A'
        },
        last_email_sent: emailStats.last_email_sent || 'never'
      },
      mailhog_ui: process.env.SMTP_PORT === '1025' 
        ? 'http://localhost:8025' 
        : null
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * GET /health/email/recent
 * Recent email delivery log
 */
router.get('/email/recent', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    
    const result = await db.query(
      `SELECT 
        id,
        email,
        email_status,
        email_sent_at,
        email_error,
        created_at,
        expires_at,
        used_at
      FROM magic_links
      ORDER BY created_at DESC
      LIMIT $1`,
      [limit]
    );
    
    res.json({
      count: result.rows.length,
      emails: result.rows.map(row => ({
        id: row.id,
        email: row.email,
        status: row.email_status,
        sent_at: row.email_sent_at,
        error: row.email_error,
        created_at: row.created_at,
        expires_at: row.expires_at,
        used: !!row.used_at
      }))
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message
    });
  }
});

export default router;
