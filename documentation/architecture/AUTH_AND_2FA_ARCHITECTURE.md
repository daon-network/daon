# DAON Authentication & 2FA Architecture

**Status:** APPROVED  
**Date:** December 2, 2025  
**Reviewed By:** Architecture Review (Opus)  
**Purpose:** Complete authentication strategy with mandatory 2FA, refresh tokens, and device trust

---

## Executive Summary

DAON uses a **refresh token + device trust** architecture to provide:
- **Mandatory 2FA** for all users
- **Trusted devices** that skip 2FA for 30 days (like GitHub, banks)
- **Short-lived access tokens** (15 min) for API security
- **Long-lived refresh tokens** (30 days) stored in DB and revocable
- **Multi-session support** for users with multiple identities (email, Discord, Google)

**Key Decision:** 2FA is required **only on initial login per device**, NOT on every action or account switch.

---

## Token Architecture

### Three Token Types

| Token | Lifetime | Storage | Purpose | Revocable? |
|-------|----------|---------|---------|------------|
| **Access Token** | 15 minutes | Memory only | Authorizes API requests | No (short-lived) |
| **Refresh Token** | 30 days | localStorage + DB | Gets new access tokens | Yes (DB-backed) |
| **Device Trust** | 30 days | DB only | Skips 2FA on trusted devices | Yes (DB-backed) |

### Access Token (JWT, Stateless)

```json
{
  "user_id": 42,
  "type": "access",
  "iat": 1733155200,
  "exp": 1733156100
}
```

**Properties:**
- 15 minute expiration (configurable: 5-60 min range)
- Stored in memory only (never localStorage/cookies)
- Standard JWT signed with HS256
- Contains minimal claims (just user_id)
- Used in `Authorization: Bearer <token>` header

**Why 15 minutes?**
- Short enough: Limits damage if stolen
- Long enough: Reduces refresh frequency
- Transparent: Frontend auto-refreshes before expiry
- Configurable: Can be 30 seconds if we want, refresh is transparent

### Refresh Token (DB-Backed, Revocable)

```typescript
// Database record
{
  token: "crypto.randomBytes(32).toString('hex')", // 64 chars
  user_id: 42,
  device_fingerprint: "abc123def456",
  device_info: {
    user_agent: "Mozilla/5.0...",
    ip: "192.168.1.1",
    screen: "1920x1080",
    timezone: "America/Los_Angeles"
  },
  created_at: "2025-12-02T12:00:00Z",
  expires_at: "2026-01-02T12:00:00Z", // 30 days
  last_used_at: "2025-12-02T12:15:00Z",
  revoked_at: null
}
```

**Properties:**
- 30 day expiration (configurable: 7-90 day range)
- Stored in localStorage on client
- Stored in PostgreSQL on server
- Tied to device fingerprint
- Can be revoked via API or user settings
- Rotated on each use (optional security enhancement)

**Why localStorage not cookies?**
- Must support mobile apps (iOS Shortcut, future mobile app)
- localStorage works consistently across web + mobile WebView
- httpOnly cookies don't work in mobile app contexts
- We mitigate XSS risk with CSP headers and input sanitization

### Device Trust (DB-Backed)

```typescript
// Database record
{
  user_id: 42,
  device_fingerprint: "abc123def456",
  device_name: "Chrome on MacBook Pro", // User-editable
  device_info: {
    user_agent: "Mozilla/5.0...",
    ip: "192.168.1.1",
    location: "San Francisco, CA"
  },
  trusted_at: "2025-12-02T12:00:00Z",
  trusted_until: "2026-01-02T12:00:00Z", // 30 days
  last_used_at: "2025-12-02T12:15:00Z",
  revoked_at: null
}
```

**Properties:**
- 30 day trust period
- User can see all trusted devices in settings
- User can revoke trust at any time
- Revocation requires 2FA code
- No token stored on client (server-side check only)

---

## Device Fingerprinting

**Library:** `@fingerprintjs/fingerprintjs` (open source, privacy-friendly)

**Fingerprint Components:**
- Browser user agent
- Screen resolution
- Timezone
- Language preferences
- Platform
- Canvas fingerprint (if available)
- WebGL fingerprint (if available)

**Generated Fingerprint Example:**
```
"a1b2c3d4e5f6g7h8"  // Consistent across sessions on same device
```

**Privacy Note:**
- Fingerprint used only for security (device recognition)
- Not used for tracking or analytics
- Stored hashed in database
- User can see which devices are trusted
- User can revoke any device

---

## Authentication Flows

### Flow 1: New User, New Device (Full Flow)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User visits protect.daon.network                         │
│ 2. Clicks "Sign in with Email"                              │
│ 3. Enters email: fanficauthor@gmail.com                     │
│ 4. POST /api/v1/auth/magic-link                             │
│    Response: { sent: true }                                 │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. User receives email with magic link                      │
│ 6. Clicks link: /auth/verify?token=abc123                   │
│ 7. Frontend calls GET /api/v1/auth/verify?token=abc123      │
│ 8. Backend:                                                  │
│    a. Verifies token (valid, not expired, not used)         │
│    b. Generates device fingerprint from request             │
│    c. Checks if device trusted for this user                │
│    d. Result: NO (new user, new device)                     │
│ 9. Backend creates temporary session:                       │
│    { session_id: "temp_xyz", expires_in: 300 }             │
│ 10. Response: { requires_2fa: true, session_id: "temp_xyz" }│
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 11. Frontend redirects to /auth/2fa-setup                   │
│ 12. User sees:                                               │
│     - QR code for Google Authenticator                      │
│     - Manual setup key (if QR doesn't work)                 │
│     - Instructions                                           │
│ 13. User scans QR with authenticator app                    │
│ 14. User enters test code to verify setup                   │
│ 15. POST /api/v1/auth/2fa/verify-setup                      │
│     Body: { session_id: "temp_xyz", code: "123456" }       │
│ 16. Backend:                                                 │
│     a. Verifies TOTP code is correct                        │
│     b. Enables 2FA for user (stores totp_secret)            │
│     c. Generates 10 backup codes                            │
│     d. Issues tokens: access + refresh                      │
│     e. Marks device as trusted (30 days)                    │
│ 17. Response:                                                │
│     {                                                        │
│       access_token: "eyJhbGc...",                           │
│       refresh_token: "xyz789...",                           │
│       expires_in: 900,                                       │
│       backup_codes: ["A1B2-C3D4", ...],                     │
│       user: { id, email, username }                         │
│     }                                                        │
│ 18. Frontend:                                                │
│     a. Shows backup codes (MUST download/save)              │
│     b. Stores refresh_token in localStorage                 │
│     c. Stores access_token in memory                        │
│     d. Sets up auto-refresh timer (14 min)                  │
│ 19. Redirects to /dashboard                                 │
└─────────────────────────────────────────────────────────────┘

Total time: ~2-3 minutes (including reading instructions)
User Experience: One-time setup, clear instructions
```

### Flow 2: Existing User, Trusted Device (Fast Path)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User visits protect.daon.network                         │
│ 2. Clicks "Sign in with Email"                              │
│ 3. Enters email: fanficauthor@gmail.com                     │
│ 4. Receives magic link, clicks                              │
│ 5. GET /api/v1/auth/verify?token=abc123                     │
│ 6. Backend:                                                  │
│    a. Verifies token                                         │
│    b. Generates device fingerprint                          │
│    c. Checks device trust:                                   │
│       SELECT * FROM trusted_devices                         │
│       WHERE user_id = 42                                     │
│       AND device_fingerprint = 'abc123'                     │
│       AND trusted_until > NOW()                             │
│       AND revoked_at IS NULL                                │
│    d. Result: TRUSTED (logged in 5 days ago)                │
│    e. Issues tokens: access + refresh                       │
│    f. Updates last_used_at on trusted device                │
│ 7. Response:                                                 │
│    {                                                         │
│      access_token: "eyJhbGc...",                            │
│      refresh_token: "xyz789...",                            │
│      expires_in: 900,                                        │
│      requires_2fa: false,                                    │
│      user: { id, email, username }                          │
│    }                                                         │
│ 8. Frontend stores tokens, redirects to /dashboard          │
└─────────────────────────────────────────────────────────────┘

Total time: ~5-10 seconds
User Experience: Seamless, no 2FA prompt
```

### Flow 3: Existing User, New Device (2FA Required)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User on new laptop, visits protect.daon.network          │
│ 2. Signs in with magic link                                 │
│ 3. Backend:                                                  │
│    - Device fingerprint: def789 (different from trusted)    │
│    - Device trust check: NO MATCH                           │
│    - User has 2FA enabled: YES                              │
│    - Requires 2FA: YES                                       │
│ 4. Response: { requires_2fa: true, session_id: "temp_abc" } │
│ 5. Frontend shows 2FA modal (NOT setup, just code entry)    │
│ 6. User enters TOTP code from phone                         │
│ 7. POST /api/v1/auth/2fa/complete                           │
│    Body: {                                                   │
│      session_id: "temp_abc",                                │
│      code: "123456",                                         │
│      device_info: { user_agent, screen, timezone },         │
│      trust_device: true  // User chooses                    │
│    }                                                         │
│ 8. Backend:                                                  │
│    a. Verifies TOTP code                                    │
│    b. Issues tokens                                          │
│    c. If trust_device=true: creates trusted_devices entry   │
│ 9. Response: { access_token, refresh_token, ... }           │
│ 10. Frontend stores tokens, redirects to /dashboard         │
└─────────────────────────────────────────────────────────────┘

Total time: ~15-20 seconds
User Experience: Quick 2FA check, optional device trust
```

### Flow 4: Token Refresh (Transparent)

```
┌─────────────────────────────────────────────────────────────┐
│ AUTOMATIC PROCESS (User sees nothing)                       │
│                                                              │
│ 1. Access token issued at 12:00 PM, expires at 12:15 PM    │
│ 2. Frontend sets timer to refresh at 12:14 PM (1 min early)│
│ 3. At 12:14 PM:                                             │
│    POST /api/v1/auth/refresh                                │
│    Body: { refresh_token: "xyz789..." }                    │
│ 4. Backend:                                                  │
│    a. Validates refresh token (exists, not expired/revoked) │
│    b. Checks device fingerprint matches original            │
│    c. Checks device trust (still valid?)                    │
│    d. If all valid: issue new access token                  │
│    e. Optionally: rotate refresh token (issue new one)      │
│    f. Update last_used_at                                   │
│ 5. Response: { access_token: "new_token...", expires_in: 900 }│
│ 6. Frontend:                                                 │
│    a. Replaces access token in memory                       │
│    b. Sets new refresh timer for 12:29 PM                   │
│    c. Continues making API requests (no interruption)       │
└─────────────────────────────────────────────────────────────┘

Frequency: Every 15 minutes
User Experience: Completely transparent, zero interruption
Server Load: Minimal (simple DB lookup + JWT sign)
```

### Flow 5: Device Trust Expired (Re-verify)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User last logged in 31 days ago                          │
│ 2. Device trust expired (30 day limit)                      │
│ 3. User visits site, has refresh token in localStorage      │
│ 4. Frontend tries: POST /api/v1/auth/refresh                │
│ 5. Backend:                                                  │
│    a. Refresh token valid: YES                              │
│    b. Device trust valid: NO (expired)                      │
│ 6. Response: { requires_2fa: true, session_id: "temp_xyz" } │
│ 7. Frontend shows 2FA modal                                 │
│ 8. User enters TOTP code                                    │
│ 9. POST /api/v1/auth/2fa/complete                           │
│ 10. Backend re-verifies, extends device trust another 30 days│
│ 11. Response: { access_token, refresh_token }               │
│ 12. User continues (now trusted for another 30 days)        │
└─────────────────────────────────────────────────────────────┘

Frequency: Once per 30 days per device
User Experience: Brief 2FA prompt, then good for another month
```

### Flow 6: Multi-Account Switching

```
┌─────────────────────────────────────────────────────────────┐
│ User has 3 accounts signed in:                              │
│ A. fanficauthor@gmail.com (email) - currently active        │
│ B. artist_persona (Discord) - trusted device                │
│ C. professional_name (Google) - NOT trusted on this device  │
│                                                              │
│ SCENARIO 1: Switch from A → B (both trusted)                │
│ ──────────────────────────────────────────────────────────  │
│ 1. User clicks account switcher dropdown                    │
│ 2. Selects "artist_persona"                                 │
│ 3. Frontend:                                                 │
│    a. Loads refresh_token_123 from localStorage             │
│    b. Calls POST /api/v1/auth/refresh                       │
│    c. Gets new access_token for account B                   │
│    d. Updates active session to B                           │
│    e. Page reloads, now showing B's dashboard               │
│ 4. Time: < 1 second, no 2FA needed                          │
│                                                              │
│ SCENARIO 2: Switch from A → C (C not trusted)               │
│ ──────────────────────────────────────────────────────────  │
│ 1. User selects "professional_name"                         │
│ 2. Frontend tries to refresh                                │
│ 3. Backend: requires_2fa = true (device not trusted for C)  │
│ 4. Frontend shows 2FA modal                                 │
│ 5. User enters TOTP code for account C                      │
│ 6. Backend verifies, issues tokens, trusts device for C     │
│ 7. Frontend switches to account C                           │
│ 8. Time: ~10 seconds (one-time 2FA for this account)        │
│                                                              │
│ Note: Each account has separate device trust!               │
│ - Account A trusted this device 5 days ago                  │
│ - Account B trusted this device 10 days ago                 │
│ - Account C hasn't trusted this device yet                  │
└─────────────────────────────────────────────────────────────┘

User Experience: Fast switching for trusted, one-time 2FA for new
```

---

## Database Schema

### Users Table (Updated)

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    discord_id VARCHAR(100) UNIQUE,
    google_id VARCHAR(100) UNIQUE,
    username VARCHAR(100),
    blockchain_address VARCHAR(255),
    
    -- 2FA fields
    totp_secret VARCHAR(32),              -- Base32 encoded TOTP secret
    totp_enabled BOOLEAN DEFAULT FALSE,
    totp_enabled_at TIMESTAMP,
    backup_codes_hash TEXT,               -- JSON array of bcrypt hashed codes
    
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

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_discord ON users(discord_id);
CREATE INDEX idx_users_google ON users(google_id);
CREATE INDEX idx_users_blockchain_addr ON users(blockchain_address);
```

### Refresh Tokens Table (New)

```sql
CREATE TABLE refresh_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(64) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    
    -- Device tracking
    device_fingerprint VARCHAR(64) NOT NULL,
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
CREATE INDEX idx_refresh_tokens_fingerprint ON refresh_tokens(device_fingerprint);

-- Cleanup job: DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked_at IS NOT NULL;
-- Run daily at 3 AM
```

### Trusted Devices Table (New)

```sql
CREATE TABLE trusted_devices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(64) NOT NULL,
    
    -- User-friendly device info
    device_name VARCHAR(100),  -- User can edit: "My MacBook Pro"
    device_info JSONB,  -- {user_agent, ip, location, screen, timezone}
    
    -- Trust lifecycle
    trusted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    trusted_until TIMESTAMP NOT NULL,  -- trusted_at + 30 days
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP,
    revoke_reason VARCHAR(100),  -- 'user_revoked', 'suspicious_activity', etc.
    
    UNIQUE(user_id, device_fingerprint)
);

CREATE INDEX idx_trusted_devices_user ON trusted_devices(user_id);
CREATE INDEX idx_trusted_devices_fingerprint ON trusted_devices(device_fingerprint);
CREATE INDEX idx_trusted_devices_expires ON trusted_devices(trusted_until);

-- Cleanup job: DELETE FROM trusted_devices WHERE trusted_until < NOW() OR revoked_at IS NOT NULL;
-- Run daily at 3 AM
```

### Magic Links Table (Existing, No Changes)

```sql
CREATE TABLE magic_links (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_magic_links_token ON magic_links(token);
CREATE INDEX idx_magic_links_email ON magic_links(email);
CREATE INDEX idx_magic_links_expires ON magic_links(expires_at);
```

### Activity Log (Existing, Add New Actions)

```sql
-- New activity actions to log:
-- '2fa_setup_started'
-- '2fa_setup_completed'
-- '2fa_verified'
-- '2fa_failed'
-- '2fa_disabled'
-- 'backup_code_used'
-- 'backup_codes_regenerated'
-- 'device_trusted'
-- 'device_trust_revoked'
-- 'refresh_token_issued'
-- 'refresh_token_revoked'
-- 'access_token_refreshed'
```

---

## API Endpoints

### Authentication Endpoints

#### POST /api/v1/auth/magic-link
```typescript
// Request
{
  "email": "user@example.com"
}

// Response: 200 OK
{
  "success": true,
  "message": "Magic link sent! Check your email."
}

// Response: 429 Too Many Requests
{
  "success": false,
  "error": "rate_limit_exceeded",
  "message": "Please wait 30 minutes before requesting another link",
  "retry_after": 1800  // seconds
}
```

**Rate Limiting:** 1 request per email per 30 minutes

---

#### GET /api/v1/auth/verify
```typescript
// Request (query params)
GET /api/v1/auth/verify?token=abc123

// Response: 200 OK (device trusted, no 2FA needed)
{
  "access_token": "eyJhbGc...",
  "refresh_token": "xyz789...",
  "token_type": "Bearer",
  "expires_in": 900,  // seconds (15 min)
  "requires_2fa": false,
  "user": {
    "id": 42,
    "email": "user@example.com",
    "username": "user",
    "totp_enabled": true
  }
}

// Response: 200 OK (device NOT trusted, 2FA required)
{
  "requires_2fa": true,
  "session_id": "temp_xyz789",  // Temporary, expires in 5 min
  "expires_in": 300,
  "user": {
    "id": 42,
    "email": "user@example.com",
    "username": "user",
    "totp_enabled": true  // true if already set up, false if needs setup
  }
}

// Response: 400 Bad Request
{
  "success": false,
  "error": "invalid_token",
  "message": "Magic link is invalid or expired"
}
```

---

#### POST /api/v1/auth/2fa/setup
```typescript
// Request
Headers: Authorization: Bearer <temporary_session_token>
Body: {
  "session_id": "temp_xyz789"
}

// Response: 200 OK
{
  "secret": "JBSWY3DPEHPK3PXP",  // Base32 encoded
  "qr_code": "data:image/png;base64,iVBORw0KG...",
  "manual_entry_key": "JBSW Y3DP EHPK 3PXP",  // Formatted for easier typing
  "issuer": "DAON",
  "account_name": "user@example.com"
}
```

**Frontend:** Display QR code and manual entry instructions

---

#### POST /api/v1/auth/2fa/verify-setup
```typescript
// Request
Headers: Authorization: Bearer <temporary_session_token>
Body: {
  "session_id": "temp_xyz789",
  "code": "123456",
  "device_info": {
    "user_agent": "Mozilla/5.0...",
    "screen": "1920x1080",
    "timezone": "America/Los_Angeles"
  },
  "trust_device": true  // User chooses to trust this device
}

// Response: 200 OK
{
  "access_token": "eyJhbGc...",
  "refresh_token": "xyz789...",
  "token_type": "Bearer",
  "expires_in": 900,
  "backup_codes": [
    "A1B2-C3D4",
    "E5F6-G7H8",
    "I9J0-K1L2",
    "M3N4-O5P6",
    "Q7R8-S9T0",
    "U1V2-W3X4",
    "Y5Z6-A7B8",
    "C9D0-E1F2",
    "G3H4-I5J6",
    "K7L8-M9N0"
  ],
  "user": {
    "id": 42,
    "email": "user@example.com",
    "username": "user",
    "totp_enabled": true
  }
}

// Response: 400 Bad Request
{
  "success": false,
  "error": "invalid_code",
  "message": "Verification code is incorrect"
}
```

**Critical:** Frontend MUST show backup codes and require user to download/save them

---

#### POST /api/v1/auth/2fa/complete
```typescript
// Request (for existing users on new device)
Headers: None (temporary session only)
Body: {
  "session_id": "temp_xyz789",
  "code": "123456",  // TOTP code OR backup code
  "is_backup_code": false,
  "device_info": {
    "user_agent": "Mozilla/5.0...",
    "screen": "1920x1080",
    "timezone": "America/Los_Angeles"
  },
  "trust_device": true
}

// Response: 200 OK
{
  "access_token": "eyJhbGc...",
  "refresh_token": "xyz789...",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": {
    "id": 42,
    "email": "user@example.com",
    "username": "user",
    "totp_enabled": true
  }
}

// Response: 400 Bad Request (wrong code)
{
  "success": false,
  "error": "invalid_code",
  "message": "Verification code is incorrect",
  "attempts_remaining": 4  // Rate limited to 5 attempts per session
}

// Response: 400 Bad Request (backup code already used)
{
  "success": false,
  "error": "backup_code_used",
  "message": "This backup code has already been used"
}
```

**Rate Limiting:** 5 attempts per session_id, then session expires

---

#### POST /api/v1/auth/refresh
```typescript
// Request
Body: {
  "refresh_token": "xyz789..."
}

// Response: 200 OK (device still trusted)
{
  "access_token": "eyJhbGc...",
  "expires_in": 900,
  // Optionally include rotated refresh token:
  "refresh_token": "new_token_abc123"  // If rotation enabled
}

// Response: 401 Unauthorized (device trust expired)
{
  "success": false,
  "error": "device_trust_expired",
  "requires_2fa": true,
  "session_id": "temp_abc456",
  "message": "Please verify your identity to continue"
}

// Response: 401 Unauthorized (refresh token revoked)
{
  "success": false,
  "error": "token_revoked",
  "message": "This session has been revoked. Please sign in again."
}

// Response: 401 Unauthorized (refresh token expired)
{
  "success": false,
  "error": "token_expired",
  "message": "Your session has expired. Please sign in again."
}
```

**Refresh Token Rotation (Optional):**
- If enabled, backend issues new refresh token on each refresh
- Old refresh token is marked as `rotated_from_token`
- Adds security: stolen token can only be used once
- Adds complexity: must handle rotation on client

---

#### POST /api/v1/auth/revoke
```typescript
// Request
Body: {
  "refresh_token": "xyz789..."
}

// Response: 200 OK
{
  "success": true,
  "message": "Session revoked successfully"
}
```

**Use Case:** User logs out of current device

---

#### POST /api/v1/auth/revoke-all
```typescript
// Request
Headers: Authorization: Bearer <access_token>
Body: {
  "code": "123456"  // 2FA required
}

// Response: 200 OK
{
  "success": true,
  "revoked_count": 5,
  "message": "All sessions revoked. You have been signed out everywhere."
}
```

**Use Case:** 
- User suspects account compromise
- User clicks "Sign out everywhere"
- Requires 2FA to prevent attacker from revoking legitimate sessions

---

### 2FA Management Endpoints

#### POST /api/v1/auth/2fa/disable
```typescript
// Request
Headers: Authorization: Bearer <access_token>
Body: {
  "code": "123456"  // Must verify with current TOTP
}

// Response: 200 OK
{
  "success": true,
  "message": "2FA disabled. You can re-enable it anytime in settings."
}

// Response: 400 Bad Request
{
  "success": false,
  "error": "invalid_code",
  "message": "Verification code is incorrect"
}
```

**Security Note:** Disabling 2FA requires 2FA code (prevents attacker from disabling it)

---

#### POST /api/v1/auth/2fa/backup-codes/regenerate
```typescript
// Request
Headers: Authorization: Bearer <access_token>
Body: {
  "code": "123456"  // Must verify with TOTP
}

// Response: 200 OK
{
  "backup_codes": [
    "A1B2-C3D4",
    // ... 10 codes
  ],
  "message": "All previous backup codes have been invalidated"
}
```

**Use Case:**
- User suspects backup codes compromised
- User lost backup codes and wants new ones
- All old codes immediately invalidated

---

### Device Management Endpoints

#### GET /api/v1/auth/devices
```typescript
// Request
Headers: Authorization: Bearer <access_token>

// Response: 200 OK
{
  "devices": [
    {
      "id": 1,
      "name": "Chrome on MacBook Pro",  // User can edit
      "device_info": {
        "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
        "ip": "192.168.1.100",
        "location": "San Francisco, CA",  // From IP geolocation
        "last_used_ip": "192.168.1.100"
      },
      "trusted_at": "2025-12-01T12:00:00Z",
      "trusted_until": "2026-01-01T12:00:00Z",
      "last_used_at": "2025-12-02T14:30:00Z",
      "is_current": true  // This device
    },
    {
      "id": 2,
      "name": "Firefox on iPhone",
      "device_info": {
        "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0...)...",
        "ip": "203.0.113.42",
        "location": "Oakland, CA",
        "last_used_ip": "203.0.113.42"
      },
      "trusted_at": "2025-11-15T09:30:00Z",
      "trusted_until": "2025-12-15T09:30:00Z",
      "last_used_at": "2025-11-20T18:45:00Z",
      "is_current": false
    }
  ]
}
```

---

#### PATCH /api/v1/auth/devices/:id
```typescript
// Request
Headers: Authorization: Bearer <access_token>
Body: {
  "name": "My Work Laptop"
}

// Response: 200 OK
{
  "success": true,
  "device": {
    "id": 1,
    "name": "My Work Laptop",
    // ... rest of device info
  }
}
```

**Use Case:** User wants friendly names for their devices

---

#### DELETE /api/v1/auth/devices/:id
```typescript
// Request
Headers: Authorization: Bearer <access_token>
Body: {
  "code": "123456"  // 2FA required
}

// Response: 200 OK
{
  "success": true,
  "message": "Device trust revoked. Next login will require 2FA."
}

// Response: 400 Bad Request (trying to revoke current device)
{
  "success": false,
  "error": "cannot_revoke_current_device",
  "message": "You cannot revoke your current device. Please use a different device or sign out."
}
```

**Use Case:**
- User lost a device
- User suspects device compromised
- User no longer uses a device

**Security:** Requires 2FA to prevent attacker from revoking legitimate devices

---

## Frontend Implementation

### Token Manager Class

```typescript
// lib/tokenManager.ts
export class TokenManager {
  private accessToken: string | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  
  /**
   * Set access token and schedule auto-refresh
   */
  setAccessToken(token: string, expiresIn: number) {
    this.accessToken = token;
    
    // Clear existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    
    // Schedule refresh 1 minute before expiry
    const refreshIn = Math.max((expiresIn - 60) * 1000, 0);
    this.refreshTimer = setTimeout(() => {
      this.refreshAccessToken();
    }, refreshIn);
  }
  
  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }
  
  /**
   * Store refresh token (per user account)
   */
  setRefreshToken(userId: number, refreshToken: string) {
    localStorage.setItem(`refresh_token_${userId}`, refreshToken);
  }
  
  /**
   * Get refresh token for user
   */
  getRefreshToken(userId: number): string | null {
    return localStorage.getItem(`refresh_token_${userId}`);
  }
  
  /**
   * Automatically refresh access token
   */
  async refreshAccessToken() {
    const currentUser = sessionManager.getActiveSession();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    
    const refreshToken = this.getRefreshToken(currentUser.id);
    if (!refreshToken) {
      router.push('/login');
      return;
    }
    
    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      
      const data = await response.json();
      
      if (data.requires_2fa) {
        // Device trust expired, need 2FA
        const code = await show2FAModal();
        
        const authResponse = await fetch('/api/v1/auth/2fa/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: data.session_id,
            code,
            device_info: await getDeviceInfo(),
            trust_device: true
          })
        });
        
        const authData = await authResponse.json();
        this.setAccessToken(authData.access_token, authData.expires_in);
        
        // Update refresh token if rotated
        if (authData.refresh_token) {
          this.setRefreshToken(currentUser.id, authData.refresh_token);
        }
        
      } else {
        // Got new access token
        this.setAccessToken(data.access_token, data.expires_in);
        
        // Update refresh token if rotated
        if (data.refresh_token) {
          this.setRefreshToken(currentUser.id, data.refresh_token);
        }
      }
      
    } catch (error) {
      console.error('Token refresh failed:', error);
      // Redirect to login
      router.push('/login');
    }
  }
  
  /**
   * Revoke refresh token and clear session
   */
  async logout(userId: number) {
    const refreshToken = this.getRefreshToken(userId);
    
    if (refreshToken) {
      try {
        await fetch('/api/v1/auth/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken })
        });
      } catch (error) {
        console.error('Logout failed:', error);
      }
    }
    
    // Clear tokens
    this.accessToken = null;
    localStorage.removeItem(`refresh_token_${userId}`);
    
    // Clear timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
  
  /**
   * Revoke all sessions (sign out everywhere)
   */
  async logoutEverywhere() {
    const code = await show2FAModal();
    
    try {
      const response = await fetch('/api/v1/auth/revoke-all', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code })
      });
      
      const data = await response.json();
      
      // Clear local state
      this.accessToken = null;
      localStorage.clear();
      
      return data.revoked_count;
      
    } catch (error) {
      console.error('Logout everywhere failed:', error);
      throw error;
    }
  }
}
```

### API Client with Auto-Retry

```typescript
// lib/api.ts
const tokenManager = new TokenManager();

export async function apiRequest(
  endpoint: string, 
  options: RequestInit = {}
): Promise<Response> {
  const accessToken = tokenManager.getAccessToken();
  
  const response = await fetch(`/api/v1${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  // Handle token expiry
  if (response.status === 401) {
    const error = await response.json();
    
    if (error.error === 'token_expired') {
      // Access token expired, try to refresh
      await tokenManager.refreshAccessToken();
      
      // Retry original request with new token
      return apiRequest(endpoint, options);
    }
    
    if (error.error === 'token_revoked') {
      // Session revoked, redirect to login
      router.push('/login?reason=session_revoked');
      throw new Error('Session revoked');
    }
  }
  
  return response;
}
```

### Device Fingerprint Utility

```typescript
// lib/deviceFingerprint.ts
import FingerprintJS from '@fingerprintjs/fingerprintjs';

let fingerprintPromise: Promise<string> | null = null;

/**
 * Get device fingerprint (cached)
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (!fingerprintPromise) {
    fingerprintPromise = (async () => {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      return result.visitorId;
    })();
  }
  
  return fingerprintPromise;
}

/**
 * Get device info for backend
 */
export function getDeviceInfo() {
  return {
    user_agent: navigator.userAgent,
    screen: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    platform: navigator.platform,
    cookie_enabled: navigator.cookieEnabled,
    do_not_track: navigator.doNotTrack
  };
}
```

---

## Security Considerations

### Attack Vectors & Mitigations

| Attack | Risk Level | Mitigation |
|--------|-----------|------------|
| **Stolen Access Token** | LOW | 15 min expiry, can't refresh without refresh token |
| **Stolen Refresh Token** | MEDIUM | Tied to device fingerprint, revocable, rotation |
| **XSS Attack** | MEDIUM | CSP headers, input sanitization, HttpOnly cookies for future |
| **MITM Attack** | LOW | HTTPS only, HSTS headers |
| **Phishing** | MEDIUM | 2FA required, educate users, email warnings on new device |
| **SIM Swap** | N/A | Not using SMS (only TOTP) |
| **Device Theft** | MEDIUM | 30-day trust limit, user can revoke devices remotely |
| **Credential Stuffing** | LOW | Magic link (no passwords), 2FA required |
| **Session Fixation** | LOW | Tokens issued after auth, not before |
| **Token Replay** | LOW | Short-lived tokens, HTTPS only, device fingerprint check |

### Best Practices Implemented

✅ **Principle of Least Privilege:** Access tokens contain minimal claims (just user_id)  
✅ **Defense in Depth:** Multiple layers (access + refresh + device trust + 2FA)  
✅ **Secure by Default:** 2FA mandatory, device trust optional  
✅ **Fail Secure:** Token validation failures → deny access  
✅ **Audit Trail:** All auth events logged in activity_log  
✅ **User Control:** Users can see and revoke all sessions/devices  
✅ **Transparency:** Clear notifications on new device login  
✅ **Recoverability:** Backup codes for lost devices  

---

## Configuration Options

### Tunable Parameters

```typescript
// config/auth.ts
export const AUTH_CONFIG = {
  // Token durations (all in seconds)
  ACCESS_TOKEN_LIFETIME: 900,        // 15 minutes (can be 30s - 1 hour)
  REFRESH_TOKEN_LIFETIME: 2592000,   // 30 days (can be 7-90 days)
  DEVICE_TRUST_LIFETIME: 2592000,    // 30 days (can be 7-90 days)
  MAGIC_LINK_LIFETIME: 1800,         // 30 minutes (can be 15-60 min)
  TEMP_SESSION_LIFETIME: 300,        // 5 minutes (for 2FA flow)
  
  // Rate limits
  MAGIC_LINK_RATE_LIMIT: 1,          // Per 30 min
  MAGIC_LINK_RATE_WINDOW: 1800,      // 30 minutes
  TOTP_VERIFY_RATE_LIMIT: 5,         // Per session
  BACKUP_CODE_VERIFY_RATE_LIMIT: 3,  // Per session
  
  // Security
  ENABLE_REFRESH_TOKEN_ROTATION: false,  // Set true for extra security
  ENABLE_DEVICE_FINGERPRINTING: true,
  REQUIRE_2FA_FOR_ALL_USERS: true,
  DEVICE_TRUST_OPTIONAL: false,      // Always trust on successful 2FA
  
  // TOTP
  TOTP_WINDOW: 1,                    // Accept codes from 1 window before/after
  TOTP_STEP: 30,                     // 30 second code validity
  BACKUP_CODE_COUNT: 10,
  
  // Logging
  LOG_ALL_AUTH_EVENTS: true,
  LOG_FAILED_ATTEMPTS: true,
  LOG_DEVICE_CHANGES: true
};
```

### Environment Variables

```bash
# JWT
JWT_SECRET=your-secret-key-min-32-chars
JWT_ALGORITHM=HS256

# Token Lifetimes (optional, defaults shown)
ACCESS_TOKEN_LIFETIME=900
REFRESH_TOKEN_LIFETIME=2592000
DEVICE_TRUST_LIFETIME=2592000

# 2FA
TOTP_ISSUER=DAON
TOTP_WINDOW=1

# Frontend
FRONTEND_URL=https://protect.daon.network

# Device Fingerprinting
FINGERPRINTJS_API_KEY=optional_for_pro_version

# Email (for magic links)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@daon.network
SMTP_PASS=your-app-password
SMTP_FROM="DAON <noreply@daon.network>"

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/daon_api

# Security
ENABLE_REFRESH_TOKEN_ROTATION=false
REQUIRE_2FA=true
```

---

## Open Questions for Review

### 1. Token Lifetimes

**Current Plan:**
- Access token: 15 minutes
- Refresh token: 30 days
- Device trust: 30 days

**Questions:**
- Should access token be shorter (5 min) or longer (1 hour)?
- Is 30 days reasonable for refresh token, or should it be 7/60/90 days?
- Should device trust match refresh token lifetime, or be independent?

**Consideration:** Since refresh is transparent, access token can be very short (even 5 min). Only downside is more frequent backend calls.

---

### 2. Refresh Token Rotation

**Current Plan:** Optional, disabled by default

**Question:** Enable rotation from day 1 for extra security?

**Pros:**
- Stolen refresh token can only be used once
- Detects token theft (if both tokens used, revoke all)

**Cons:**
- More complex (must handle rotation on every refresh)
- If client loses connection mid-rotation, can get out of sync
- Harder to debug

**Recommendation:** Start disabled, enable in Phase 2 after testing

---

### 3. Storage: localStorage vs Cookies

**Current Plan:** localStorage for refresh tokens (mobile compatibility)

**Questions:**
- Should we use httpOnly cookies on web (more secure)?
- How to handle mobile apps if we use cookies?
- Can we do both (cookies on web, localStorage on mobile)?

**Consideration:** 
- httpOnly cookies = XSS protection
- localStorage = mobile compatibility
- Hybrid approach possible but complex

**Recommendation:** localStorage for MVP (simpler), migrate to cookies in Phase 2 for web

---

### 4. 2FA Setup Timing

**Current Plan:** Required on first content protection

**Question:** Should we require 2FA setup immediately after signup?

**Options:**
- **A.** Immediate (at signup): Maximum security, but friction for new users
- **B.** On first protect (current plan): Less friction, security when it matters
- **C.** Optional initially, required after N protections: Phased approach

**Recommendation:** Current plan (B) - require on first protect. Users trying to protect content are committed, won't abandon due to 2FA.

---

### 5. Backup Codes

**Current Plan:** 10 codes, single-use, must download

**Questions:**
- How to ensure users actually save backup codes?
- Should we email them backup codes?
- Block account access if user loses phone AND backup codes?

**Ideas:**
- Require user to check "I have saved my backup codes" before proceeding
- Show one backup code in verification modal as test
- Provide "recovery email" option if both lost?

**Recommendation:** 
- MUST download before proceeding
- Show warning: "Without these, you may lose access to your account"
- No email recovery (too weak), only support ticket as last resort

---

### 6. Multi-Account 2FA

**Current Plan:** Each account has separate 2FA setup

**Question:** Should multiple accounts share one 2FA setup?

**Scenario:**
- User has email + Discord accounts
- Both use same TOTP secret
- One authenticator app entry covers both

**Pros:**
- Simpler for user (one app entry)
- Easier to manage

**Cons:**
- Links accounts together (defeats multi-identity purpose)
- If one account compromised, both are

**Recommendation:** Keep separate. Users want multiple identities isolated.

---

### 7. Device Naming

**Current Plan:** Auto-generate from user agent, user can edit

**Question:** Should we require user to name device on first login?

**Options:**
- **A.** Auto-generate, user can edit later (current)
- **B.** Prompt user to name device after 2FA
- **C.** Use generic names ("Device 1", "Device 2")

**Recommendation:** Current plan (A). Most users won't care, power users can edit.

---

### 8. Session Limits

**Question:** Should we limit number of active sessions/devices per user?

**Options:**
- **A.** Unlimited (current)
- **B.** Limit to 5 devices
- **C.** Limit to 10 devices
- **D.** Warn user at 5, hard limit at 10

**Consideration:** 
- Real users might have: laptop, desktop, phone, tablet, work computer = 5 devices
- Attackers could create many sessions if unlimited

**Recommendation:** Soft warning at 5, hard limit at 10. Show in device management UI.

---

### 9. Token Theft Detection

**Question:** Should we detect suspicious patterns and auto-revoke?

**Patterns:**
- Refresh token used from different IP than original
- Refresh token used from different country
- Multiple failed 2FA attempts
- Two refresh tokens used simultaneously (if rotation enabled)

**Action:**
- Email user warning
- Require 2FA re-verification
- Auto-revoke suspicious tokens

**Recommendation:** Phase 2 feature. Start simple, add detection later.

---

### 10. Mobile App Support

**Question:** How will iOS Shortcut / future mobile app authenticate?

**Options:**
- **A.** Same as web (magic link in email, open in browser)
- **B.** Custom URL scheme (daon://auth?token=...)
- **C.** Native OAuth flow
- **D.** QR code scan from web to mobile

**Consideration:** iOS Shortcuts can:
- Open URLs
- Send HTTP requests
- Store data in iCloud
- Show notifications

**Recommendation:** 
- MVP: Magic link opens in Safari, stores refresh token in localStorage
- Phase 2: Custom URL scheme to open in Shortcut directly
- Phase 3: Native mobile app with proper OAuth

---

## Implementation Issues (MUST Address)

These issues were identified during architectural review and **MUST be addressed during implementation**:

### Issue 1: Device Fingerprint Stability

**Problem:** FingerprintJS fingerprints can change if user updates browser, clears data, or modifies settings. This could unexpectedly require 2FA.

**Solution:** Add localStorage `device_id` as fallback alongside fingerprint.

```typescript
// lib/deviceFingerprint.ts - UPDATED

const DEVICE_ID_KEY = 'daon_device_id';

export async function getDeviceIdentifier(): Promise<string> {
  // First, check for stable device_id in localStorage
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  
  if (!deviceId) {
    // Generate new device_id on first visit
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  
  // Also get fingerprint for additional verification
  const fingerprint = await getDeviceFingerprint();
  
  // Return composite identifier
  // Backend stores both and matches on EITHER
  return JSON.stringify({
    device_id: deviceId,
    fingerprint: fingerprint
  });
}
```

**Database Change:**
```sql
-- Add device_id column to trusted_devices
ALTER TABLE trusted_devices ADD COLUMN device_id VARCHAR(64);

-- Update unique constraint
ALTER TABLE trusted_devices DROP CONSTRAINT trusted_devices_user_id_device_fingerprint_key;
ALTER TABLE trusted_devices ADD CONSTRAINT trusted_devices_user_device_unique 
  UNIQUE(user_id, device_id);

-- Match on device_id OR fingerprint for trust lookup
```

**Backend Logic:**
```typescript
// Device is trusted if EITHER matches:
// 1. device_id matches (stable across browser updates)
// 2. device_fingerprint matches (backup for new installs)
const trusted = await db.query(`
  SELECT * FROM trusted_devices 
  WHERE user_id = $1 
  AND (device_id = $2 OR device_fingerprint = $3)
  AND trusted_until > NOW()
  AND revoked_at IS NULL
`, [userId, deviceId, fingerprint]);
```

---

### Issue 2: Temporary Sessions Table Missing

**Problem:** The 2FA flow creates `session_id` values but no table is defined to store them. These are referenced in `/api/v1/auth/verify` responses but have no persistence layer.

**Solution:** Add `temp_sessions` table to schema.

```sql
-- Add to schema.sql
CREATE TABLE temp_sessions (
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

-- Cleanup job: DELETE FROM temp_sessions WHERE expires_at < NOW();
-- Run every 5 minutes
```

**Usage:**
```typescript
// When 2FA is required, create temp session
const sessionId = crypto.randomBytes(32).toString('hex');
await db.query(`
  INSERT INTO temp_sessions (session_id, user_id, flow_type, expires_at)
  VALUES ($1, $2, '2fa_verify', NOW() + INTERVAL '5 minutes')
`, [sessionId, userId]);

// Return to frontend
return { requires_2fa: true, session_id: sessionId };

// When 2FA completed, verify and mark complete
const session = await db.query(`
  SELECT * FROM temp_sessions 
  WHERE session_id = $1 
  AND expires_at > NOW() 
  AND completed_at IS NULL
  AND attempts < max_attempts
`, [sessionId]);

if (!session) throw new Error('Invalid or expired session');

// On success
await db.query(`
  UPDATE temp_sessions SET completed_at = NOW() WHERE session_id = $1
`, [sessionId]);
```

---

### Issue 3: Race Condition on Token Refresh

**Problem:** In multi-tab scenarios, multiple tabs could simultaneously detect access token expiry and attempt refresh. Without coordination, this causes issues (especially with rotation enabled).

**Solution:** Add mutex in TokenManager for refresh operations.

```typescript
// lib/tokenManager.ts - ADD THIS

class TokenManager {
  private refreshPromise: Promise<void> | null = null;
  
  async refreshAccessToken() {
    // If already refreshing, wait for existing operation
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    
    // Create mutex
    this.refreshPromise = this._doRefresh();
    
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }
  
  private async _doRefresh() {
    // Actual refresh logic here...
    // Only one tab will execute this at a time
  }
}

// Cross-tab coordination using BroadcastChannel
const refreshChannel = new BroadcastChannel('daon_token_refresh');

refreshChannel.onmessage = (event) => {
  if (event.data.type === 'refreshed') {
    // Another tab refreshed, update our token
    tokenManager.setAccessToken(event.data.accessToken, event.data.expiresIn);
  }
};

// After successful refresh, notify other tabs
refreshChannel.postMessage({
  type: 'refreshed',
  accessToken: newAccessToken,
  expiresIn: expiresIn
});
```

---

### Issue 4: TOTP Secret Encryption at Rest

**Problem:** `totp_secret` is stored as plaintext VARCHAR. If database is compromised, attacker can generate TOTP codes for any user.

**Solution:** Encrypt TOTP secrets with application-level key.

```typescript
// lib/encryption.ts
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY; // 32 bytes, hex encoded
const ALGORITHM = 'aes-256-gcm';

export function encryptTotpSecret(secret: string): string {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptTotpSecret(encryptedData: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

**Environment Variable:**
```bash
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
TOTP_ENCRYPTION_KEY=<64-char-hex-string>
```

**Database Note:** Column remains VARCHAR but now contains encrypted data. Add comment:
```sql
COMMENT ON COLUMN users.totp_secret IS 'AES-256-GCM encrypted. Format: iv:authTag:ciphertext';
```

---

### Issue 5: Account Recovery Flow Missing

**Problem:** No documented process for users who lose both their phone AND backup codes. Without this, users could be permanently locked out.

**Solution:** Document support ticket recovery process.

**User-Facing Process:**
1. User clicks "Lost access to 2FA" on login page
2. Shows message: "You'll need to verify your identity through our support team"
3. Link to support form with required fields:
   - Email address associated with account
   - Any blockchain transaction IDs from their account
   - Photo ID (optional, speeds up process)
   - Description of content they've protected

**Support Team Process:**
1. Verify user owns email (send verification code to registered email)
2. Cross-reference any provided transaction IDs against their account
3. If email + transaction history matches, proceed
4. Manual 2FA reset requires manager approval
5. Send one-time recovery link (valid 1 hour)
6. User must set up new 2FA immediately on recovery

**Security Measures:**
- 72-hour cooling period before reset takes effect
- Email notification sent immediately when reset requested
- Previous devices remain trusted (can cancel from trusted device)
- Rate limit: 1 recovery request per account per 30 days
- Log all recovery attempts in activity log

**Add to Frontend:**
```typescript
// pages/auth/lost-2fa.tsx
// Form that collects:
// - registered email
// - any protected content URLs they can provide
// - description of issue
// Submits to support queue (Zendesk/Freshdesk/email)
```

---

### Issue 6: Email Change Flow Missing

**Problem:** No documented process for changing email address. Without proper controls, attacker with session access could change email and lock out real user.

**Solution:** Require 2FA + dual email confirmation.

**Flow:**
```
1. User requests email change (Settings → Email)
2. Prompt for 2FA code (current TOTP)
3. If valid, send confirmation to OLD email:
   "Someone requested to change your email to new@example.com.
    If this was you, click here to confirm.
    If not, click here to cancel and secure your account."
4. After OLD email confirms, send verification to NEW email:
   "Click to verify this email address for your DAON account"
5. Only after BOTH confirmations, change email
6. Send notification to OLD email: "Your email has been changed"
7. Previous trusted devices remain trusted (important!)
```

**API Endpoints:**
```typescript
// POST /api/v1/user/email/request-change
// Body: { new_email: "...", code: "123456" }
// Requires: valid 2FA code
// Action: sends confirmation to current email

// GET /api/v1/user/email/confirm-change?token=xxx
// Called from OLD email link
// Action: marks old email as confirmed, sends verification to new email

// GET /api/v1/user/email/verify-new?token=xxx
// Called from NEW email link
// Action: completes email change if old email already confirmed

// POST /api/v1/user/email/cancel-change
// Body: { code: "123456" }
// Action: cancels pending email change
```

**Database:**
```sql
CREATE TABLE email_change_requests (
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
    cancelled_at TIMESTAMP
);
```

---

### Issue 7: Backup Code Verification

**Problem:** Users might not actually save backup codes before dismissing the modal. They'll say "yes I saved them" without doing so.

**Solution:** Require user to TYPE one backup code to prove they saved them.

**Flow Change:**
```
Current Flow:
1. Show backup codes
2. "Download" button
3. Checkbox: "I have saved my backup codes"
4. Continue

New Flow:
1. Show backup codes (copy-friendly format)
2. "Download" / "Copy" buttons
3. Hide one random code: "Code 7: ████████"
4. "Enter code 7 to continue:" [________]
5. User must type correct code to proceed
6. If wrong: "That's not code 7. Please check your saved codes."
7. Continue (proves they have access to their codes)
```

**Implementation:**
```typescript
// When generating backup codes for display
const codes = generateBackupCodes(10);
const verifyIndex = Math.floor(Math.random() * 10); // 0-9

return {
  backup_codes: codes.map((code, i) => 
    i === verifyIndex ? '████████' : code
  ),
  verify_index: verifyIndex,
  verify_hash: hashBackupCode(codes[verifyIndex]) // Store temporarily
};

// When user submits verification
const userEnteredCode = normalizeBackupCode(input);
if (hashBackupCode(userEnteredCode) !== session.verify_hash) {
  return { error: 'incorrect_backup_code', message: `That's not code ${verifyIndex + 1}` };
}
// Proceed with setup completion
```

**UX Consideration:** Consider longer codes (12 chars like `A1B2-C3D4-E5F6`) for easier identification, or use words (`apple-banana-cherry`).

---

## Summary

**Architecture Decision:** Refresh token + device trust model

**Key Benefits:**
1. ✅ Mandatory 2FA for security
2. ✅ Trusted devices for convenience (skip 2FA for 30 days)
3. ✅ Short-lived access tokens for safety (15 min)
4. ✅ Revocable refresh tokens for control
5. ✅ Multi-session support for multiple identities
6. ✅ Transparent token refresh (zero user interruption)
7. ✅ Mobile-compatible (localStorage)

**User Experience:**
- First time: 2FA setup (~2-3 min, one-time)
- Trusted device: Sign in + 2FA (~20 sec, every 30 days)
- Daily use: Zero 2FA prompts, seamless refresh
- Account switch: Instant (if trusted), 2FA if not (one-time)

**Security Posture:**
- Defense in depth (access + refresh + device + 2FA)
- User control (view/revoke all sessions)
- Audit trail (all events logged)
- Recovery path (backup codes)

**Next Steps:**
1. Review token lifetimes
2. Decide on rotation strategy
3. Finalize backup code flow
4. Review and approve architecture
5. Begin implementation

---

**Status:** APPROVED - Implementation issues documented above must be addressed
