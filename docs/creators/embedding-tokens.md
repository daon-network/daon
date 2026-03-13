---
layout: default
title: "Embedding Your Verification Token"
description: "Platform-specific instructions for adding your DAON verification token to your published work"
---

# Embedding Your Verification Token

After registering your content, you'll receive a verification URL like:

```
https://verify.daon.network/verify/sha256:a3f9b2...
```

This URL proves ownership — but only if readers can find it alongside your actual work. This guide shows you how to embed your verification token on each major platform.

> **Why this matters:** The verification link proves *a hash was registered*, not that the content you're reading *is* that registered work. To close that gap, embed the token in the content itself so readers can use the [Verify by Content tool](/verify) to confirm a match.

---

## Platform-Specific Instructions

### AO3 (Archive of Our Own)

Add to your **Author's Notes** (top or bottom of your work):

```html
<p>This work is registered on the DAON blockchain.
<a href="https://verify.daon.network/verify/sha256:YOUR_HASH_HERE" rel="nofollow">
  [Verify ownership]
</a></p>
```

AO3 allows basic HTML in author's notes. Replace `YOUR_HASH_HERE` with your 64-character hex hash (shown on your registration confirmation screen).

**Where to add it:**
1. Go to your work → Edit
2. Scroll to "Preface" or "End Notes"
3. Paste the snippet, replace the hash
4. Save

---

### WordPress / Self-Hosted Blog

**Visible badge** (in post body or footer widget):

```html
<p><small>Protected by DAON.
<a href="https://verify.daon.network/verify/sha256:YOUR_HASH_HERE">Verify this work →</a>
</small></p>
```

**Machine-readable meta tag** (in `<head>`, via theme functions.php or a plugin):

```html
<meta name="daon-verification" content="sha256:YOUR_HASH_HERE">
```

Adding both gives you human-readable proof AND lets automated tools find your registration.

**Via WordPress theme:**
1. Appearance → Theme Editor → `header.php`
2. Add the `<meta>` tag before `</head>`
3. Or use a plugin like "Insert Headers and Footers" to add it without editing theme files

---

### Images (JPEG / PNG / TIFF)

Embed directly in the file's EXIF/IPTC metadata using [ExifTool](https://exiftool.org/):

```bash
exiftool \
  -Comment="DAON:sha256:YOUR_HASH_HERE" \
  -Copyright="© YOUR_NAME. Registered on DAON blockchain." \
  -XMP-dc:Rights="https://verify.daon.network/verify/sha256:YOUR_HASH_HERE" \
  your-image.jpg
```

This embeds the verification hash *inside the image file itself* — it travels with the file even when downloaded or re-shared.

**Verify it was written:**
```bash
exiftool -Comment -Copyright your-image.jpg
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
Verification: https://verify.daon.network/verify/sha256:YOUR_HASH_HERE
Registration hash: sha256:YOUR_HASH_HERE
```

---

### Plain Text Files

Use the first or last line convention:

**First line:**
```
[DAON: sha256:YOUR_HASH_HERE | https://verify.daon.network/verify/sha256:YOUR_HASH_HERE]
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
Writer | DAON-verified creator | verify.daon.network/verify/sha256:SHORT_HASH
```
(Use just the first 12 characters of the hash as a recognizable identifier — not enough to verify, but enough to direct people to your profile)

**In posts/captions:**
```
My work is blockchain-registered. Verify: [link in bio] or
https://verify.daon.network/verify/sha256:YOUR_HASH_HERE
```

**On Tumblr:** You can add the full verification URL to post descriptions or a pinned post.

---

### Wattpad / Fanfiction.Net / Other Platforms

Most platforms allow plain text in story descriptions or author notes:

```
This work is registered on the DAON blockchain.
Proof of ownership: https://verify.daon.network/verify/sha256:YOUR_HASH_HERE
```

For platforms that allow links: embed as a hyperlink with text like "Verify ownership" or "DAON certified."

---

## What to Tell Readers

If you want readers to actively verify your work (not just see a badge), direct them to the **Verify by Content** tool:

> "To confirm this is the registered version of my work, paste the text at [verify.daon.network/verify](https://verify.daon.network/verify) — it will hash your copy and check it against the blockchain record."

This is stronger than a link alone: it confirms the content you're reading *matches* the registered hash, not just that a hash exists.

---

## Finding Your Hash

Your full 64-character hash is displayed:
- On the registration confirmation screen immediately after protecting your work
- In the verification URL itself: `...verify/sha256:` followed by 64 hex characters
- In your [My Assets](/assets) dashboard

---

## Related

- [Getting Started Guide](./getting-started.md)
- [Verify by Content](/verify) — reader tool to confirm content matches registration
- [Bulk Protection](./bulk-protection.md) — protect many works at once
