-- Migration: Add email delivery tracking
-- Date: 2025-12-05

-- Add email tracking columns to magic_links table
ALTER TABLE magic_links 
ADD COLUMN IF NOT EXISTS email_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS email_error TEXT,
ADD COLUMN IF NOT EXISTS email_message_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_magic_links_email_status ON magic_links(email_status);

COMMENT ON COLUMN magic_links.email_status IS 'Email delivery status: pending, sent, failed, bounced';
COMMENT ON COLUMN magic_links.email_message_id IS 'SMTP message ID for tracking delivery';

-- Add email tracking columns to email_change_requests table
ALTER TABLE email_change_requests
ADD COLUMN IF NOT EXISTS old_email_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS old_email_sent_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS old_email_error TEXT,
ADD COLUMN IF NOT EXISTS new_email_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS new_email_sent_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS new_email_error TEXT;

COMMENT ON COLUMN email_change_requests.old_email_status IS 'Email delivery status for confirmation email';
COMMENT ON COLUMN email_change_requests.new_email_status IS 'Email delivery status for verification email';
