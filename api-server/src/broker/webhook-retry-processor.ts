/**
 * Webhook Retry Processor
 * 
 * Background job to retry failed webhook deliveries
 * Runs on a schedule to process pending retries
 */

import { WebhookService } from './webhook-service.js';
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
    new winston.transports.File({ filename: 'logs/webhook-retry.log' })
  ]
});

export class WebhookRetryProcessor {
  private webhookService: WebhookService;
  private intervalId: NodeJS.Timeout | null = null;
  private processingInterval: number; // milliseconds
  private isProcessing = false;
  
  constructor(
    db: DatabaseClient,
    intervalMinutes: number = 1
  ) {
    this.webhookService = new WebhookService(db);
    this.processingInterval = intervalMinutes * 60 * 1000;
  }
  
  /**
   * Start the retry processor
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('Webhook retry processor already running');
      return;
    }
    
    logger.info(`Starting webhook retry processor (interval: ${this.processingInterval / 1000}s)`);
    
    // Process immediately on start
    this.processRetries();
    
    // Then process on interval
    this.intervalId = setInterval(() => {
      this.processRetries();
    }, this.processingInterval);
  }
  
  /**
   * Stop the retry processor
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Webhook retry processor stopped');
    }
  }
  
  /**
   * Process pending retries
   */
  private async processRetries(): Promise<void> {
    if (this.isProcessing) {
      logger.debug('Retry processing already in progress, skipping...');
      return;
    }
    
    this.isProcessing = true;
    
    try {
      logger.debug('Processing webhook retries...');
      await this.webhookService.processRetries();
    } catch (error) {
      logger.error('Error processing webhook retries:', error);
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Trigger manual retry processing
   */
  async triggerManualProcessing(): Promise<void> {
    await this.processRetries();
  }
}
