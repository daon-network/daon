---
layout: default
title: "Design Documents"
description: "How DAON provenance is designed, why each decision was made, and what is still unresolved."
permalink: /design/
---
# Design Documents

These are working design documents for **DAON provenance versioning** — the append-only revision
ledger that lets a creator prove how a work came to exist.

They are published for the same reason the format is published: a claim you cannot check is not
evidence. Anyone should be able to read what we decided, see the reasoning, and disagree with it.

> **Most of this is not built yet.** These describe a system under design. Each page carries a
> status line; where a mechanism does not exist, the page says so at the top rather than at the
> bottom. Nothing here should be read as a description of shipped software unless it says it is.

---

## Start here

| | |
| --- | --- |
| [Data model]({{ '/design/provenance-data-model/' \| relative_url }}) | Leaves, heads and witnesses — what the ledger is and what each part proves |
| [Registry and provenance]({{ '/design/registry-and-provenance/' \| relative_url }}) | Two systems with two anchors, and why nothing should keep them in sync |

## Format

| | |
| --- | --- |
| [Wire format]({{ '/design/wire-format/' \| relative_url }}) | **Normative.** Byte layout for leaves: fixed widths, big-endian, no optional fields |
| [Editor integration]({{ '/design/editor-integration-spec/' \| relative_url }}) | What an editor may send, how often, and which errors it must handle |

## Content

| | |
| --- | --- |
| [Document formats]({{ '/design/document-formats/' \| relative_url }}) | Why the same manuscript hashes differently as .docx, .epub and a Google Doc — and what to register |
| [Publication and versions]({{ '/design/publication-and-versions/' \| relative_url }}) | When a registration happens, how a work already registered gains a history, and which version mechanism wins |

## Keys

| | |
| --- | --- |
| [Key authorization]({{ '/design/key-authorization/' \| relative_url }}) | Which keys may extend an entity — and why the verifier must stay at four steps |
| [Key recovery and rotation]({{ '/design/key-recovery/' \| relative_url }}) | Surviving a lost or captured key without DAON holding a backdoor |
| [Recovery runbook]({{ '/design/key-recovery-runbook/' \| relative_url }}) | Step-by-step procedure for each way a key goes wrong |
| [Secure Enclave and device enrollment]({{ '/design/device-keys/' \| relative_url }}) | What hardware-bound keys would cost, and whether ordinary people could enroll a device |

---

## What the design is trying to protect

Three commitments run through every page here, and they explain most of the decisions:

**The verifier stays small.** Checking a claim takes four steps — recompute the leaf hash, walk
the inclusion proof, verify the witness, optionally verify the signature. Several otherwise
attractive designs were rejected for adding a fifth. Anything a verifier must do, every future
implementer must do, forever.

**DAON is never the anchor for its own claims.** Witnessing goes to Bitcoin via OpenTimestamps,
not to the DAON chain, so a proof does not depend on us existing or being honest.

**Provenance is ownership, not virtue.** The ledger records who signed what, and when. It is not a
purity score, not a human-made attestation, and not a gatekeeping signal — and certificates must
not become something readers can mine for guilt.
