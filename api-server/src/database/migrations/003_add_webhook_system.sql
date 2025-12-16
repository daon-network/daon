-- Migration: Add Webhook System for Brokers
-- Allows brokers to receive real-time notifications for events

-- Webhook Endpoints
CREATE TABLE IF NOT EXISTS broker_webhooks (
    id SERIAL PRIMARY KEY,
    broker_id INTEGER NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
    url VARCHAR(2048) NOT NULL,
    secret VARCHAR(255) NOT NULL, -- HMAC secret for signature verification
    events TEXT[] NOT NULL, -- Array of event types: ['content.protected', 'content.transferred', 'content.verified']
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_triggered_at TIMESTAMP,
    
    -- Rate limiting
    max_retries INTEGER DEFAULT 3,
    retry_delay_seconds INTEGER DEFAULT 60,
    
    -- Metadata
    description TEXT,
    custom_headers JSONB, -- Custom headers to include in webhook requests
    
    CONSTRAINT unique_broker_webhook_url UNIQUE(broker_id, url)
);

CREATE INDEX idx_broker_webhooks_broker ON broker_webhooks(broker_id);
CREATE INDEX idx_broker_webhooks_enabled ON broker_webhooks(enabled);

-- Webhook Delivery Log
CREATE TABLE IF NOT EXISTS broker_webhook_deliveries (
    id SERIAL PRIMARY KEY,
    webhook_id INTEGER NOT NULL REFERENCES broker_webhooks(id) ON DELETE CASCADE,
    broker_id INTEGER NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    
    -- Delivery status
    status VARCHAR(20) NOT NULL, -- 'pending', 'success', 'failed', 'retrying'
    http_status_code INTEGER,
    response_body TEXT,
    error_message TEXT,
    
    -- Timing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP,
    completed_at TIMESTAMP,
    next_retry_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    
    -- Request details
    request_headers JSONB,
    response_headers JSONB,
    duration_ms INTEGER
);

CREATE INDEX idx_webhook_deliveries_webhook ON broker_webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_broker ON broker_webhook_deliveries(broker_id);
CREATE INDEX idx_webhook_deliveries_status ON broker_webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_created ON broker_webhook_deliveries(created_at DESC);
CREATE INDEX idx_webhook_deliveries_next_retry ON broker_webhook_deliveries(next_retry_at) WHERE status = 'retrying';

-- Comments
COMMENT ON TABLE broker_webhooks IS 'Webhook endpoint configurations for brokers';
COMMENT ON TABLE broker_webhook_deliveries IS 'Log of all webhook delivery attempts';
COMMENT ON COLUMN broker_webhooks.secret IS 'HMAC-SHA256 secret for webhook signature verification';
COMMENT ON COLUMN broker_webhooks.events IS 'Array of event types to trigger this webhook';
COMMENT ON COLUMN broker_webhook_deliveries.status IS 'Delivery status: pending, success, failed, retrying';
