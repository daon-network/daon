---
layout: default
title: "Key Authorization — Which Keys May Extend an Entity"
description: "Which keys are allowed to extend an entity, and why the answer must keep the verifier at four steps."
permalink: /design/key-authorization/
mermaid: true
---
# Key Authorization — Which Keys May Extend an Entity

**Status:** design proposal, pre-`0.1.0` · **Decision required before the agent is built**
**Companion to:** [`wire-format.md`](./wire-format.md), [`provenance-data-model.md`](./provenance-data-model.md)

---

## The question

An entity's chain is extended by leaves signed by a private key. The format has exactly one
`author_key` field and no mechanism saying another key may also append. That is fine for one
writer on one machine forever, and that describes nobody.

Three pressures arrive at the same question:

| | |
| --- | --- |
| **Multi-device** | A writer drafts on a laptop and fixes a line on a phone. Both are the same person and the same manuscript. |
| **Key loss** | `recovery_key` is reserved precisely so a lost key does not freeze a chain — but "reserved" means its semantics are undefined. |
| **Hardware keys** | Secure Enclave keys are non-extractable and device-bound. Using one means accepting more than one key per entity. |

These are one question — *which keys may extend this chain* — and answering them separately would
produce two mechanisms that must then agree.

## A scoping error worth naming

The specs list multi-device as out of MVP scope, "single-writer." That conflated two things:

- **Single-writer** — no concurrent authors, no merge semantics. Genuinely deferrable.
- **Single-device** — never true of real writing.

A solo writer moving between their own devices is the normal case. It was scoped out by accident.

## The constraint everything must respect

> One trusted anchor. One log-depth walk. Constant in leaf count. Multi-witness, consistency
> chains, selective-disclosure ZK, and fork traversal are **later features, never part of this
> path.**

Any design that makes the verifier walk a chain of authorizations to decide whether a signature
counts has spent the thing the data model says to protect. That is the bar.

## What the witnessed head already gives us

Worth stating because it removes an attack people reach for first.

A verifier that trusts a witnessed head trusts that **every leaf beneath it existed when it was
witnessed.** An attacker cannot retroactively insert an authorization leaf into a witnessed head
— that would require finding a SHA-256 collision, or rewriting Bitcoin.

So the question is never "could this authorization have been forged into the past." It is only
"among the leaves under a head I already trust, was this signature made by a key that was allowed
to sign."

---

## Option A — One key, moved deliberately

The format is unchanged. An entity has one key for its lifetime. Multi-device is solved by the
creator moving the key: an export/import ceremony, a QR code, an encrypted file.

| | |
| --- | --- |
| Verifier | **unchanged — four steps** |
| Format | **unchanged** |
| Secure Enclave | impossible; the key must be movable |
| Multi-device | works, with friction the creator performs deliberately |
| Key loss | `recovery_key`, semantics still to define |
| Cross-platform | complete — nothing vendor-specific |

The friction is real, and it is also legible: the creator knows exactly when their key moved,
because they moved it. Nothing syncs behind their back.

## Option B — One key, synced by the platform

As A, but iCloud Keychain (or equivalent) moves the key between the creator's devices.

Same properties as A except: no friction, and a dependency on a vendor's sync with a vendor's
threat model. Apple-only; Android and Linux need a different answer, so the project ends up
maintaining A anyway as the portable path.

**A and B are the same protocol.** B is a convenience layer over A, not a separate design, and
can be added or dropped without touching the format.

## Option C — Key set committed in every leaf

Add `key_set_root` to the leaf: a Merkle root over the public keys currently authorized. A leaf
is valid if its signature verifies under a key proven to be a member of *its own* `key_set_root`.

Verification becomes:

```
1. recompute leaf id
2. inclusion proof: leaf → witnessed head        (existing)
3. attestation covers that head                  (existing)
4. signature verifies under key K                (existing, optional)
5. membership proof: K → leaf.key_set_root       (new — same machinery as 2)
```

Step 5 is a Merkle inclusion walk against a root already in the leaf. Local, O(log keys), no
chain traversal. It reuses the tree code that already exists.

| | |
| --- | --- |
| Verifier | **five steps**, but the fifth is the same *kind* as the second |
| Format | +32 bytes per leaf; every vector regenerates |
| Secure Enclave | **works** — each device enrols its own non-extractable key |
| Multi-device | native |
| Key loss | a recovery key is simply another set member |
| Cross-platform | complete |

### What it does not establish

Step 5 proves a signature came from a key the leaf *claims* is authorized. It does not prove the
claim is legitimate — a leaf could name any key set. Establishing that a set was legitimately
derived from the previous one requires walking back toward genesis, which is the cost the
constraint forbids.

For the case that matters this is acceptable, and the reason is worth being precise about: the
leaf is under a head the verifier already trusts, so it was placed there by whoever controlled the
entity at the time. A creator who adds a key to their own chain has done exactly what the
mechanism is for. The residual risk is an *attacker who has already compromised the entity*
adding their own key — and an attacker who can append to your chain has already won, regardless
of what step 5 says.

The property genuinely lost is **retrospective auditability of the key set** — "when was this key
added, and by whom" is answerable only by walking the chain. That is a P1 tool, not a verifier
step.

## Option D — Device-bound entities

Each device gets its own entity; lineage between them is expressed by forks (P2).

Cheapest to build, and it fragments a single manuscript across devices while forks are still
unspecified. A writer would see one work as several unrelated chains. Recorded for completeness.

---

## Recommendation

**Option A now, with C's shape kept possible.**

The reasoning is priority order rather than a claim that C is worse:

**The verifier is the thing being protected.** A is the only option that leaves it at four steps.
C's fifth step is cheap and reuses existing machinery, but "five steps, one of which is
conditional" is a different artifact from "four steps," and the design says to protect the four.

**Recovery outranks theft-resistance here, and that was already decided.** `recovery_key` exists
because a frozen chain is a real harm — a fourteen-month dissertation stopping dead. Secure
Enclave maximises theft-resistance by making loss *permanent*, which is the failure mode we
deliberately designed against. Hardware binding is a weaker fit for this project than it first
appears.

**A works everywhere; C's main prize does not.** Secure Enclave is Apple; StrongBox is Android and
inconsistently available. A creator on Linux gets a software key either way. Paying a format
change for a benefit that reaches some platforms is a poor trade.

**A is reversible; the format change is not.** Adding `key_set_root` later is a version bump —
possible, since every hashed structure carries its version, and old leaves keep verifying.
Removing it is not. Choosing A now costs an option we can still exercise; choosing C now spends
32 bytes per leaf and a verifier step forever, before anyone has written anything.

### What this commits us to

- Ed25519 stays. Secure Enclave stays unavailable, and the key lives in Keychain or an encrypted
  file — gated by biometrics, encrypted at rest, extractable by design because it must move.
- Multi-device is an explicit act by the creator, not background sync.
- Rotation semantics must still be designed (P1). Under A, rotation means "a new key takes over
  from here," which is a chain-visible event rather than a set membership change.

### What would change the recommendation

- Hardware binding turning out to matter more to real users than recovery.
- Key transport proving unusably awkward in practice — the honest test is whether *you* find it
  tolerable moving a key between your Mac and your phone.
- Multi-writer arriving sooner than expected, since C generalises to it and A does not.

---

## Open

- **Rotation semantics under A.** What a rotation leaf looks like, what a verifier checks, and
  whether `recovery_key` can itself rotate. P1, and now the last undefined thing in the format.
- **Key transport mechanics.** QR, encrypted file, something else — a UX question, not a format
  one, which is the point of choosing A.
- **Whether `recovery_key` is still right under A.** If rotation is a chain-visible event signed
  by the outgoing key, a lost key cannot sign the rotation — which is exactly the case
  `recovery_key` exists for. Its semantics must handle "the key that should authorise this
  transition is the one that is gone."
