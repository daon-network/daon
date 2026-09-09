---
layout: default
title: "C2PA Ingest — What DAON Reads From a Manifest"
description: "Which provenance assertions DAON carries, which it refuses to relay, and why the Apple Reference Image is out of scope."
permalink: /design/c2pa-ingest/
---
# C2PA Ingest — What DAON Reads From a Manifest

**Status:** design, no decision taken · **Companion to:** [`decisions.md`](./decisions.md),
[`provenance-data-model.md`](./provenance-data-model.md), [`document-formats.md`](./document-formats.md)

> **Two claims here are not yet verified against primary sources, and the conclusions rest on them.**
>
> 1. Everything in the *Apple Reference Image* section comes from launch-day live blogs and
>    secondary reporting on 9 Sep 2026, not from Apple's own documentation. Live-blog detail is
>    written in real time and is routinely wrong about specifics. Confirm against Apple's newsroom
>    and developer documentation before treating the mechanism described as settled.
> 2. *"C2PA/CAWG has a standardised do-not-train assertion"* is taken from secondary sources and has
>    not been checked against the CAWG specification. The recommendation in *What this is worth*
>    depends entirely on it.
>
> Neither affects the rule this document sets out, which follows from DAON's own boundaries. Both
> affect the specific advice. Remove this box once checked.

`provenance-data-model.md` § *Scope / phasing* already lists this as P2: *"VC/C2PA interop
(holder-presented, non-mandatory)."* Both qualifiers survive contact with the detail. This document
says what the ingest actually reads, and — more usefully — what it must refuse to read even though
the data is sitting right there.

---

## The rule

**DAON reads assertions about people and rights. It ignores assertions about process.**

Who signed this, what they declare about its use — in scope. How the pixels got there — not DAON's
business, whatever the manifest says.

This is not a new boundary; it is the existing one applied to a new input. A registry that recorded
*how* a work was made would be making a judgment about legitimacy of process, and
[`decisions.md`](./decisions.md) § *Boundaries* already refuses the adjudicating role in every other
form. An artist who used generative fill owns the result exactly as much as one who used a pencil,
and the registration answers the same question either way.

### Why this is not merely a purity-score risk

The obvious framing is that reading a `c2pa.actions` AI-generation assertion would grow a purity
score by accident, and it would. But the sharper reason to refuse is **epistemic, and it disqualifies
the field regardless of how carefully it is presented**:

The signal runs one direction only. Its *presence* is weak positive evidence that a generator
participated in a marking scheme. Its *absence* is evidence of nothing — the model may not
participate, the file may have been re-encoded, a platform may have stripped the manifest, or the
image may be a screenshot. Local and open-weights models never mark at all.

So a reader who sees "no AI assertion" would read "human-made," and DAON would have no basis for
that whatsoever. A field that cannot be reasoned about in the negative cannot be surfaced at all,
because the negative is exactly how people will use it.

### The declaration/claim split

This is the line that decides each field, and it is not the same line as "AI or not":

| | Nature | Absence means | Verdict |
| --- | --- | --- | --- |
| Rights declarations (do-not-train, licence) | **Performative** — a rights holder declaring | Nobody declared anything | **Read** |
| Signer identity | **Attributed** — a named party asserting | No manifest present | **Read** |
| Process claims (capture, generation, edit actions) | **Evidentiary** — a claim about what happened | Unknowable | **Refuse to relay** |

A declaration does not need to be present in every file to mean something, any more than a copyright
notice does. A claim about what happened is only useful if its absence can be reasoned about, and
here it cannot.

---

## What this is worth: the do-not-train assertion

The registry already carries `ai_training_policy` with `prohibited | contact_required | open`
(`server.ts`, the JSON `/protect` handler). C2PA and CAWG have a standardised assertion for the same
declaration.

Expressing DAON's existing policy in a field that crawlers and platforms already parse — rather than
a bespoke one nobody reads — is the substantive interop win here. It is a rights declaration, so it
is squarely inside the rule above, and it survives the incompleteness objection for the reason the
table gives.

This, not capture attestation, is the part worth building.

---

## Storage: whole blob, disciplined surface

Store the manifest **entire, as an opaque signed blob.** Do not filter at ingest.

The discipline belongs in what the API and UI surface, not in what the parser strips. One rule, in
one place, that does not need re-litigating each time C2PA adds a field. A parser allowlist would
have to be revisited on every spec revision, and the revision that gets missed is the one that
leaks.

The *semantics* already exist, in `content_associations` (`schema.sql:217`): append-only,
deliberately not unique on `content_hash`, `verified` kept as a column distinct from the assertion
itself, and no assertion displacing another. A C2PA manifest is precisely *a third party asserting
something about this hash*, so that is the model to copy.

**The table itself is not reusable, though.** `entity_id` and `head` are both `NOT NULL` and mean
something specific to a provenance chain; a manifest has neither, and filling them with placeholders
to reuse the table would be a lie in the schema. It also carries the key-change gating workflow
(`status`, `expires_at`, `resolution_token`, owner-of-record attestation), none of which should fire
for a manifest. So: a **sibling table** with the same discipline, not this one.

It also inherits the right behaviour for free:

- **Associations are non-exclusive** — several manifests may attach to one hash, and none wins.
- **DAON never ranks competing claims** — it shows them, dated and attributed.

Two signers disagreeing about one file is a fact to record, not a conflict to resolve.

---

## The hash question is already answered ↺

The instinct is to hash the file payload with the manifest box excluded, so that adding or stripping
Content Credentials does not change the DAON hash. **This is the rejected answer being re-derived,
and it is rejected twice.**

[`decisions.md`](./decisions.md) § *Hashed bytes are never normalised*: canonicalisation happens
before hashing, on content the creator chooses, never inside the hash. A server-side rule that
silently excludes a byte range from an image is normalisation inside the hash by another name.

§ *Register plain text — unless the pictures or the layout are the work* already took the trade
explicitly: registering a file accepts that a re-save changes the bytes, because *"a hash that covers
your photographs and breaks when you re-export is worth more than one that is stable and covers none
of them."*

So: **a manifest changing the hash is the accepted consequence of a decision already made, not a
defect to engineer around.** Adding Content Credentials after registration produces a different hash
and therefore a different registration. That is correct behaviour, and `docs/creators/` should say so
plainly — the guidance is *stamp your metadata first, register second*, which is already the advice
given for the outbound `DAON:sha256:` EXIF workflow in
[`embedding-tokens.md`](../creators/embedding-tokens.md).

If manifest-insensitive hashing is ever wanted, it must be an explicit creator choice at submission
time, in the shape canonicalisation already has — never a silent server rule.

---

## Apple Reference Image — out of scope, and worth saying why

Announced 9 September 2026 with iPhone 18 Pro. The sensor signs photo data at capture at the pixel
level; an immutable reference is kept in Photos beside the editable image. Apple's own phrase is
*"like having the digital negative."* Authentication sends the raw image, sensor signatures, capture
timing and hardware identifiers to Private Cloud Compute, which confirms the sensor captured it and
assigns a unique ID. Opt-in, off by default, iPhone 18 Pro only, and **not available in the EU or
China.** Proprietary — not C2PA.

Two things about it are genuinely close to DAON's architecture, which is what makes the divergence
worth stating precisely rather than dismissively:

- **An immutable reference beside a living, editable work** is the same shape as registration: a
  fixed dated state that the work then departs from.
- **Apple retains a hash and a result, not the content.** Same posture as `protected_content`, which
  holds a hash and no body.

**It is out of scope on two independent grounds, either of which is sufficient.**

**1. It is a process claim.** "This sensor captured these pixels" is a statement about a device and
how a file came to exist. Not about a person, not about rights. It fails the rule at the top of this
document, and it fails it in the same way the AI-generation assertion does — an unsigned photo tells
you nothing, since the feature is opt-in, Pro-only, and absent from the EU entirely.

**2. It costs a fifth verifier step, permanently.** [`decisions.md`](./decisions.md) § *Boundaries*:
*"The minimum verifier stays at four steps. Several otherwise attractive designs were rejected for
adding a fifth; anything a verifier must do, every future implementer must do, forever."*

Verifying an Apple Reference Image requires a round trip to Private Cloud Compute. Not once, at
ingest — every time, forever, by every verifier. It requires Apple to still exist, still run the
service, and still answer. DAON's verifier is four steps against one trusted anchor, walks in log
time, and runs in wasm with no platform dependency. Taking a dependency on a single company's live
service would be the largest such dependency in the system, taken for a signal already excluded on
other grounds.

**The framing worth keeping:** the disagreement is not about whether hardware-rooted capture
attestation is good. It is about *who you must ask*. Anyone holding the content can check a DAON
registration. Only Apple can check an Apple Reference Image. That is the whole difference, and it is
the thing DAON exists to avoid.

If a creator wants the Apple ID recorded, it is a string in a third-party assertion like any other —
stored, attributed, never verified by DAON and never presented as corroboration.

---

## Deferred by name: `ingredients`

C2PA `ingredients` records which *other works* fed into this one. That is a claim about people and
rights, so it passes the rule at the top of this document, and fork/derivation lineage is already a
P2 item in [`provenance-data-model.md`](./provenance-data-model.md).

It is nonetheless **out of a first pass**, deliberately, because it collides with a boundary that is
not negotiable: *DAON never asserts two artifacts are the same work.* "Derived from" is one bad UI
decision away from reading as "lesser than," which is the gatekeeping the derivation profile was
scoped to avoid. It deserves its own decision, argued on paper, rather than riding in on the same
change as manifest storage.

---

## Open questions

1. **Which endpoint.** Manifests live in JUMBF boxes inside file bytes, so only the file-upload
   `/protect` path can see one. The JSON path takes `content` as a string and has no container to
   read. The file path currently stores title, type and byte length and nothing else — it is the
   thinner of the two and would need extending.
2. **Signature validation.** Does DAON verify the manifest's own signature chain at ingest and record
   the result in `verified`, or store it unvalidated and leave validation to the reader? The
   `verified` column exists for exactly this distinction, but validating means carrying a trust list,
   which is a new class of thing to maintain and to be wrong about.
3. **Presentation.** The single highest-risk surface, because the storage decision above deliberately
   pushes all discipline here. Needs its own review against § *Boundaries* before any UI ships.
