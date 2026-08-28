# What DAON actually does

**Last verified:** 21 August 2026, against production and the test suites.

This is the single source of truth for what exists. `documentation/project/`
holds eighteen roadmap and status files, three of which describe the broker
system as complete; where any of them disagrees with this page, this page is
right and they are stale.

Every "works" below was checked, not remembered. Where something is partial or
missing it says so, because a features list that overstates is the same failure
as a testimonial from a person who does not exist.

## Live right now

| | |
| --- | --- |
| API | `https://api.daon.network` |
| App | `https://app.daon.network` |
| Docs | `https://daon.network` (GitHub Pages) |
| Chain | `daon-mainnet-1`, height 2,412,248 |
| Content records | 109 |
| Accounts | 3 |

The 109 records date from April–May 2026 and carry no owner: a volume was wiped
and they were rebuilt from chain transactions, which preserved the hashes but not
who registered them.

## Works

### Registration and verification

- **Text registration** with licence terms and AI-training policy
- **Text verification** — submit content, get the record
- **File registration** — any bytes, committed as `content_commit`: a Merkle root
  over 1 KiB segments. Verified in production against a locally computed hash.
- **Duplicate detection** — re-registering returns the existing record
- Files are **not** canonicalised. A re-exported JPEG is a different file, and
  the 404 says so in words.

### Provenance agent (Rust, `provenance/`)

- Append-only Merkle revision log, 218-byte leaves, inclusion proofs
- The four-step verifier, `no_std`, builds for `wasm32`
- **Composite works** — text with images, committed as a tree over parts, so one
  panel can be disclosed without revealing the rest
- **Streaming ingress** — `POST /v1/part` takes raw bytes; the agent keeps 32
  bytes per part, so work size is not bounded by daemon memory
- **Witness loop** — batches heads and anchors them via OpenTimestamps to
  Bitcoin. Verified end to end against the real public calendars.
- Keychain-backed signing, rotation, recovery rotation, transfer
- The daemon speaks HTTP over a `0600` Unix socket. There is no TCP option.

### Verification inside DAON

The API loads the same `wasm32` verifier a skeptic runs in a browser. There is
exactly one implementation of the format, and CI fails if the committed artifact
drifts from its source.

### Accounts

- Magic-link sign-in
- **Mandatory TOTP 2FA** — required on every account, by decision
- Trusted devices
- Apple's built-in verification codes documented first, because they need no
  install

### Integrations

| | |
| --- | --- |
| Node SDK | **published** as `daon-sdk` |
| Python, Ruby, Go, PHP SDKs | source only — see below |
| WordPress plugin | in-repo, tested by CI, **never published** |

## Partial

- **Broker system** — endpoints, auth, webhooks and rate limiting exist and are
  tested. Three documents call it complete; it is not.
- **Blockchain beacon** — leaves carry a zero beacon until the daemon has a block
  source. Honest rather than wrong: it claims nothing instead of claiming an
  unverified height.

## Does not exist

Listed because someone will otherwise assume it does.

- **Account deletion.** No endpoint, no UI, nothing in the database client. This
  matters more than it looks: the stated jurisdiction is Germany/EU and the site
  claims GDPR compliance, and the right to erasure is not optional there.
- **2FA recovery / backup codes.** Lose the authenticator with no trusted device
  and the account is unreachable.
- **Status page.** `/health` reports build, chain height and memory; nothing
  presents it.
- **Four of the five SDKs are unpublished.** Their workflows can publish now, but
  no name has been claimed on PyPI, RubyGems or Packagist.
- **Web text still uses the old hash.** Registration through the site hashes
  canonicalised text with a bare SHA-256, while the agent and file registration
  use `content_commit`. One work can therefore have two identities. Tracked in
  #137.

## Deliberately not built

Not gaps. Decisions, with reasons that hold.

- **No browser extension.** A web store can update it silently for every user,
  browser storage has no hardware backing, and a content script reads what the
  *site* sent rather than what a person wrote. Removed entirely in August 2026.
- **No collections or grouping.** Provenance is a property of a work. Grouping
  works is cataloguing, and cataloguing creates an aggregation surface where
  scoring becomes possible.
- **No similarity or "purity" scoring, ever.** Ownership and provenance only.
- **No delay on key rotation.** It would produce two chain-asserted competing
  records rather than one clear one.
- **Nothing normalises hashed bytes.** No Unicode folding, no line-ending
  translation — a normalised hash depends on which Unicode revision the
  implementation was built against.
