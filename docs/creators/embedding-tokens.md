---
layout: default
title: "Embedding Your Verification Token"
description: "Platform-specific instructions for adding your DAON verification token to your published work"
---

# Embedding Your Verification Token

After registering your content, you'll receive a verification URL like:

```
https://app.daon.network/verify/sha256:a3f9b2...
```

This URL proves ownership — but only if readers can find it alongside your actual work. This guide shows you how to embed your verification token on each major platform.

> **Why this matters:** The verification link proves *a hash was registered*, not that the content you're reading *is* that registered work. To close that gap, embed the token in the content itself so readers can use the [Verify by Content tool](https://app.daon.network/verify) to confirm a match.

---

## Web Pages (Full Spec)

For any page you control, the complete embedding pattern uses two `<meta>` tags in `<head>` and a `data-daon-ref` attribute on the content element.

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

**Why two tags?** `daon-hash` holds the fingerprint. `daon-content-type` tells verifiers exactly what was hashed, so they reproduce it correctly. The `id` on the hash tag and `data-for` on the type tag link them together. `data-daon-ref` on the content element defines the boundary of what was registered.

**Content type values:**

| Value | Use when |
|---|---|
| `text/plain` | You registered the visible text |
| `text/html` | You registered the HTML markup itself |
| `application/octet-stream` | Binary file (image, PDF, etc.) |

**Multiple protected items on one page:** each gets its own `<meta id>` pair with a unique id, and its own `data-daon-ref` element. Registrations are always independent.

---

## Platform-Specific Instructions

### WordPress / Self-Hosted Blog

Add both the machine-readable tags and a visible badge.

**In `<head>`** (via theme `functions.php` or a plugin like "Insert Headers and Footers"):

```html
<meta name="daon-hash"
      content="sha256:YOUR_HASH_HERE"
      id="daon-protection-1">
<meta name="daon-content-type"
      content="text/plain"
      data-for="daon-protection-1">
```

**In the post body** — add `data-daon-ref` to your content wrapper and a visible badge:

```html
<div data-daon-ref="daon-protection-1">
  <!-- your post content -->
</div>
<p><small>Protected by DAON.
  <a href="https://app.daon.network/verify/sha256:YOUR_HASH_HERE">Verify this work →</a>
</small></p>
```

---

### AO3 (Archive of Our Own)

AO3 doesn't allow `<head>` access, so use the visible link form in **Author's Notes**:

```html
<p>This work is registered on the DAON blockchain.
<a href="https://app.daon.network/verify/sha256:YOUR_HASH_HERE" rel="nofollow">
  [Verify ownership]
</a></p>
```

Replace `YOUR_HASH_HERE` with your 64-character hex hash (shown on your registration confirmation screen).

**Where to add it:**
1. Go to your work → Edit
2. Scroll to "Preface" or "End Notes"
3. Paste the snippet, replace the hash
4. Save

---

### Images (JPEG / PNG / TIFF)

Embed directly in the file's EXIF/IPTC metadata using [ExifTool](https://exiftool.org/):

```bash
exiftool \
  -Comment="DAON:sha256:YOUR_HASH_HERE" \
  -Copyright="© YOUR_NAME. Registered on DAON blockchain." \
  -XMP-dc:Rights="https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  your-image.jpg
```

This embeds the verification hash *inside the image file itself* — it travels with the file even when downloaded or re-shared.

**Verify it was written:**
```bash
exiftool -Comment -Copyright your-image.jpg
```

For the web embedding pattern with images, put `data-daon-ref` on the `<img>` element and set `daon-content-type` to `application/octet-stream`:

```html
<head>
  <meta name="daon-hash"
        content="sha256:YOUR_HASH_HERE"
        id="daon-img-1">
  <meta name="daon-content-type"
        content="application/octet-stream"
        data-for="daon-img-1">
</head>
<body>
  <img src="your-image.jpg" data-daon-ref="daon-img-1" alt="...">
</body>
```

---

### PDF Documents

**Via PDF metadata** (using `exiftool`):

```bash
exiftool \
  -Title="YOUR_TITLE" \
  -Author="YOUR_NAME" \
  -Subject="DAON:sha256:YOUR_HASH_HERE" \
  -Keywords="daon-verified, sha256:YOUR_HASH_HERE" \
  your-document.pdf
```

**Via document body** — add a footer or final page:

```
This document is registered on the DAON blockchain.
Verification: https://app.daon.network/verify/sha256:YOUR_HASH_HERE
Registration hash: sha256:YOUR_HASH_HERE
```

---

### Plain Text Files

Use the first or last line convention:

**First line:**
```
[DAON: sha256:YOUR_HASH_HERE | https://app.daon.network/verify/sha256:YOUR_HASH_HERE]
```

**Last line:**
```
---
DAON Verification: sha256:YOUR_HASH_HERE
```

This works for `.txt`, `.md`, fanfic plain-text archives, and any format that can't carry metadata.

---

### Social Media (Twitter/X, Tumblr, Instagram, Bluesky)

Social platforms don't support metadata embedding, so use these approaches:

**In bio/profile:**
```
Writer | DAON-verified creator | app.daon.network/verify/sha256:SHORT_HASH
```
(Use just the first 12 characters of the hash as a recognizable identifier — not enough to verify, but enough to direct people to your profile)

**In posts/captions:**
```
My work is blockchain-registered. Verify: [link in bio] or
https://app.daon.network/verify/sha256:YOUR_HASH_HERE
```

**On Tumblr:** You can add the full verification URL to post descriptions or a pinned post.

---

### Wattpad / Fanfiction.Net / Other Platforms

Most platforms allow plain text in story descriptions or author notes:

```
This work is registered on the DAON blockchain.
Proof of ownership: https://app.daon.network/verify/sha256:YOUR_HASH_HERE
```

For platforms that allow links: embed as a hyperlink with text like "Verify ownership" or "DAON certified."

---

## What to Tell Readers

If you want readers to actively verify your work (not just see a badge), direct them to the **Verify by Content** tool:

> "To confirm this is the registered version of my work, paste the text at [app.daon.network/verify](https://app.daon.network/verify) — it will fingerprint your copy and check it against the blockchain record."

This is stronger than a link alone: it confirms the content you're reading *matches* the registered fingerprint, not just that a fingerprint exists.

---

## Finding Your Hash

Your full 64-character hash is displayed:
- On the registration confirmation screen immediately after protecting your work
- In the verification URL itself: `...verify/sha256:` followed by 64 hex characters
- In your [My Assets](https://app.daon.network/assets) dashboard

---

## Related

- [Getting Started Guide](./getting-started.md)
- [How DAON Works](/how-it-works/) — full explanation of what the fingerprint proves
- [Verify by Content](https://app.daon.network/verify) — reader tool to confirm content matches registration
- [Bulk Protection](./bulk-protection.md) — protect many works at once
