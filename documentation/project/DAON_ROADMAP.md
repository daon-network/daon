# DAON Product Roadmap
**Last updated:** April 2026
**Status:** Live on mainnet. Accepting users.

---

## What DAON Is

DAON is ownership proof infrastructure for digital content.

A creator registers their work. DAON hashes it, records that hash on an immutable blockchain tied to their identity, and returns a cryptographic token — a verification URL that proves the registration happened. The creator embeds that token in their work. Anyone who receives the work can follow the link to confirm it's real.

DAON is not a marketplace. It does not process payments, set prices, issue licenses, or take a cut. It provides proof of existence, proof of ownership, and a contact path for licensing. Everything else is between rights holders and whoever wants to use their work.

---

## Three Pillars

### 1. Content Ownership
*Core value. Shipped.*

A creator submits content → DAON hashes it → records the hash + identity + license + timestamp on the blockchain → returns a verification URL.

**What's live:**
- Web registration (single and bulk)
- API registration with 5 SDK clients (Node.js, Python, Go, Ruby, PHP)
- License selection at registration (Liberation v1, CC0/public domain, and others)
- Blockchain-backed record on daon-mainnet-1
- Verification URL embedded in the returned token
- Embed instructions provided at registration

**What the token proves:** *This hash was registered by this identity at this time under this license.*

**Known issue:** The default license is inconsistent. The single-item endpoint defaults to `all-rights-reserved`; the bulk and broker endpoints default to `liberation_v1`. This should be aligned before launch.

---

### 2. Content Verification
*Partially shipped. Binary file support is the remaining gap.*

**Current state:** `POST /api/v1/verify-content` exists and the verify page has UI for it. Submit text content → DAON hashes it → looks it up → returns who registered it (or "not found"). This closes the loop for text-based works.

**The remaining gap:** The endpoint accepts text strings only. Binary content — images, PDFs, audio, video — cannot be verified this way. A photographer can't upload a JPEG to check if it's registered. This matters because the majority of content that gets stolen is visual or audio.

**What to build:**
- `POST /api/v1/verify-content` upgrade to accept multipart file uploads
- Server-side binary hashing using the same SHA256 algorithm as registration
- Frontend file picker on the verify page alongside the existing text input

**Notes:**
- Architecture is already correct — it's purely an input format extension
- Priority: near-term post-launch

---

### 3. The Broker System
*Platform integration layer. ~40% complete.*

The broker system lets third-party platforms register content on behalf of their users. A platform like AO3 integrates once; every work uploaded by a creator is automatically registered under a federated identity (`username@platform.com`). No individual action required from the creator.

**Why this matters:** Direct registration requires creators to know DAON exists and take action. The broker system inverts this — platforms protect creators by default.

**What's built:**
- Broker authentication (API keys, bcrypt, Ed25519 signature verification)
- Rate limiting per broker tier (Community / Standard / Enterprise)
- Federated identity management (`username@platform.com`)
- Content registration via broker endpoint (`POST /api/v1/broker/protect`)
- Ownership transfer system with full audit trail
- Webhook delivery system (HMAC-signed, exponential backoff retry)
- 61+ unit tests + integration tests, 100% passing
- Database schema for all broker tables

**What's not yet built:**

| Feature | Priority | Notes |
|---------|----------|-------|
| Security monitoring + auto-suspend | Critical | Alert on anomalous broker activity |
| Transfer blockchain integration | Critical | Transfers write to DB only; not on-chain |
| Broker onboarding documentation | High | Required before first partner |
| Broker Node.js SDK | High | Reference implementation for integrators |
| AI licensing fields | High | `ai_training_policy`, `licensing_email`, `licensing_uri` absent from schema |
| License record API (audit trail) | High | Brokers record that licensing occurred |
| Redis for rate limiting | High | General API rate limits use in-memory store (resets on restart) |
| Identity linking (federated → DAON account) | Medium | User claims their platform content |
| Platform shutdown protocol | Medium | Required in broker ToS |
| DMCA process | Medium | Legal exposure without it |

**Broker tiers:**

| Tier | Rate Limit | Key Recovery | Certification |
|------|-----------|--------------|---------------|
| Community | 100 req/hr | Multi-key | Automated checks + manual approval |
| Standard | 1,000 req/hr | Multi-key + encrypted backup | Video call required |
| Enterprise | 10,000 req/hr | HSM or Shamir escrow | Full security audit |

**Key architectural decisions (already made):**
- DAON does not process payments, set prices, or take a cut
- Blockchain downtime = graceful degradation (DB first, blockchain sync on recovery)
- Rate limiting via Redis (not database)
- Broker certification is manual approval (trust is the product)
- Community tier is free; Standard/Enterprise are volume-priced

---

## Sequence

```
NOW          → Public launch with current feature set (Pillar 1)
NEAR-TERM    → Content verification via file upload (Pillar 2 gap)
NEXT         → Broker system completion + first certified partner (Pillar 3)
FOLLOWING    → AI licensing infrastructure (contact routing + audit trail)
ONGOING      → Platform shutdown protocol, identity migration, DMCA handling
```

The broker system does not need to be complete before launch. Launch with Pillar 1. Add Pillar 2 (content verification) as the first post-launch feature. Broker system is the medium-term priority that enables mass adoption without requiring individual creator action.

---

## What "Production Ready" Means for the Broker System

Before certifying the first broker:

1. Security monitoring is live and alerting (auto-suspend on anomalous activity)
2. Transfer system writes to blockchain (currently DB-only)
3. Broker documentation exists (someone else can integrate without our help)
4. DMCA process is documented and implemented
5. Broker Terms of Service are reviewed and signed

Admin authentication is already implemented (`admin-middleware.ts`, wired into the server).

Estimated: ~120 engineering hours from current state.

---

## What DAON Does NOT Plan to Build

- Payment processing
- Licensing negotiations or marketplaces
- Price setting
- Revenue distribution
- AI model monitoring or violation detection
- Content hosting of any kind

These are appropriate for third parties to build on top of DAON's verification infrastructure. DAON's job is proof. Everything else is someone else's job.

---

## Open Questions

1. Should license records (AI training audit trail) be public or private?
2. For broker-registered content: auto-populate broker's licensing email as default contact?
3. Payment currency in license records: normalize to USD or support multiple?
