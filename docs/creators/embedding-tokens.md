---
layout: default
title: "Embedding Your Verification Token"
description: "Complete guide to embedding your DAON verification token in every major file format and platform"
---

# Embedding Your Verification Token

After registering your content, you'll receive a verification URL like:

```
https://app.daon.network/verify/sha256:a3f9b2...
```

This URL proves ownership — but only if readers can find it alongside your actual work. This guide shows you how to embed your verification token everywhere it can go.

> **Why this matters:** The verification link proves *a hash was registered*, not that the content you're reading *is* that registered work. To close that gap, embed the token in the content itself so readers can use the [Verify by Content tool](https://app.daon.network/verify) to confirm a match.

---

## What this protection is — and isn't

Embedding your DAON token works like `robots.txt` combined with a timestamped legal receipt.

`robots.txt` is a declared boundary. It tells crawlers "do not scrape this." Ethical crawlers respect it. Bad actors can ignore it — but ignoring a declared, machine-readable boundary is a deliberate choice, and courts are increasingly treating it as one.

DAON gives you the same declared boundary, plus something `robots.txt` can't: **proof**. If a scraper ignores your meta tags and uses your work anyway, you have a cryptographic, timestamped record proving the content existed, was owned by you, and was licensed with explicit AI training restrictions — before the scraping happened.

That record is what makes the boundary meaningful in a legal context. The more places your token appears, the harder it is to claim the boundary wasn't visible.

**Embed everywhere you can.**

---

## ⚠️ The metadata stripping problem

Most social platforms (Instagram, Twitter/X, Facebook, TikTok, Discord) **strip all EXIF and metadata from images and videos on upload**. Your carefully embedded ExifTool data will not survive posting to these platforms.

For those platforms, the only reliable embedding is in the visible text of a post, caption, or bio. See [Social Media](#social-media) below.

For files you distribute directly — on your own site, via email, as downloads — metadata embedding works and travels with the file.

---

## Contents

- [Web Pages](#web-pages-full-spec)
- [Images](#images)
- [Video](#video)
- [Audio](#audio)
- [PDF Documents](#pdf-documents)
- [Word / DOCX](#word--docx)
- [LibreOffice / ODT](#libreoffice--odt)
- [EPUB](#epub)
- [SVG](#svg)
- [Source Code](#source-code)
- [Plain Text and Markdown](#plain-text-and-markdown)
- [XMP Sidecar Files](#xmp-sidecar-files)
- [Platform-Specific: AO3, Wattpad, Fanfiction.Net](#ao3--wattpad--fanfictionnet)
- [Platform-Specific: WordPress](#wordpress--self-hosted-blog)
- [Platform-Specific: Social Media](#social-media)
- [Declaring Boundaries for AI Crawlers](#declaring-boundaries-for-ai-crawlers)

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

## Images

### The stripping warning, again

If you're uploading to a social platform: **metadata will be stripped**. Embed in visible text instead. If you're distributing the file directly, metadata embedding is reliable.

### JPEG, TIFF — ExifTool (command line)

[ExifTool](https://exiftool.org/) is the most reliable cross-platform tool for embedding metadata into image files. Install it from [exiftool.org](https://exiftool.org/) or via your package manager (`brew install exiftool`, `apt install libimage-exiftool-perl`).

```bash
exiftool \
  -Comment="DAON:sha256:YOUR_HASH_HERE" \
  -Copyright="© YOUR_NAME. Registered on DAON. Verify: https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  -XMP-dc:Rights="https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  -IPTC:CopyrightNotice="DAON:sha256:YOUR_HASH_HERE" \
  -XMP-xmpRights:WebStatement="https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  -XMP-xmpRights:Marked=True \
  your-image.jpg
```

Verify it was written:
```bash
exiftool -Comment -Copyright -XMP-dc:Rights your-image.jpg
```

### PNG — ExifTool

PNG uses a different metadata structure but ExifTool handles it:

```bash
exiftool \
  -PNG:Comment="DAON:sha256:YOUR_HASH_HERE" \
  -XMP-dc:Rights="https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  -XMP-xmpRights:WebStatement="https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  your-image.png
```

Note: PNG's native `tEXt` chunk doesn't support all EXIF fields. The XMP fields above are the most portable.

### Adobe Lightroom / Lightroom Classic

1. Select your image(s)
2. **Metadata panel → IPTC Content section**
3. In **Copyright**: `© YOUR_NAME. DAON verified.`
4. In **Rights Usage Terms**: `https://app.daon.network/verify/sha256:YOUR_HASH_HERE`
5. **File → Export** → check "Write Keywords as Lightroom Hierarchy" and ensure metadata is included in export settings

To embed permanently in the source file:
- **Metadata → Save Metadata to File** (Ctrl/Cmd+S)

### Adobe Photoshop

1. **File → File Info** (Alt+Shift+Ctrl+I / Option+Shift+Cmd+I)
2. **Basic tab**:
   - **Description**: `DAON:sha256:YOUR_HASH_HERE`
   - **Copyright Status**: Copyrighted
   - **Copyright Notice**: `© YOUR_NAME. Verify: https://app.daon.network/verify/sha256:YOUR_HASH_HERE`
   - **Copyright Info URL**: `https://app.daon.network/verify/sha256:YOUR_HASH_HERE`
3. Click OK and save

### Capture One

1. Select image(s) in the browser
2. **Metadata tool tab** → **IPTC** section
3. **Copyright**: `© YOUR_NAME. DAON:sha256:YOUR_HASH_HERE`
4. **Rights Usage Terms**: `https://app.daon.network/verify/sha256:YOUR_HASH_HERE`
5. Export with **Include Metadata** checked

### GIMP

1. **File → Export As** → your filename
2. In the export dialog, click **Advanced Options**
3. Check **Save EXIF data** and **Save XMP data**
4. Before exporting, set metadata via **Image → Image Properties** or install the Metadata plugin

For full control, export with GIMP then apply ExifTool afterward — it's more reliable.

### Web embedding pattern for images

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
  <figure>
    <img src="your-image.jpg"
         data-daon-ref="daon-img-1"
         alt="Description of your image">
    <figcaption>
      © YOUR_NAME —
      <a href="https://app.daon.network/verify/sha256:YOUR_HASH_HERE">Verify ownership</a>
    </figcaption>
  </figure>
</body>
```

---

## Video

### MP4 / MOV (QuickTime)

```bash
exiftool \
  -Title="YOUR_TITLE" \
  -Artist="YOUR_NAME" \
  -Copyright="© YOUR_NAME. DAON:sha256:YOUR_HASH_HERE" \
  -Comment="DAON:sha256:YOUR_HASH_HERE. Verify: https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  -XMP-dc:Rights="https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  -XMP-xmpRights:WebStatement="https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  -XMP-xmpRights:Marked=True \
  your-video.mp4
```

### MKV (Matroska)

MKV uses its own tagging format. Use [mkvpropedit](https://mkvtoolnix.download/) (part of MKVToolNix):

```bash
mkvpropedit your-video.mkv \
  --edit info \
  --set "title=YOUR_TITLE" \
  --add-track-statistics-tags

# For custom tags:
mkvpropedit your-video.mkv \
  --tags "global:tags.xml"
```

Where `tags.xml` contains:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Tags>
  <Tag>
    <Targets/>
    <Simple>
      <Name>COPYRIGHT</Name>
      <String>© YOUR_NAME. DAON:sha256:YOUR_HASH_HERE</String>
    </Simple>
    <Simple>
      <Name>DAON_HASH</Name>
      <String>sha256:YOUR_HASH_HERE</String>
    </Simple>
    <Simple>
      <Name>DAON_VERIFY</Name>
      <String>https://app.daon.network/verify/sha256:YOUR_HASH_HERE</String>
    </Simple>
  </Tag>
</Tags>
```

### WebM

```bash
exiftool \
  -Copyright="© YOUR_NAME. DAON:sha256:YOUR_HASH_HERE" \
  -Comment="Verify: https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  your-video.webm
```

### Video description text (YouTube, Vimeo, etc.)

All major video platforms strip file metadata. In your video description:

```
This video is registered on the DAON blockchain.

Ownership verification: https://app.daon.network/verify/sha256:YOUR_HASH_HERE
Registration hash: sha256:YOUR_HASH_HERE

AI training on this content is prohibited under the Liberation License.
Contact for licensing: YOUR_EMAIL
```

---

## Audio

### MP3 — ID3v2 tags

MP3 uses ID3v2 tags. ExifTool writes them:

```bash
exiftool \
  -Title="YOUR_TITLE" \
  -Artist="YOUR_NAME" \
  -Copyright="© YOUR_NAME. DAON:sha256:YOUR_HASH_HERE" \
  -Comment="DAON:sha256:YOUR_HASH_HERE. Verify: https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  -TCOP="© YOUR_NAME. DAON verified." \
  your-audio.mp3
```

Or with `id3v2` directly:
```bash
id3v2 \
  --artist "YOUR_NAME" \
  --song "YOUR_TITLE" \
  --comment "DAON:sha256:YOUR_HASH_HERE | https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  your-audio.mp3
```

### FLAC — Vorbis comments

FLAC uses plain-text Vorbis comments. Use `metaflac`:

```bash
metaflac \
  --set-tag="TITLE=YOUR_TITLE" \
  --set-tag="ARTIST=YOUR_NAME" \
  --set-tag="COPYRIGHT=© YOUR_NAME. DAON:sha256:YOUR_HASH_HERE" \
  --set-tag="DAON_HASH=sha256:YOUR_HASH_HERE" \
  --set-tag="DAON_VERIFY=https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  your-audio.flac
```

### OGG Vorbis

```bash
vorbiscomment -w your-audio.ogg << 'EOF'
TITLE=YOUR_TITLE
ARTIST=YOUR_NAME
COPYRIGHT=© YOUR_NAME. DAON:sha256:YOUR_HASH_HERE
DAON_HASH=sha256:YOUR_HASH_HERE
DAON_VERIFY=https://app.daon.network/verify/sha256:YOUR_HASH_HERE
EOF
```

### AAC / M4A / Apple Music

```bash
exiftool \
  -Title="YOUR_TITLE" \
  -Artist="YOUR_NAME" \
  -Copyright="© YOUR_NAME. DAON:sha256:YOUR_HASH_HERE" \
  -Comment="Verify: https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  your-audio.m4a
```

### WAV

WAV supports INFO chunks:

```bash
exiftool \
  -RIFF:Artist="YOUR_NAME" \
  -RIFF:Copyright="© YOUR_NAME. DAON:sha256:YOUR_HASH_HERE" \
  -RIFF:Comment="DAON:sha256:YOUR_HASH_HERE | https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  your-audio.wav
```

### Audacity

Audacity doesn't have full metadata editing built in. Export your file, then apply ExifTool afterward. For MP3, use the ID3 tag instructions above post-export.

---

## PDF Documents

### ExifTool (most reliable)

```bash
exiftool \
  -Title="YOUR_TITLE" \
  -Author="YOUR_NAME" \
  -Subject="DAON:sha256:YOUR_HASH_HERE" \
  -Keywords="daon-verified, sha256:YOUR_HASH_HERE" \
  -Rights="© YOUR_NAME. AI training prohibited. Verify: https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  -XMP-dc:Rights="https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  -XMP-xmpRights:WebStatement="https://app.daon.network/verify/sha256:YOUR_HASH_HERE" \
  -XMP-xmpRights:Marked=True \
  your-document.pdf
```

### Document body

Add a footer or final page visible in the document itself:

```
────────────────────────────────────────
This document is registered on the DAON blockchain.
Owner: YOUR_NAME
Registration hash: sha256:YOUR_HASH_HERE
Verification: https://app.daon.network/verify/sha256:YOUR_HASH_HERE
AI training on this content is prohibited.
────────────────────────────────────────
```

---

## Word / DOCX

### Via the Word UI (Windows / Mac)

1. **File → Info → Properties** (right panel) → **Advanced Properties**
2. **Summary tab**:
   - **Author**: Your name
   - **Comments**: `DAON:sha256:YOUR_HASH_HERE. Verify: https://app.daon.network/verify/sha256:YOUR_HASH_HERE`
3. **Custom tab** → **Add**:
   - Name: `DAON-Hash`, Value: `sha256:YOUR_HASH_HERE`
   - Name: `DAON-Verify`, Value: `https://app.daon.network/verify/sha256:YOUR_HASH_HERE`
4. Click OK and save

### Via python-docx (command line / scripted)

```python
from docx import Document
from docx.opc.constants import RELATIONSHIP_TYPE as RT

doc = Document("your-document.docx")
props = doc.core_properties
props.author = "YOUR_NAME"
props.comments = f"DAON:sha256:YOUR_HASH_HERE. Verify: https://app.daon.network/verify/sha256:YOUR_HASH_HERE"
props.subject = "DAON:sha256:YOUR_HASH_HERE"
props.keywords = "daon-verified"
doc.save("your-document.docx")
```

### In the document body

Add a footer via **Insert → Footer**:

```
DAON Verification: sha256:YOUR_HASH_HERE | https://app.daon.network/verify/sha256:YOUR_HASH_HERE
```

---

## LibreOffice / ODT

### Via the LibreOffice UI

1. **File → Properties**
2. **Description tab**:
   - **Subject**: `DAON:sha256:YOUR_HASH_HERE`
   - **Comments**: `Verify: https://app.daon.network/verify/sha256:YOUR_HASH_HERE`
3. **Custom Properties tab** → **Add Property**:
   - `DAON-Hash`: `sha256:YOUR_HASH_HERE`
   - `DAON-Verify`: `https://app.daon.network/verify/sha256:YOUR_HASH_HERE`
4. Click OK and save

ODT files are ZIP archives containing XML. The custom properties are stored in `meta.xml` inside the file and survive most format conversions.

---

## EPUB

EPUB uses OPF XML metadata. Open your `.epub` file (it's a ZIP), find `content.opf` or `package.opf`, and add to the `<metadata>` section:

```xml
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"
          xmlns:opf="http://www.idpf.org/2007/opf">
  <dc:creator>YOUR_NAME</dc:creator>
  <dc:rights>© YOUR_NAME. DAON:sha256:YOUR_HASH_HERE. AI training prohibited.</dc:rights>
  <dc:description>DAON verification: https://app.daon.network/verify/sha256:YOUR_HASH_HERE</dc:description>
  <meta name="daon-hash" content="sha256:YOUR_HASH_HERE"/>
  <meta name="daon-verify" content="https://app.daon.network/verify/sha256:YOUR_HASH_HERE"/>
</metadata>
```

To edit: `unzip book.epub -d book_dir`, edit `content.opf`, then `cd book_dir && zip -X ../book_updated.epub mimetype && zip -rg ../book_updated.epub . -x mimetype`.

Many EPUB editors (Sigil, Calibre) also expose metadata fields directly:

**Calibre:**
1. Right-click the book → **Edit metadata**
2. **Comments** field: paste the full verification block
3. **Custom columns** if you've set them up: add `daon-hash` and `daon-verify`

---

## SVG

SVG is XML — you can embed metadata directly:

```xml
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:cc="http://creativecommons.org/ns#"
     xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
     width="..." height="...">

  <metadata>
    <rdf:RDF>
      <cc:Work rdf:about="">
        <dc:creator><dc:Agent><dc:title>YOUR_NAME</dc:title></dc:Agent></dc:creator>
        <dc:rights>© YOUR_NAME. DAON:sha256:YOUR_HASH_HERE</dc:rights>
        <cc:license rdf:resource="https://app.daon.network/verify/sha256:YOUR_HASH_HERE"/>
      </cc:Work>
    </rdf:RDF>
  </metadata>

  <!-- add a visible comment too -->
  <!-- DAON:sha256:YOUR_HASH_HERE | https://app.daon.network/verify/sha256:YOUR_HASH_HERE -->

  <!-- rest of your SVG -->
</svg>
```

Inkscape exposes this via **File → Document Properties → Metadata**.

---

## Source Code

Add a DAON header comment to source files. The convention is consistent across languages:

**JavaScript / TypeScript / Go / Rust / C / C++:**
```js
/**
 * DAON: sha256:YOUR_HASH_HERE
 * Verify: https://app.daon.network/verify/sha256:YOUR_HASH_HERE
 * © YOUR_NAME. All rights reserved. AI training prohibited.
 */
```

**Python / Ruby / Shell:**
```python
# DAON: sha256:YOUR_HASH_HERE
# Verify: https://app.daon.network/verify/sha256:YOUR_HASH_HERE
# © YOUR_NAME. All rights reserved. AI training prohibited.
```

**HTML / XML:**
```html
<!-- DAON: sha256:YOUR_HASH_HERE | https://app.daon.network/verify/sha256:YOUR_HASH_HERE -->
```

**For repositories:** add a `DAON.md` or append to `LICENSE`:
```
DAON Registration
-----------------
Hash:   sha256:YOUR_HASH_HERE
Verify: https://app.daon.network/verify/sha256:YOUR_HASH_HERE
Owner:  YOUR_NAME
```

---

## Plain Text and Markdown

Use the first or last line convention:

**First line:**
```
[DAON: sha256:YOUR_HASH_HERE | https://app.daon.network/verify/sha256:YOUR_HASH_HERE]
```

**Last line:**
```
---
DAON Verification: sha256:YOUR_HASH_HERE
https://app.daon.network/verify/sha256:YOUR_HASH_HERE
```

This works for `.txt`, `.md`, fanfic plain-text archives, README files, and any format that can't carry metadata.

---

## XMP Sidecar Files

When you can't embed metadata in the file itself — for example, formats that don't support it, or files you don't want to modify — use an XMP sidecar. Most professional tools and DAMs (Digital Asset Managers) recognize them.

Create `your-file.xmp` alongside `your-file.whatever`:

```xml
<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/">
      <dc:creator>
        <rdf:Seq><rdf:li>YOUR_NAME</rdf:li></rdf:Seq>
      </dc:creator>
      <dc:rights>
        <rdf:Alt><rdf:li xml:lang="x-default">© YOUR_NAME. DAON:sha256:YOUR_HASH_HERE</rdf:li></rdf:Alt>
      </dc:rights>
      <xmpRights:WebStatement>https://app.daon.network/verify/sha256:YOUR_HASH_HERE</xmpRights:WebStatement>
      <xmpRights:Marked>True</xmpRights:Marked>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
```

The sidecar must have the same base filename as the asset and live in the same directory.

---

## AO3 / Wattpad / Fanfiction.Net

### AO3 (Archive of Our Own)

AO3 doesn't allow `<head>` access. Use the visible link form in **Author's Notes** (beginning or end):

```html
<p>This work is registered on the DAON blockchain.
<a href="https://app.daon.network/verify/sha256:YOUR_HASH_HERE">[Verify ownership]</a>
— AI training prohibited under the Liberation License.</p>
```

**Where to add it:**
1. Go to your work → Edit
2. Scroll to "Preface" or "End Notes"
3. Paste the snippet, replace the hash
4. Save

### Wattpad / Fanfiction.Net / Royal Road

Most platforms allow plain text or limited HTML in story descriptions and author notes:

```
This work is registered on the DAON blockchain.
Proof of ownership: https://app.daon.network/verify/sha256:YOUR_HASH_HERE
AI training prohibited.
```

---

## WordPress / Self-Hosted Blog

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

## Social Media

**⚠️ All major social platforms strip file metadata on upload.** The only reliable embed is in visible text.

**In bio / profile:**
```
Creator | DAON-verified | app.daon.network
```

**In posts / captions:**
```
DAON registered. Verify: https://app.daon.network/verify/sha256:YOUR_HASH_HERE
AI training prohibited under the Liberation License.
```

**On Tumblr:** You can add the full verification URL to the post body, author notes, or a pinned post.

**On Bluesky:** Paste the verification URL into your post text. It will linkify.

---

## Declaring Boundaries for AI Crawlers

Beyond embedding tokens in individual files, you can declare a site-wide boundary for AI crawlers using `robots.txt` and HTTP headers.

### robots.txt

Add to your site's `robots.txt`:

```
# DAON-protected content — AI training prohibited
User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: Claude-Web
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: FacebookBot
Disallow: /

User-agent: Omgilibot
Disallow: /

User-agent: Diffbot
Disallow: /

# Standard crawlers (Google Search, etc.)
User-agent: *
Allow: /
```

If you only want to block AI crawlers from specific directories:

```
User-agent: GPTBot
Disallow: /posts/
Disallow: /stories/
Disallow: /art/
```

### X-Robots-Tag HTTP header

For server-controlled assets (images, PDFs served directly), add this header:

```
X-Robots-Tag: noai, noimageai
```

In **nginx**:
```nginx
location ~* \.(jpg|jpeg|png|gif|pdf|mp3|mp4)$ {
    add_header X-Robots-Tag "noai, noimageai";
}
```

In **Apache** (`.htaccess`):
```apache
<FilesMatch "\.(jpg|jpeg|png|gif|pdf|mp3|mp4)$">
    Header set X-Robots-Tag "noai, noimageai"
</FilesMatch>
```

### What these declarations mean

Like `robots.txt`, these are declared boundaries — not hard technical walls. A crawler that wants to ignore them can. But:

- Ignoring a declared, machine-readable boundary is a deliberate choice
- Your DAON registration timestamps your ownership claim *before* any scraping event
- Together, the meta tags, `robots.txt` entries, and DAON record make the boundary as legible and legally defensible as possible

The goal isn't to make scraping impossible. It's to make ignoring your boundaries an unambiguous, documented act.

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
