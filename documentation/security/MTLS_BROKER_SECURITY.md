# mTLS & Broker Security Enhancement Plan

> **Status:** Post-Launch Roadmap  
> **Priority:** High  
> **Target:** Phase 2 (Post-Launch)  
> **Last Updated:** January 2026

## Executive Summary

This document outlines the technical design for implementing mutual TLS (mTLS) authentication for brokers and validators, along with related security enhancements identified during the broker system security review.

### Key Objectives

1. **mTLS for Brokers** - Certificate-based authentication as defense-in-depth
2. **mTLS for Validators** - Secure validator-to-API communication
3. **Certificate Management API** - Self-service cert provisioning and rotation
4. **IP Allowlist Enforcement** - Optional enterprise security feature

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Architecture Overview](#architecture-overview)
3. [mTLS Implementation Design](#mtls-implementation-design)
4. [Certificate Management API](#certificate-management-api)
5. [Database Schema Changes](#database-schema-changes)
6. [Scaling Considerations](#scaling-considerations)
7. [Migration Strategy](#migration-strategy)
8. [Security Considerations](#security-considerations)
9. [Implementation Phases](#implementation-phases)

---

## Current State Analysis

### Existing Authentication Flow

```mermaid
sequenceDiagram
    participant B as Broker
    participant LB as Load Balancer
    participant API as API Server
    participant DB as PostgreSQL

    B->>LB: HTTPS + API Key (Bearer token)
    LB->>API: Forward request (SSL terminated)
    API->>DB: Lookup key by prefix
    DB-->>API: Key hash + broker info
    API->>API: bcrypt.compare(key, hash)
    API-->>B: 200 OK + rate limit headers
```

### Current Security Controls

| Control | Status | Notes |
|---------|--------|-------|
| API Key (bcrypt hashed) | Implemented | Primary auth method |
| Rate Limiting | Implemented | Hourly + daily limits |
| Ed25519 Signatures | Implemented | Enterprise tier only |
| Scope-based Authorization | Implemented | Per-endpoint |
| IP Allowlist | Schema only | Not enforced |
| mTLS | Not implemented | This document |

### Identified Gaps

1. **No admin auth on broker registration** - Critical, separate fix required
2. **IP allowlist not enforced** - Optional feature, low priority
3. **Single-factor auth** - API key only, no certificate option
4. **Webhook secrets in plaintext** - Should be encrypted

---

## Architecture Overview

### Target Architecture with mTLS

```mermaid
flowchart TB
    subgraph External
        B[Broker Platform]
        V[Validator Node]
    end

    subgraph Edge ["Edge Layer"]
        CF[Cloudflare CDN]
        LB[Nginx Load Balancer]
    end

    subgraph API ["API Layer"]
        API1[API Server 1]
        API2[API Server 2]
        API3[API Server 3]
    end

    subgraph Data ["Data Layer"]
        PG[(PostgreSQL)]
        RD[(Redis Cache)]
        BC[Blockchain Node]
    end

    subgraph Security ["Security Services"]
        CA[Certificate Authority]
        CRL[Revocation List]
        KMS[Key Management]
    end

    B -->|mTLS| CF
    V -->|mTLS| LB
    CF -->|X-Client-Cert Header| LB
    LB --> API1 & API2 & API3
    API1 & API2 & API3 --> PG & RD & BC
    CA -.->|Issue certs| B & V
    CRL -.->|Check revocation| LB
    KMS -.->|Manage CA keys| CA
```

### Connection Security Matrix

| Source | Destination | Auth Method | mTLS | Priority |
|--------|-------------|-------------|------|----------|
| Broker | API (via Cloudflare) | API Key + Cert Fingerprint | Phase 2 | High |
| Broker | API (direct) | API Key + mTLS | Phase 2 | High |
| Validator | API | mTLS | Phase 2 | Medium |
| Validator | Validator | Tendermint P2P | N/A | Already secure |
| API | Blockchain RPC | mTLS | Phase 3 | Low |
| Internal services | Internal | Private network | No | Not needed |

---

## mTLS Implementation Design

### Option Selection: Header Forwarding

After analyzing scaling requirements (multi-DC, Cloudflare), we recommend **Certificate Header Forwarding**:

```mermaid
sequenceDiagram
    participant B as Broker
    participant CF as Cloudflare
    participant LB as Nginx
    participant API as API Server
    participant DB as PostgreSQL

    B->>CF: mTLS handshake + request
    Note over CF: Validates client cert<br/>against uploaded CA
    CF->>LB: Request + CF-Client-Cert-* headers
    LB->>API: Request + X-Client-Cert-* headers
    API->>DB: Lookup broker by fingerprint
    DB-->>API: Broker record
    API->>API: Validate fingerprint match
    API->>API: Validate cert not expired
    API->>API: Validate API key (if provided)
    API-->>B: 200 OK
```

### Nginx Configuration for mTLS

```nginx
# /etc/nginx/conf.d/mtls.conf

# CA certificate for validating client certs
ssl_client_certificate /etc/nginx/ssl/daon-ca.crt;
ssl_verify_client optional;  # Don't require, but validate if present
ssl_verify_depth 2;

# Broker API endpoints - extract cert info
location /api/v1/broker/ {
    # Forward certificate information to backend
    proxy_set_header X-Client-Cert-Fingerprint $ssl_client_fingerprint;
    proxy_set_header X-Client-Cert-Subject $ssl_client_s_dn;
    proxy_set_header X-Client-Cert-Issuer $ssl_client_i_dn;
    proxy_set_header X-Client-Cert-Serial $ssl_client_serial;
    proxy_set_header X-Client-Cert-Verify $ssl_client_verify;
    proxy_set_header X-Client-Cert-NotBefore $ssl_client_v_start;
    proxy_set_header X-Client-Cert-NotAfter $ssl_client_v_end;
    
    # Standard proxy headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    proxy_pass http://api_backend;
}

# Validator endpoints - require mTLS
location /api/v1/validator/ {
    ssl_verify_client on;  # Required for validators
    
    proxy_set_header X-Client-Cert-Fingerprint $ssl_client_fingerprint;
    proxy_set_header X-Client-Cert-Verify $ssl_client_verify;
    
    proxy_pass http://api_backend;
}
```

### Cloudflare Configuration

For Cloudflare-proxied traffic, use Authenticated Origin Pulls + Client Certificates:

1. **Upload CA certificate** to Cloudflare dashboard
2. **Enable mTLS** for broker API endpoints
3. **Configure origin** to accept Cloudflare headers:

```
CF-Client-Cert-Fingerprint: <SHA-256 fingerprint>
CF-Client-Cert-Subject-DN: CN=ao3.org,O=Archive of Our Own
CF-Client-Cert-Issuer-DN: CN=DAON Broker CA,O=DAON
CF-Client-Cert-Serial: 1234567890
CF-Client-Cert-Verified: true
```

### API Server Certificate Validation

```typescript
// src/broker/mtls-middleware.ts

import { Request, Response, NextFunction } from 'express';
import { DatabaseClient } from '../database/client.js';

interface CertificateInfo {
  fingerprint: string;
  subject: string;
  issuer: string;
  serial: string;
  verified: boolean;
  notBefore: Date;
  notAfter: Date;
}

export function extractCertificateInfo(req: Request): CertificateInfo | null {
  const fingerprint = req.headers['x-client-cert-fingerprint'] as string;
  const verified = req.headers['x-client-cert-verify'] as string;
  
  if (!fingerprint || verified !== 'SUCCESS') {
    return null;
  }
  
  return {
    fingerprint: fingerprint.replace(/:/g, '').toLowerCase(),
    subject: req.headers['x-client-cert-subject'] as string,
    issuer: req.headers['x-client-cert-issuer'] as string,
    serial: req.headers['x-client-cert-serial'] as string,
    verified: verified === 'SUCCESS',
    notBefore: new Date(req.headers['x-client-cert-notbefore'] as string),
    notAfter: new Date(req.headers['x-client-cert-notafter'] as string),
  };
}

export function createMtlsMiddleware(db: DatabaseClient) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const certInfo = extractCertificateInfo(req);
    
    // If no cert provided, fall back to API key auth
    if (!certInfo) {
      return next();
    }
    
    // Validate certificate hasn't expired
    const now = new Date();
    if (certInfo.notAfter < now) {
      return res.status(401).json({
        success: false,
        error: 'Certificate expired',
        code: 'MTLS_CERT_EXPIRED',
        expired_at: certInfo.notAfter,
      });
    }
    
    // Lookup broker by fingerprint
    const result = await db.query(`
      SELECT b.*, bc.revoked_at as cert_revoked_at
      FROM brokers b
      JOIN broker_certificates bc ON b.id = bc.broker_id
      WHERE bc.fingerprint = $1
        AND bc.revoked_at IS NULL
        AND b.enabled = true
        AND b.certification_status = 'active'
    `, [certInfo.fingerprint]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Unknown or revoked certificate',
        code: 'MTLS_CERT_UNKNOWN',
      });
    }
    
    // Attach broker to request
    req.broker = result.rows[0];
    req.mtlsAuthenticated = true;
    req.certificateInfo = certInfo;
    
    next();
  };
}
```

---

## Certificate Management API

### API Endpoints

```mermaid
flowchart LR
    subgraph Admin ["Admin Endpoints (requires admin auth)"]
        A1[POST /admin/brokers/:id/certificate]
        A2[GET /admin/brokers/:id/certificate]
        A3[POST /admin/brokers/:id/certificate/rotate]
        A4[DELETE /admin/brokers/:id/certificate]
    end

    subgraph Broker ["Broker Self-Service"]
        B1[GET /broker/certificate]
        B2[POST /broker/certificate/csr]
    end

    subgraph Internal ["Internal Services"]
        I1[GET /internal/crl]
        I2[GET /internal/ca-chain]
    end
```

### Endpoint Specifications

#### POST /api/v1/admin/brokers/:id/certificate

Generate and issue a new client certificate for a broker.

**Request:**
```json
{
  "validity_days": 365,
  "key_type": "EC",
  "key_curve": "P-256",
  "subject_alt_names": ["api.ao3.org", "www.ao3.org"]
}
```

**Response:**
```json
{
  "success": true,
  "certificate": {
    "id": 42,
    "fingerprint": "a1b2c3d4e5f6...",
    "subject": "CN=ao3.org,O=Archive of Our Own",
    "issuer": "CN=DAON Broker CA,O=DAON",
    "serial": "1234567890",
    "not_before": "2026-01-05T00:00:00Z",
    "not_after": "2027-01-05T00:00:00Z",
    "pem": "-----BEGIN CERTIFICATE-----\n..."
  },
  "private_key": "-----BEGIN EC PRIVATE KEY-----\n...",
  "ca_chain": "-----BEGIN CERTIFICATE-----\n...",
  "warning": "Private key will not be shown again. Store securely."
}
```

#### POST /api/v1/admin/brokers/:id/certificate/rotate

Rotate certificate with grace period for old cert.

**Request:**
```json
{
  "grace_period_hours": 24,
  "revoke_old_after_grace": true
}
```

**Response:**
```json
{
  "success": true,
  "new_certificate": { ... },
  "old_certificate": {
    "fingerprint": "old123...",
    "valid_until": "2026-01-06T00:00:00Z",
    "will_revoke_at": "2026-01-06T00:00:00Z"
  },
  "private_key": "-----BEGIN EC PRIVATE KEY-----\n..."
}
```

#### DELETE /api/v1/admin/brokers/:id/certificate

Immediately revoke a certificate.

**Request:**
```json
{
  "fingerprint": "a1b2c3d4...",
  "reason": "key_compromise",
  "notify_broker": true
}
```

**Revocation Reasons:**
- `key_compromise` - Private key exposed
- `ca_compromise` - CA was compromised
- `affiliation_changed` - Broker no longer authorized
- `superseded` - Replaced by new certificate
- `cessation_of_operation` - Broker shutting down
- `certificate_hold` - Temporary suspension

### Certificate Generation Service

```typescript
// src/broker/certificate-service.ts

import forge from 'node-forge';
import { DatabaseClient } from '../database/client.js';

export interface CertificateOptions {
  brokerId: number;
  domain: string;
  organizationName: string;
  validityDays: number;
  keyType: 'EC' | 'RSA';
  keyCurve?: 'P-256' | 'P-384';
  keySize?: 2048 | 4096;
  subjectAltNames?: string[];
}

export interface GeneratedCertificate {
  certificate: string;      // PEM-encoded certificate
  privateKey: string;       // PEM-encoded private key
  fingerprint: string;      // SHA-256 fingerprint
  serial: string;
  notBefore: Date;
  notAfter: Date;
}

export class CertificateService {
  private db: DatabaseClient;
  private caCert: forge.pki.Certificate;
  private caKey: forge.pki.PrivateKey;
  
  constructor(db: DatabaseClient, caCertPem: string, caKeyPem: string) {
    this.db = db;
    this.caCert = forge.pki.certificateFromPem(caCertPem);
    this.caKey = forge.pki.privateKeyFromPem(caKeyPem);
  }
  
  async generateCertificate(options: CertificateOptions): Promise<GeneratedCertificate> {
    // Generate key pair
    const keys = options.keyType === 'EC'
      ? forge.pki.ed25519.generateKeyPair()
      : forge.pki.rsa.generateKeyPair(options.keySize || 2048);
    
    // Create certificate
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = this.generateSerialNumber();
    
    // Validity
    const notBefore = new Date();
    const notAfter = new Date();
    notAfter.setDate(notAfter.getDate() + options.validityDays);
    cert.validity.notBefore = notBefore;
    cert.validity.notAfter = notAfter;
    
    // Subject
    cert.setSubject([
      { name: 'commonName', value: options.domain },
      { name: 'organizationName', value: options.organizationName },
    ]);
    
    // Issuer (from CA)
    cert.setIssuer(this.caCert.subject.attributes);
    
    // Extensions
    cert.setExtensions([
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', clientAuth: true },
      {
        name: 'subjectAltName',
        altNames: (options.subjectAltNames || [options.domain]).map(name => ({
          type: 2, // DNS
          value: name,
        })),
      },
    ]);
    
    // Sign with CA key
    cert.sign(this.caKey, forge.md.sha256.create());
    
    // Calculate fingerprint
    const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert));
    const fingerprint = forge.md.sha256.create()
      .update(certDer.getBytes())
      .digest()
      .toHex();
    
    // Store in database
    await this.db.query(`
      INSERT INTO broker_certificates (
        broker_id, fingerprint, serial, subject_dn, issuer_dn,
        not_before, not_after, certificate_pem, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `, [
      options.brokerId,
      fingerprint,
      cert.serialNumber,
      forge.pki.distinguishedNameToAsn1(cert.subject).value,
      forge.pki.distinguishedNameToAsn1(cert.issuer).value,
      notBefore,
      notAfter,
      forge.pki.certificateToPem(cert),
    ]);
    
    return {
      certificate: forge.pki.certificateToPem(cert),
      privateKey: forge.pki.privateKeyToPem(keys.privateKey),
      fingerprint,
      serial: cert.serialNumber,
      notBefore,
      notAfter,
    };
  }
  
  async revokeCertificate(
    fingerprint: string,
    reason: string,
    revokedBy: number
  ): Promise<void> {
    await this.db.query(`
      UPDATE broker_certificates
      SET revoked_at = NOW(),
          revocation_reason = $1,
          revoked_by = $2
      WHERE fingerprint = $3
    `, [reason, revokedBy, fingerprint]);
    
    // Add to CRL cache (Redis)
    await this.addToCrl(fingerprint, reason);
  }
  
  async getCertificateRevocationList(): Promise<string[]> {
    const result = await this.db.query(`
      SELECT fingerprint FROM broker_certificates
      WHERE revoked_at IS NOT NULL
    `);
    return result.rows.map(r => r.fingerprint);
  }
  
  private generateSerialNumber(): string {
    return forge.util.bytesToHex(forge.random.getBytesSync(16));
  }
  
  private async addToCrl(fingerprint: string, reason: string): Promise<void> {
    // Implementation would add to Redis set for fast lookup
  }
}
```

---

## Database Schema Changes

### New Tables

```sql
-- Certificate storage and management
CREATE TABLE IF NOT EXISTS broker_certificates (
    id SERIAL PRIMARY KEY,
    broker_id INTEGER REFERENCES brokers(id) ON DELETE CASCADE,
    
    -- Certificate identity
    fingerprint VARCHAR(64) UNIQUE NOT NULL,  -- SHA-256 hex
    serial VARCHAR(64) NOT NULL,
    
    -- Subject/Issuer
    subject_dn TEXT NOT NULL,
    issuer_dn TEXT NOT NULL,
    
    -- Validity
    not_before TIMESTAMP NOT NULL,
    not_after TIMESTAMP NOT NULL,
    
    -- Certificate data
    certificate_pem TEXT NOT NULL,
    
    -- Revocation
    revoked_at TIMESTAMP,
    revocation_reason VARCHAR(50),
    revoked_by INTEGER REFERENCES users(id),
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT valid_revocation_reason CHECK (
        revocation_reason IS NULL OR revocation_reason IN (
            'key_compromise', 'ca_compromise', 'affiliation_changed',
            'superseded', 'cessation_of_operation', 'certificate_hold'
        )
    )
);

CREATE INDEX idx_broker_certs_broker ON broker_certificates(broker_id);
CREATE INDEX idx_broker_certs_fingerprint ON broker_certificates(fingerprint);
CREATE INDEX idx_broker_certs_expiry ON broker_certificates(not_after);
CREATE INDEX idx_broker_certs_revoked ON broker_certificates(revoked_at) WHERE revoked_at IS NOT NULL;

-- Certificate Authority configuration
CREATE TABLE IF NOT EXISTS certificate_authorities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    purpose VARCHAR(50) NOT NULL,  -- 'broker', 'validator', 'internal'
    
    -- CA Certificate
    certificate_pem TEXT NOT NULL,
    private_key_encrypted TEXT NOT NULL,  -- Encrypted with KMS
    
    -- Validity
    not_before TIMESTAMP NOT NULL,
    not_after TIMESTAMP NOT NULL,
    
    -- Status
    active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    
    CONSTRAINT valid_purpose CHECK (purpose IN ('broker', 'validator', 'internal'))
);

-- Validator certificates (similar structure)
CREATE TABLE IF NOT EXISTS validator_certificates (
    id SERIAL PRIMARY KEY,
    validator_address VARCHAR(64) NOT NULL,  -- Tendermint validator address
    
    fingerprint VARCHAR(64) UNIQUE NOT NULL,
    serial VARCHAR(64) NOT NULL,
    subject_dn TEXT NOT NULL,
    issuer_dn TEXT NOT NULL,
    not_before TIMESTAMP NOT NULL,
    not_after TIMESTAMP NOT NULL,
    certificate_pem TEXT NOT NULL,
    
    revoked_at TIMESTAMP,
    revocation_reason VARCHAR(50),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_validator_certs_address ON validator_certificates(validator_address);
CREATE INDEX idx_validator_certs_fingerprint ON validator_certificates(fingerprint);
```

### Broker Table Additions

```sql
ALTER TABLE brokers ADD COLUMN IF NOT EXISTS require_mtls BOOLEAN DEFAULT FALSE;
ALTER TABLE brokers ADD COLUMN IF NOT EXISTS mtls_grace_period_ends TIMESTAMP;

COMMENT ON COLUMN brokers.require_mtls IS 'If true, mTLS is required in addition to API key';
COMMENT ON COLUMN brokers.mtls_grace_period_ends IS 'During migration, allow API key only until this date';
```

---

## Scaling Considerations

### Multi-Region Certificate Distribution

```mermaid
flowchart TB
    subgraph Primary ["Primary Region (US-East)"]
        CA[Certificate Authority]
        DB1[(Primary PostgreSQL)]
    end

    subgraph Secondary ["Secondary Regions"]
        subgraph EU ["EU Region"]
            LB_EU[Load Balancer]
            DB_EU[(PostgreSQL Replica)]
        end
        subgraph Asia ["Asia Region"]
            LB_ASIA[Load Balancer]
            DB_ASIA[(PostgreSQL Replica)]
        end
    end

    subgraph Cache ["Distributed Cache"]
        R1[Redis US]
        R2[Redis EU]
        R3[Redis Asia]
    end

    CA -->|Issue certs| DB1
    DB1 -->|Replicate| DB_EU & DB_ASIA
    
    CA -->|Publish CRL| R1
    R1 <-->|Sync| R2 & R3
    
    LB_EU -->|Check CRL| R2
    LB_ASIA -->|Check CRL| R3
```

### CRL Caching Strategy

```typescript
// Certificate Revocation List caching
interface CRLCacheConfig {
  // Full CRL refresh interval
  fullRefreshIntervalMs: 300000;  // 5 minutes
  
  // Delta CRL check interval (new revocations only)
  deltaCheckIntervalMs: 30000;    // 30 seconds
  
  // Local cache TTL
  localCacheTtlMs: 60000;         // 1 minute
  
  // Redis key prefix
  redisKeyPrefix: 'daon:crl:';
}

// Check revocation with caching
async function isCertificateRevoked(fingerprint: string): Promise<boolean> {
  // 1. Check local memory cache (fastest)
  if (localCrlCache.has(fingerprint)) {
    return true;
  }
  
  // 2. Check Redis (shared across instances)
  const revoked = await redis.sismember('daon:crl:fingerprints', fingerprint);
  if (revoked) {
    localCrlCache.add(fingerprint);
    return true;
  }
  
  return false;
}
```

### Cloudflare Integration

For Cloudflare-proxied deployments:

```mermaid
sequenceDiagram
    participant B as Broker
    participant CF as Cloudflare Edge
    participant O as Origin (Nginx)
    participant API as API Server

    Note over CF: mTLS enabled for<br/>/api/v1/broker/*
    
    B->>CF: TLS handshake with client cert
    CF->>CF: Validate cert against uploaded CA
    
    alt Certificate Valid
        CF->>O: Request + CF-Client-Cert headers
        O->>API: Request + normalized headers
        API->>API: Validate fingerprint in DB
        API-->>B: 200 OK
    else Certificate Invalid
        CF-->>B: 403 Forbidden
    end
```

**Cloudflare Headers Available:**
- `CF-Client-Cert-Verified`: `true` or `false`
- `CF-Client-Cert-Fingerprint`: SHA-256 fingerprint
- `CF-Client-Cert-Subject-DN`: Full subject DN
- `CF-Client-Cert-Issuer-DN`: Full issuer DN
- `CF-Client-Cert-Serial`: Certificate serial number
- `CF-Client-Cert-Not-Before`: Validity start
- `CF-Client-Cert-Not-After`: Validity end

**Limitation:** Cloudflare does not forward the full certificate PEM, only metadata. Fingerprint-based validation is required.

---

## Migration Strategy

### Phase 1: Infrastructure Setup (Week 1-2)

```mermaid
gantt
    title mTLS Implementation Timeline
    dateFormat  YYYY-MM-DD
    section Infrastructure
    Generate CA keypair           :a1, 2026-02-01, 2d
    Store CA in KMS              :a2, after a1, 1d
    Configure Nginx mTLS         :a3, after a2, 2d
    Deploy to staging            :a4, after a3, 2d
    
    section API Development
    Certificate service          :b1, 2026-02-01, 5d
    Admin endpoints              :b2, after b1, 3d
    mTLS middleware              :b3, after b1, 3d
    Integration tests            :b4, after b2, 3d
    
    section Rollout
    Enterprise brokers (opt-in)  :c1, 2026-02-15, 14d
    Standard brokers (opt-in)    :c2, after c1, 14d
    Documentation & support      :c3, 2026-02-15, 28d
```

### Phase 2: Gradual Rollout

1. **Opt-in Period (4 weeks)**
   - mTLS available but optional
   - API key remains primary auth
   - Enterprise brokers invited to test

2. **Encouraged Period (4 weeks)**
   - mTLS recommended in docs
   - Dashboard shows security score
   - Email campaign to brokers

3. **Required for Enterprise (ongoing)**
   - Enterprise tier requires mTLS
   - Standard/Community remain optional
   - Grace period for migration

### Broker Communication Template

```markdown
Subject: [DAON] Enhanced Security: mTLS Now Available

Dear {broker_name} Team,

We're pleased to announce mutual TLS (mTLS) authentication is now 
available for your broker integration.

**What is mTLS?**
mTLS adds certificate-based authentication alongside your API key,
providing defense-in-depth security for your content registrations.

**Timeline:**
- Now: mTLS available (opt-in)
- {date+30}: Recommended for all brokers
- {date+60}: Required for Enterprise tier

**Getting Started:**
1. Log in to your broker dashboard
2. Navigate to Security > Certificates
3. Generate your client certificate
4. Update your integration (see docs)

Documentation: https://docs.daon.io/broker/mtls
Support: broker-support@daon.io

Best regards,
DAON Security Team
```

---

## Security Considerations

### Threat Model

| Threat | Mitigation | mTLS Benefit |
|--------|------------|--------------|
| API key theft | Rate limiting, key rotation | Cert required too |
| Man-in-the-middle | TLS encryption | Client authentication |
| Replay attacks | Timestamps, nonces | Cert binding |
| Broker impersonation | API key validation | Cert tied to domain |
| Key compromise | Revocation | CRL distribution |

### Certificate Security Requirements

1. **Key Storage**
   - Private keys never stored on DAON servers (except CA)
   - CA private key in KMS (HashiCorp Vault / AWS KMS)
   - Broker keys generated client-side when possible

2. **Certificate Validity**
   - Maximum validity: 1 year
   - Recommended validity: 90 days
   - Auto-rotation reminders at 30 days

3. **Revocation**
   - CRL updated within 30 seconds of revocation
   - OCSP responder for real-time checks (future)
   - Immediate propagation to all regions

### Audit Logging

All certificate operations logged:

```typescript
interface CertificateAuditLog {
  timestamp: Date;
  action: 'issue' | 'revoke' | 'rotate' | 'verify_success' | 'verify_failure';
  broker_id: number;
  fingerprint: string;
  performed_by: number;  // Admin user ID
  ip_address: string;
  details: {
    reason?: string;
    old_fingerprint?: string;  // For rotations
    failure_reason?: string;   // For verify failures
  };
}
```

---

## Implementation Phases

### Phase 1: Foundation (Critical Path)

**Must complete before mTLS:**
- [ ] Admin authentication on broker registration endpoint
- [ ] Certificate Authority setup and key management
- [ ] Database schema migrations

### Phase 2: Core mTLS (This Document)

- [ ] Certificate generation service
- [ ] Certificate management API endpoints
- [ ] mTLS middleware for API servers
- [ ] Nginx/Cloudflare configuration
- [ ] CRL distribution system

### Phase 3: Validator mTLS

- [ ] Validator certificate issuance
- [ ] Validator → API authentication
- [ ] Integration with Tendermint KMS

### Phase 4: Advanced Features

- [ ] OCSP responder
- [ ] Hardware security module (HSM) integration
- [ ] Automated certificate rotation
- [ ] Certificate transparency logging

---

## Appendix A: Configuration Reference

### Environment Variables

```bash
# Certificate Authority
DAON_CA_CERT_PATH=/etc/daon/ca/ca.crt
DAON_CA_KEY_PATH=/etc/daon/ca/ca.key  # Or KMS reference
DAON_CA_KEY_KMS_ID=arn:aws:kms:...    # If using AWS KMS

# mTLS Settings
DAON_MTLS_ENABLED=true
DAON_MTLS_REQUIRED_TIERS=enterprise   # Comma-separated
DAON_MTLS_GRACE_PERIOD_DAYS=30

# CRL Settings
DAON_CRL_REFRESH_INTERVAL_MS=300000
DAON_CRL_REDIS_KEY=daon:crl:fingerprints
```

### Nginx Full Configuration

See `/nginx/conf.d/mtls.conf` (to be created)

---

## Appendix B: Testing Checklist

### Unit Tests
- [ ] Certificate generation with valid parameters
- [ ] Certificate generation with invalid parameters
- [ ] Certificate revocation
- [ ] Fingerprint extraction from headers
- [ ] CRL lookup (cache hit)
- [ ] CRL lookup (cache miss)

### Integration Tests
- [ ] Full mTLS handshake with valid cert
- [ ] Rejection of expired certificate
- [ ] Rejection of revoked certificate
- [ ] Rejection of unknown certificate
- [ ] Fallback to API key when no cert provided
- [ ] Rate limiting with mTLS auth
- [ ] Certificate rotation with grace period

### Load Tests
- [ ] CRL lookup under load (10k req/s)
- [ ] Certificate validation latency (<10ms p99)
- [ ] Multi-region CRL sync latency

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-05 | Security Review | Initial draft |
