---
layout: default
title: "Wire Format — DAON Provenance Leaves"
description: "Normative byte layout for provenance leaves. Fixed widths, big-endian, no optional fields."
permalink: /design/wire-format/
mermaid: true
---
# Wire Format — DAON Provenance Leaves

**Status:** draft, pre-`0.1.0` · **Normative** · **Companion to:** [`provenance-data-model.md`](./provenance-data-model.md), [`editor-integration-spec.md`](./editor-integration-spec.md)

This defines the exact bytes that get hashed. It is the one artifact that cannot be revised
after release: once anyone's history is written with these rules, changing them invalidates
every proof already made, and re-witnessing the past is impossible — the timestamps came from
Bitcoin, not from us.

Everything here is chosen to be reimplementable from this document alone, in any language,
byte-for-byte. Test vectors in §8 are the acceptance test for a second implementation.

---

## 1. Primitives

| | |
| --- | --- |
| Hash | **SHA-256**, output 32 bytes |
| Integers | **fixed-width big-endian**. No varints, no LEB128 |
| Signatures | **Ed25519** over `leaf_id` |
| Text and content | **raw bytes, hashed exactly as supplied** |

**No varints.** Variable-length integer encodings admit multiple representations of the same
value, and every such ambiguity is a place two implementations can silently disagree about a
hash. Fixed width costs a few bytes and removes the class entirely.

**No canonicalisation of any hashed bytes.** Not Unicode normalisation, not line-ending
translation, not trailing-newline insertion. Normalisation tables change between Unicode
versions, so a normalised hash would depend on which Unicode revision the implementation was
built against — a hash that drifts over time is not a hash. The same reasoning rules out every
other "helpful" transformation: each one is an algorithm that must then be specified exactly and
implemented identically forever.

The tool decides what the document *is*. This format hashes those bytes verbatim. `tool_id` is
constrained to ASCII (§3) so the question cannot arise there either.

**No optional fields in hashed structures.** Absence is expressed by a defined sentinel value,
never by omitting bytes or setting a presence flag. A genesis leaf's `parent_head` is 32 zero
bytes. Every leaf body is therefore exactly 218 bytes with nothing to disagree about.

---

## 2. Domain separation

Every hashed structure is prefixed with a one-byte tag:

| Tag | Structure |
| --- | --- |
| `0x00` | revision leaf, and Merkle leaf input |
| `0x01` | internal Merkle node |
| `0x02` | observation |
| `0x03` | content |

Without distinct prefixes, a crafted leaf preimage could be reinterpreted as an internal node,
which is the second-preimage attack RFC 6962 exists to prevent. The `0x00`/`0x01` assignment
deliberately matches Certificate Transparency, so existing CT tooling and intuitions carry over.

> **Note on RFC 6962 constants.** For cross-checking against CT: `MTH({})`, the empty *tree*, is
> `SHA256("")` = `e3b0c442…`; an empty *leaf* is `SHA256(0x00)` = `6e340b9c…`. Neither appears in
> §8 — the vectors there build leaves from single non-empty bytes, so `leaf[0]` is
> `SHA256(0x00 ‖ 0x00)` = `96a296d2…`. Stated explicitly because an earlier draft of this
> document misattributed that value as a CT constant.

---

## 3. Observation

Variable-length, so it is committed separately and only its hash enters the leaf. This is what
lets a holder disclose metadata without content.

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 1 | format version = `0x01` |
| 1 | 2 | `tool_id` length, u16 BE, **max 64** |
| 3 | n | `tool_id`, **ASCII only** |
| 3+n | 1 | `ingress` enum |
| 4+n | 8 | `span_bytes.added`, u64 BE |
| 12+n | 8 | `span_bytes.removed`, u64 BE |
| 20+n | 8 | `duration_ms`, u64 BE |
| 28+n | 8 | `op_count`, u64 BE |

```
ingress:  0 unknown   1 keystroke_stream   2 paste   3 import   4 programmatic
```

### One leaf, many observations

A coalescing window routinely contains several observations with different `ingress` values —
typing, then a paste, then more typing. The integration spec requires these be reported
separately and **not averaged**, because averaging destroys exactly the distinction that makes
the record worth having.

`meta_commit` is therefore a **Merkle root over the observation sequence**, in the order the
agent recorded them, using the same node hashing as §5:

```
observation_leaf(i) = SHA256( 0x02 || observation_bytes(i) )
meta_commit         = merkle_root([ observation_leaf(0), … ])
```

A leaf commits to **at least one** observation. With exactly one, the root is that leaf's hash,
so `meta_commit = SHA256(0x02 ‖ observation_bytes)` and the common case is unchanged. This also
means a holder can disclose one observation with an inclusion proof, without revealing the rest
of the window.

### What is deliberately absent

`authoritative` from the data model is **not encoded.** It is a structural constant, always
false; giving it a byte would imply it could be otherwise. Its absence from the wire is the
strongest possible statement that tools do not adjudicate source.

There is no field for content source and **no extension mechanism that could carry one.** New
`ingress` values require a format version bump, which is a decision, not a vendor's option.

---

## 4. Revision leaf

**Fixed 218 bytes.** No length prefixes, no optional fields.

| Offset | Size | Field | Notes |
| --- | --- | --- | --- |
| 0 | 1 | format version = `0x01` | |
| 1 | 8 | `seq`, u64 BE | 0 = genesis, monotonic |
| 9 | 32 | `parent_head` | **32 zero bytes for genesis** |
| 41 | 32 | `content_commit` | §6 |
| 73 | 32 | `meta_commit` | §3 |
| 105 | 1 | beacon chain tag | `1` bitcoin, `2` daon |
| 106 | 8 | beacon height, u64 BE | |
| 114 | 32 | beacon block hash | |
| 146 | 32 | `author_key` | Ed25519 public key |
| 178 | 32 | `recovery_key` | §7 |
| 210 | 8 | `local_time`, **i64** BE | unix ms, **untrusted** |

```
leaf_id = SHA256( 0x00 || leaf_body )
```

**`local_time` is signed, not unsigned.** It is creator-asserted and explicitly untrusted, so it
must be able to hold nonsense — including values before the epoch — without the encoder
rejecting it or wrapping it into a different number. The verifier derives real bounds from the
beacon and the witness; this field is recorded, never believed.

### The signature is not in `leaf_id`

`sig` is Ed25519 over `leaf_id`, carried alongside the leaf, and **excluded from the hashed
body.** Two consequences, both wanted:

- A leaf's identity is a property of its content, not of who signed it or how. Re-signing cannot
  change what a leaf *is*.
- Verifier steps 1–3 (recompute, walk, check the timestamp) work on an unsigned leaf. Signature
  checking stays step 4 and stays optional, exactly as the data model specifies.

---

## 5. Merkle tree

```
node(l, r) = SHA256( 0x01 || l || r )
```

For n > 1 leaves, split at **k = the largest power of two strictly less than n**:

```
root(leaves) = node( root(leaves[0..k]), root(leaves[k..n]) )
root([x])    = x
root([])     = SHA256("")
```

**Not last-node duplication.** Duplicating an odd trailing node — the Bitcoin approach — lets two
different leaf sequences produce the same root (CVE-2012-2459). For a structure whose entire
purpose is proving *which* revisions existed, a root that is ambiguous about its leaves is
disqualifying. RFC 6962's split has no such collision.

An inclusion proof is the sibling hashes from leaf to root, each tagged with the side it sits on.
Verification is a fold: `h = node(h, sib)` for a right sibling, `node(sib, h)` for a left one.

The same construction serves both the entity log (over revision leaves) and `meta_commit` (over
observations). One tree implementation, one set of proofs.

---

## 6. Content commitment

```
SEGMENT_SIZE   = 1024 bytes
segments(c)    = [ c[0:1024], c[1024:2048], … ]     last may be short; empty c → one empty segment
content_commit = merkle_root([ SHA256(0x03 || seg) for seg in segments(content) ])
```

Content under 1 KiB is a single segment, so `content_commit = SHA256(0x03 ‖ content)` and small
documents behave exactly like a flat content hash.

**Not a delta.** The data model describes `content_commit` as hashing the delta from the parent,
and that is the wrong layer for it. In a disclosure, an adjudicator holds the content and must
confirm it produces the committed hash — in whatever language they have, years later. Hashing a
delta makes that reproduction contingent on a diff algorithm, its version, and its tie-breaking
rules. Hashing content makes it a hash. Delta storage remains a perfectly good **local**
optimisation; it is simply not what we commit to.

### Why segmented rather than flat

A flat hash would force **maximal disclosure**. To prove anything at all about a revision — that
one paragraph existed before a date — a creator would have to reveal the entire revision. For
someone with an unpublished manuscript, answering one question would mean handing over the book.

Segmenting inverts that. A holder can disclose one segment plus an inclusion proof:

```
disclose( segment_bytes, index, sibling_hashes )  →  verifies against content_commit
```

Everything else stays hidden. **Fine-grained proof is a tool for disclosing less, not a mechanism
for demanding more.**

### The line this does not cross

Capability and surface are different things, and the distinction is the whole point:

The **revision** is the unit. Every leaf is one revision, and everything DAON stores, proves and
certifies operates at that grain. Segments live *inside* a single revision's content; they are a
finer grain than anything DAON's own surfaces work in.

| | |
| --- | --- |
| DAON stores, proves and certifies **revisions** | always — this is the entire system |
| A creator may choose to prove **one segment within** a revision | the format supports it |
| DAON issues, renders, or serves an endpoint for **segment-level** detail | never |

Nothing DAON produces — certificate, viewer, API — asks for, renders, or makes queryable a
segment-level disclosure. Concretely: `GET /v1/entity/{id}/proof?seq=N` returns a proof for
revision N and there is no `?segment=` parameter, on that endpoint or any other.

A creator wanting to prove one segment generates that proof themselves, from content only they
hold, and hands it to whoever they choose. It is an affirmative act by the holder, exactly as
`provenance-data-model.md` requires of disclosure generally.

The coercion risk that argues against fine granularity lives in what a system *issues and
displays*, because that is what an adversary can point at and demand. It does not live in what a
creator can voluntarily choose to prove about their own work — refusing them that only means the
sole way to prove anything is to expose everything.

### Segment boundaries leak, and that is the creator's call

A 1 KiB boundary has no relationship to a paragraph. Disclosing a passage discloses the segments
it spans, which may include adjacent text the holder did not intend to reveal. Smaller segments
reduce the spill and enlarge the tree; the proof stays O(log n) either way.

This cost is real and is not hidden: a holder choosing segment-level disclosure is choosing to
reveal up to `SEGMENT_SIZE − 1` bytes of neighbouring content on each side. An implementation
offering this **must** show the holder the exact bytes that will be disclosed before they
disclose them. Consent to reveal a passage is not consent to reveal whatever shares its segment.

## 7. Key recovery

`recovery_key` is a second Ed25519 public key, committed in **every** leaf and signed alongside
the rest of the body.

Without it, losing the author key freezes an entity permanently. History stays verifiable but
can never be extended — and for a work in progress, continuity *was* the evidence. A fourteen-month
chain that stops dead is not a small loss.

`ForkGenesis` does not solve this. A new entity pointing at the old one's witnessed head is
signed by a different key, so it demonstrates nothing an adversary with a copy of the public
history could not also demonstrate.

**Why it must be here now, before rotation semantics exist.** Adding rotation later requires the
verifier to decide when a key change is legitimate, which means walking a rotation chain — work
the four-step minimum verifier does not do, and which the data model explicitly protects it from.
Committing the key in genesis means a future rotation rule can be checked against something that
was there from the beginning, instead of requiring the verifier to be extended to establish it.

Thirty-two bytes now, in a format that by its own terms can never be revised.

Rotation semantics are proposed in [`key-recovery.md`](./key-recovery.md): the recovery key may
sign a rotation leaf naming a new `author_key` and **nothing else**, rotation is an ordinary
witnessed leaf so takeover is visible and ordered, and the minimum verifier is untouched — a leaf
signed by the `author_key` in that leaf is valid, and whether the key legitimately changed is an
audit question rather than a verification step. This document reserves the field and requires it
be committed; the encoding of a rotation leaf is still open. An implementation that has no
recovery key **must** commit 32 zero bytes and accept that the entity is unrecoverable.

---

## 8. Versioning

Every hashed structure carries its format version in its **first byte**, inside the hash
preimage. A v2 leaf cannot be mistaken for a v1 leaf, because the version participates in the
identity.

Rules for any future version:

1. Old leaves are **never re-encoded**. Their proofs must keep verifying forever.
2. A verifier that meets an unknown version **fails closed** — it must not guess.
3. Version numbers are per-structure. Bumping the observation format does not bump the leaf format.

---

## 9. Test vectors

Computed by [`../../scripts/provenance/wire_ref.py`](../../scripts/provenance/wire_ref.py), which
regenerates them and self-checks on run. A second implementation is conforming when it reproduces
all of these.

### 9.1 Observations and `meta_commit`

```
observation[0]  tool_id "ref/1.0"  ingress paste (2)
                added 214  removed 12  duration_ms 45200  op_count 87

observation[1]  tool_id "ref/1.0"  ingress keystroke_stream (1)
                added 1180  removed 96  duration_ms 51000  op_count 1431

encoded[0] (43 bytes)
0100077265662f312e300200000000000000d6000000000000000c000000000000b090
0000000000000057

obs_leaf[0]      86bf7780630473515767599095e90e35b92266e1d5860d172591e8ab6cc3da65
obs_leaf[1]      3cf97112729a2de6c51b7ae3372541d70b813e0a7c589cc4a66383e6aec1761b

meta_commit, one observation   86bf7780630473515767599095e90e35b92266e1d5860d172591e8ab6cc3da65
meta_commit, both observations f806164d604f0a608cc55ad1339d37a7d6a196251f09b305998b1a9078217cd8
```

The single-observation `meta_commit` equals `obs_leaf[0]` — the degenerate root of a one-leaf
tree. An implementation that special-cases it differently will disagree here.

### 9.2 Content commitment

```
content         "the quick brown fox"     (19 bytes — one segment)
content_commit  04d4bb06c05c7593ea1cfb3b63c92cfe061f3e737afef00b213fc4b3963ae958
```

Under `SEGMENT_SIZE` the root is the single segment's hash, so this equals
`SHA256(0x03 ‖ content)`. An implementation that special-cases short content differently will
still agree here — which is the point of the degenerate case.

Multi-segment, to exercise the tree. Content is `0x01 × 1024 ‖ 0x02 × 1024 ‖ 0x03 × 1024`:

```
segments        3
content_commit  6f530589075448eb1369f2188bf4115e04aeafe4f73954c49dbfbb5b3cbaabc9
segment[1] hash 10c283b2a1ca587fcdf599494dbf6b0be12d5ca720bc3aabb524d13531415ae5
```

Boundary cases: 1024 bytes is **one** segment, 1025 is **two**, empty content is **one empty
segment**.

### 9.3 Genesis leaf

```
seq             0
parent_head     0000…0000  (32 zero bytes)
content_commit  §9.2
meta_commit     §9.1, both observations
beacon          bitcoin, height 880000, hash 00…00deadbeef
author_key      1111…1111  (32 × 0x11)
recovery_key    2222…2222  (32 × 0x22)
local_time      1754000000000

body (218 bytes)
010000000000000000000000000000000000000000000000000000000000000000000000
00000000000004d4bb06c05c7593ea1cfb3b63c92cfe061f3e737afef00b213fc4b3963a
e958f806164d604f0a608cc55ad1339d37a7d6a196251f09b305998b1a9078217cd80100
000000000d6d8000000000000000000000000000000000000000000000000000000000de
adbeef1111111111111111111111111111111111111111111111111111111111111111222
2222222222222222222222222222222222222222222222222222222222200000198628c0
400

leaf_id  c6167ccbb8af644c7b7a478e8a64c0a8695bac272fa8fbcc597c4b2182efad78
```

### 9.4 Merkle root over 5 leaves

Leaves are `SHA256(0x00 ‖ <single byte i>)` for i = 0…4 — chosen so the vector tests the tree,
not the leaf encoder.

```
leaf[0]  96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7
leaf[1]  b413f47d13ee2fe6c845b2ee141af81de858df4ec549a58b7970bb96645bc8d2
leaf[2]  fcf0a6c700dd13e274b6fba8deea8dd9b26e4eedde3495717cac8408c9c5177f
leaf[3]  583c7dfb7b3055d99465544032a571e10a134b1b6f769422bbb71fd7fa167a5d
leaf[4]  4f35212d12f9ad2036492c95f1fe79baf4ec7bd9bef3dffa7579f2293ff546a4

root     b855b42d6c30f5b087e05266783fbd6e394f7b926013ccaa67700a8b0c5a596f
```

Five leaves is the smallest count that exercises an unbalanced split (k = 4), so an
implementation using last-node duplication produces a different root here and fails.

### 9.5 Inclusion proof for `leaf[3]`

```
L  fcf0a6c700dd13e274b6fba8deea8dd9b26e4eedde3495717cac8408c9c5177f
L  a20bf9a7cc2dc8a08f5f415a71b19f6ac427bab54d24eec868b5d3103449953a
R  4f35212d12f9ad2036492c95f1fe79baf4ec7bd9bef3dffa7579f2293ff546a4
```

Folds to the §9.4 root. Substituting `leaf[2]` must fail.

---

## 10. Open

- **Rotation semantics** — §7 reserves `recovery_key` but does not define its use. P1.
- **Content store** — bytes stay local and the format no longer constrains how they are stored,
  since the commitment is over content rather than a delta. Git remains a strong candidate and
  the decision is now purely local.
- **Beacon chain tags** are an enum, so adding a source is a format change. Only `bitcoin` and
  `daon` are defined; `daon` is unused until the P2 multi-witness work.
- **`tool_id` is ASCII ≤ 64** to sidestep normalisation. Richer identifiers belong in unhashed
  transport metadata, not the commitment.
- **No consistency-proof encoding yet.** P1; it constrains nothing here, since consistency proofs
  derive from the same node hashing.
