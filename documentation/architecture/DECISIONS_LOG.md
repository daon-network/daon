# Architecture Decision Log

**Session Date:** December 2025  
**Participants:** Architecture Review

---

## Decisions Made

### 1. Web Upload Over Browser Extension

**Decision:** Use web upload site (protect.daon.network) instead of browser extension

**Rationale:**
- Browser extensions can be compromised, cloned, or updated maliciously
- Web app is under our control, simpler to secure
- Works on any device/browser including mobile
- No Chrome/Firefox store approval needed

**Status:** APPROVED

---

### 2. No Claim Codes

**Decision:** Bind identity immediately at registration, no claim code system

**Rationale:**
- Claim codes create theft window between generation and claiming
- First to claim wins, even if not creator
- Immediate binding eliminates this attack vector
- Simpler UX (no code to save/remember)

**Status:** APPROVED

---

### 3. Email + OAuth for Identity

**Decision:** 
- Primary: Email magic link (passwordless)
- Secondary: Discord OAuth (fanfic community)
- Tertiary: Google OAuth (familiar)
- Future: Domain verification, Platform OAuth

**Rationale:**
- Email is universal, recoverable
- Discord is where fanfic/art communities live
- No wallet management for non-crypto users
- Can add more methods later

**Status:** APPROVED

---

### 4. User-Embedded Metadata

**Decision:** Users copy/paste embed codes into their works (author's notes, etc.)

**Rationale:**
- Works on ANY platform without integration
- No platform cooperation needed
- User controls where it appears
- Visible to humans and scrapers

**Status:** APPROVED

---

### 5. Version History

**Decision:** Support linking edited versions to original registration

**Rationale:**
- Users will edit their works
- Multiple versions should be trackable
- All versions prove same ownership chain
- Matches how copyright actually works

**Status:** APPROVED

---

### 6. Duplicate Detection Strategy

**Decision:** Multi-layer detection (exact + normalized + perceptual hash)

**Rationale:**
- Exact hash catches copies
- Normalized hash catches formatting changes
- Perceptual hash catches resize/crop/compress
- ~80% of lazy theft attempts caught
- Can't catch everything (acknowledged limitation)

**Status:** APPROVED

---

### 7. Zero Gas Price is Acceptable

**Decision:** Keep zero gas prices for ownership blockchain

**Rationale:**
- DAON is ownership registry, not financial chain
- No monetary value to extract via spam
- Spam protection at API layer (rate limiting, auth)
- Reduces friction for creators

**Status:** APPROVED (corrected from earlier security audit)

---

### 8. iOS Shortcut for Procreate

**Decision:** Build iOS Shortcut as primary mobile solution

**Rationale:**
- Procreate has no plugin API
- 5M+ iPad artists use Procreate
- Shortcuts are inspectable (security)
- Uses same API as web
- 1 week to build

**Status:** APPROVED

---

### 9. Adobe Plugin Post-MVP

**Decision:** Submit Adobe plugin immediately, accept review timeline

**Rationale:**
- 10M+ professional users
- One codebase works across Photoshop, Illustrator, etc.
- Review takes 2-4 weeks anyway
- Start now, ships in Month 2

**Status:** APPROVED

---

### 10. Broker Model is Long-Term

**Decision:** Keep broker model for future platform integration, not MVP

**Rationale:**
- Requires platform adoption (hard)
- Security certification requirements (complex)
- Web upload works today
- Brokers can be added when platforms want to integrate

**Status:** APPROVED (deferred to post-MVP)

---

### 11. Strategic Approach: Grassroots First

**Decision:** Launch to users, not platforms

**Rationale:**
- Users can adopt immediately
- Creates demand for platform integration
- No gatekeepers
- Viral potential in creator communities
- Platforms come to us when users demand it

**Status:** APPROVED

---

## Deferred Decisions

### A. Passkeys / WebAuthn
- Promising for future
- Not needed for MVP
- Can add as additional auth method later

### B. AI-Based Duplicate Detection
- Requires ML infrastructure
- Add when basic detection proves insufficient
- Post-launch improvement

### C. Dispute Resolution System
- Manual review process
- Needed but not MVP-critical
- Can handle disputes case-by-case initially

---

## Superseded Documents

The following documents contain proposals that were NOT accepted:

1. **CLAIM_CODE_SYSTEM.md** - DELETED (claim codes rejected)
2. **FEDERATED_IDENTITY_DESIGN.md** - SUPERSEDED for MVP (broker model deferred)
3. **Browser extension code** - NOT TO BE USED (security risk)

---

## Canonical Reference

**For implementation, use:** `PROTECTION_SYSTEM_FINAL.md`

This document contains the approved architecture, API specs, data models, and implementation checklist.

---

**Last Updated:** December 2025
