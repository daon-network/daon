-- DAON Broker System Schema
-- Enables platform integrations for mass adoption
-- Version: 1.0
-- Date: December 2025

-- ============================================================================
-- BROKER REGISTRATION & CERTIFICATION
-- ============================================================================

-- Certified brokers (platforms authorized to register content)
CREATE TABLE IF NOT EXISTS brokers (
    id SERIAL PRIMARY KEY,
    
    -- Identity
    domain VARCHAR(255) UNIQUE NOT NULL,  -- archiveofourown.org, wattpad.com
    name VARCHAR(255) NOT NULL,           -- "Archive of Our Own", "Wattpad"
    description TEXT,
    contact_email VARCHAR(255) NOT NULL,
    
    -- Authentication
    api_key_hash VARCHAR(255) NOT NULL,   -- bcrypt hash of API key
    public_key TEXT,                      -- Ed25519 public key for signature verification
    private_key_encrypted TEXT,           -- Optional: encrypted storage for key recovery
    
    -- Certification
    certification_tier VARCHAR(20) NOT NULL DEFAULT 'community',  -- 'community', 'standard', 'enterprise'
    certification_status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'active', 'suspended', 'revoked'
    certification_date TIMESTAMP,
    certification_expires TIMESTAMP,      -- Requires renewal
    certification_authority VARCHAR(255), -- Who certified them
    
    -- Security
    allowed_ip_ranges INET[],             -- Optional IP whitelist
    rate_limit_per_hour INTEGER DEFAULT 1000,
    rate_limit_per_day INTEGER DEFAULT 10000,
    require_signature BOOLEAN DEFAULT TRUE,
    
    -- Status
    enabled BOOLEAN DEFAULT FALSE,
    suspended_at TIMESTAMP,
    suspend_reason TEXT,
    revoked_at TIMESTAMP,
    revoke_reason TEXT,
    
    -- Metadata
    metadata JSONB,                       -- Additional broker info
    terms_accepted_at TIMESTAMP,
    terms_version VARCHAR(20),
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT valid_certification_tier CHECK (
        certification_tier IN ('community', 'standard', 'enterprise')
    ),
    CONSTRAINT valid_certification_status CHECK (
        certification_status IN ('pending', 'active', 'suspended', 'revoked')
    ),
    CONSTRAINT require_public_key_if_signatures CHECK (
        NOT require_signature OR public_key IS NOT NULL
    )
);

CREATE INDEX idx_brokers_domain ON brokers(domain);
CREATE INDEX idx_brokers_status ON brokers(certification_status);
CREATE INDEX idx_brokers_enabled ON brokers(enabled);
CREATE INDEX idx_brokers_tier ON brokers(certification_tier);

COMMENT ON TABLE brokers IS 'Certified platforms authorized to register content on behalf of users';
COMMENT ON COLUMN brokers.api_key_hash IS 'bcrypt hash of broker API key for authentication';
COMMENT ON COLUMN brokers.public_key IS 'Ed25519 public key for verifying broker signatures';
COMMENT ON COLUMN brokers.certification_tier IS 'community: <10k users, standard: <1M users, enterprise: unlimited';

-- Broker API keys (supports key rotation)
CREATE TABLE IF NOT EXISTS broker_api_keys (
    id SERIAL PRIMARY KEY,
    broker_id INTEGER REFERENCES brokers(id) ON DELETE CASCADE,
    
    -- Key details
    key_hash VARCHAR(255) UNIQUE NOT NULL,  -- bcrypt hash
    key_prefix VARCHAR(20) NOT NULL,        -- First 8 chars for identification (e.g., "DAON_BR_")
    key_name VARCHAR(100),                  -- User-friendly name: "Production Key"
    
    -- Lifecycle
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,                   -- Optional expiration
    last_used_at TIMESTAMP,
    revoked_at TIMESTAMP,
    revoke_reason TEXT,
    
    -- Usage tracking
    total_requests BIGINT DEFAULT 0,
    total_registrations BIGINT DEFAULT 0,
    
    -- Permissions
    scopes TEXT[] DEFAULT ARRAY['broker:register'],  -- 'broker:register', 'broker:transfer', 'broker:verify'
    
    CONSTRAINT broker_api_keys_not_revoked CHECK (
        revoked_at IS NULL OR expires_at IS NULL OR revoked_at <= expires_at
    )
);

CREATE INDEX idx_broker_api_keys_broker ON broker_api_keys(broker_id);
CREATE INDEX idx_broker_api_keys_hash ON broker_api_keys(key_hash);
CREATE INDEX idx_broker_api_keys_prefix ON broker_api_keys(key_prefix);
CREATE INDEX idx_broker_api_keys_expires ON broker_api_keys(expires_at);

-- ============================================================================
-- FEDERATED IDENTITIES (username@platform.com)
-- ============================================================================

-- Federated user identities brokered by platforms
CREATE TABLE IF NOT EXISTS federated_identities (
    id SERIAL PRIMARY KEY,
    
    -- Identity
    username VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    full_identity VARCHAR(512) UNIQUE NOT NULL GENERATED ALWAYS AS (username || '@' || domain) STORED,
    
    -- Broker relationship
    broker_id INTEGER REFERENCES brokers(id) ON DELETE RESTRICT,
    
    -- User linkage (if user claims this identity directly)
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    claimed_at TIMESTAMP,
    claim_proof TEXT,  -- Signature or verification token
    
    -- Verification
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP,
    verification_method VARCHAR(50),  -- 'broker_signature', 'platform_oauth', 'email_verification'
    
    -- Status
    active BOOLEAN DEFAULT TRUE,
    suspended_at TIMESTAMP,
    suspend_reason TEXT,
    
    -- Metadata
    metadata JSONB,  -- Platform-specific user data
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(username, domain)
);

CREATE INDEX idx_federated_identities_full ON federated_identities(full_identity);
CREATE INDEX idx_federated_identities_broker ON federated_identities(broker_id);
CREATE INDEX idx_federated_identities_user ON federated_identities(user_id);
CREATE INDEX idx_federated_identities_domain ON federated_identities(domain);

COMMENT ON TABLE federated_identities IS 'User identities vouched for by certified brokers';
COMMENT ON COLUMN federated_identities.full_identity IS 'Computed column: username@domain';

-- ============================================================================
-- OWNERSHIP & TRANSFER TRACKING
-- ============================================================================

-- Content ownership records (extends protected_content)
CREATE TABLE IF NOT EXISTS content_ownership (
    id SERIAL PRIMARY KEY,
    content_hash VARCHAR(64) UNIQUE NOT NULL,
    
    -- Current owner
    owner_type VARCHAR(20) NOT NULL,  -- 'direct_user', 'federated_identity', 'blockchain_address'
    owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    owner_federated_id INTEGER REFERENCES federated_identities(id) ON DELETE SET NULL,
    owner_blockchain_address VARCHAR(255),
    
    -- Original registration
    registered_by_type VARCHAR(20) NOT NULL,  -- 'user', 'broker'
    registered_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    registered_by_broker_id INTEGER REFERENCES brokers(id) ON DELETE SET NULL,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Current status
    active BOOLEAN DEFAULT TRUE,
    disputed BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    license VARCHAR(50) DEFAULT 'liberation_v1',
    blockchain_tx VARCHAR(255),
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_owner_type CHECK (
        owner_type IN ('direct_user', 'federated_identity', 'blockchain_address')
    ),
    CONSTRAINT owner_type_matches_id CHECK (
        (owner_type = 'direct_user' AND owner_user_id IS NOT NULL) OR
        (owner_type = 'federated_identity' AND owner_federated_id IS NOT NULL) OR
        (owner_type = 'blockchain_address' AND owner_blockchain_address IS NOT NULL)
    ),
    CONSTRAINT valid_registered_by CHECK (
        registered_by_user_id IS NOT NULL OR registered_by_broker_id IS NOT NULL
    )
);

CREATE INDEX idx_ownership_hash ON content_ownership(content_hash);
CREATE INDEX idx_ownership_owner_user ON content_ownership(owner_user_id);
CREATE INDEX idx_ownership_owner_federated ON content_ownership(owner_federated_id);
CREATE INDEX idx_ownership_registered_broker ON content_ownership(registered_by_broker_id);
CREATE INDEX idx_ownership_disputed ON content_ownership(disputed);

COMMENT ON TABLE content_ownership IS 'Tracks current ownership and registration source for all content';

-- Transfer history (immutable audit log)
CREATE TABLE IF NOT EXISTS ownership_transfers (
    id SERIAL PRIMARY KEY,
    content_hash VARCHAR(64) NOT NULL,
    transfer_number SERIAL,  -- Sequential transfer counter per content
    
    -- From
    from_type VARCHAR(20) NOT NULL,
    from_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    from_federated_id INTEGER REFERENCES federated_identities(id) ON DELETE SET NULL,
    from_blockchain_address VARCHAR(255),
    from_identity VARCHAR(512),  -- Cached for immutability
    
    -- To
    to_type VARCHAR(20) NOT NULL,
    to_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    to_federated_id INTEGER REFERENCES federated_identities(id) ON DELETE SET NULL,
    to_blockchain_address VARCHAR(255),
    to_identity VARCHAR(512),  -- Cached for immutability
    
    -- Transfer details
    transfer_type VARCHAR(50),  -- 'user_initiated', 'broker_migration', 'claim_direct', 'dispute_resolution'
    transfer_reason TEXT,
    
    -- Authorization
    authorized_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    authorized_by_broker_id INTEGER REFERENCES brokers(id) ON DELETE SET NULL,
    signature TEXT,  -- Cryptographic proof
    
    -- Blockchain
    blockchain_tx VARCHAR(255),
    blockchain_height BIGINT,
    
    -- Metadata
    metadata JSONB,
    
    -- Audit
    transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    
    UNIQUE(content_hash, transfer_number)
);

CREATE INDEX idx_transfers_hash ON ownership_transfers(content_hash);
CREATE INDEX idx_transfers_from_user ON ownership_transfers(from_user_id);
CREATE INDEX idx_transfers_to_user ON ownership_transfers(to_user_id);
CREATE INDEX idx_transfers_from_federated ON ownership_transfers(from_federated_id);
CREATE INDEX idx_transfers_to_federated ON ownership_transfers(to_federated_id);
CREATE INDEX idx_transfers_date ON ownership_transfers(transferred_at DESC);

COMMENT ON TABLE ownership_transfers IS 'Immutable audit log of all ownership transfers';

-- ============================================================================
-- BROKER ACTIVITY & RATE LIMITING
-- ============================================================================

-- Broker API usage tracking
CREATE TABLE IF NOT EXISTS broker_api_usage (
    id SERIAL PRIMARY KEY,
    broker_id INTEGER REFERENCES brokers(id) ON DELETE CASCADE,
    api_key_id INTEGER REFERENCES broker_api_keys(id) ON DELETE SET NULL,
    
    -- Request details
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    
    -- Content
    content_hash VARCHAR(64),
    federated_identity VARCHAR(512),
    
    -- Result
    success BOOLEAN,
    error_message TEXT,
    
    -- Rate limiting
    rate_limit_bucket VARCHAR(50),  -- 'hourly', 'daily'
    rate_limit_remaining INTEGER,
    
    -- Security
    ip_address INET,
    user_agent TEXT,
    signature_valid BOOLEAN,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_broker_api_usage_broker ON broker_api_usage(broker_id);
CREATE INDEX idx_broker_api_usage_key ON broker_api_usage(api_key_id);
CREATE INDEX idx_broker_api_usage_endpoint ON broker_api_usage(endpoint);
CREATE INDEX idx_broker_api_usage_created ON broker_api_usage(created_at DESC);
CREATE INDEX idx_broker_api_usage_ip ON broker_api_usage(ip_address);

-- Broker rate limit tracking (in-memory would be better, but DB for persistence)
CREATE TABLE IF NOT EXISTS broker_rate_limits (
    broker_id INTEGER REFERENCES brokers(id) ON DELETE CASCADE,
    time_bucket TIMESTAMP NOT NULL,  -- Truncated to hour/day
    bucket_type VARCHAR(10) NOT NULL,  -- 'hour' or 'day'
    request_count INTEGER DEFAULT 1,
    registration_count INTEGER DEFAULT 0,
    last_request_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (broker_id, time_bucket, bucket_type)
);

CREATE INDEX idx_rate_limits_broker ON broker_rate_limits(broker_id);
CREATE INDEX idx_rate_limits_bucket ON broker_rate_limits(time_bucket DESC);

-- ============================================================================
-- SECURITY & AUDIT
-- ============================================================================

-- Broker security events (suspicious activity)
CREATE TABLE IF NOT EXISTS broker_security_events (
    id SERIAL PRIMARY KEY,
    broker_id INTEGER REFERENCES brokers(id) ON DELETE CASCADE,
    
    -- Event details
    event_type VARCHAR(50) NOT NULL,  -- 'invalid_signature', 'rate_limit_exceeded', 'unauthorized_domain', etc.
    severity VARCHAR(20) NOT NULL,    -- 'low', 'medium', 'high', 'critical'
    description TEXT,
    
    -- Context
    ip_address INET,
    endpoint VARCHAR(255),
    request_data JSONB,
    
    -- Response
    auto_action VARCHAR(50),  -- 'none', 'rate_limit', 'temp_suspend', 'revoke'
    manual_review_required BOOLEAN DEFAULT FALSE,
    reviewed_at TIMESTAMP,
    reviewed_by INTEGER REFERENCES users(id),
    resolution TEXT,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_security_events_broker ON broker_security_events(broker_id);
CREATE INDEX idx_security_events_type ON broker_security_events(event_type);
CREATE INDEX idx_security_events_severity ON broker_security_events(severity);
CREATE INDEX idx_security_events_created ON broker_security_events(created_at DESC);
CREATE INDEX idx_security_events_review ON broker_security_events(manual_review_required);

COMMENT ON TABLE broker_security_events IS 'Security incidents and suspicious activity from brokers';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update updated_at timestamps
CREATE TRIGGER update_brokers_updated_at 
    BEFORE UPDATE ON brokers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_federated_identities_updated_at 
    BEFORE UPDATE ON federated_identities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_ownership_updated_at 
    BEFORE UPDATE ON content_ownership
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Broker health dashboard
CREATE OR REPLACE VIEW broker_health AS
SELECT 
    b.id,
    b.domain,
    b.name,
    b.certification_tier,
    b.certification_status,
    b.enabled,
    COUNT(DISTINCT fi.id) as total_identities,
    COUNT(DISTINCT co.id) as total_registrations,
    COUNT(CASE WHEN bau.created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as requests_24h,
    COUNT(CASE WHEN bau.created_at > NOW() - INTERVAL '1 hour' THEN 1 END) as requests_1h,
    MAX(bau.created_at) as last_request,
    COUNT(CASE WHEN bse.severity IN ('high', 'critical') THEN 1 END) as critical_events_30d
FROM brokers b
LEFT JOIN federated_identities fi ON b.id = fi.broker_id
LEFT JOIN content_ownership co ON co.registered_by_broker_id = b.id
LEFT JOIN broker_api_usage bau ON b.id = bau.broker_id
LEFT JOIN broker_security_events bse ON b.id = bse.broker_id 
    AND bse.created_at > NOW() - INTERVAL '30 days'
GROUP BY b.id, b.domain, b.name, b.certification_tier, b.certification_status, b.enabled;

-- Federated identity summary
CREATE OR REPLACE VIEW federated_identity_stats AS
SELECT 
    domain,
    COUNT(*) as total_identities,
    COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as claimed_identities,
    COUNT(CASE WHEN verified THEN 1 END) as verified_identities,
    COUNT(CASE WHEN active THEN 1 END) as active_identities
FROM federated_identities
GROUP BY domain;

-- Transfer audit trail (per content)
CREATE OR REPLACE VIEW content_transfer_history AS
SELECT 
    ot.content_hash,
    ot.transfer_number,
    ot.from_identity,
    ot.to_identity,
    ot.transfer_type,
    ot.transferred_at,
    b.domain as authorized_by_broker,
    u.email as authorized_by_user
FROM ownership_transfers ot
LEFT JOIN brokers b ON ot.authorized_by_broker_id = b.id
LEFT JOIN users u ON ot.authorized_by_user_id = u.id
ORDER BY ot.content_hash, ot.transfer_number;

-- ============================================================================
-- INITIAL DATA & PERMISSIONS
-- ============================================================================

-- Grant permissions (adjust based on your database user)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO daon_api;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO daon_api;

COMMENT ON SCHEMA public IS 'DAON Broker System - Migration 002 - Enables platform integrations';
