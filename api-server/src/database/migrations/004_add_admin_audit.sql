-- Admin Security and Audit Logging
-- Version: 1.0
-- Date: January 2026

-- ============================================================================
-- ADMIN SECURITY EVENTS
-- ============================================================================

-- Logs security events related to admin operations
CREATE TABLE IF NOT EXISTS admin_security_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    
    -- Event details
    event_type VARCHAR(50) NOT NULL,  -- 'unauthorized_admin_access', 'admin_login', 'suspicious_activity'
    severity VARCHAR(20) NOT NULL,     -- 'low', 'medium', 'high', 'critical'
    description TEXT NOT NULL,
    
    -- Context
    ip_address INET,
    endpoint VARCHAR(255),
    user_agent TEXT,
    
    -- Metadata
    metadata JSONB,
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_severity CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX idx_admin_security_events_user ON admin_security_events(user_id);
CREATE INDEX idx_admin_security_events_type ON admin_security_events(event_type);
CREATE INDEX idx_admin_security_events_severity ON admin_security_events(severity);
CREATE INDEX idx_admin_security_events_created ON admin_security_events(created_at DESC);

COMMENT ON TABLE admin_security_events IS 'Security events and anomalies related to admin operations';

-- ============================================================================
-- ADMIN AUDIT LOG
-- ============================================================================

-- Comprehensive audit trail of all admin actions
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    
    -- Action details
    action_type VARCHAR(50) NOT NULL,    -- 'create', 'update', 'delete', 'approve', 'suspend'
    resource_type VARCHAR(50) NOT NULL,  -- 'broker', 'user', 'certificate', 'webhook'
    resource_id VARCHAR(255) NOT NULL,   -- ID of affected resource
    
    -- Details
    description TEXT,
    details JSONB,  -- Full details of what changed
    
    -- Context
    ip_address INET,
    user_agent TEXT,
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_audit_log_user ON admin_audit_log(user_id);
CREATE INDEX idx_admin_audit_log_action ON admin_audit_log(action_type);
CREATE INDEX idx_admin_audit_log_resource ON admin_audit_log(resource_type, resource_id);
CREATE INDEX idx_admin_audit_log_created ON admin_audit_log(created_at DESC);

COMMENT ON TABLE admin_audit_log IS 'Complete audit trail of all administrative actions';
COMMENT ON COLUMN admin_audit_log.details IS 'JSON with before/after values, full request data, etc.';

-- ============================================================================
-- EXAMPLE AUDIT LOG ENTRY
-- ============================================================================

-- INSERT INTO admin_audit_log (
--   user_id, action_type, resource_type, resource_id,
--   description, details, ip_address
-- ) VALUES (
--   1, 
--   'create',
--   'broker',
--   '42',
--   'Registered new broker: ao3.org',
--   '{"domain": "ao3.org", "tier": "standard", "contact": "admin@ao3.org"}'::jsonb,
--   '192.168.1.1'
-- );
