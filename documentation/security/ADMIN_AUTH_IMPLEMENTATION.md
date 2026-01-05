# Admin Authentication Implementation

> **Status:** Implemented  
> **Priority:** Critical (Pre-Launch Blocker)  
> **Completed:** January 2026

## Overview

This document describes the implementation of admin authentication for the broker registration endpoint, addressing a critical security vulnerability identified during the security review.

## Vulnerability Fixed

**Issue:** Anyone could register a new broker without authentication  
**File:** `api-server/src/server.ts:897-900`  
**Risk Level:** Critical  
**Impact:** Malicious actors could register fake brokers to submit fraudulent content

## Solution Implemented

### 1. Admin Authentication Middleware

**File:** `api-server/src/auth/admin-middleware.ts`

```typescript
export function requireAdminAuth(db: DatabaseClient): RequestHandler {
  // 1. Verify JWT token
  // 2. Check user exists in database
  // 3. Verify user is admin (by ID or email domain)
  // 4. Log security events for unauthorized attempts
  // 5. Attach req.userId and req.adminUser
}
```

**Admin Verification Logic:**

Users are considered admins if:
- User ID is in `ADMIN_USER_IDS` environment variable (comma-separated)
- OR email domain is in `ADMIN_EMAIL_DOMAINS` environment variable

**Example Configuration:**
```bash
ADMIN_USER_IDS=1,5,42
ADMIN_EMAIL_DOMAINS=daon.io,admin.daon.io
```

### 2. Database Schema for Audit Logging

**File:** `api-server/src/database/migrations/004_add_admin_audit.sql`

Two new tables:

#### admin_security_events
Logs security events like unauthorized access attempts:
```sql
CREATE TABLE admin_security_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    event_type VARCHAR(50),  -- 'unauthorized_admin_access', etc.
    severity VARCHAR(20),     -- 'low', 'medium', 'high', 'critical'
    description TEXT,
    ip_address INET,
    endpoint VARCHAR(255),
    created_at TIMESTAMP
);
```

#### admin_audit_log
Complete audit trail of all admin actions:
```sql
CREATE TABLE admin_audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action_type VARCHAR(50),    -- 'create', 'update', 'delete'
    resource_type VARCHAR(50),  -- 'broker', 'user', 'certificate'
    resource_id VARCHAR(255),
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP
);
```

### 3. Updated Broker Registration Endpoint

**File:** `api-server/src/server.ts:899`

**Before (Vulnerable):**
```typescript
app.post('/api/v1/broker/register',
  // TODO: Add admin authentication middleware  ← NO AUTH!
  [...validators],
  async (req, res) => { ... }
);
```

**After (Secure):**
```typescript
app.post('/api/v1/broker/register',
  requireAdminAuth(dbClient),  ← ADMIN AUTH REQUIRED
  [...validators],
  async (req, res) => {
    // ... register broker ...
    
    // Log admin action for audit trail
    await logAdminAction(dbClient, {
      user_id: req.userId!,
      action_type: 'create',
      resource_type: 'broker',
      resource_id: newBroker.id,
      details: { domain, name, certification_tier, ... },
      ip_address: req.ip
    });
    
    res.status(201).json({ ... });
  }
);
```

### 4. Comprehensive Test Coverage

**Files:**
- `api-server/src/test/admin-auth.test.ts` - Unit tests for middleware
- `api-server/src/test/broker-registration-admin.test.ts` - Integration tests

**Test Coverage:**
- ✅ Reject requests without Authorization header
- ✅ Reject invalid JWT tokens
- ✅ Reject expired tokens
- ✅ Reject tokens for non-existent users
- ✅ Reject non-admin users
- ✅ Accept admin users by ID
- ✅ Accept admin users by email domain
- ✅ Log security events for unauthorized attempts
- ✅ Log admin actions in audit trail

## Configuration

### Environment Variables

```bash
# Admin User Configuration (required)
ADMIN_USER_IDS=1,5,42              # Comma-separated user IDs
ADMIN_EMAIL_DOMAINS=daon.io        # Comma-separated email domains

# JWT Configuration (existing)
JWT_SECRET=your-secret-key-min-32-characters
ACCESS_TOKEN_LIFETIME=900          # 15 minutes
```

### Database Migration

Run the new migration to create audit tables:

```bash
# From api-server directory
npm run migrate

# Or manually:
psql -U postgres -d daon -f src/database/migrations/004_add_admin_audit.sql
```

## Usage

### For Admins

1. **Log in** to get JWT access token:
   ```bash
   curl -X POST https://api.daon.io/api/v1/auth/magic-link \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@daon.io"}'
   
   # Click link in email, get access token
   ```

2. **Register a broker** with admin token:
   ```bash
   curl -X POST https://api.daon.io/api/v1/broker/register \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "domain": "ao3.org",
       "name": "Archive of Our Own",
       "certification_tier": "standard",
       "contact_email": "admin@ao3.org"
     }'
   ```

### For Non-Admins

Attempting to register a broker without admin privileges will result in:

```json
{
  "success": false,
  "error": "Forbidden",
  "code": "ADMIN_INSUFFICIENT_PERMISSIONS",
  "message": "Admin privileges required for this operation"
}
```

This attempt will be logged in `admin_security_events` with severity `high`.

## Security Considerations

### Current Implementation (Temporary)

The current implementation uses environment variables to define admins. This is suitable for:
- MVP/early launch with small admin team
- Development and testing
- Single-server deployments

**Limitations:**
- Requires server restart to add/remove admins
- No granular permissions (all admins have full access)
- Not suitable for large teams

### Future Enhancements (Post-Launch)

For production scale, implement:

1. **Database-backed roles:**
   ```sql
   ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user';
   -- role: 'user', 'admin', 'superadmin'
   ```

2. **Role-Based Access Control (RBAC):**
   ```sql
   CREATE TABLE roles (
     id SERIAL PRIMARY KEY,
     name VARCHAR(50) UNIQUE,
     permissions JSONB
   );
   
   CREATE TABLE user_roles (
     user_id INTEGER REFERENCES users(id),
     role_id INTEGER REFERENCES roles(id)
   );
   ```

3. **Permission scopes:**
   - `admin:brokers:create`
   - `admin:brokers:update`
   - `admin:brokers:delete`
   - `admin:users:manage`
   - `admin:certificates:issue`

4. **Admin management UI:**
   - Web dashboard for managing admins
   - Audit log viewer
   - Real-time security alerts

## Audit and Monitoring

### Audit Log Queries

**View recent admin actions:**
```sql
SELECT 
  aal.created_at,
  u.email as admin_email,
  aal.action_type,
  aal.resource_type,
  aal.resource_id,
  aal.details
FROM admin_audit_log aal
JOIN users u ON aal.user_id = u.id
ORDER BY aal.created_at DESC
LIMIT 100;
```

**View security events:**
```sql
SELECT 
  ase.created_at,
  u.email,
  ase.event_type,
  ase.severity,
  ase.description,
  ase.ip_address,
  ase.endpoint
FROM admin_security_events ase
LEFT JOIN users u ON ase.user_id = u.id
WHERE ase.severity IN ('high', 'critical')
ORDER BY ase.created_at DESC;
```

**Track broker registrations:**
```sql
SELECT 
  aal.created_at,
  u.email as registered_by,
  aal.details->>'domain' as broker_domain,
  aal.details->>'certification_tier' as tier,
  aal.ip_address
FROM admin_audit_log aal
JOIN users u ON aal.user_id = u.id
WHERE aal.action_type = 'create'
  AND aal.resource_type = 'broker'
ORDER BY aal.created_at DESC;
```

## Testing

### Manual Testing

1. **Test unauthorized access:**
   ```bash
   curl -X POST http://localhost:3000/api/v1/broker/register \
     -H "Content-Type: application/json" \
     -d '{"domain":"test.com","name":"Test","certification_tier":"community","contact_email":"test@test.com"}'
   
   # Expected: 401 Unauthorized
   ```

2. **Test with non-admin user:**
   ```bash
   # Get token for regular user (not in ADMIN_USER_IDS)
   TOKEN=...
   
   curl -X POST http://localhost:3000/api/v1/broker/register \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"domain":"test.com","name":"Test","certification_tier":"community","contact_email":"test@test.com"}'
   
   # Expected: 403 Forbidden
   ```

3. **Test with admin user:**
   ```bash
   # Get token for admin user (ID 1)
   export ADMIN_USER_IDS=1
   TOKEN=...
   
   curl -X POST http://localhost:3000/api/v1/broker/register \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"domain":"ao3.org","name":"AO3","certification_tier":"standard","contact_email":"admin@ao3.org"}'
   
   # Expected: 201 Created
   ```

### Automated Testing

Run the test suite:

```bash
npm test -- src/test/admin-auth.test.ts
npm test -- src/test/broker-registration-admin.test.ts
```

## Migration Plan

### Pre-Launch

1. ✅ Implement admin middleware
2. ✅ Add audit logging tables
3. ✅ Update broker registration endpoint
4. ✅ Write comprehensive tests
5. ✅ Document configuration
6. Configure initial admin users
7. Run migration on production database
8. Deploy to staging for testing
9. Security review and approval
10. Deploy to production

### Post-Launch

Monitor audit logs and security events for:
- Unauthorized access attempts
- Unusual admin activity patterns
- Failed authentication attempts

## References

- [POST_LAUNCH_SECURITY_ROADMAP.md](./POST_LAUNCH_SECURITY_ROADMAP.md) - Full security roadmap
- [PRE_LAUNCH_CHECKLIST.md](./PRE_LAUNCH_CHECKLIST.md) - Launch requirements
- [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) - Complete security audit

---

**Document History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-05 | Security Team | Initial implementation |
