-- DAON Content Protection Database Schema
-- PostgreSQL schema for user authentication and content tracking

-- Users table (for authentication)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    discord_id VARCHAR(100) UNIQUE,
    google_id VARCHAR(100) UNIQUE,
    username VARCHAR(100),
    blockchain_address VARCHAR(255),
    
    -- 2FA fields
    totp_secret VARCHAR(255),              -- AES-256-GCM encrypted. Format: iv:authTag:ciphertext
    totp_enabled BOOLEAN DEFAULT FALSE,
    totp_enabled_at TIMESTAMP,
    backup_codes_hash TEXT,                -- JSON array of bcrypt hashed codes
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    email_verified BOOLEAN DEFAULT FALSE,
    
    CONSTRAINT at_least_one_auth CHECK (
        email IS NOT NULL OR 
        discord_id IS NOT NULL OR 
        google_id IS NOT NULL
    )
);

COMMENT ON COLUMN users.totp_secret IS 'AES-256-GCM encrypted. Format: iv:authTag:ciphertext';

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_discord ON users(discord_id);
CREATE INDEX idx_users_google ON users(google_id);
CREATE INDEX idx_users_blockchain_addr ON users(blockchain_address);

-- Magic link tokens for passwordless auth
CREATE TABLE IF NOT EXISTS magic_links (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Email delivery tracking
    email_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'bounced'
    email_sent_at TIMESTAMP,
    email_error TEXT,
    email_message_id VARCHAR(255) -- SMTP message ID for tracking
);

CREATE INDEX idx_magic_links_token ON magic_links(token);
CREATE INDEX idx_magic_links_email ON magic_links(email);
CREATE INDEX idx_magic_links_expires ON magic_links(expires_at);
CREATE INDEX idx_magic_links_email_status ON magic_links(email_status);

-- OAuth sessions
CREATE TABLE IF NOT EXISTS oauth_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- 'discord', 'google'
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_oauth_sessions_user ON oauth_sessions(user_id);
CREATE INDEX idx_oauth_sessions_provider ON oauth_sessions(provider);

-- Refresh tokens table (for JWT refresh token rotation)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(64) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    
    -- Device tracking
    device_id VARCHAR(64),
    device_fingerprint VARCHAR(64),
    device_info JSONB,  -- {user_agent, ip, screen, timezone, created_at}
    
    -- Lifecycle
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,  -- created_at + 30 days
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP,
    
    -- Metadata
    rotated_from_token VARCHAR(64),  -- If rotated, reference to old token
    revoke_reason VARCHAR(100)       -- 'user_logout', 'suspicious_activity', etc.
);

CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_device_id ON refresh_tokens(device_id);
CREATE INDEX idx_refresh_tokens_fingerprint ON refresh_tokens(device_fingerprint);

-- Trusted devices table (for device trust / 2FA skip)
CREATE TABLE IF NOT EXISTS trusted_devices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(64),
    device_fingerprint VARCHAR(64),
    
    -- User-friendly device info
    device_name VARCHAR(100),  -- User can edit: "My MacBook Pro"
    device_info JSONB,  -- {user_agent, ip, location, screen, timezone}
    
    -- Trust lifecycle
    trusted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    trusted_until TIMESTAMP NOT NULL,  -- trusted_at + 30 days
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP,
    revoke_reason VARCHAR(100),  -- 'user_revoked', 'suspicious_activity', etc.
    
    UNIQUE(user_id, device_id)
);

CREATE INDEX idx_trusted_devices_user ON trusted_devices(user_id);
CREATE INDEX idx_trusted_devices_device_id ON trusted_devices(device_id);
CREATE INDEX idx_trusted_devices_fingerprint ON trusted_devices(device_fingerprint);
CREATE INDEX idx_trusted_devices_expires ON trusted_devices(trusted_until);

-- Temporary sessions table (for 2FA flow state management)
CREATE TABLE IF NOT EXISTS temp_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(64) UNIQUE NOT NULL,  -- crypto.randomBytes(32).toString('hex')
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    
    -- Flow state
    flow_type VARCHAR(20) NOT NULL,  -- '2fa_setup', '2fa_verify', 'device_trust'
    flow_data JSONB,  -- Store any flow-specific data
    
    -- Security
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    
    -- Lifecycle
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,  -- created_at + 5 minutes
    completed_at TIMESTAMP,
    
    CONSTRAINT temp_sessions_not_expired CHECK (expires_at > created_at)
);

CREATE INDEX idx_temp_sessions_session_id ON temp_sessions(session_id);
CREATE INDEX idx_temp_sessions_expires ON temp_sessions(expires_at);
CREATE INDEX idx_temp_sessions_user ON temp_sessions(user_id);

-- Email change requests table
CREATE TABLE IF NOT EXISTS email_change_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    old_email VARCHAR(255) NOT NULL,
    new_email VARCHAR(255) NOT NULL,
    old_email_token VARCHAR(64) UNIQUE NOT NULL,
    new_email_token VARCHAR(64) UNIQUE,
    old_email_confirmed_at TIMESTAMP,
    new_email_confirmed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,  -- created_at + 24 hours
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    
    -- Email delivery tracking
    old_email_status VARCHAR(20) DEFAULT 'pending',
    old_email_sent_at TIMESTAMP,
    old_email_error TEXT,
    new_email_status VARCHAR(20) DEFAULT 'pending',
    new_email_sent_at TIMESTAMP,
    new_email_error TEXT
);

CREATE INDEX idx_email_change_user ON email_change_requests(user_id);
CREATE INDEX idx_email_change_old_token ON email_change_requests(old_email_token);
CREATE INDEX idx_email_change_new_token ON email_change_requests(new_email_token);
CREATE INDEX idx_email_change_expires ON email_change_requests(expires_at);

-- Protected content records (synced with blockchain)
CREATE TABLE IF NOT EXISTS protected_content (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    content_hash VARCHAR(64) UNIQUE NOT NULL,
    normalized_hash VARCHAR(64),
    perceptual_hash VARCHAR(64),
    previous_version VARCHAR(64),
    title VARCHAR(500),
    description TEXT,
    content_type VARCHAR(50), -- 'text', 'image', 'video', etc.
    license VARCHAR(50) DEFAULT 'liberation_v1',
    blockchain_tx VARCHAR(255),
    blockchain_height BIGINT,
    verification_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_content_hash ON protected_content(content_hash);
CREATE INDEX idx_content_normalized ON protected_content(normalized_hash);
CREATE INDEX idx_content_perceptual ON protected_content(perceptual_hash);
CREATE INDEX idx_content_previous ON protected_content(previous_version);
CREATE INDEX idx_content_user ON protected_content(user_id);
CREATE INDEX idx_content_created ON protected_content(created_at DESC);

-- Duplicate detection log (for tracking duplicate attempts)
CREATE TABLE IF NOT EXISTS duplicate_detections (
    id SERIAL PRIMARY KEY,
    content_hash VARCHAR(64) NOT NULL,
    normalized_hash VARCHAR(64),
    perceptual_hash VARCHAR(64),
    detection_level VARCHAR(20), -- 'exact', 'normalized', 'perceptual'
    original_content_id INTEGER REFERENCES protected_content(id),
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);

CREATE INDEX idx_duplicate_content ON duplicate_detections(content_hash);
CREATE INDEX idx_duplicate_level ON duplicate_detections(detection_level);
CREATE INDEX idx_duplicate_detected ON duplicate_detections(detected_at DESC);

-- API usage tracking
CREATE TABLE IF NOT EXISTS api_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_usage_user ON api_usage(user_id);
CREATE INDEX idx_api_usage_endpoint ON api_usage(endpoint);
CREATE INDEX idx_api_usage_created ON api_usage(created_at DESC);

-- Version history (for tracking content updates)
CREATE TABLE IF NOT EXISTS content_versions (
    id SERIAL PRIMARY KEY,
    content_id INTEGER REFERENCES protected_content(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    previous_hash VARCHAR(64),
    blockchain_tx VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(content_id, version_number)
);

CREATE INDEX idx_versions_content ON content_versions(content_id);
CREATE INDEX idx_versions_hash ON content_versions(content_hash);
CREATE INDEX idx_versions_created ON content_versions(created_at DESC);

-- Disputes (for handling duplicate/ownership disputes)
CREATE TABLE IF NOT EXISTS disputes (
    id SERIAL PRIMARY KEY,
    content_id INTEGER REFERENCES protected_content(id) ON DELETE CASCADE,
    reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    dispute_type VARCHAR(50), -- 'duplicate', 'ownership', 'license_violation'
    description TEXT,
    evidence_url TEXT,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'investigating', 'resolved', 'dismissed'
    resolution TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

CREATE INDEX idx_disputes_content ON disputes(content_id);
CREATE INDEX idx_disputes_reporter ON disputes(reporter_user_id);
CREATE INDEX idx_disputes_status ON disputes(status);
CREATE INDEX idx_disputes_created ON disputes(created_at DESC);

-- Activity log for audit trail
CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- Actions: see comment below
    entity_type VARCHAR(50), -- 'user', 'content', 'dispute', 'device', 'session'
    entity_id INTEGER,
    metadata JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN activity_log.action IS 'Actions: register_content, verify_content, login, 2fa_setup_started, 2fa_setup_completed, 2fa_verified, 2fa_failed, 2fa_disabled, backup_code_used, backup_codes_regenerated, device_trusted, device_trust_revoked, refresh_token_issued, refresh_token_revoked, access_token_refreshed, email_change_requested, email_change_completed';

CREATE INDEX idx_activity_user ON activity_log(user_id);
CREATE INDEX idx_activity_action ON activity_log(action);
CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_created ON activity_log(created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for protected_content
CREATE TRIGGER update_protected_content_updated_at 
    BEFORE UPDATE ON protected_content
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for oauth_sessions
CREATE TRIGGER update_oauth_sessions_updated_at 
    BEFORE UPDATE ON oauth_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Views for common queries
CREATE OR REPLACE VIEW user_content_summary AS
SELECT 
    u.id as user_id,
    u.email,
    u.username,
    COUNT(pc.id) as total_protected,
    COUNT(CASE WHEN pc.license = 'liberation_v1' THEN 1 END) as liberation_count,
    MAX(pc.created_at) as last_protection,
    u.created_at as user_since
FROM users u
LEFT JOIN protected_content pc ON u.id = pc.user_id
GROUP BY u.id, u.email, u.username, u.created_at;

CREATE OR REPLACE VIEW duplicate_detection_stats AS
SELECT 
    detection_level,
    COUNT(*) as total_detections,
    COUNT(DISTINCT content_hash) as unique_attempts,
    DATE_TRUNC('day', detected_at) as detection_date
FROM duplicate_detections
GROUP BY detection_level, DATE_TRUNC('day', detected_at)
ORDER BY detection_date DESC, detection_level;

-- Initial admin user (optional)
-- INSERT INTO users (email, username, email_verified, created_at) 
-- VALUES ('admin@daon.network', 'admin', TRUE, CURRENT_TIMESTAMP)
-- ON CONFLICT (email) DO NOTHING;

-- Grant permissions (adjust based on your database user)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO daon_api;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO daon_api;
