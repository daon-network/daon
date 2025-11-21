# DAON Network Architecture

This document clarifies what components are public vs private and how the network operates.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        DAON Network                              │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   Validator 1   │  │   Validator 2   │  │   Validator N   │ │
│  │  (MIT)          │  │  (OTW)          │  │  (Community)    │ │
│  │  Docker Hub     │  │  Docker Hub     │  │  Docker Hub     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│           │                    │                     │           │
│           └────────────────────┴─────────────────────┘           │
│                              │                                   │
│                   P2P Consensus Network                          │
│                     (26656 - Public)                             │
└─────────────────────────────────────────────────────────────────┘
                               │
                    Blockchain State Queries
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │     DAON API Infrastructure (Private)         │
        │                                               │
        │  ┌─────────────┐  ┌──────────────┐          │
        │  │ API Server  │  │  PostgreSQL   │          │
        │  │ (Private)   │  │  (Private)    │          │
        │  └─────────────┘  └──────────────┘          │
        │                                               │
        │         Your Infrastructure                   │
        │       (api.daon.network)                      │
        └──────────────────────────────────────────────┘
                               │
                     HTTPS REST API
                               │
        ┌──────────────────────┴─────────────────────┐
        │                                             │
        ▼                                             ▼
┌───────────────┐                           ┌──────────────────┐
│  DAON SDKs    │                           │  Creator Tools   │
│  (Public)     │                           │  (Public)        │
│               │                           │                  │
│  • Node.js    │                           │  • Browser Ext   │
│  • Python     │                           │  • WordPress     │
│  • Go         │                           │  • Bulk Scripts  │
│  • Ruby       │                           │                  │
└───────────────┘                           └──────────────────┘
```

## Component Breakdown

### 🌐 PUBLIC Components (Docker Hub: daonnetwork/*)

#### 1. Validator Node (`daonnetwork/validator:latest`)
**Who uses it:** Organizations, universities, creators who want to participate in network consensus

**What it does:**
- Validates content registrations
- Participates in blockchain consensus
- Maintains distributed ledger
- Earns validation rewards

**How to run:**
```bash
docker run -d --name daon-validator \
  -p 26656:26656 \
  daonnetwork/validator:latest
```

**Why public:**
- We WANT as many validators as possible
- Decentralization requires easy setup
- Anyone can verify the network is operating correctly
- More validators = more secure network

#### 2. SDKs (npm, PyPI, etc.)
**Who uses them:** Developers integrating DAON into their platforms

**What they do:**
- Connect to api.daon.network
- Hash and submit content for protection
- Verify content ownership
- Generate Liberation License compliance documents

**Why public:**
- We WANT developers to integrate DAON everywhere
- More platforms = more creators protected
- Open source builds trust

#### 3. Creator Tools (GitHub)
**Who uses them:** Individual creators protecting their content

**What they do:**
- Browser extension for AO3 protection
- WordPress plugin for blog protection
- Bulk protection scripts
- License generator tools

**Why public:**
- We WANT creators using these tools
- Community can contribute improvements
- Open source ensures no backdoors

### 🔒 PRIVATE Components (Your Infrastructure)

#### 1. API Server
**Who runs it:** You (DAON Network operators)

**What it does:**
- REST API layer for SDKs
- Content hashing and validation
- Database caching for fast lookups
- Rate limiting and abuse prevention
- Analytics and monitoring

**Why private:**
- This is YOUR service to creators
- You control API terms, rate limits, pricing
- You can add value-added features
- Prevents abuse and ensures quality

**Built locally during deployment - NOT on Docker Hub**

#### 2. PostgreSQL Database
**Who runs it:** You (DAON Network operators)

**What it does:**
- Cache blockchain state for fast queries
- Store API analytics
- User/API key management
- Rate limiting state

**Why private:**
- Contains your business data
- Performance optimization
- User privacy

#### 3. Redis Cache
**Who runs it:** You (DAON Network operators)

**What it does:**
- Fast content hash lookups
- Rate limiting
- Session management

**Why private:**
- Performance optimization for YOUR API
- Reduces load on blockchain nodes

## Data Flow Examples

### Example 1: Creator Protects Content

```
Creator (Browser Extension)
    │
    │ POST /api/v1/protect
    ▼
api.daon.network (Your Private API)
    │
    │ Hash content
    │ Validate license
    ▼
PostgreSQL (Check if already protected)
    │
    │ Not found - new protection needed
    ▼
DAON Validator Network (Public Blockchain)
    │
    │ Submit transaction
    │ Consensus validation
    │ Block committed
    ▼
Blockchain State Updated
    │
    │ Return transaction hash
    ▼
api.daon.network
    │
    │ Cache in PostgreSQL/Redis
    │ Return verification URL
    ▼
Creator receives proof of protection
```

### Example 2: AI Company Verifies License

```
AI Company Scraper
    │
    │ GET /api/v1/verify/CONTENT_HASH
    ▼
api.daon.network (Your Private API)
    │
    │ Check Redis cache
    ▼
Cache Hit?
    │
    ├─ Yes → Return cached result (fast)
    │
    └─ No → Query blockchain
            │
            ▼
        DAON Validator Network
            │
            │ Query state
            ▼
        Return: Liberation License + Timestamp + Creator
            │
            ▼
        api.daon.network
            │
            │ Cache result
            │ Log query (analytics)
            ▼
        Return to AI company:
        {
          "protected": true,
          "license": "liberation_v1",
          "creator": "...",
          "timestamp": "...",
          "prohibited_uses": ["ai_training"]
        }
```

## Why This Architecture?

### Decentralization Where It Matters
- **Validators:** Anyone can run one - no gatekeepers
- **Blockchain:** Immutable, distributed, censorship-resistant
- **Consensus:** No single point of control

### Centralized Where It Makes Sense
- **API:** Fast, reliable, professional service
- **Caching:** Performance optimization
- **Rate limiting:** Abuse prevention
- **Analytics:** Business intelligence

### Best of Both Worlds
- **Trust:** Blockchain validation anyone can verify
- **Performance:** API caching for instant responses
- **Resilience:** If your API goes down, validators keep running
- **Flexibility:** You can add features without blockchain upgrades

## Deployment Strategy

### Public (Docker Hub)
✅ `daonnetwork/validator:latest` - Blockchain validator node

**Build & Push:**
```bash
# Automated via GitHub Actions when you push to main
# See: .github/workflows/deploy.yml (build-validator job)
```

**Anyone can run:**
```bash
docker pull daonnetwork/validator:latest
docker run -d daonnetwork/validator:latest
```

### Private (Your Servers)
✅ API Server - Built locally during deployment
✅ PostgreSQL - Standard Docker image with your schema
✅ Redis - Standard Docker image with your config

**Deployed via:**
```bash
# GitHub Actions SSH deploy to your server
# Builds images locally, never pushes to Docker Hub
# See: .github/workflows/deploy.yml (deploy job)
```

## Security Model

### Blockchain Security
- **Consensus:** Multiple validators must agree
- **Immutability:** Can't change historical records
- **Transparency:** Anyone can audit the chain

### API Security
- **Rate limiting:** Prevent abuse
- **API keys:** Track usage, enable/disable access
- **HTTPS:** Encrypted communication
- **Firewall:** Only expose necessary ports

### Validator Security
- **Non-root user:** Container security
- **Resource limits:** Prevent DoS
- **Health checks:** Auto-restart on failure
- **Backup keys:** Validator identity protection

## Cost Analysis

### Running a Validator (Public)
- **Server:** $20-50/month (4GB RAM, 2 CPU)
- **Bandwidth:** Minimal (usually included)
- **Maintenance:** ~1 hour/month
- **Rewards:** DAON tokens + transaction fees

### Running API Infrastructure (Private - Your Cost)
- **Server:** $50-100/month (8GB RAM, 4 CPU)
- **Database volume:** $10-20/month (500GB)
- **Bandwidth:** Varies by usage
- **Monitoring:** $0-20/month (Grafana Cloud optional)
- **Revenue:** API pricing, donations, grants

## Governance

### Validator Governance (Decentralized)
- Anyone can run a validator
- Validators vote on protocol changes
- No permission needed to participate

### API Governance (Your Control)
- You set API terms of service
- You set rate limits and pricing
- You add value-added features
- You build reputation as trusted API provider

## Future Architecture

### Phase 1 (Current)
- ✅ Public validator image
- ✅ Private API service
- ✅ Manual validator setup

### Phase 2
- [ ] Multiple public API providers (competitive market)
- [ ] Validator delegation/staking
- [ ] SDK auto-failover between API providers

### Phase 3
- [ ] Light clients (no API needed - direct blockchain queries)
- [ ] IPFS integration for content storage
- [ ] Cross-chain bridges (Ethereum, etc.)

---

**Summary:** 
- **Validators = Public** (we want many)
- **API = Private** (your competitive advantage)
- **SDKs/Tools = Public** (we want adoption)
- **Blockchain State = Public** (anyone can verify)
- **Your Infrastructure = Private** (your business)

This architecture maximizes decentralization while maintaining performance and allowing you to build a sustainable business around creator protection.
