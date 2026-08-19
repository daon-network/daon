---
layout: default
title: "Decisions, and Why"
description: "The load-bearing choices in DAON provenance, the reasoning behind each, and the ones we got wrong first."
permalink: /design/decisions/
---
# Decisions, and Why

The other documents say what the system does. This one says **why it does that rather than the
obvious alternative**, because most of these look arbitrary until you know what they are avoiding.

Several were decided twice. Those are marked **↺ reversed**, and they are the most useful entries
here: a reversal records a wrong answer that looked right, which is exactly the answer someone will
re-derive if nobody wrote down why it failed.

---

## What the system is for

**DAON proves a work existed by a date, and that a key signed it. It does not decide who owns
anything.**

Everything below follows from refusing that second role. A registry that adjudicates is a registry
that can be pressured, subpoenaed and wrong; one that records and dates can only be checked.

---

## Hashing

### Hashed bytes are never normalised

Not Unicode folding, not line endings, nothing. Normalisation tables change between Unicode
versions, so a normalised hash depends on which revision the implementation was built against — it
would stop verifying after a library upgrade, silently, years later, in exactly the situation where
the proof mattered.

Canonicalisation happens **before** hashing, on content the creator chooses, never inside the hash.
[`wire-format.md`](./wire-format.md) §2.

### Register plain text — unless the pictures or the layout are the work ↺

The first version said "register plain text" full stop. That silently drops images: an illustrated
book registered through the text path is a registration of its captions.

So the rule is scoped. Words → text. Pictures or layout → **register the file**, accepting that a
`.docx` is a ZIP whose bytes change on re-save. A hash that covers your photographs and breaks when
you re-export is worth more than one that is stable and covers none of them.
[`document-formats.md`](./document-formats.md).

### Content that strips to nothing is refused ↺

Canonicalisation introduced a collision: every image-only document reduced to the empty string and
hashed to `e3b0c442…`. Three unrelated works, one hash, the first registration blocking the rest,
and the survivor committing to an empty document.

Refusing is the only honest answer — content that vanishes under text extraction is not text. There
is a second guard at the hash site so a future code path that skips canonicalisation still cannot
register the hash of nothing.

### `content_commit` is a Merkle tree over 1 KiB segments, not a flat hash

So a creator can prove **one passage** without revealing the rest. The cost is real and stated:
segment boundaries have no relationship to paragraphs, so disclosing a passage discloses whatever
shares its segments. Any tool offering it must show the holder the exact bytes first.

**DAON never issues, renders or serves segment-level detail.** There is no `?segment=` parameter on
any endpoint. The capability is the creator's; the surface is not ours to build.

---

## Witnessing

### The witness is Bitcoin via OpenTimestamps, not the DAON chain

DAON must never be the anchor for its own claims. A proof that depends on us existing and being
honest is not a proof a skeptic can use.

### Batching is mandatory, not an optimisation

Authoring events and leaves are free and local. Witnesses consume calendar servers running on
someone else's goodwill and Bitcoin fees somebody pays. So heads accumulate into a Merkle tree and
one anchor covers all of them — reusing the machinery the revision log already has, at `log2(n)`
hashes per member, **without adding a step to the verifier**.

### A pending proof proves nothing, and says so

A freshly submitted timestamp parses cleanly, looks finished, and carries no Bitcoin attestation.
It is a receipt. `needs_upgrade` exists because this is the step that gets forgotten.

---

## Keys

### The keychain, not the Secure Enclave

An Enclave key is generated inside the chip and cannot leave it — which is the whole security
property, and exactly why it **can never sync**. The two are mutually exclusive by construction.
A creator writing on a laptop and a tablet has one identity, not two.

The Enclave would also require P-256; `author_key` is a 32-byte Ed25519 field and a compressed
P-256 key is 33. Deferring costs nothing: the format version byte at offset 0 is the agility
mechanism and it is already there. [`device-keys.md`](./device-keys.md).

### One key, moved deliberately

Per-device keys push toward one chain signed by several keys, which turns verification from
checking a signature into walking an authorisation graph. That is a permanent tax on every future
implementer. [`key-authorization.md`](./key-authorization.md) chose the option that keeps the
verifier at four steps.

### Each key may replace the other; neither may replace itself

A rotation replaces the author key and is signed by the recovery key. A recovery rotation replaces
the recovery key and is signed by the author key.

The half that looks redundant is the load-bearing half: **a rotation must not replace the recovery
key.** Symmetry with transfer suggests it should, and if it did, a thief who obtained the recovery
key would install their own on first use and the legitimate holder would have nothing left to
answer with.

### Key events are a sentinel, not a format version

`content_commit` of 32 zero bytes means "this leaf records a key change". Unreachable by content —
empty content commits to `084fed08…`, and all-zero any other way needs a SHA-256 preimage.

A version-byte flag was the obvious alternative and it breaks something. A verifier that does not
understand key events must still **parse** the leaf, because `head` is a Merkle root over every
`leaf_id` — one unparseable leaf makes the entire chain unverifiable to that verifier. Fixed layout
keeps history checkable by implementations that do not know what they are looking at.

### There is no chain-level delay ↺

For a while, any leaf replacing the recovery key took effect only after five days, so a creator
could notice a hostile change and counter-rotate.

**That assumed one chain. Theft produces two.** A thief works from a copy: their rotation and the
creator's counter-rotation share a parent and **fork** rather than sequence, so nothing supersedes
anything. And no timestamp calendar indexes, so neither party can look for the other's branch.

The rule helped only where both parties extend the same store — a shared machine — and cost the
verifier an audit rule for a case it did not cover. Removed.

### A superseded key still proves who wrote the past

A rotation hands over the future of a chain. It cannot transfer the fact that a particular key
signed leaves 0–400, and that stays demonstrable by whoever holds the key: sign a fresh challenge,
bound to a nonce and an expiry.

This cuts both ways and should. After a legitimate sale the seller can still prove they signed the
pre-transfer leaves, because they did.

---

## The registry

### Registry and provenance are separate systems, linked by content

Not by accounts. Both values derive from the same bytes, so anyone holding the content computes
both. A pointer would add nothing — there is no verifier who can check one and not the other — and
an account link would make account recovery an attack path on provenance.

Which is why the database association is a **finding aid, not evidence**. Tamper with it, drop the
table, restore a bad backup: the check still runs on content.

### Registrations are append-only

A new version is a new row. Updating a record's hash in place would destroy its original date,
which is the only thing registration was ever for.

### Associations are non-exclusive ↺

Any number of accounts may assert a chain for one content hash, and none displaces another.

A unique constraint is the obvious design and it is a trap: whoever asserted first would squat the
hash, and the person best placed to do that is not the creator. It would also silence the
notification, since there would be no prior claimant to tell.

### The gate is the owner of record, not the previous asserter ↺

An association carrying different chain keys waits for the **owner of record** to attest.

Gating on the *previous asserter* was the first instinct and it inverts the problem: it hands
whoever asserted first a veto over everyone after, so a false assertion on Monday stops the real
creator recording their own on Tuesday. The owner of record is the one thing DAON is genuinely
authoritative for, and therefore the one thing it may gate.

**Verification cannot substitute for this.** DAON can check that a rotation was authorised by the
key it recorded — and a stolen key *is* the key it recorded, so a thief's rotation verifies
perfectly. Cryptography answers whether a change was authorised; only a human with the account
answers whether it was wanted.

### Silence refuses ↺

A pending association expires after five days, unanswered, and is refused.

The first version left it pending indefinitely on the grounds that silence must not become consent.
Expiry is better and the direction is what matters: **if silence accepted, the winning move would
be to assert against somebody on holiday and say nothing.** An expired row stays on the record,
dated, because that the assertion was made is a fact.

### Every key change is notified, not only suspicious ones

Deciding which rotations are legitimate is the adjudication this design refuses. A creator who
rotated their own key receives a confirmation, and that is the point: it is how the ones they did
not make stand out.

---

## Boundaries that are not negotiable

- **DAON never ranks competing claims.** It shows them, dated and attributed.
- **DAON never asserts two artifacts are the same work.** It can report that canonical text
  corresponds, with that phrasing and its limits attached.
- **The agent's only egress is OpenTimestamps.** No content, no keys, no telemetry.
- **The minimum verifier stays at four steps.** Several otherwise attractive designs were rejected
  for adding a fifth; anything a verifier must do, every future implementer must do, forever.
