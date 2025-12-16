/**
 * Webhook Service for Broker Notifications
 * 
 * Handles webhook delivery with retry logic and signature verification
 */

import crypto from 'crypto';
import { DatabaseClient } from '../database/client.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
    new winston.transports.File({ filename: 'logs/webhooks.log' })
  ]
});

export interface WebhookConfig {
  id: number;
  broker_id: number;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  max_retries: number;
  retry_delay_seconds: number;
  custom_headers?: Record<string, string>;
}

export interface WebhookEvent {
  event: string;
  timestamp: string;
  data: any;
  broker_id: number;
}

export class WebhookService {
  private db: DatabaseClient;
  
  constructor(db: DatabaseClient) {
    this.db = db;
  }

  /**
   * Register a webhook endpoint for a broker
   */
  async registerWebhook(
    brokerId: number,
    url: string,
    secret: string,
    events: string[],
    options: {
      description?: string;
      customHeaders?: Record<string, string>;
      maxRetries?: number;
      retryDelaySeconds?: number;
    } = {}
  ): Promise<number> {
    try {
      // Validate URL
      new URL(url); // Throws if invalid
      
      // Validate events
      const validEvents = [
        'content.protected',
        'content.transferred',
        'content.verified',
        'identity.verified',
        'content.disputed'
      ];
      
      for (const event of events) {
        if (!validEvents.includes(event)) {
          throw new Error(`Invalid event type: ${event}`);
        }
      }
      
      const result = await this.db.query(`
        INSERT INTO broker_webhooks (
          broker_id, url, secret, events, description,
          custom_headers, max_retries, retry_delay_seconds
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (broker_id, url) DO UPDATE SET
          secret = EXCLUDED.secret,
          events = EXCLUDED.events,
          description = EXCLUDED.description,
          custom_headers = EXCLUDED.custom_headers,
          max_retries = EXCLUDED.max_retries,
          retry_delay_seconds = EXCLUDED.retry_delay_seconds,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `, [
        brokerId,
        url,
        secret,
        events,
        options.description || null,
        options.customHeaders ? JSON.stringify(options.customHeaders) : null,
        options.maxRetries || 3,
        options.retryDelaySeconds || 60
      ]);
      
      const webhookId = result.rows[0].id;
      logger.info(`Webhook registered: ${url} for broker ${brokerId}`);
      
      return webhookId;
    } catch (error) {
      logger.error('Webhook registration failed:', error);
      throw error;
    }
  }

  /**
   * Trigger webhook for event
   */
  async triggerWebhook(
    brokerId: number,
    eventType: string,
    eventData: any
  ): Promise<void> {
    try {
      // Find all webhooks for this broker and event type
      const result = await this.db.query(`
        SELECT id, url, secret, custom_headers, max_retries, retry_delay_seconds
        FROM broker_webhooks
        WHERE broker_id = $1
          AND enabled = true
          AND $2 = ANY(events)
      `, [brokerId, eventType]);
      
      if (result.rows.length === 0) {
        logger.debug(`No webhooks found for broker ${brokerId} event ${eventType}`);
        return;
      }
      
      const event: WebhookEvent = {
        event: eventType,
        timestamp: new Date().toISOString(),
        data: eventData,
        broker_id: brokerId
      };
      
      // Send to all matching webhooks (async, non-blocking)
      for (const webhook of result.rows) {
        this.deliverWebhook(webhook, event).catch(err => {
          logger.error(`Webhook delivery error: ${err.message}`);
        });
      }
      
    } catch (error) {
      logger.error('Webhook trigger failed:', error);
      // Don't throw - webhook failures shouldn't break main flow
    }
  }

  /**
   * Deliver webhook with retry logic
   */
  private async deliverWebhook(
    webhook: any,
    event: WebhookEvent,
    existingDeliveryId?: number
  ): Promise<void> {
    const startTime = Date.now();
    
    let deliveryId: number;
    
    if (existingDeliveryId) {
      // Use existing delivery record for retries
      deliveryId = existingDeliveryId;
    } else {
      // Create new delivery record
      const deliveryResult = await this.db.query(`
        INSERT INTO broker_webhook_deliveries (
          webhook_id, broker_id, event_type, payload, status, created_at
        ) VALUES ($1, $2, $3, $4, 'pending', NOW())
        RETURNING id
      `, [webhook.id, event.broker_id, event.event, JSON.stringify(event)]);
      
      deliveryId = deliveryResult.rows[0].id;
    }
    
    try {
      // Generate HMAC signature
      const signature = this.generateSignature(event, webhook.secret);
      
      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'DAON-Webhook/1.0',
        'X-DAON-Webhook-Signature': signature,
        'X-DAON-Webhook-Event': event.event,
        'X-DAON-Webhook-ID': deliveryId.toString(),
        'X-DAON-Webhook-Timestamp': event.timestamp,
      };
      
      // Add custom headers
      if (webhook.custom_headers) {
        const customHeaders = typeof webhook.custom_headers === 'string'
          ? JSON.parse(webhook.custom_headers)
          : webhook.custom_headers;
        Object.assign(headers, customHeaders);
      }
      
      // Send HTTP POST request
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      const duration = Date.now() - startTime;
      const responseBody = await response.text().catch(() => '');
      
      if (response.ok) {
        // Success
        await this.db.query(`
          UPDATE broker_webhook_deliveries
          SET status = 'success',
              http_status_code = $1,
              response_body = $2,
              sent_at = NOW(),
              completed_at = NOW(),
              duration_ms = $3,
              response_headers = $4
          WHERE id = $5
        `, [
          response.status,
          responseBody.substring(0, 1000), // Limit response body size
          duration,
          JSON.stringify(Object.fromEntries(response.headers.entries())),
          deliveryId
        ]);
        
        await this.db.query(`
          UPDATE broker_webhooks
          SET last_triggered_at = NOW()
          WHERE id = $1
        `, [webhook.id]);
        
        logger.info(`Webhook delivered successfully: ${webhook.url} (${duration}ms)`);
      } else {
        // HTTP error - schedule retry
        await this.handleDeliveryFailure(
          deliveryId,
          webhook,
          response.status,
          `HTTP ${response.status}: ${responseBody.substring(0, 200)}`,
          duration
        );
      }
      
    } catch (error) {
      // Network error or timeout - schedule retry
      const duration = Date.now() - startTime;
      await this.handleDeliveryFailure(
        deliveryId,
        webhook,
        0,
        error.message,
        duration
      );
    }
  }

  /**
   * Handle webhook delivery failure and schedule retry
   */
  private async handleDeliveryFailure(
    deliveryId: number,
    webhook: any,
    statusCode: number,
    errorMessage: string,
    duration: number
  ): Promise<void> {
    try {
      // Get current retry count
      const result = await this.db.query(`
        SELECT retry_count FROM broker_webhook_deliveries WHERE id = $1
      `, [deliveryId]);
      
      const retryCount = result.rows[0].retry_count;
      const maxRetries = webhook.max_retries;
      
      if (retryCount < maxRetries) {
        // Schedule retry with exponential backoff
        const delaySeconds = webhook.retry_delay_seconds * Math.pow(2, retryCount);
        const nextRetry = new Date(Date.now() + delaySeconds * 1000);
        
        await this.db.query(`
          UPDATE broker_webhook_deliveries
          SET status = 'retrying',
              http_status_code = $1,
              error_message = $2,
              retry_count = retry_count + 1,
              next_retry_at = $3,
              sent_at = NOW(),
              duration_ms = $4
          WHERE id = $5
        `, [statusCode, errorMessage, nextRetry, duration, deliveryId]);
        
        logger.warn(`Webhook delivery failed, scheduled retry ${retryCount + 1}/${maxRetries}: ${webhook.url}`);
      } else {
        // Max retries exceeded
        await this.db.query(`
          UPDATE broker_webhook_deliveries
          SET status = 'failed',
              http_status_code = $1,
              error_message = $2,
              completed_at = NOW(),
              duration_ms = $3
          WHERE id = $4
        `, [statusCode, errorMessage, duration, deliveryId]);
        
        logger.error(`Webhook delivery failed after ${maxRetries} retries: ${webhook.url}`);
      }
    } catch (error) {
      logger.error('Failed to handle webhook delivery failure:', error);
    }
  }

  /**
   * Process pending webhook retries
   */
  async processRetries(): Promise<void> {
    try {
      // Find deliveries due for retry
      const result = await this.db.query(`
        SELECT 
          d.id, d.webhook_id, d.event_type, d.payload,
          w.url, w.secret, w.custom_headers, w.max_retries, w.retry_delay_seconds,
          w.broker_id
        FROM broker_webhook_deliveries d
        JOIN broker_webhooks w ON d.webhook_id = w.id
        WHERE d.status = 'retrying'
          AND d.next_retry_at <= NOW()
          AND w.enabled = true
        LIMIT 100
      `);
      
      for (const row of result.rows) {
        const event = typeof row.payload === 'string' 
          ? JSON.parse(row.payload)
          : row.payload;
          
        await this.deliverWebhook(row, event, row.id);
      }
      
      if (result.rows.length > 0) {
        logger.info(`Processed ${result.rows.length} webhook retries`);
      }
    } catch (error) {
      logger.error('Webhook retry processing failed:', error);
    }
  }

  /**
   * Generate HMAC-SHA256 signature for webhook payload
   */
  private generateSignature(event: WebhookEvent, secret: string): string {
    const payload = JSON.stringify(event);
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Verify webhook signature
   */
  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateSignature(JSON.parse(payload), secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * List webhooks for a broker
   */
  async listWebhooks(brokerId: number): Promise<any[]> {
    const result = await this.db.query(`
      SELECT 
        id, url, events, enabled, description,
        created_at, updated_at, last_triggered_at,
        max_retries, retry_delay_seconds
      FROM broker_webhooks
      WHERE broker_id = $1
      ORDER BY created_at DESC
    `, [brokerId]);
    
    return result.rows;
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: number, brokerId: number): Promise<boolean> {
    const result = await this.db.query(`
      DELETE FROM broker_webhooks
      WHERE id = $1 AND broker_id = $2
      RETURNING id
    `, [webhookId, brokerId]);
    
    return result.rows.length > 0;
  }

  /**
   * Get webhook delivery stats
   */
  async getDeliveryStats(brokerId: number, webhookId?: number): Promise<any> {
    const query = webhookId
      ? `SELECT 
           COUNT(*) as total_deliveries,
           COUNT(*) FILTER (WHERE status = 'success') as successful,
           COUNT(*) FILTER (WHERE status = 'failed') as failed,
           COUNT(*) FILTER (WHERE status = 'retrying') as retrying,
           AVG(duration_ms) FILTER (WHERE status = 'success') as avg_duration_ms
         FROM broker_webhook_deliveries
         WHERE webhook_id = $1`
      : `SELECT 
           COUNT(*) as total_deliveries,
           COUNT(*) FILTER (WHERE status = 'success') as successful,
           COUNT(*) FILTER (WHERE status = 'failed') as failed,
           COUNT(*) FILTER (WHERE status = 'retrying') as retrying,
           AVG(duration_ms) FILTER (WHERE status = 'success') as avg_duration_ms
         FROM broker_webhook_deliveries
         WHERE broker_id = $1`;
    
    const params = webhookId ? [webhookId] : [brokerId];
    const result = await this.db.query(query, params);
    
    return result.rows[0];
  }
}
