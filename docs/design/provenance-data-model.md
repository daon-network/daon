---
layout: default
title: "DAON Provenance & Versioning — Data Model (Design)"
description: "The append-only revision ledger: leaves, heads, witnesses, and what each one proves."
permalink: /design/provenance-data-model/
mermaid: true
---
# DAON Provenance & Versioning — Data Model (Design)

**Status:** draft · MVP scope locked (July 2026)
**Feeds:** NGI Zero Commons milestones — *Specification v1.0*, *Threat Model*, *Reference Implementation*

---

## Mission — and the hard boundary around it

DAON establishes **ownership and provenance** of creative work. That is the entire scope.

DAON does **not** certify a work as "human-made," score creators, or gate access. It refuses the human/AI binary *by construction* (see Non-Goals). We offer metrics and data under the creator's control; we never render a verdict.

---

## Core principle: assert revisions, never source

No tool can truthfully attest the *source* of content. An editor cannot know whether pasted text came from a person, a notes app, or a model — and assuming "human" is merely ignorance dressed as fact. So the system never attests source. It attests **revisions**:

- **Tools observe** what happened (a paste occurred; keystrokes occurred) — never what the content *is*.
- **A witness timestamps existence** — it attests only that a given state existed by a given time.
- **The relying party infers** from the shape of the history. The inference is theirs, on evidence they can independently check.

The creator's key signs *"I made these revisions,"* never *"these are human."*

---

## Why verification stays tractable — the three rates

| Rate | Where it lives | Cost | Frequency |
|---|---|---|---|
| Authoring events (keystrokes, edits) | editor's local history | ~free | very high |
| Leaves (revision commits) | creator's local store | local hash | medium |
| Witnesses (anchored heads) | OpenTimestamps → Bitcoin | free, trust-bearing | low (publish-only) |

**One witnessed head vouches for arbitrarily many leaves.** A single receipt on a head plus an O(log n) inclusion proof proves any leaf beneath it existed by the witness time. Therefore:

> **Verification cost scales with the number of witnessed heads, not the number of leaves.**

This is the invariant the whole design protects. Keep witnessed heads few and meaningful and verification never explodes.

---

## Data model

```
// Entity: identity = genesis; position = head
Entity {
  entity_id : Hash    // = hash(genesis leaf) — content-addressed, immutable
  head      : Hash    // current Merkle root over all appended leaves
  head_seq  : uint    // revision count
}

// Revision leaf: the append-only unit. One per authoring event (save/session).
RevisionLeaf {
  seq            : uint       // 0 = genesis, monotonic
  parent_head    : Hash       // head this revision extended (fork = parent in another entity)
  content_commit : Hash       // hash(content bytes) — raw bytes stay in the creator's store
                              // (was: delta. See wire-format.md §6 — a delta is not
                              //  reproducible by an adjudicator years later.)
  meta_commit    : Hash       // hash(Observation) — committed separately so metadata opens without content
  beacon         : BeaconRef  // recent public unpredictable value (block hash) → free lower time bound
  author_key     : PubKey     // creator-held key — the only authorship anchor
  local_time     : Timestamp  // UNTRUSTED (creator-asserted)
  sig            : Signature  // author_key over the above
}

// Observation: what the tool SAW. Never what the source IS.
Observation {
  observed_by   : ToolId
  authoritative : false       // structural constant — tools observe, never adjudicate source
  ingress       : "keystroke_stream" | "paste" | "import" | "programmatic" | "unknown"
  span_bytes    : { added: uint, removed: uint }
  duration_ms   : uint        // wall-clock to produce this revision
  op_count      : uint
  // DELIBERATELY no `source: human|ai` field. It would be a lie or a guess.
}

// Witness receipt (MVP: OpenTimestamps)
WitnessReceipt {
  witnessed_head : Hash       // this head existed…
  witness_time   : Timestamp  // …by this trusted time. EXISTENCE + ORDERING ONLY.
  ots_proof      : OtsProof   // OpenTimestamps proof → Bitcoin block header (pending → upgraded)
}

// Fork / derivation edge: a genesis whose parent is another entity's witnessed head
ForkGenesis : RevisionLeaf {
  parent_head   : Hash        // = a witnessed head of the canonical entity
  parent_entity : Hash        // canonical entity_id
}
```

**Derived on demand, never stored:**
- `InclusionProof(leaf, head)` — "this revision is in this witnessed head" (O(log n)).
- `ConsistencyProof(head_a, head_b)` — "head_b append-only-extends head_a; nothing rewritten." *(P1)*

---

## Witnessing — MVP: OpenTimestamps

Chosen for fastest-to-build + cheapest-to-run + best trust story:
- **Free forever** — hashes are aggregated into shared Bitcoin transactions; no per-timestamp fee.
- **Trust anchor is Bitcoin, not DAON** — we never ask anyone to trust us about time.
- **Existence-by-time only** — matches the one thing a witness may attest.
- Publish-only cadence hides the ~1 h confirmation latency. Proof starts *pending*, upgrades on confirmation.

*Fallback:* RFC-3161 TSA for synchronous receipts / smaller verifier, at the cost of trusting a CA.

## Time bounds — sandwich, cheaply

- **Lower bound (free, per leaf):** the `beacon` (a recent public block hash) can't be predicted, so `leaf_time > beacon_time` — a trusted lower bound with no external round-trip.
- **Upper bound:** the next witnessed head's `witness_time`.

Together they bracket each leaf's time tightly while witnessing rarely.

---

## Disclosure model — creator-gated, litigation-only

- **Default silence.** The profile is never a field, never computed, never emitted. At rest, the only public artifact is an opaque `head` + witness timestamp. A derivation profile **cannot be computed from public data** — it requires the creator to open their leaves.
- **Creator-gated, not verifier-pullable.** Metadata lives in the creator's store. There is no endpoint to query a creator's profile. Disclosure is an affirmative act by the holder.
- **Split commits** (`content_commit` vs `meta_commit`) let a holder disclose *metadata without content*, or *one passage without the rest*.

### Creator Data Rights guarantee (state upfront, in product and docs)

> Creators retain all rights to the metadata about their certificate. It will never be presented to a third party without the creator's explicit request.

---

## Non-Goals (normative design discipline)

1. **No human/AI verdict — ever.** Source is unprovable; DAON refuses the binary by construction. Satisfying anti-AI purists is an explicit non-goal.
2. **No ambient purity score or badge.** No "has revision history ✓". No verifier-pull. Platforms cannot demand or query a creator's derivation profile.
3. **The derivation profile is a litigation instrument only** — disclosed by the holder inside formal adjudication, where a relying party is already weighing evidence.
4. **The "a work with no revision history is suspicious" inversion is a courtroom argument, never an ambient signal.** It must never be normalized in UI or platform hooks. No green checks. Keeping it out of the ambient layer is a design discipline, enforced in review.
5. **No gatekeeping, no shaming of AI-assisted workflows.** Assuming every creator can afford human editors is classist; AI-as-first-pass-editor is a legitimate accommodation. We record observed process signals; we never judge them.

---

## Derivation profile (the litigation instrument)

Computed only on holder disclosure, from opened `Observation`s + inclusion proofs:

```
DerivationProfile {
  revision_count  : uint
  witnessed_span  : Duration  // first witnessed head → last, in real time
  accretion_ratio : float     // bytes via keystroke_stream ÷ final bytes
  paste_fraction  : float
  session_count   : uint
}
```

Raw shape only. DAON never applies a threshold or emits a label — the threshold is the adjudicator's. Its evidentiary force is a **cost gradient**, not proof: it makes cheap fraud (paste-and-claim) legible and forces expensive fraud (simulated accretion) to burn real wall-clock time ahead of any dispute. This limit is stated plainly in the Threat Model — it is a feature of the honesty, not a gap.

---

## Minimum verifier (protect this)

Given `(leaf, inclusion_proof, witness_receipt)`:
1. Recompute the leaf hash from disclosed fields.
2. Walk `inclusion_proof` from leaf → `witnessed_head` (O(log n)).
3. Verify the OTS proof resolves to a Bitcoin block ≥ `witness_time`.
4. *(optional)* verify the author signature on the leaf.

One trusted anchor. One log-depth walk. Constant in leaf count. Multi-witness, consistency chains, selective-disclosure ZK, and fork traversal are **later features, never part of this path.**

---

## Scope / phasing

- **MVP** — single-writer append-only Merkle log; save-granularity leaves; OpenTimestamps witness; beacon lower-bound; the 4-step verifier; inclusion proofs; creator-gated disclosure; non-goals enforced. → *Spec v1.0* + *Reference Impl*.
- **P1** — consistency proofs (anti-backdating); derivation profile from disclosed metadata. → *Threat Model*.
- **P2** — fork/derivation lineage; multi-witness independence (add DAON chain + CT log); VC/C2PA interop (holder-presented, non-mandatory). → *Interoperability*.
