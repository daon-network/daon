# DAON Broker Roadmap - Review & Recommendations

**Reviewer:** Engineering  
**Date:** December 15, 2025  
**Document Reviewed:** BROKER_IMPLEMENTATION_ROADMAP.md  
**Overall Assessment:** 85% Complete - Solid foundation with critical gaps

---

## Executive Summary

The broker implementation roadmap is comprehensive and security-focused. However, before implementation begins, several gaps need to be addressed to ensure the system is truly production-ready. This document identifies those gaps and proposes solutions.

**Recommendation:** Address critical gaps before starting Phase 1. Most additions are architectural decisions that affect implementation.

---

## Gap 1: Content Ownership Verification

### The Problem

The current plan doesn't address how platforms verify that content being registered actually belongs to the user. A malicious or compromised broker could:

- Register content that doesn't belong to the user
- Register content before the actual creator does
- Backdate registrations fraudulently

### Risk Level: HIGH

If this isn't addressed, DAON's trust model is fundamentally broken.

### Proposed Solutions

#### Option A: Timestamp Correlation (Recommended)

**How it works:**
1. Broker must provide `platform_content_id` and `platform_publish_date`
2. DAON records this metadata alongside the registration
3. For disputes, the original platform publication date is evidence
4. DAON registration timestamp must be AFTER platform publish date

**Implementation:**
```typescript
interface BrokerRegistration {
  // Existing fields...
  
  // NEW: Platform-side proof
  platform_content_id: string;      // "work_12345678" on AO3
  platform_publish_date: string;    // ISO timestamp from platform
  platform_content_url: string;     // URL where content is published
}
```

**Database schema addition:**
```sql
ALTER TABLE content_ownership ADD COLUMN platform_content_id VARCHAR(255);
ALTER TABLE content_ownership ADD COLUMN platform_publish_date TIMESTAMP;
ALTER TABLE content_ownership ADD COLUMN platform_content_url TEXT;

-- Constraint: DAON registration must be after platform publish
ALTER TABLE content_ownership ADD CONSTRAINT registration_after_publish
  CHECK (registered_at >= platform_publish_date);
```

**Pros:**
- Simple to implement
- Creates audit trail
- Platform is accountable for their attestation

**Cons:**
- Doesn't prevent malicious broker from lying
- Requires trust in broker's timestamp

#### Option B: Content Signature Chain

**How it works:**
1. Platform signs content hash + user ID + timestamp
2. DAON verifies platform signature before accepting registration
3. Creates cryptographic proof that platform attested to ownership

**Implementation:**
```typescript
interface BrokerRegistration {
  // Existing fields...
  
  // NEW: Cryptographic attestation
  ownership_attestation: {
    content_hash: string;
    username: string;
    platform_timestamp: string;
    platform_signature: string;  // Ed25519 signature of above fields
  }
}
```

**Verification:**
```typescript
function verifyOwnershipAttestation(broker: Broker, attestation: OwnershipAttestation): boolean {
  const payload = canonicalize({
    content_hash: attestation.content_hash,
    username: attestation.username,
    platform_timestamp: attestation.platform_timestamp
  });
  
  return verifyEd25519(payload, attestation.platform_signature, broker.public_key);
}
```

**Pros:**
- Cryptographic proof of attestation
- Non-repudiable - broker can't deny they attested
- Stronger legal standing

**Cons:**
- More complex implementation
- Requires all brokers to implement signing

#### Option C: Deferred Verification (Lightweight)

**How it works:**
1. Registration is accepted but marked as "unverified"
2. DAON periodically spot-checks registrations
3. Crawls platform URL to verify content exists and matches
4. Upgrades to "verified" status if confirmed

**Pros:**
- Lowest friction for broker integration
- Automated verification
- Catches fraud after the fact

**Cons:**
- Fraud window before verification
- Requires crawler infrastructure
- May not work for private/logged-in content

### Recommendation

**Implement Option A (Timestamp Correlation) for launch, with Option B (Signature Chain) as a requirement for Standard/Enterprise tier brokers.**

Community tier: Timestamp correlation only  
Standard tier: Timestamp + Signature attestation  
Enterprise tier: Timestamp + Signature + Platform webhook verification

---

## Gap 2: Broker Key Recovery

### The Problem

If a broker loses their private key:
- They can't sign new registrations
- Users can't register new content through that platform
- Existing registrations remain valid but platform is crippled
- No recovery path defined

### Risk Level: CRITICAL

Key loss for a major broker (AO3, Wattpad) would be catastrophic.

### Proposed Solutions

#### Option A: Key Escrow Service (Recommended for Enterprise)

**How it works:**
1. During broker onboarding, key is split using Shamir's Secret Sharing
2. Shares distributed to:
   - DAON escrow (encrypted)
   - Broker's backup location
   - Third-party escrow service (optional)
3. Recovery requires M-of-N shares (e.g., 2-of-3)

**Implementation:**
```typescript
// During broker key generation
const keyPair = generateEd25519KeyPair();
const shares = shamirSplit(keyPair.privateKey, {
  totalShares: 3,
  threshold: 2
});

// Store shares
await storeEscrowShare(brokerId, shares[0], 'daon_escrow');
await sendToEmail(broker.recoveryEmail, shares[1], encrypted: true);
// Share 3 kept by broker in cold storage
```

**Database schema:**
```sql
CREATE TABLE broker_key_escrow (
  id SERIAL PRIMARY KEY,
  broker_id INTEGER REFERENCES brokers(id),
  share_index INTEGER NOT NULL,
  share_data_encrypted TEXT NOT NULL,  -- AES-256-GCM encrypted
  encryption_key_id VARCHAR(64),        -- Reference to KMS key
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(broker_id, share_index)
);
```

**Pros:**
- Industry-standard approach
- No single point of failure
- Recovery possible without compromising security

**Cons:**
- Complex to implement correctly
- Requires secure share distribution
- Social engineering risk on recovery

#### Option B: Multi-Signature Keys

**How it works:**
1. Broker has multiple signing keys (primary + backup)
2. Both keys are registered with DAON
3. Either key can sign registrations
4. Key rotation: add new key, revoke old key

**Implementation:**
```sql
-- Support multiple active keys per broker
ALTER TABLE brokers ADD COLUMN public_keys JSONB;
-- Format: [{"key": "base64...", "added_at": "...", "revoked_at": null}, ...]
```

**Pros:**
- Simpler than escrow
- Natural key rotation support
- No secret sharing complexity

**Cons:**
- Both keys could be compromised together
- Doesn't help if all keys are lost

#### Option C: Hardware Security Module (HSM)

**How it works:**
1. Enterprise brokers must use HSM for key storage
2. HSM provides key backup/recovery natively
3. DAON certifies specific HSM vendors

**Pros:**
- Highest security level
- Industry standard for financial services
- Built-in backup/recovery

**Cons:**
- Expensive ($$$)
- Only practical for enterprise tier
- Excludes smaller platforms

### Recommendation

**Tiered approach:**

| Tier | Key Recovery Method |
|------|---------------------|
| Community | Multi-signature keys (Option B) |
| Standard | Multi-sig + encrypted backup to DAON |
| Enterprise | HSM required (Option C) or Shamir escrow (Option A) |

**Add to Phase 1.2:**
- [ ] Implement multi-key support for brokers
- [ ] Key rotation API endpoint
- [ ] Key recovery workflow

**Add to Phase 4.1 (Certification):**
- [ ] Define key management requirements per tier
- [ ] HSM vendor certification list
- [ ] Key ceremony documentation

---

## Gap 3: Federated Identity Migration

### The Problem

A user registers content as `writer@ao3.org`. Later, they:
- Want to claim the content under their direct DAON account
- The platform shuts down
- They want to consolidate multiple platform identities

Currently, no migration path exists.

### Risk Level: MEDIUM

Not critical for launch, but needed for long-term user trust.

### Proposed Solutions

#### Option A: Identity Linking (Recommended)

**How it works:**
1. User signs into DAON with their direct account
2. User initiates "Link Identity" flow
3. DAON sends verification to platform (or user proves access)
4. Federated identity is linked to DAON user account
5. Content ownership remains with federated identity, but user can manage it

**User flow:**
```
1. User: "Link my AO3 account"
2. DAON: Generates challenge code
3. User: Posts challenge to AO3 profile (or broker API confirms)
4. DAON: Verifies challenge
5. DAON: Links ao3.org/writer → daon_user_123
6. User: Can now manage all ao3.org/writer content from DAON dashboard
```

**Database schema:**
```sql
-- Update federated_identities table
ALTER TABLE federated_identities 
  ADD COLUMN linked_user_id INTEGER REFERENCES users(id),
  ADD COLUMN linked_at TIMESTAMP,
  ADD COLUMN link_verification_method VARCHAR(50),
  ADD COLUMN link_proof TEXT;

CREATE INDEX idx_federated_linked_user ON federated_identities(linked_user_id);
```

**Pros:**
- Non-destructive (original identity preserved)
- Reversible
- Works even if platform is online

**Cons:**
- Requires platform cooperation for verification
- Doesn't help if platform shuts down without warning

#### Option B: Full Ownership Transfer

**How it works:**
1. User proves ownership of federated identity
2. Content ownership is transferred from `writer@ao3.org` to `user@daon.network`
3. Transfer is recorded in blockchain
4. Old identity becomes alias/redirect

**Implementation:**
```typescript
interface IdentityMigration {
  from_identity: string;           // "writer@ao3.org"
  to_identity: string;             // "user@daon.network" or wallet address
  verification_proof: string;      // Signature or challenge response
  migration_type: 'link' | 'transfer' | 'platform_shutdown';
  authorized_by: 'user' | 'broker' | 'daon_admin';
}
```

**Pros:**
- Clean ownership model
- User fully controls content
- Works for platform shutdown scenarios

**Cons:**
- Destructive (old identity no longer owner)
- Requires careful verification to prevent theft
- Transfer history becomes complex

#### Option C: Platform Shutdown Protocol

**How it works:**
1. Broker announces shutdown with 90-day notice
2. DAON notifies all users with content on that platform
3. Users have 90 days to link/migrate their identities
4. After shutdown, DAON admin can process migration requests with proof
5. Unclaimed content remains attributed to federated identity (historical record)

**Implementation:**
```sql
CREATE TABLE platform_shutdown_notices (
  id SERIAL PRIMARY KEY,
  broker_id INTEGER REFERENCES brokers(id),
  announced_at TIMESTAMP NOT NULL,
  effective_at TIMESTAMP NOT NULL,  -- announced_at + 90 days minimum
  reason TEXT,
  migration_instructions TEXT,
  status VARCHAR(20) DEFAULT 'announced',  -- 'announced', 'active', 'completed'
  
  CONSTRAINT minimum_notice CHECK (effective_at >= announced_at + INTERVAL '90 days')
);

CREATE TABLE shutdown_migration_requests (
  id SERIAL PRIMARY KEY,
  shutdown_id INTEGER REFERENCES platform_shutdown_notices(id),
  federated_identity_id INTEGER REFERENCES federated_identities(id),
  requesting_user_id INTEGER REFERENCES users(id),
  proof_type VARCHAR(50),  -- 'email_verification', 'content_match', 'admin_review'
  proof_data JSONB,
  status VARCHAR(20) DEFAULT 'pending',
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Pros:**
- Handles the "platform disappears" scenario
- Gives users time to act
- Creates clear process

**Cons:**
- Doesn't help with sudden shutdowns
- Requires manual review for edge cases

### Recommendation

**Implement all three as a progression:**

1. **Option A (Identity Linking)** - Launch feature
   - Users can link federated identities to DAON account
   - Non-destructive, reversible
   
2. **Option B (Full Transfer)** - Post-launch
   - For users who want to "graduate" to direct ownership
   - Requires strong verification
   
3. **Option C (Shutdown Protocol)** - Required for broker certification
   - All certified brokers must agree to shutdown protocol
   - Part of Broker Terms of Service

**Add to Phase 1.4:**
- [ ] Identity linking flow
- [ ] Challenge-response verification
- [ ] Link management UI (dashboard)

**Add to Phase 4.1:**
- [ ] Shutdown protocol requirements
- [ ] Migration request workflow
- [ ] Admin review queue

---

## Gap 4: Testing Strategy

### The Problem

Testing is sequenced AFTER implementation (Phase 3 after Phase 2). This is waterfall, not modern development practice.

### Risk Level: MEDIUM

Late testing means late bug discovery, which means expensive fixes.

### Proposed Solution

**Shift testing left - parallel with implementation.**

**Revised timeline:**

| Week | Implementation | Testing |
|------|----------------|---------|
| 1 | Phase 1.1 (Auth middleware) | Write unit tests for auth middleware |
| 2 | Phase 1.2 (Signatures) | Write unit tests for signature verification |
| 3 | Phase 1.3 (Endpoints) | Integration tests for endpoints |
| 4 | Phase 1.4 (Transfers) | Unit + integration tests for transfers |
| 5 | Phase 2.1-2.2 (Security) | Security test planning |
| 6 | Phase 2.3 (Audit) | Security test execution |
| 7 | Buffer / bug fixes | Full regression suite |
| 8 | Load testing | Performance benchmarks |

**Test-driven development mandate:**

```markdown
## Development Process

1. For each feature:
   a. Write failing test first
   b. Implement minimum code to pass
   c. Refactor
   d. Repeat

2. No PR merged without:
   - Unit tests for new code
   - Integration test for new endpoints
   - All existing tests passing
   - Code coverage >= 90%

3. Security tests run:
   - Daily: Automated OWASP scans
   - Weekly: Manual penetration testing
   - Pre-release: Full security audit
```

**Add to each Phase 1 task:**
```markdown
### 1.1 Broker Authentication Middleware
**Tasks:**
- [ ] Write unit tests for authenticateBroker() **← ADD**
- [ ] Create broker-auth.ts middleware
- [ ] Write integration tests for auth flow **← ADD**
- [ ] Integrate with Express middleware stack
...
```

---

## Gap 5: Webhook/Callback System

### The Problem

Brokers have no way to receive notifications about:
- Registration success/failure (async)
- Disputes filed against their content
- Certification expiring
- Security events on their account

### Risk Level: MEDIUM

Without webhooks, brokers must poll for status updates, which is inefficient and doesn't scale.

### Proposed Solution

**Add webhook system to Phase 2.**

**Event types:**
```typescript
type WebhookEvent = 
  | 'registration.completed'
  | 'registration.failed'
  | 'registration.duplicate_detected'
  | 'dispute.filed'
  | 'dispute.resolved'
  | 'certification.expiring'    // 30 days before
  | 'certification.expired'
  | 'security.rate_limit_warning'
  | 'security.suspended'
  | 'identity.claimed'          // User claimed federated identity
  | 'transfer.initiated'
  | 'transfer.completed';
```

**Database schema:**
```sql
CREATE TABLE broker_webhooks (
  id SERIAL PRIMARY KEY,
  broker_id INTEGER REFERENCES brokers(id) ON DELETE CASCADE,
  
  url TEXT NOT NULL,
  secret_hash VARCHAR(255) NOT NULL,  -- For signature verification
  
  events TEXT[] NOT NULL,  -- Which events to send
  
  enabled BOOLEAN DEFAULT TRUE,
  
  -- Health tracking
  consecutive_failures INTEGER DEFAULT 0,
  last_success_at TIMESTAMP,
  last_failure_at TIMESTAMP,
  last_failure_reason TEXT,
  disabled_at TIMESTAMP,  -- Auto-disabled after too many failures
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE webhook_deliveries (
  id SERIAL PRIMARY KEY,
  webhook_id INTEGER REFERENCES broker_webhooks(id) ON DELETE CASCADE,
  
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  
  -- Delivery tracking
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'delivered', 'failed', 'retrying'
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  
  first_attempted_at TIMESTAMP,
  last_attempted_at TIMESTAMP,
  delivered_at TIMESTAMP,
  
  response_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  
  -- Retry scheduling
  next_retry_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_pending ON webhook_deliveries(status, next_retry_at) 
  WHERE status IN ('pending', 'retrying');
```

**Webhook signature:**
```typescript
function signWebhookPayload(payload: any, secret: string): string {
  const timestamp = Date.now();
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  
  return `t=${timestamp},v1=${signature}`;
}

// Broker verifies with:
// 1. Parse t= and v1= from X-DAON-Signature header
// 2. Recreate signature with their secret
// 3. Compare (timing-safe)
// 4. Reject if timestamp > 5 minutes old (replay protection)
```

**Retry schedule (exponential backoff):**
```
Attempt 1: Immediate
Attempt 2: 1 minute
Attempt 3: 5 minutes
Attempt 4: 30 minutes
Attempt 5: 2 hours
```

**Auto-disable after 5 consecutive failures, require manual re-enable.**

**Add to Phase 2:**
- [ ] Webhook registration API
- [ ] Webhook delivery worker (background job)
- [ ] Retry logic with exponential backoff
- [ ] Webhook signature generation
- [ ] Auto-disable on repeated failures
- [ ] Webhook logs & debugging UI

**Estimated time:** 8 hours

---

## Gap 6: Open Questions Resolution

### The Problem

Critical architectural questions are listed but not answered. These affect implementation.

### Recommendation

**Resolve these BEFORE starting Phase 1:**

| Question | Recommendation | Rationale |
|----------|----------------|-----------|
| HSM for broker keys? | **No for launch.** Optional for Enterprise tier post-launch. | Cost and complexity too high for initial release. Multi-sig keys are sufficient. |
| Redis or database for rate limiting? | **Redis.** | Performance critical. Database rate limiting won't scale. Already a dependency for sessions. |
| Blockchain downtime handling? | **Graceful degradation.** Register to database, sync to blockchain when available. | Can't block registrations on blockchain availability. |
| Broker certification: manual or automated? | **Manual for launch.** Automated checks + manual approval. | Trust is critical. Automation can come later. |
| Pricing? | **Free for Community tier.** Paid for Standard/Enterprise based on volume. | Need adoption first. Monetize later. |
| Multi-region? | **No for launch.** Single region, multi-AZ. Plan for multi-region. | Complexity too high. Start with reliability in one region. |

**Add to documentation:**
```markdown
## Architectural Decisions

### Rate Limiting: Redis
- Decision: Use Redis for rate limiting
- Date: December 2025
- Rationale: Database-based rate limiting doesn't scale. Redis provides O(1) operations for token bucket algorithm.
- Implementation: Use `ioredis` with Lua scripts for atomic operations.

### Blockchain Downtime: Graceful Degradation  
- Decision: Accept registrations during blockchain downtime
- Date: December 2025
- Rationale: User experience > perfect consistency. Sync when blockchain recovers.
- Implementation: 
  1. Register to PostgreSQL immediately
  2. Queue blockchain transaction
  3. Background worker syncs to blockchain
  4. Update record with blockchain tx hash
  5. If blockchain rejects (duplicate), mark as "blockchain_conflict"

### Broker Certification: Manual Approval
- Decision: Human review required for all broker certifications
- Date: December 2025
- Rationale: Trust is critical. A malicious broker could cause significant harm.
- Implementation:
  1. Automated checks (domain verification, security headers, etc.)
  2. Manual review of application
  3. Video call for Standard/Enterprise tier
  4. Approval by 2 team members
```

---

## Gap 7: DMCA / Legal Jurisdiction

### The Problem

What happens when:
- A broker registers infringing content?
- A DMCA takedown request is received?
- Users in different jurisdictions have disputes?

### Risk Level: HIGH

Legal exposure without clear policies.

### Proposed Solution

**Add to Phase 6 with higher priority:**

```markdown
## 6.3 DMCA & Content Disputes

### DMCA Safe Harbor
- DAON is a registration service, not a hosting service
- We don't store content, only hashes
- Safe harbor provisions may not apply (need legal review)

### Takedown Process
1. Receive DMCA notice
2. Verify notice is complete (17 U.S.C. § 512)
3. Notify broker who registered content
4. Mark content as "disputed" (not removed - we can't remove)
5. Counter-notice process available
6. Legal escalation if unresolved

### Jurisdiction
- DAON operates under [TBD] jurisdiction
- Broker agreements specify governing law
- Users agree to arbitration for disputes under $X

### Broker Liability
- Brokers indemnify DAON for content they register
- Brokers responsible for their users' content
- Certification requires DMCA agent designation
```

**Database addition:**
```sql
CREATE TABLE dmca_notices (
  id SERIAL PRIMARY KEY,
  
  -- Content identification
  content_hash VARCHAR(64) NOT NULL,
  
  -- Complainant
  complainant_name VARCHAR(255) NOT NULL,
  complainant_email VARCHAR(255) NOT NULL,
  complainant_address TEXT,
  
  -- Claim
  original_work_description TEXT NOT NULL,
  infringement_description TEXT NOT NULL,
  good_faith_statement BOOLEAN NOT NULL,
  accuracy_statement BOOLEAN NOT NULL,
  signature TEXT NOT NULL,
  
  -- Processing
  received_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'received',  -- 'received', 'valid', 'invalid', 'counter_filed', 'resolved'
  broker_notified_at TIMESTAMP,
  owner_notified_at TIMESTAMP,
  
  -- Resolution
  resolution VARCHAR(50),
  resolution_notes TEXT,
  resolved_at TIMESTAMP,
  resolved_by INTEGER REFERENCES users(id)
);

CREATE TABLE dmca_counter_notices (
  id SERIAL PRIMARY KEY,
  notice_id INTEGER REFERENCES dmca_notices(id),
  
  respondent_name VARCHAR(255) NOT NULL,
  respondent_email VARCHAR(255) NOT NULL,
  respondent_address TEXT,
  
  counter_statement TEXT NOT NULL,
  consent_to_jurisdiction BOOLEAN NOT NULL,
  signature TEXT NOT NULL,
  
  received_at TIMESTAMP DEFAULT NOW(),
  forwarded_to_complainant_at TIMESTAMP,
  
  -- 10-14 business day waiting period
  waiting_period_ends_at TIMESTAMP,
  court_action_filed BOOLEAN DEFAULT FALSE
);
```

---

## Gap 8: AI Licensing - Contact Routing & Audit Trail

### The Problem

The original roadmap had NO mechanism for:
- AI companies to find out HOW to license content
- Recording that licensing has occurred
- Providing evidence for disputes

### Risk Level: MEDIUM

Without this, DAON protects content but provides no path to legitimate licensing.

### Proposed Solution

**DAON as infrastructure, not marketplace.**

After discussion, we determined DAON should NOT:
- Process payments
- Set prices
- Negotiate deals
- Issue licenses
- Take a cut

Instead, DAON provides:
1. **Contact routing** - Verification tells AI companies who to contact
2. **Audit trail** - Brokers can record that licensing occurred

**Rights holders (creators, agents, brokers) handle:**
- Negotiation
- Pricing
- Payment collection
- License issuance
- Revenue distribution

**Add new Phase 7: AI Licensing Infrastructure (Simplified)**

| Sub-phase | Description | Hours |
|-----------|-------------|-------|
| 7.1 Licensing Fields | Add ai_training_policy, licensing_email, licensing_uri to content | 8h |
| 7.2 License Recording | Broker endpoint to record that licensing occurred | 8h |
| 7.3 Dashboard Updates | Show license records to creators | 4h |
| 7.4 Testing | Unit + integration tests | 4h |
| **Total** | | **24h** |

**Key Features:**

1. **AI Training Policies** (creator-set):
   - `prohibited` (default) - No AI training allowed
   - `contact_required` - Contact rights holder
   - `open` - Free with attribution

2. **Contact Routing:**
   - `licensing_email` - Email for licensing inquiries
   - `licensing_uri` - URL for licensing portal/info

3. **License Recording (Audit Trail):**
   - Brokers record that licensing occurred
   - Payment amounts recorded (but not processed)
   - Creates evidence for disputes
   - Enables analytics ("$X in licensing revenue recorded")

4. **What We DON'T Build:**
   - ~~Payment processing~~ (brokers handle)
   - ~~Price setting~~ (rights holders decide)
   - ~~License tokens~~ (brokers issue)
   - ~~Collective pools~~ (third parties can build)
   - ~~Revenue distribution~~ (brokers handle)

**Database additions:** 1 new table (license_records), 3 new columns on protected_content

---

## Summary: All Additions

### New Tasks for Phase 1

| Task | Estimated Hours | Added To |
|------|-----------------|----------|
| Content ownership attestation (timestamp + optional signature) | 4h | Phase 1.3 |
| Multi-key support for brokers | 3h | Phase 1.2 |
| Key rotation API | 2h | Phase 1.2 |
| Identity linking flow | 6h | Phase 1.4 |
| Challenge-response verification | 3h | Phase 1.4 |

**Phase 1 revised estimate: 28h → 46h**

### New Tasks for Phase 2

| Task | Estimated Hours | Added To |
|------|-----------------|----------|
| Webhook system | 8h | Phase 2 (new section 2.4) |
| Redis rate limiting | 2h | Phase 2.1 (revised) |

**Phase 2 revised estimate: 14h → 24h**

### New Tasks for Phase 4

| Task | Estimated Hours | Added To |
|------|-----------------|----------|
| Shutdown protocol documentation | 2h | Phase 4.1 |
| Key management requirements per tier | 2h | Phase 4.1 |
| Migration request workflow | 4h | Phase 4.1 |

**Phase 4 revised estimate: 32h → 40h**

### New Tasks for Phase 6

| Task | Estimated Hours | Added To |
|------|-----------------|----------|
| DMCA process & database | 6h | Phase 6 (new section 6.3) |
| Jurisdiction documentation | 2h | Phase 6.1 |

**Phase 6 revised estimate: TBD → 8h (engineering only, legal separate)**

### NEW Phase 7: AI Licensing Infrastructure (Simplified)

| Task | Estimated Hours | Priority |
|------|-----------------|----------|
| Licensing fields + verification updates | 8h | HIGH |
| License recording API (audit trail) | 8h | HIGH |
| Dashboard updates (view-only) | 4h | MEDIUM |
| Testing | 4h | HIGH |

**Phase 7 estimate: 24h** (down from 160h - we're not processing payments)

---

## Revised Total Estimate

| Phase | Original | Revised | Delta |
|-------|----------|---------|-------|
| Phase 1: Core Infrastructure | 28h | 46h | +18h |
| Phase 2: Security & Monitoring | 14h | 24h | +10h |
| Phase 3: Testing | 40h | 40h | 0 (parallel) |
| Phase 4: Documentation & SDK | 32h | 40h | +8h |
| Phase 5: Production Readiness | 20h | 20h | 0 |
| Phase 6: Compliance | TBD | 8h | +8h |
| **Phase 7: AI Licensing (Simplified)** | **0h** | **24h** | **+24h** |
| **TOTAL** | **134h** | **202h** | **+68h** |

**Revised timeline:** 5-6 sprints (single engineer) or 3 sprints (two engineers)

---

## Recommendation

1. **Accept all additions** - They address real gaps that would cause problems post-launch
2. **Resolve open questions** - Before starting implementation
3. **Shift testing left** - Parallel with implementation, not after
4. **Prioritize Phase 7** - This is the REVENUE path and creator value proposition
5. **Phase 6.3 (DMCA)** - Legal exposure is real risk

**The 68 additional hours are worth it.** 

Key insight from review: DAON should be **infrastructure**, not a marketplace.

- We provide verification + contact routing + audit trail
- Rights holders (creators, brokers, agents) handle negotiation/payment
- This is simpler, less liability, more scalable
- Third parties can build licensing marketplaces on top of DAON

**Phased launch recommendation:**
1. **Launch (Q1):** Full broker system + licensing infrastructure together
2. **Post-launch:** Third parties build licensing collectives, marketplaces, etc.

---

## New Open Questions (AI Licensing - Simplified)

1. **Default contact for broker content:** Auto-populate broker's licensing email?
2. **License record visibility:** Public or private?
3. **Payment currency:** Normalize to USD or support multiple?

---

**Prepared by:** Engineering  
**Date:** December 15, 2025  
**Status:** Approved after stakeholder review  
**Documents Created/Updated:**
- `BROKER_IMPLEMENTATION_ROADMAP.md` (updated - 202h total)
- `BROKER_ROADMAP_REVIEW.md` (this document)
- `AI_LICENSING_COMPENSATION_SYSTEM.md` (rewritten - simplified model)

**Key Decision:** DAON is infrastructure (verification + contact routing + audit trail), not a marketplace. We don't process payments or set prices. Rights holders handle that.
