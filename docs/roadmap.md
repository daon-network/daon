---
layout: default
title: "Roadmap"
description: "What DAON is building, what's live, and what's coming next"
---

# DAON Roadmap

**Last updated:** April 2026
**Status:** Live on mainnet. Accepting users.

---

## What DAON Is

DAON is ownership proof infrastructure for digital content.

A creator registers their work. DAON hashes it, records that hash on an immutable blockchain tied to their identity, and returns a cryptographic token — a verification URL that proves the registration happened. The creator embeds that token in their work. Anyone who receives the work can follow the link to confirm it's real.

DAON is not a marketplace. It does not process payments, set prices, issue licenses, or take a cut. It provides proof of existence, proof of ownership, and a contact path for licensing. Everything else is between rights holders and whoever wants to use their work.

---

## Pillar 1 — Content Ownership

**Status: Live.**

A creator submits content → DAON hashes it → records the hash, identity, license, and timestamp on the blockchain → returns a verification URL.

**What's live:**
- Web registration (single and bulk)
- API registration with SDK clients (Node.js, Python, Go, Ruby, PHP)
- License selection at registration (Liberation v1, CC0/public domain, Creative Commons, all-rights-reserved)
- AI training policy declaration (`prohibited` / `contact required` / `open`) with licensing contact info
- Blockchain-backed record on daon-mainnet-1
- Verification URL embedded in the returned token
- Embed instructions provided at registration

**What the token proves:** *This hash was registered by this identity at this time under this license.*

---

## Pillar 2 — Content Verification

**Status: Partially live. Binary file support is the remaining gap.**

`POST /api/v1/verify-content` exists and the verify page has UI for it. Submit text content → DAON hashes it → looks it up → returns who registered it and under what license (or "not found"). This closes the loop for text-based works.

**The remaining gap:** The endpoint accepts text strings only. Binary content — images, PDFs, audio, video — cannot be verified this way yet. A photographer can't upload a JPEG to check if it's registered.

**What we're building next:**
- `POST /api/v1/verify-content` upgrade to accept multipart file uploads
- Server-side binary hashing using the same SHA-256 algorithm as registration
- Frontend file picker on the verify page alongside the existing text input

---

## Pillar 3 — The Broker System

**Status: ~40% complete. Not yet open to partners.**

The broker system lets third-party platforms register content on behalf of their users. A platform like AO3 integrates once; every work uploaded by a creator is automatically registered under a federated identity (`username@platform.com`). No individual action required from the creator.

**Why this matters:** Direct registration requires creators to know DAON exists and take action. The broker system inverts this — platforms protect creators by default.

**What's built:**
- Broker authentication (API keys, bcrypt, Ed25519 signature verification)
- Rate limiting per broker tier (Community / Standard / Enterprise)
- Federated identity management
- Content registration via broker endpoint
- Ownership transfer system with full audit trail
- Webhook delivery system (HMAC-signed, exponential backoff retry)

**What's still needed before the first certified partner:**

| Feature | Priority |
|---------|----------|
| Security monitoring + auto-suspend | Critical |
| Transfer blockchain integration (currently DB-only) | Critical |
| Broker onboarding documentation | High |
| Redis for rate limiting (currently in-memory) | High |
| License record API (AI training audit trail) | High |
| Identity linking (federated → DAON account) | Medium |
| Platform shutdown protocol | Medium |
| DMCA process | Medium |

**Broker tiers:**

| Tier | Rate Limit | Certification |
|------|-----------|---------------|
| Community | 100 req/hr | Automated checks + manual approval |
| Standard | 1,000 req/hr | Video call required |
| Enterprise | 10,000 req/hr | Full security audit |

---

## Sequence

```
NOW          → Public launch (Pillar 1)
NEAR-TERM    → Binary file verification (Pillar 2 gap)
NEXT         → Broker system completion + first certified partner (Pillar 3)
ONGOING      → Platform shutdown protocol, identity migration, DMCA handling
```

---

## What DAON Does Not Plan to Build

- Payment processing
- Licensing negotiations or marketplaces
- Price setting or revenue distribution
- AI model monitoring or violation detection
- Content hosting of any kind

These are appropriate for third parties to build on top of DAON's verification infrastructure. DAON's job is proof. Everything else is someone else's job.
