# DAON Federated Identity Architecture

**Status:** SUPERSEDED - See PROTECTION_SYSTEM_FINAL.md for current architecture  
**Last Updated:** December 2025

> **Note:** The broker model described here remains valid for long-term platform 
> integration. However, for MVP, we are using direct web upload with email/OAuth 
> identity. See `PROTECTION_SYSTEM_FINAL.md` for the approved implementation plan.

---

## The Problem

Traditional blockchain requires users to:
- Manage private keys (complex, scary)
- Install wallet software (friction)
- Understand gas fees (confusing)
- Never lose their keys (impossible for most users)

**This is unacceptable for creators** who just want to protect their fanfiction from AI scraping.

---

## The Solution: Federated Identity via Brokers

Instead of forcing wallet management, DAON uses a **broker model** where platforms vouch for user identity.

### Identity Format

```
username@platform.domain

Examples:
- fanficwriter@archiveofourown.org
- novelist@wattpad.com
- blogger@wordpress-site.com
```

The **platform is the trust anchor**, just like email.

---

## How It Works

### 1. User Experience (Zero Crypto Knowledge Required)

```
User publishes fanfic on AO3
        ↓
AO3 extension: "Protect with DAON?"
        ↓
User clicks "Yes"
        ↓
✅ Protected! No wallet, no keys, no blockchain jargon.
```

Behind the scenes:
- AO3 signs transaction with broker key
- Registers: `username@archiveofourown.org owns sha256:abc123`
- Blockchain records immutable proof

---

### 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  CONTENT PLATFORMS                       │
│  (AO3, Wattpad, WordPress, etc.)                        │
│                                                          │
│  - Manage user accounts                                 │
│  - Handle password recovery                             │
│  - Vouch for user identity                              │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ DAON Broker SDK
                   │ - Signs registrations
                   │ - Provides verification API
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│              DAON BLOCKCHAIN                             │
│                                                          │
│  Stores:                                                 │
│  - Content hash                                          │
│  - Owner identity (username@domain)                     │
│  - Broker signature                                      │
│  - License type                                          │
│  - Timestamp                                             │
└─────────────────────────────────────────────────────────┘
                   │
                   │ Verification Queries
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│              ANYONE CAN VERIFY                           │
│                                                          │
│  - Check if content is protected                        │
│  - See who owns it                                       │
│  - Verify license terms                                  │
│  - Cryptographic proof                                   │
└─────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. Broker (Platform)

**Responsibilities:**
- ✅ User account management
- ✅ Authentication & password recovery
- ✅ Sign registrations with broker key
- ✅ Provide identity verification API
- ✅ Meet security certification standards

**Benefits:**
- ✅ Existing relationship with users
- ✅ Already solving identity problem
- ✅ Users trust them
- ✅ Can leverage existing security infrastructure

---

### 2. DAON Blockchain

**Stores:**
```javascript
{
  content_hash: "sha256:abc123...",
  owner: "fanficwriter@archiveofourown.org",
  owner_type: "brokered",
  broker: "archiveofourown.org",
  broker_signature: "...",
  license: "liberation_v1",
  registered_at: "2025-12-01T10:30:00Z"
}
```

**Provides:**
- Immutable proof of registration
- Public verification
- License enforcement record
- Timestamp proof

---

### 3. Broker SDK (`@daon/broker-sdk`)

**Makes integration trivial:**

```typescript
import { DAONBroker } from '@daon/broker-sdk';

const broker = new DAONBroker({
  domain: 'myplatform.com',
  privateKey: process.env.DAON_BROKER_KEY
});

// Protect content
await broker.registerContent({
  username: 'fanficwriter',
  contentHash: 'sha256:abc123',
  license: 'liberation_v1'
});
```

**Platform integration:** 4 hours max for most platforms.

---

## Security Model

### Trust Hierarchy

```
User trusts Platform
     ↓
Platform trusts DAON
     ↓
DAON trusts Blockchain
     ↓
Blockchain trusts Math
```

### What Each Party Controls

| Party | Controls | Cannot Control |
|-------|----------|----------------|
| **User** | Account login | Blockchain records |
| **Platform** | Account recovery | Past registrations |
| **DAON** | Certification | Platform security |
| **Blockchain** | Immutability | Off-chain identity |

---

## Account Recovery Flow

### Traditional Blockchain (Broken)
```
User loses private key
     ↓
❌ GONE FOREVER
     ↓
No recovery possible
```

### DAON Broker Model (Works)
```
User forgets password
     ↓
Platform recovery process
(email reset, 2FA, etc.)
     ↓
User regains account access
     ↓
✅ Content ownership maintained
(blockchain still recognizes username@platform.com)
```

---

## Migration to Self-Custody

Users can "graduate" to direct ownership when ready:

### Migration Flow

```
1. User: "I want to control my own wallet"
   ↓
2. Platform: "Okay, here's what that means..."
   Warning: You'll be responsible for your keys
   Warning: We cannot help you recover them
   Warning: Loss = permanent
   ↓
3. User connects Keplr wallet
   ↓
4. User proves ownership (signs challenge)
   ↓
5. Platform signs migration transaction
   ↓
6. Blockchain transfers ownership:
   FROM: username@platform.com
   TO: daon1abc123... (wallet address)
   ↓
7. ✅ User now has direct ownership
   ❌ Platform can no longer help with recovery
```

### Code Example

```typescript
// User requests migration
app.post('/daon/migrate', authenticateUser, async (req, res) => {
  const { walletAddress, confirmed } = req.body;
  
  // User must explicitly confirm they understand
  if (!confirmed) {
    return res.status(400).json({
      error: 'You must confirm you understand wallet responsibility'
    });
  }
  
  // Migrate all user's registrations
  const result = await broker.migrateToWallet({
    username: req.user.username,
    walletAddress: walletAddress,
    userConfirmed: true
  });
  
  if (result.success) {
    // Update user record
    await db.users.update(req.user.id, {
      daon_migrated: true,
      daon_wallet: walletAddress
    });
    
    res.json({
      success: true,
      message: 'You now control your registrations directly. Keep your wallet safe!'
    });
  }
});
```

---

## Broker Certification

To prevent malicious or insecure brokers, DAON requires certification.

### Certification Tiers

**Tier 1: Community (Self-Certified)**
- Small platforms, personal sites
- Basic security standards
- Self-assessment
- Max 10,000 users

**Tier 2: Standard (Audited)**
- Medium platforms
- Third-party security audit
- Enhanced requirements
- Max 1,000,000 users

**Tier 3: Enterprise (SOC 2)**
- Major platforms
- SOC 2 Type II required
- Annual audits
- Unlimited users

### Minimum Standards (All Tiers)

- ✅ Multi-factor authentication
- ✅ Account recovery mechanism
- ✅ Audit logging
- ✅ TLS 1.3+
- ✅ Rate limiting
- ✅ API security
- ✅ Identity verification endpoint
- ✅ Privacy policy

Full standards: See `BROKER_CERTIFICATION.md`

---

## Verification Without Broker

Even if broker goes offline, verification still works:

### Blockchain Record (Permanent)
```
Content sha256:abc123 was registered by
username@archiveofourown.org on 2025-12-01
with Liberation License v1.0
```

### Verification Process
```
AI Scraper: "Can I use this content?"
     ↓
Check DAON: verify.daon.network/sha256:abc123
     ↓
Result: Protected, Liberation License
     ↓
Check License: Does scraper comply?
     ↓
If yes: Allowed (with attribution)
If no: Violation → Legal action
```

**Broker being offline doesn't affect verification** — blockchain record is permanent.

---

## Attack Scenarios & Mitigations

### Attack: Broker Gets Hacked

**What attacker can do:**
- Register new content as users ❌
- Cannot alter past registrations ✅
- Cannot transfer ownership ✅ (requires broker signature)

**Mitigation:**
- Broker security standards
- Audit logging (detect attack)
- Suspension mechanism
- Users can migrate away

---

### Attack: Broker Goes Rogue

**What broker can do:**
- Register fake content for users ❌
- Cannot alter past registrations ✅
- Cannot steal ownership ✅ (immutable on-chain)

**Mitigation:**
- Blockchain has permanent record
- Users can prove registration date
- Community can revoke broker cert
- Users can migrate to new broker

---

### Attack: Broker Shuts Down

**Impact:**
- New registrations: Impossible ❌
- Existing registrations: Still valid ✅
- Verification: Still works ✅
- User migration: Possible (if broker cooperates) ⚠️

**Mitigation:**
- Broker should provide export tools
- Users should back up registration list
- Migration to direct wallet available
- Community can run recovery service

---

### Attack: User Account Compromised

**What attacker can do:**
- Register new content as user ❌
- Cannot alter user's existing registrations ✅
- Cannot transfer ownership ✅ (requires explicit migration)

**Mitigation:**
- Platform's existing security (2FA, etc.)
- Audit logs (detect unauthorized registrations)
- User can report compromise
- Platform can suspend account

---

## Comparison to Alternatives

### vs. Traditional Blockchain Wallets

| Feature | DAON Broker | Traditional Wallet |
|---------|-------------|-------------------|
| User setup | 0 minutes | 30+ minutes |
| Key management | Platform handles | User responsible |
| Recovery | Password reset | Impossible |
| UX complexity | Zero crypto | High crypto |
| Trust model | Trust platform | Trust yourself |
| Migration | Optional | Required |

---

### vs. Account Abstraction / Smart Wallets

| Feature | DAON Broker | Smart Wallets |
|---------|-------------|---------------|
| Available now | ✅ Yes | ⚠️ Emerging |
| Gas fees | Platform pays | User pays |
| Recovery | Platform handles | Social recovery |
| Platform integration | Easy (SDK) | Complex |
| User education | None needed | Some needed |

---

### vs. Centralized Databases

| Feature | DAON Broker | Centralized DB |
|---------|-------------|----------------|
| Tamper-proof | ✅ Yes | ❌ No |
| Platform-portable | ✅ Yes | ❌ No |
| Public verification | ✅ Yes | ❌ No |
| Censorship resistant | ✅ Yes | ❌ No |
| Platform controls | ⚠️ Identity only | ❌ Everything |

---

## Implementation Roadmap

### Phase 1: MVP (3 months)
- ✅ Broker SDK (Node.js)
- ✅ Blockchain module updates
- ✅ Certification standards
- ✅ WordPress plugin (reference)
- ✅ Documentation

### Phase 2: Ecosystem (6 months)
- AO3 integration (browser extension)
- Wattpad integration
- 5 certified brokers
- Verification website
- Mobile apps (iOS/Android)

### Phase 3: Decentralization (12 months)
- Governance for broker approval
- Community-run certification
- Multi-chain support
- Advanced migration tools
- Open standards body

---

## For Brokers: Getting Started

### 1. Install SDK
```bash
npm install @daon/broker-sdk
```

### 2. Generate Keys
```typescript
import { DAONBroker } from '@daon/broker-sdk';

const keys = DAONBroker.generateKeyPair();
console.log('Private key:', keys.privateKey); // Save securely!
console.log('Public key:', keys.publicKey);   // Publish this
```

### 3. Integrate
```typescript
const broker = new DAONBroker({
  domain: 'myplatform.com',
  privateKey: process.env.DAON_BROKER_KEY
});

// When user publishes content
await broker.registerContent({
  username: user.username,
  contentHash: hashContent(content),
  license: 'liberation_v1'
});
```

### 4. Publish Endpoints
```
GET /.well-known/daon/verify/:username
GET /.well-known/daon/broker-key.json
```

### 5. Apply for Certification
https://daon.network/become-a-broker

---

## For Users: What You Get

### Without Wallet (Default)
- ✅ Content protected on blockchain
- ✅ Cryptographic proof of ownership
- ✅ Public verification
- ✅ Zero complexity
- ✅ Platform handles everything
- ⚠️ Trust platform security

### With Wallet (Advanced)
- ✅ All of above
- ✅ Direct blockchain ownership
- ✅ Platform-independent
- ✅ Maximum control
- ❌ Must manage keys
- ❌ No recovery if lost

**Choice is yours.** Start simple, upgrade when ready.

---

## FAQ

### Q: What if I don't trust the platform?
**A:** Migrate to direct wallet ownership. But remember: you're trusting them with your content already.

### Q: Can platforms censor my registration?
**A:** They can refuse to register new content, but cannot alter or remove existing blockchain records.

### Q: What if broker gets hacked?
**A:** Your existing registrations are safe (immutable). Attacker could register new content, but can't change past.

### Q: Is this really decentralized?
**A:** Hybrid. Identity is federated (like email), but registrations are on blockchain (immutable).

### Q: Why not just use wallets?
**A:** 99% of users will never manage keys successfully. Broker model is pragmatic.

### Q: Can I use multiple brokers?
**A:** Yes! Register different content with different brokers. It's all on the same blockchain.

### Q: What happens if DAON shuts down?
**A:** Blockchain records persist. Anyone can run a verification node. Brokers remain independent.

---

## Conclusion

The DAON broker model solves the blockchain UX problem by:

1. **Leveraging existing trust** - Platforms already handle identity
2. **Zero user friction** - No wallets, no keys, no complexity
3. **Maintaining decentralization** - Blockchain records are immutable
4. **Enabling portability** - Users can migrate when ready
5. **Ensuring security** - Certification standards protect users

**Result:** Fanfiction writers can protect their work from AI exploitation without knowing anything about blockchain.

---

## Next Steps

- Review `BROKER_CERTIFICATION.md` for detailed standards
- See `BROKER_SDK_SPEC.md` for integration guide
- Check examples: `github.com/daon-network/broker-examples`
- Join discussion: `community.daon.network`

---

**Last Updated:** December 2025  
**Status:** Ready for community feedback
