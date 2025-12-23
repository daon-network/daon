# DAON Content Protection System - Final Architecture

**Status:** APPROVED FOR IMPLEMENTATION  
**Date:** December 2025  
**Decision Authority:** Architecture Review Session

---

## Executive Summary

DAON content protection uses a **web-first approach** where users upload content directly to `protect.daon.network`, receive immediate ownership binding to their verified identity, and get embed codes to paste into their works on any platform.

**No browser extension. No claim codes. No anonymous registration.**

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary interface | Web upload site | Simpler, more secure than extension |
| Browser extension | ❌ NO | Security risk (can be compromised) |
| Claim codes | ❌ NO | Theft window, complexity |
| Identity binding | Immediate at registration | No gap for theft |
| Primary auth | Email magic link | Universal, recoverable |
| Secondary auth | Discord OAuth | Fanfic/art community lives there |
| Tertiary auth | Google OAuth | Familiar for many users |
| Future auth | Domain verification, Platform OAuth | For professionals and brokers |
| Embedding | User copies snippet to their platform | Works everywhere, no integration needed |
| Version history | Yes, linked versions | Users can re-protect edited works |
| Duplicate detection | Exact + normalized + perceptual hash | Catches ~80% of lazy copies |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    protect.daon.network                  │
│                      (Next.js / React)                   │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │   Sign In   │  │   Upload    │  │  Dashboard  │      │
│  │  (Email/    │  │  (Text/     │  │  (My Works) │      │
│  │   Discord)  │  │   Image)    │  │             │      │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │
└─────────┼────────────────┼────────────────┼─────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────┐
│                      API Server                          │
│                   (Existing Express API)                 │
│                                                          │
│  POST /auth/magic-link     - Send verification email    │
│  GET  /auth/verify/:token  - Verify + create session    │
│  GET  /auth/discord        - Discord OAuth flow         │
│  GET  /auth/google         - Google OAuth flow          │
│  POST /protect             - Register content           │
│  GET  /verify/:hash        - Public verification page   │
│  GET  /user/works          - User's protected works     │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                   DAON Blockchain                        │
│                  (Cosmos SDK Module)                     │
│                                                          │
│  ContentRegistry:                                        │
│  - RegisterContent(hash, owner, metadata, prevVersion)  │
│  - GetContent(hash) → registration details              │
│  - GetContentsByOwner(owner) → list of works            │
│  - GetVersionHistory(hash) → linked versions            │
└─────────────────────────────────────────────────────────┘
```

---

## User Flows

### Flow 1: First-Time User Protects Fanfic

```
1. User visits protect.daon.network
2. Clicks "Sign in with Email" (or Discord)
3. Enters email address
4. Receives magic link email
5. Clicks link → signed in
6. Pastes fanfic text into upload box
7. Selects license (Liberation License default)
8. Clicks "Protect My Work"
9. Sees success screen with:
   - Verification link
   - Embed codes (text, HTML, comment)
10. Copies embed code
11. Pastes into AO3 author's note
12. Done - work is protected and linked
```

### Flow 2: Returning User Protects New Work

```
1. User visits protect.daon.network
2. Already signed in (session cookie)
3. Pastes new content
4. Clicks "Protect My Work"
5. Gets embed codes
6. Done
```

### Flow 3: User Updates Protected Work

```
1. User edits their fanfic significantly
2. Visits protect.daon.network
3. Pastes updated content
4. Optionally links to previous version
5. Gets new embed code
6. Updates embed code in AO3 author's note
7. Both versions now protected, linked together
```

### Flow 4: Anyone Verifies Protection

```
1. Reader sees "🛡️ DAON Protected: daon.network/v/a1b2c3" in author's note
2. Clicks link
3. Sees verification page:
   - "This content is protected"
   - Owner (partially masked): fa*****er@gmail.com
   - Registered: December 1, 2025
   - License: Liberation License v1.0
   - Version history (if multiple versions)
4. Can report violations or contact creator
```

---

## Data Models

### ContentRegistration (Blockchain)

```go
type ContentRegistration struct {
    ContentHash       string    `json:"content_hash"`       // SHA256 of content
    NormalizedHash    string    `json:"normalized_hash"`    // SHA256 of normalized content
    PerceptualHash    string    `json:"perceptual_hash"`    // pHash for images, MinHash for text
    Owner             string    `json:"owner"`              // "email:user@example.com" or "discord:user#1234"
    OwnerType         string    `json:"owner_type"`         // "email", "discord", "google", "domain"
    License           string    `json:"license"`            // "liberation_v1", "cc_by", etc.
    PreviousVersion   string    `json:"previous_version"`   // Content hash of prior version (optional)
    Metadata          string    `json:"metadata"`           // JSON string with title, platform, URL
    RegisteredAt      int64     `json:"registered_at"`      // Unix timestamp
}
```

### User (API PostgreSQL)

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE,
    email_verified  BOOLEAN DEFAULT FALSE,
    discord_id      VARCHAR(64) UNIQUE,
    discord_username VARCHAR(64),
    google_id       VARCHAR(64) UNIQUE,
    google_email    VARCHAR(255),
    created_at      TIMESTAMP DEFAULT NOW(),
    last_login      TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_discord ON users(discord_id);
```

### Session (API PostgreSQL)

```sql
CREATE TABLE sessions (
    token       VARCHAR(64) PRIMARY KEY,
    user_id     UUID REFERENCES users(id),
    created_at  TIMESTAMP DEFAULT NOW(),
    expires_at  TIMESTAMP NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

### Magic Link Token (API PostgreSQL)

```sql
CREATE TABLE magic_tokens (
    token       VARCHAR(64) PRIMARY KEY,
    email       VARCHAR(255) NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW(),
    expires_at  TIMESTAMP NOT NULL,
    used        BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_magic_tokens_email ON magic_tokens(email);
```

---

## API Endpoints

### Authentication

#### POST /auth/magic-link

Send magic link email for passwordless sign-in.

```javascript
// Request
{
  "email": "user@example.com"
}

// Response: 200 OK
{
  "sent": true,
  "message": "Check your email for sign-in link"
}

// Response: 429 Too Many Requests
{
  "error": "Too many requests. Try again in 5 minutes."
}
```

**Implementation:**
1. Generate random 64-char token
2. Store in magic_tokens table (expires in 15 minutes)
3. Send email with link: `protect.daon.network/auth/verify?token={token}`
4. Rate limit: 3 per email per hour

---

#### GET /auth/verify/:token

Verify magic link token and create session.

```javascript
// Response: 200 OK
{
  "success": true,
  "session_token": "abc123...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "verified": true
  }
}

// Response: 400 Bad Request
{
  "error": "Invalid or expired token"
}
```

**Implementation:**
1. Look up token in magic_tokens table
2. Check not expired, not used
3. Mark token as used
4. Create or get user by email
5. Set email_verified = true
6. Create session (expires in 7 days)
7. Return session token

---

#### GET /auth/discord

Initiate Discord OAuth flow.

```javascript
// Redirects to Discord OAuth
// After user approves, Discord redirects to:
// protect.daon.network/auth/discord/callback?code=xyz

// Callback Response: 200 OK
{
  "success": true,
  "session_token": "abc123...",
  "user": {
    "id": "uuid",
    "discord_id": "123456789",
    "discord_username": "user#1234"
  }
}
```

**Implementation:**
1. Redirect to Discord OAuth URL
2. On callback, exchange code for token
3. Get user info from Discord API
4. Create or get user by discord_id
5. Create session
6. Redirect to app with session cookie

---

#### GET /auth/google

Initiate Google OAuth flow. (Same pattern as Discord)

---

### Content Protection

#### POST /protect

Register content on blockchain.

```javascript
// Request
{
  "content": "Chapter 1: The Beginning...",  // For text
  // OR
  "file": "<base64 encoded image>",          // For images
  
  "content_type": "text",                    // "text" or "image"
  "title": "My Amazing Fanfic",              // Optional
  "platform": "archiveofourown.org",         // Optional
  "url": "https://archiveofourown.org/works/123", // Optional
  "license": "liberation_v1",                // Default if not provided
  "previous_version": "a1b2c3d4"             // Optional: link to prior version
}

// Headers
Authorization: Bearer <session_token>

// Response: 200 OK
{
  "success": true,
  "content_hash": "a1b2c3d4e5f6...",
  "short_hash": "a1b2c3d4",
  "verify_url": "https://daon.network/v/a1b2c3d4",
  "tx_hash": "ABCDEF123456...",
  "embed_codes": {
    "text": "🛡️ DAON Protected: daon.network/v/a1b2c3d4",
    "html": "<a href=\"https://daon.network/v/a1b2c3d4\">🛡️ DAON Protected</a>",
    "comment": "<!-- DAON:a1b2c3d4 -->",
    "markdown": "[🛡️ DAON Protected](https://daon.network/v/a1b2c3d4)"
  },
  "version": 1,
  "previous_version": null
}

// Response: 409 Conflict (duplicate detected)
{
  "error": "duplicate_detected",
  "message": "This content or similar content is already protected",
  "matches": [
    {
      "hash": "xyz789...",
      "owner_masked": "an*****er@gmail.com",
      "registered_at": "2025-11-15T10:30:00Z",
      "similarity": "exact"        // or "high" (>90%), "medium" (>70%)
    }
  ]
}

// Response: 401 Unauthorized
{
  "error": "Not authenticated"
}
```

**Implementation:**
1. Validate session token
2. Generate hashes:
   - `content_hash`: SHA256 of raw content
   - `normalized_hash`: SHA256 of normalized content (lowercase, no punctuation, collapsed whitespace)
   - `perceptual_hash`: pHash for images, MinHash for text
3. Check for duplicates:
   - Exact match on content_hash → block
   - Close match on perceptual_hash → warn (return matches)
4. If no blocking duplicates:
   - Register on blockchain
   - Return success with embed codes
5. If previous_version provided:
   - Verify user owns previous version
   - Link in blockchain

---

#### GET /verify/:hash

Public verification page data.

```javascript
// No authentication required

// Response: 200 OK
{
  "verified": true,
  "content_hash": "a1b2c3d4e5f6...",
  "owner_masked": "fa*****er@gmail.com",
  "owner_type": "email",
  "license": "liberation_v1",
  "license_name": "Liberation License v1.0",
  "license_url": "https://liberationlicense.org/v1.0",
  "registered_at": "2025-12-01T10:30:00Z",
  "metadata": {
    "title": "My Amazing Fanfic",
    "platform": "archiveofourown.org"
  },
  "version": 2,
  "previous_version": {
    "hash": "xyz789...",
    "registered_at": "2025-11-01T10:30:00Z"
  },
  "next_versions": []
}

// Response: 404 Not Found
{
  "verified": false,
  "error": "Content not found in registry"
}
```

---

#### GET /user/works

Get authenticated user's protected works.

```javascript
// Headers
Authorization: Bearer <session_token>

// Response: 200 OK
{
  "works": [
    {
      "content_hash": "a1b2c3d4",
      "title": "My Amazing Fanfic",
      "platform": "archiveofourown.org",
      "registered_at": "2025-12-01T10:30:00Z",
      "verify_url": "https://daon.network/v/a1b2c3d4",
      "license": "liberation_v1",
      "versions": 2,
      "embed_codes": {
        "text": "🛡️ DAON Protected: daon.network/v/a1b2c3d4",
        "html": "<a href=\"https://daon.network/v/a1b2c3d4\">🛡️ DAON Protected</a>",
        "comment": "<!-- DAON:a1b2c3d4 -->"
      }
    }
  ],
  "total": 12,
  "page": 1,
  "per_page": 20
}
```

---

## Duplicate Detection

### For Text Content

```javascript
function generateTextHashes(text) {
  // 1. Exact hash
  const contentHash = sha256(text);
  
  // 2. Normalized hash (catches formatting changes)
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')      // Remove punctuation
    .replace(/\s+/g, ' ')          // Collapse whitespace
    .trim();
  const normalizedHash = sha256(normalized);
  
  // 3. MinHash (catches similar text)
  const shingles = createShingles(normalized, 5);  // 5-word shingles
  const minHash = computeMinHash(shingles, 128);   // 128 hash functions
  
  return { contentHash, normalizedHash, minHash };
}

function findDuplicates(hashes) {
  // Check exact match
  const exact = db.findByContentHash(hashes.contentHash);
  if (exact) return { match: exact, similarity: 'exact' };
  
  // Check normalized match (catches reformatted copies)
  const normalized = db.findByNormalizedHash(hashes.normalizedHash);
  if (normalized) return { match: normalized, similarity: 'exact' };
  
  // Check MinHash similarity (catches modified copies)
  const similar = db.findSimilarMinHash(hashes.minHash, threshold: 0.7);
  if (similar.length > 0) {
    return { matches: similar, similarity: 'high' };
  }
  
  return null;
}
```

### For Image Content

```javascript
function generateImageHashes(imageBuffer) {
  // 1. Exact hash
  const contentHash = sha256(imageBuffer);
  
  // 2. Perceptual hash (catches resize, compress, slight crop)
  const image = loadImage(imageBuffer);
  const resized = resize(image, 32, 32);
  const grayscale = toGrayscale(resized);
  const dct = applyDCT(grayscale);
  const perceptualHash = extractHash(dct);  // 64-bit hash
  
  // 3. Difference hash (catches gradients)
  const dHash = computeDifferenceHash(image);
  
  return { contentHash, perceptualHash, dHash };
}

function findImageDuplicates(hashes) {
  // Check exact match
  const exact = db.findByContentHash(hashes.contentHash);
  if (exact) return { match: exact, similarity: 'exact' };
  
  // Check perceptual similarity (Hamming distance)
  const similar = db.findSimilarPerceptual(hashes.perceptualHash, maxDistance: 5);
  if (similar.length > 0) {
    return { matches: similar, similarity: 'high' };
  }
  
  return null;
}
```

---

## Blockchain Module Updates

### ContentRegistry Message Types

Add to `proto/daoncore/contentregistry/tx.proto`:

```protobuf
message MsgRegisterContent {
  string creator = 1;
  string content_hash = 2;
  string normalized_hash = 3;
  string perceptual_hash = 4;
  string owner = 5;
  string owner_type = 6;
  string license = 7;
  string previous_version = 8;  // NEW: Link to prior version
  string metadata = 9;
}

message MsgRegisterContentResponse {
  string content_hash = 1;
  int64 registered_at = 2;
}
```

### ContentRegistry Keeper

Add to `x/contentregistry/keeper/msg_server_register_content.go`:

```go
func (k msgServer) RegisterContent(goCtx context.Context, msg *types.MsgRegisterContent) (*types.MsgRegisterContentResponse, error) {
    ctx := sdk.UnwrapSDKContext(goCtx)
    
    // Check if content already registered
    existing, found := k.GetContentRegistration(ctx, msg.ContentHash)
    if found {
        return nil, sdkerrors.Wrap(sdkerrors.ErrInvalidRequest, "content already registered")
    }
    
    // If previous version specified, verify ownership
    if msg.PreviousVersion != "" {
        prev, found := k.GetContentRegistration(ctx, msg.PreviousVersion)
        if !found {
            return nil, sdkerrors.Wrap(sdkerrors.ErrInvalidRequest, "previous version not found")
        }
        if prev.Owner != msg.Owner {
            return nil, sdkerrors.Wrap(sdkerrors.ErrUnauthorized, "cannot link to version you don't own")
        }
    }
    
    // Create registration
    registration := types.ContentRegistration{
        ContentHash:     msg.ContentHash,
        NormalizedHash:  msg.NormalizedHash,
        PerceptualHash:  msg.PerceptualHash,
        Owner:           msg.Owner,
        OwnerType:       msg.OwnerType,
        License:         msg.License,
        PreviousVersion: msg.PreviousVersion,
        Metadata:        msg.Metadata,
        RegisteredAt:    ctx.BlockTime().Unix(),
    }
    
    k.SetContentRegistration(ctx, registration)
    
    // Emit event
    ctx.EventManager().EmitEvent(
        sdk.NewEvent(
            types.EventTypeContentRegistered,
            sdk.NewAttribute(types.AttributeKeyContentHash, msg.ContentHash),
            sdk.NewAttribute(types.AttributeKeyOwner, msg.Owner),
        ),
    )
    
    return &types.MsgRegisterContentResponse{
        ContentHash:  msg.ContentHash,
        RegisteredAt: registration.RegisteredAt,
    }, nil
}
```

### Query: Get Version History

Add to `x/contentregistry/keeper/query_version_history.go`:

```go
func (k Keeper) GetVersionHistory(ctx sdk.Context, contentHash string) ([]types.ContentRegistration, error) {
    var history []types.ContentRegistration
    
    // Walk backwards through previous versions
    current, found := k.GetContentRegistration(ctx, contentHash)
    if !found {
        return nil, sdkerrors.Wrap(sdkerrors.ErrNotFound, "content not found")
    }
    
    history = append(history, current)
    
    for current.PreviousVersion != "" {
        prev, found := k.GetContentRegistration(ctx, current.PreviousVersion)
        if !found {
            break
        }
        history = append(history, prev)
        current = prev
    }
    
    // Reverse to get chronological order
    for i, j := 0, len(history)-1; i < j; i, j = i+1, j-1 {
        history[i], history[j] = history[j], history[i]
    }
    
    return history, nil
}
```

---

## Frontend: protect.daon.network

### Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Auth:** NextAuth.js (for Discord/Google) + custom magic link
- **State:** React hooks (simple enough, no Redux needed)

### Page Structure

```
app/
├── page.tsx                    # Landing / sign-in
├── auth/
│   ├── verify/page.tsx         # Magic link verification
│   └── callback/page.tsx       # OAuth callbacks
├── protect/
│   └── page.tsx                # Main upload/protect interface
├── dashboard/
│   └── page.tsx                # User's protected works
├── v/
│   └── [hash]/page.tsx         # Public verification page
└── api/
    └── (proxies to main API)
```

### Key Components

```
components/
├── SignIn.tsx                  # Email + OAuth buttons
├── ContentUpload.tsx           # Text area + file drop zone
├── ProtectionResult.tsx        # Success with embed codes
├── EmbedCodeBox.tsx            # Copy-able code snippets
├── WorksList.tsx               # Dashboard work list
├── VerificationBadge.tsx       # For verification page
└── DuplicateWarning.tsx        # Show when duplicates detected
```

---

## iOS Shortcut Specification

### Shortcut Name
"DAON Protect"

### Shortcut Actions

```
1. Receive [Images, Files] from Share Sheet
2. Set Variable "file" to Shortcut Input

3. If "daon_email" does not exist in Data Jar:
   a. Ask for Input (Text) "Enter your email for DAON:"
   b. Save to Data Jar as "daon_email"

4. Get Variable "daon_email" from Data Jar

5. Get Contents of URL:
   URL: https://api.daon.network/protect-mobile
   Method: POST
   Headers: Content-Type: multipart/form-data
   Body:
     - file: [file variable]
     - email: [daon_email variable]
     - license: liberation_v1

6. Get Dictionary Value "verify_url" from Result
7. Get Dictionary Value "embed_text" from Result

8. Show Alert:
   Title: "🛡️ Protected!"
   Message: [embed_text]
   
9. Copy to Clipboard: [embed_text]

10. Open URL: [verify_url]
```

### API Endpoint for Mobile

```javascript
// POST /protect-mobile
// Same as /protect but accepts multipart form data
// and doesn't require session (uses email verification)

// Request: multipart/form-data
// - file: image file
// - email: user's email
// - license: license type

// Response: Same as /protect
// BUT: Also sends verification email if email not yet verified
```

---

## Security Considerations

### Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /auth/magic-link | 3 per email | 1 hour |
| POST /protect | 10 per user | 1 hour |
| GET /verify/:hash | 100 per IP | 1 minute |
| GET /user/works | 30 per user | 1 minute |

### Input Validation

- Email: RFC 5322 compliant, max 255 chars
- Content: Max 10MB for text, max 50MB for images
- Title: Max 500 chars, sanitize HTML
- URL: Valid URL format, max 2000 chars
- License: Must be in allowed list

### Session Security

- Session tokens: 64 random bytes, hex encoded
- Expiry: 7 days
- Refresh: On each authenticated request
- Cookie: HttpOnly, Secure, SameSite=Strict

### Content Hashing

- Always hash on server (don't trust client hashes)
- Store original content temporarily for dispute resolution
- Delete original content after 30 days (keep only hash)

---

## Deployment

### New Services Needed

1. **protect.daon.network** (Vercel or self-hosted)
   - Next.js app
   - Connects to existing API

2. **Email service** (SendGrid, Postmark, or AWS SES)
   - For magic link emails
   - For notification emails

### Environment Variables (API Server)

```bash
# Authentication
MAGIC_LINK_SECRET=<random 64 bytes>
SESSION_SECRET=<random 64 bytes>
DISCORD_CLIENT_ID=<from Discord developer portal>
DISCORD_CLIENT_SECRET=<from Discord developer portal>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>

# Email
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<SendGrid API key>
EMAIL_FROM=noreply@daon.network

# URLs
FRONTEND_URL=https://protect.daon.network
API_URL=https://api.daon.network
```

---

## Implementation Checklist

### Week 1: Core Backend

- [ ] Add `previous_version` field to ContentRegistry module
- [ ] Add version history query to blockchain
- [ ] Create users table in PostgreSQL
- [ ] Create sessions table in PostgreSQL
- [ ] Create magic_tokens table in PostgreSQL
- [ ] Implement POST /auth/magic-link
- [ ] Implement GET /auth/verify/:token
- [ ] Implement Discord OAuth flow
- [ ] Implement Google OAuth flow

### Week 2: Protection & Detection

- [ ] Implement text normalization and hashing
- [ ] Implement perceptual hashing for images
- [ ] Implement MinHash for text similarity
- [ ] Implement duplicate detection logic
- [ ] Update POST /protect with new hashing
- [ ] Implement GET /verify/:hash
- [ ] Implement GET /user/works
- [ ] Generate embed codes in response

### Week 3: Frontend

- [ ] Set up Next.js project for protect.daon.network
- [ ] Build sign-in page (email + OAuth)
- [ ] Build content upload page
- [ ] Build protection result page with embed codes
- [ ] Build user dashboard
- [ ] Build public verification page
- [ ] Mobile responsive design

### Week 4: Launch Prep

- [ ] Build iOS Shortcut
- [ ] Set up email service (SendGrid)
- [ ] Deploy protect.daon.network
- [ ] Test full flow end-to-end
- [ ] Write launch messaging
- [ ] Prepare community posts

---

## Success Metrics

### MVP Launch Goals

- [ ] 100 protected works in first week
- [ ] 1,000 protected works in first month
- [ ] 100 verified users
- [ ] < 1% error rate
- [ ] < 2 second protection time

### Post-Launch Goals (Month 2-3)

- [ ] 10,000 protected works
- [ ] First platform integration discussion
- [ ] iOS Shortcut used by 100+ artists
- [ ] Adobe plugin submitted for review

---

## Open Questions for Implementation

1. **Content storage:** Store original content for disputes, or hash only?
   - Recommendation: Store for 30 days, then delete (keep hash)

2. **Email domains:** Block throwaway email domains?
   - Recommendation: No for MVP, add later if abuse

3. **Rate limits:** Are proposed limits appropriate?
   - Recommendation: Start with these, adjust based on usage

4. **Image formats:** Which formats to support?
   - Recommendation: JPEG, PNG, WebP, GIF (common web formats)

---

**Document Status:** Ready for implementation  
**Next Step:** Handoff to development team (Sonnet)
