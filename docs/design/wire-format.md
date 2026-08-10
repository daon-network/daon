# Wire Format — DAON Provenance Leaves

**Status:** draft, pre-`0.1.0` · **Normative** · **Companion to:** [`provenance-data-model.md`](./provenance-data-model.md), [`editor-integration-spec.md`](./editor-integration-spec.md)

This defines the exact bytes that get hashed. It is the one artifact that cannot be revised
after release: once anyone's history is written with these rules, changing them invalidates
every proof already made, and re-witnessing the past is impossible — the timestamps came from
Bitcoin, not from us.

Everything here is chosen to be reimplementable from this document alone, in any language,
byte-for-byte. Test vectors in §7 are the acceptance test for a second implementation.

---

## 1. Primitives

| | |
| --- | --- |
| Hash | **SHA-256**, output 32 bytes |
| Integers | **fixed-width big-endian**. No varints, no LEB128 |
| Signatures | **Ed25519** over `leaf_id` |
| Text | **raw bytes, hashed as supplied** |

**No varints.** Variable-length integer encodings admit multiple representations of the same
value, and every such ambiguity is a place two implementations can silently disagree about a
hash. Fixed width costs a few bytes and removes the class entirely.

**No Unicode normalisation, anywhere in hashed data.** Normalisation tables change between
Unicode versions, so normalising would make a leaf's hash depend on which Unicode revision the
implementation was built against — a hash that changes over time is not a hash. Text is hashed
exactly as received. `tool_id` is therefore constrained to ASCII (§3) so the question cannot
arise.

**No optional fields in hashed structures.** Absence is expressed by a defined sentinel value,
never by omitting bytes or setting a presence flag. A genesis leaf's `parent_head` is 32 zero
bytes. This keeps every encoding fixed-length and removes any "was this field present?" ambiguity.

---

## 2. Domain separation

Every hashed structure is prefixed with a one-byte tag:

| Tag | Structure |
| --- | --- |
| `0x00` | revision leaf |
| `0x01` | internal Merkle node |
| `0x02` | observation |
| `0x03` | content delta |

Without distinct prefixes, a crafted leaf preimage could be reinterpreted as an internal node,
which is the second-preimage attack RFC 6962 exists to prevent. The `0x00`/`0x01` assignment
deliberately matches Certificate Transparency, so the empty-leaf hash is the familiar
`96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7` and existing CT tooling and
intuitions carry over.

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

```
meta_commit = SHA256( 0x02 || observation_bytes )
```

`authoritative` from the data model is **not encoded.** It is a structural constant, always
false; giving it a byte would imply it could be otherwise. Its absence from the wire is the
strongest possible statement that tools do not adjudicate source.

There is deliberately **no field for content source** and no extension mechanism that could
carry one. New `ingress` values require a format version bump, which is a decision, not a
vendor's option.

---

## 4. Revision leaf

**Fixed 186 bytes.** No length prefixes, no optional fields, nothing to disagree about.

| Offset | Size | Field | Notes |
| --- | --- | --- | --- |
| 0 | 1 | format version = `0x01` | |
| 1 | 8 | `seq`, u64 BE | 0 = genesis, monotonic |
| 9 | 32 | `parent_head` | **32 zero bytes for genesis** |
| 41 | 32 | `content_commit` | `SHA256(0x03 ‖ delta)` |
| 73 | 32 | `meta_commit` | §3 |
| 105 | 1 | beacon chain tag | `1` bitcoin, `2` daon |
| 106 | 8 | beacon height, u64 BE | |
| 114 | 32 | beacon block hash | |
| 146 | 32 | `author_key` | Ed25519 public key |
| 178 | 8 | `local_time`, **i64** BE | unix ms, **untrusted** |

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

---

## 6. Versioning

Every hashed structure carries its format version in its **first byte**, inside the hash
preimage. A v2 leaf cannot be mistaken for a v1 leaf, because the version participates in the
identity.

Rules for any future version:

1. Old leaves are **never re-encoded**. Their proofs must keep verifying forever.
2. A verifier that meets an unknown version **fails closed** — it must not guess.
3. Version numbers are per-structure. Bumping the observation format does not bump the leaf format.

---

## 7. Test vectors

Computed by the reference encoder in [`../../scripts/provenance/wire_ref.py`](../../scripts/provenance/wire_ref.py).
A second implementation is conforming when it reproduces all of these.

### 7.1 Observation

```
tool_id      "ref/1.0"
ingress      paste (2)
added        214        removed   12
duration_ms  45200      op_count  87

encoded (43 bytes)
0100077265662f312e300200000000000000d6000000000000000c000000000000b090
0000000000000057

meta_commit  86bf7780630473515767599095e90e35b92266e1d5860d172591e8ab6cc3da65
```

### 7.2 Content commit

```
delta           "the quick brown fox"
content_commit  04d4bb06c05c7593ea1cfb3b63c92cfe061f3e737afef00b213fc4b3963ae958
```

### 7.3 Genesis leaf

```
seq             0
parent_head     0000…0000  (32 zero bytes)
content_commit  §7.2
meta_commit     §7.1
beacon          bitcoin, height 880000, hash 00…00deadbeef
author_key      1111…1111  (32 × 0x11)
local_time      1754000000000

body (186 bytes)
010000000000000000000000000000000000000000000000000000000000000000000000
00000000000004d4bb06c05c7593ea1cfb3b63c92cfe061f3e737afef00b213fc4b3963a
e95886bf7780630473515767599095e90e35b92266e1d5860d172591e8ab6cc3da650100
000000000d6d8000000000000000000000000000000000000000000000000000000000de
adbeef1111111111111111111111111111111111111111111111111111111111111100000
198628c0400

leaf_id  b515ccba6108166c28e6e8073700211c41a49094b247da070bcaf0a42a47da52
```

### 7.4 Merkle root over 5 leaves

Leaves are `SHA256(0x00 || <single byte i>)` for i = 0…4 — chosen so the vector tests the tree,
not the leaf encoder. `leaf[0]` is the RFC 6962 empty-leaf hash.

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

### 7.5 Inclusion proof for `leaf[3]`

```
L  fcf0a6c700dd13e274b6fba8deea8dd9b26e4eedde3495717cac8408c9c5177f
L  a20bf9a7cc2dc8a08f5f415a71b19f6ac427bab54d24eec868b5d3103449953a
R  4f35212d12f9ad2036492c95f1fe79baf4ec7bd9bef3dffa7579f2293ff546a4
```

Folds to the §7.4 root. Substituting `leaf[2]` must fail.

---

## 8. Open

- **Beacon chain tags** are an enum, so adding a source is a format change. Only `bitcoin` and
  `daon` are defined; `daon` is unused until the P2 multi-witness work.
- **`tool_id` is ASCII ≤ 64** to sidestep normalisation. If richer identifiers are ever needed,
  they belong in unhashed transport metadata, not the commitment.
- **No consistency-proof encoding yet.** P1 in the data model; it constrains nothing here, since
  consistency proofs are derived from the same node hashing.
