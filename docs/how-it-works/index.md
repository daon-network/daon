---
layout: default
title: "How DAON Works"
description: "What DAON does, what it doesn't do, and what's coming next — a plain-language explanation of the protocol"
---

# How DAON Works

## What DAON actually is

DAON is a **notary**, not a cop.

When you register content, one thing happens: a SHA-256 fingerprint of your content is written to the DAON blockchain, tied to your account, at a specific point in time. That record is permanent, public, and tamper-proof.

This gives you three things:

- **Proof of existence** — this exact content existed at or before this timestamp
- **Proof of ownership** — your address registered it
- **Exact duplicate detection** — if the same content is submitted for verification later, the fingerprints match and your registration record is returned

That's the complete protocol. Everything else — legal action, takedowns, platform enforcement — is built on top of these three properties by humans.

---

## The fingerprint

DAON uses SHA-256, a standard cryptographic hash function. The same content always produces the same fingerprint. The fingerprint is stored on chain as `sha256:` followed by 64 characters.

Anyone can reproduce your fingerprint independently, without trusting DAON, by hashing your original content. This is intentional: the proof doesn't depend on us.

---

## What DAON does not do

### It does not detect similarity

One changed character produces a completely different fingerprint. DAON cannot tell you whether two pieces of content are similar, whether something is a paraphrase of your work, or whether a copy has been lightly edited to avoid matching. The fingerprint is exact.

### It does not prevent copying

Your content is still readable after registration. Anyone can still copy, scrape, or reproduce it. DAON records that an injury happened; it does not stop it from happening.

### It does not enforce licenses

DAON records which license was declared when you registered. It does not automatically block unlicensed use or issue takedowns. License enforcement is a legal process — DAON gives that process the evidence it needs.

### It does not scan for copies automatically

DAON does not monitor the web for copies of your work or alert you when something similar appears. You bring the content to DAON; DAON tells you whether it matches a registration.

---

## What it's good for

**Establishing prior art.** If someone copies your work and registers it after you, your earlier timestamp proves you created it first.

**Proving a specific version.** If a dispute involves "which version was published when," your registration is a timestamped record of the exact bytes you submitted.

**Cited quotation.** A journalist or writer quoting your registered work can include the verification link as attribution. Each registration is independent — a page containing your quoted work alongside other content is handled correctly, with each protected section pointing to its own registration.

**Machine-readable attribution.** With the [web embedding standard](#web-embedding), crawlers and automated tools can find and verify protected content on any webpage without any manual step.

---

## Web embedding

To let crawlers, browsers, and verification tools identify protected content on a webpage, DAON defines a standard HTML embedding pattern.

### The pattern

```html
<head>
  <meta name="daon-hash"
        content="sha256:YOUR_HASH_HERE"
        id="daon-protection-1">
  <meta name="daon-content-type"
        content="text/plain"
        data-for="daon-protection-1">
</head>
<body>
  <article data-daon-ref="daon-protection-1">
    Your protected content here...
  </article>
</body>
```

### Why it works this way

`<meta>` tags are HTML void elements — they cannot wrap content and must live in `<head>`. The `id` on the meta tag and the `data-daon-ref` on the content element create an explicit link between the registration record and the protected region of the page.

A verifier's algorithm is unambiguous:
1. Find all elements with `data-daon-ref`
2. Look up the `<meta id>` that matches
3. Hash the element's content using the declared content type
4. Check the hash against the chain

### Multiple protected items on one page

Each protected item gets its own `<meta>`/`id` pair. Registrations are always independent — a page that quotes someone else's registered work simply has two `data-daon-ref` elements, each pointing to a different meta tag and a different registration.

### Content types

The `daon-content-type` meta tag specifies what was hashed:

| Value | What gets hashed |
|---|---|
| `text/plain` | The visible text content of the element |
| `text/html` | The raw HTML markup of the element |
| `application/octet-stream` | Binary file bytes (for `<img>`, `<video>`, etc.) |

For HTML as a creative work — markup that is itself the expression — use `text/html`. A scraper that strips tags produces a different hash, which is the correct behavior.

---

## What's coming next

### File and binary upload

The current API and frontend accept text content only. Arbitrary binary content (images, PDFs, audio, video) will be supported with:

- **File upload** via multipart form on both the protect and verify sides
- **Client-side hashing** using the browser's built-in Web Crypto API — your file is hashed in your browser and never needs to leave your machine to be verified

The existing blockchain records are already forward-compatible with binary content. No protocol changes are needed — only new upload and hashing surfaces in the interface.

### Verification badge

A lightweight embeddable badge that displays verification status inline on any page, without requiring the reader to visit a separate tool.

---

## Summary

| | Status |
|---|---|
| Register text content with timestamp | Live |
| Verify exact content by hash | Live |
| Verify by pasting content | Live |
| Multiple licenses | Live |
| Web embedding meta tag spec | Planned |
| File and binary upload | Planned |
| Client-side hashing (privacy-preserving verify) | Planned |
| Similarity / fuzzy matching | Out of scope |
| Automated infringement detection | Out of scope |
| License enforcement / takedowns | Out of scope |

---

## Related

- [Getting Started](/creators/getting-started/) — protect your first work
- [Embedding Your Verification Token](/creators/embedding-tokens/) — add verification to your published pages
- [Verify Content](https://app.daon.network/verify) — check a piece of content against the chain
