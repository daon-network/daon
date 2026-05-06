# DAON Product Roadmap
**Last updated:** May 2026
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

**Next for Pillar 1 — Canary Trap Registry:**

When a creator registers content, they can also register a *canary* — a short, unique, statistically improbable phrase embedded in their published work. The canary hash is stored on-chain alongside the content record; the plaintext is known only to the creator. If a model is later suspected of training on their work, the creator prompts the model to elicit the canary. Successful elicitation + the timestamped DAON receipt = evidence of unauthorized ingestion.

**What to build:**
- Canary generation tool (produces phrases with near-zero probability of natural occurrence)
- `canary_hash` field on `protected_content`, committed to chain
- Canary verification endpoint: given a canary and a model response, assess statistical likelihood of memorization
- Creator guidance on canary placement (must survive tokenization and not alter meaning for human readers)

**Research basis:** ICLR 2025 canary-based privacy auditing demonstrated the first nontrivial privacy audit of an LLM trained on real data. Canary design is the critical variable — poorly designed canaries underestimate memorization by orders of magnitude. The generation tool must account for tokenizer behavior across major model families.

**Priority:** Near-term. This is a field, a tool, and an endpoint — not a new system.

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

**Next for Pillar 2 — Membership Inference as a Service (MIaaS):**

DAON already holds the registered content. MIaaS lets a creator ask: *"Was my work used to train this model?"* and get a statistically rigorous answer.

**How it works:**
- Creator selects registered content from their DAON portfolio
- DAON runs membership inference attacks against target model APIs (SPV-MIA, DUALTEST, or successor methods)
- Returns a confidence score and a report structured for legal proceedings
- Canary probes (from Pillar 1) are used as targeted tests alongside general membership inference

**What to build:**
- Inference pipeline that queries model APIs with registered content
- Statistical testing framework (p-values, AUC scores, false positive calibration)
- Report generator: timestamped DAON receipt + inference results + methodology disclosure
- API partnerships or proxy access to target models

**Research basis:** SPV-MIA raised membership inference AUC from 0.7 to 0.9. DUALTEST detected hundreds of memorized samples in LLaMA-2-70B across one million articles. These methods work on black-box API access — no model weights required.

**Priority:** Medium-term. Depends on having a critical mass of registered content and stable model API access. Legal report format should be designed with input from an IP attorney.

**Open question:** Should MIaaS results be published on-chain as "inference attestations," creating a public record of which models show evidence of training on which registered works?

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
| AI licensing fields | ~~High~~ | ~~`ai_training_policy`, `licensing_email`, `licensing_uri` absent from schema~~ **Shipped** (PR #71) |
| 2FA recovery via backup codes | High | Allow users to disable/reset 2FA using a backup code when they've lost their authenticator. Currently backup codes can authenticate but not reset 2FA — users who lose their authenticator AND don't have a trusted device are permanently locked out. |
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

## Research Track: Radioactive Text Watermarking

*Separate project. Not a DAON feature — a tool that feeds into DAON's registry.*

The February 2024 paper "Watermarking Makes Language Models Radioactive" proved that watermarked text leaves detectable traces in models trained on it, with p-values as low as 10⁻⁶. ICLR 2025 extended this to diffusion models and federated learning.

**The concept:** A creator runs their text through a watermarking process that embeds statistically detectable patterns at the token distribution level — invisible to human readers, but "radioactive" to any model that ingests it. If a model trains on the watermarked version, the watermark signature propagates into the model's outputs and can be detected with high confidence.

**This is not homoglyph swapping.** It's distributional — shifting which synonym or phrasing gets used in ways that are statistically fingerprinted. The original meaning is preserved. The math is sound.

**What needs to exist:**
- A text-specific implementation for human-authored content (current work focuses on LLM-generated text and images)
- A detection pipeline that works against black-box model APIs
- Integration with DAON's registry so the watermark parameters are timestamped on-chain
- Probably an academic collaboration — this is a research problem, not a weekend feature

**The endgame:** A creator watermarks their manuscript, registers the watermarked version on DAON, publishes it. Six months later, a model shows the radioactive signature. The DAON receipt proves the watermarked version existed before the model's training cutoff. The statistical test proves ingestion. The Liberation License proves the boundary was set. That's a case.

**Key references:**
- "Watermarking Makes Language Models Radioactive" (Sander et al., 2024)
- "Radioactive Watermarks in Diffusion and Autoregressive Image Generative Models" (2025)
- WARD: Dataset misuse detection in RAG systems with statistical guarantees (ETH Zürich, ICLR 2025)
- "Scaling Up Membership Inference" (NAACL 2025)
- "Privacy Auditing of Large Language Models" (2025) — canary design for nontrivial LLM auditing

---

## Sequence

```
NOW          → Public launch with current feature set (Pillar 1)
NEAR-TERM    → Canary trap registry (Pillar 1) + binary file verification (Pillar 2 gap)
NEXT         → Broker system completion + first certified partner (Pillar 3)
FOLLOWING    → Membership Inference as a Service (Pillar 2)
RESEARCH     → Radioactive text watermarking (separate project, feeds into DAON)
ONGOING      → Platform shutdown protocol, identity migration, DMCA handling
```

The broker system does not need to be complete before launch. Launch with Pillar 1. Canary traps and binary verification are the first post-launch features. MIaaS follows once there's enough registered content to make inference attacks meaningful. Radioactive watermarking is a parallel research effort.

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
- Content hosting of any kind

These are appropriate for third parties to build on top of DAON's verification infrastructure. DAON's job is proof — proof of registration, proof of boundary, and (with MIaaS and radioactive watermarking) proof of ingestion.

---

## Open Questions

1. Should license records (AI training audit trail) be public or private?
2. For broker-registered content: auto-populate broker's licensing email as default contact?
3. Payment currency in license records: normalize to USD or support multiple?
4. Should MIaaS inference results be published on-chain as "ingestion attestations" — creating a public, immutable record of which models show evidence of training on which registered works?
5. Radioactive watermarking: pursue as internal research or seek academic partnership? (ETH Zürich, UChicago, and Amazon Science all have active groups in this space.)
