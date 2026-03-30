# DAON Protocol Scope

A precise description of what DAON does, what it intentionally does not do, and what is planned.

---

## What DAON Does

DAON is a **notary**, not a cop.

When you register content with DAON, one thing happens: a SHA-256 hash of your content is written to the DAON blockchain, associated with your wallet address, at a specific block timestamp. That record is permanent and public.

This gives you:

- **Proof of existence** — this exact content existed at or before this block time
- **Proof of ownership** — this wallet address registered it
- **Exact duplicate detection** — if the same content is submitted for verification later, the hashes match and the registration record is returned

That's the complete protocol. Everything else is built on top of these three properties.

### The hashing contract

For text content, DAON hashes the raw UTF-8 encoded bytes of the submitted string with no normalization. The hash is stored on chain as `sha256:<hex>`. Because the algorithm is explicit in the stored value, the contract is self-describing: anyone with the original content can reproduce the hash independently without trusting DAON.

---

## What DAON Does Not Do

### It does not detect similarity

A SHA-256 hash is an exact fingerprint. Change one character and the hash is completely different. DAON cannot tell you whether two pieces of content are similar, whether one is a paraphrase of another, or whether a scraped copy has been lightly edited. Similarity detection would require fuzzy hashing or embedding comparison — a different system, off-chain.

### It does not prevent copying

Content registered with DAON is still readable. Anyone can still copy, scrape, or reproduce it. DAON records the injury after the fact; it does not prevent it.

### It does not enforce licenses

DAON records which license was declared at registration time. It does not automatically block unlicensed use, issue takedowns, or contact infringers. License enforcement remains a human and legal process — DAON provides the evidence that process needs.

### It does not detect plagiarism automatically

DAON can *prove* plagiarism once identified — if your registration predates theirs, you have a timestamped record of prior art. But DAON does not scan the web for copies of your content or alert you when something similar appears.

---

## The Journalism Case

A journalist quoting a registered work is not plagiarism — it is citation. This is an intentional use case for DAON's nesting model.

When a page contains multiple protected items (an article that quotes a registered work), each registration is independent. The article's hash includes the quoted content as part of its exact bytes. The relationship between the two registrations is a human and legal question, not a protocol question. DAON's job is to make the timestamps and ownership undeniable; interpretation is left to whoever is arbitrating the dispute.

---

## What's Coming Next

### Web embedding: `<meta>` tag spec

To allow verification tools and crawlers to identify protected content on a webpage, DAON will define a standard embedding pattern using HTML meta tags:

```html
<head>
  <meta name="daon-hash"
        content="sha256:abc123..."
        id="daon-protection-1">
  <meta name="daon-content-type"
        content="text/plain"
        data-for="daon-protection-1">
</head>
<body>
  <article data-daon-ref="daon-protection-1">
    Protected content here...
  </article>
</body>
```

Key design decisions:
- `<meta>` stays in `<head>` where the HTML spec requires it (it is a void element and cannot wrap content)
- A unique `id` on the meta tag is referenced by `data-daon-ref` on the content element in `<body>`
- A separate `<meta>` with `data-for` carries the content type, so verifiers know exactly what was hashed
- Multiple protected regions on one page are supported — each gets its own `<meta>`/`id` pair
- The boundary question is self-answering: whatever element carries `data-daon-ref`, its content is what was hashed

The `data-daon-content-type` matters because HTML as a creative work is different from plain text. If an author registers their HTML markup, the markup *is* the expression — a scraper that strips tags produces a different work. The content type makes this explicit so verifiers hash the right thing.

### File upload and byte verification

The current API and frontend only support text content submitted as a string. Arbitrary binary content (images, PDFs, audio, video) requires:

- **API**: multipart form upload rather than JSON body, so binary files can be submitted without encoding loss
- **Frontend**: client-side hash computation using the Web Crypto API (`subtle.digest('SHA-256', buffer)`) before upload — the file never needs to leave the user's machine to be verified
- **Verification**: file upload on the verify side, with the hash computed client-side and checked against the chain

For binary files, the boundary question disappears — a file is its own boundary. The `<meta>` tag pattern still applies for web embedding: the `content` attribute holds the hash and `data-daon-ref` points to the `<img>` or other element; a verifier fetches the asset, hashes the binary, and compares.

The existing API and blockchain are forward-compatible with this — a SHA-256 hash of a binary file is stored and verified identically to a hash of text. No protocol changes are needed, only new upload and hashing surfaces in the client.

---

## Summary Table

| Capability | Status |
|---|---|
| Register text content with timestamp | ✅ Live |
| Verify exact content by hash | ✅ Live |
| Verify by pasting content (hash computed server-side) | ✅ Live |
| Multiple licenses | ✅ Live |
| Web embedding meta tag spec | Planned |
| File / binary upload | Planned |
| Client-side hash computation (privacy-preserving verify) | Planned |
| Similarity / fuzzy matching | Out of scope |
| Automated infringement detection | Out of scope |
| License enforcement / takedowns | Out of scope |
