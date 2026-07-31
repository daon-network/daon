# NGI Zero Commons — DAON submission (working draft)

**Fund:** NLnet / NGI Zero Commons · **Ceiling:** €50k (first proposal) · **Ask:** €47k
**Status:** draft. Search for `⟨FILL⟩` before submitting.

> Field order below matches the NLnet application form.

---

## Project name

**DAON — Open Provenance and Authorship Attestation for Creative Work**

---

## Abstract (~1200 chars)

Creative work on the internet has no portable, creator-held proof of origin. Existing provenance schemes are device- or platform-anchored: C2PA attests what a camera or editing suite did, under the governance of the vendor that ships it. Authors of text — and creators working across tools and jurisdictions — have no equivalent, even as automated generation makes authorship disputes routine and shifts the burden of proof onto the author.

DAON is an open specification and reference implementation for **creator-held** authorship attestation. Its trust anchor is the creator's key, not a device or vendor. Rather than claim the unprovable — that a work is "human-made" — DAON records an append-only, externally witnessed history of *revisions*: what was done to a work over time, disclosed only at the creator's discretion. The project delivers the specification, an adversarial threat model for contested attestation, a spec-conformant reference implementation and conformance suite, and interoperability mappings to C2PA and W3C Verifiable Credentials. All outputs ship under recognised open licenses (AGPL-3.0 / Apache-2.0 / CC-BY-SA-4.0), documented for third-party implementers rather than end users of a single service.

---

## Have you been involved with projects or organisations relevant to this project before?

Former lead software engineer at Apple. Author and maintainer of DAON, publicly launched ⟨FILL: launch date⟩ and running in production (registration, verification, blockchain, and API infrastructure). Building open creator-protection infrastructure independently. Repository: ⟨FILL: public repo URL⟩.

*(Do not pitch a company here — name the org on the repo only if the form needs an applicant entity.)*

---

## Explain what the requested budget will be used for

The work is **research and development**, not maintenance: DAON today proves the concept is real, but the attestation *format*, its *adversarial threat model*, and its *interoperability* are unsolved and are what this grant produces. Every milestone is a deliverable a third party can independently inspect.

| # | Milestone (deliverable someone else can inspect) | € |
|---|---|---|
| 1 | **Specification v1.0** — formal open document: leaf/head/witness format, key lifecycle, the "assert revisions, never source" model, the creator-gated disclosure model and non-goals, verification algorithm, stable versioning policy. | 7,000 |
| 2 | **Threat model & adversarial analysis** — documented attack classes: key compromise & rotation, backdating, false-claim attestation, coerced/ghost authorship, chain forking, witness compromise — and an honest account of the limits of what attestation can and cannot prove (including simulated-accretion fraud). Public document. | 7,000 |
| 3 | **Reference implementation — core ledger & minimum verifier** — append-only Merkle revision log, inclusion proofs, external timestamp anchoring (OpenTimestamps), and the constant-cost verifier. Reproducible builds + CI. (AGPL-3.0) | 10,000 |
| 4 | **Conformance test suite** — published vectors and a runner third parties execute against their own implementations to claim conformance. (Apache-2.0, so proprietary implementers can adopt it freely) | 6,000 |
| 5 | **Interoperability layer** — DAON attestations expressed as W3C Verifiable Credentials (holder-presented), plus a documented relationship to C2PA assertions for mixed-media works, with a working demonstration. | 8,000 |
| 6 | **Implementer documentation & integration guide** — everything a third party needs to implement DAON without contacting us, plus a worked integration example. | 4,000 |
| 7 | **Security audit remediation** — reserve against findings from the NGI-provided audit. | 5,000 |
| | **Total** | **47,000** |

---

## Compare your project with existing or historical efforts

**C2PA / Content Credentials** is a real standard doing real work, and DAON builds toward it rather than against it — but its trust model is anchored in hardware and vendor-issued certificates. That serves *capture* provenance well and *authorship* poorly: it attests that a device produced a file, not that a person authored a work, and it presumes tooling most creators of text do not use.

**Platform-side schemes** (per-platform AI labelling, publisher-side detection) are *detection*, not *attestation*: unfalsifiable in the wrong direction, and owned by the platform rather than the creator.

**W3C Verifiable Credentials** are infrastructure DAON builds on, not a competitor — DAON expresses its attestations as holder-presented VCs.

The structural difference: **DAON's trust anchor is the creator, not the vendor or the device — and that is a governance property, not merely a technical one.** Two design choices follow from it and distinguish DAON from everything above. First, DAON never certifies a work as "human-made"; it attests *revisions*, because source is unprovable and pretending otherwise is dishonest. Second, the derivation record is a **creator-gated, litigation-scoped** instrument — never an ambient purity score platforms can demand. DAON deliberately refuses to build the gatekeeping tool, which is the very thing the field keeps drifting toward.

---

## European dimension

DAON's contribution to the Next Generation Internet vision is direct and structural, and the fund explicitly recognises this route: *"a significant contribution towards the vision of the Next Generation Internet initiative also qualifies."*

- **A regulatory need Europe is actively creating.** EU AI Act transparency obligations generate near-term institutional demand for creator-side provenance. DAON is open infrastructure built for precisely the need this European regime is bringing into being — a public-interest response to live policy, not a speculative market.
- **Sovereignty from US platforms.** European creators and publishers have the sharpest interest in provenance infrastructure that is not owned by, and cannot be captured by, US platforms. DAON is creator-anchored and vendor-neutral by construction, and explicitly refuses the platform-gatekeeping model — a governance property, not merely a technical one.
- **Commons, not enclosure.** Every output ships under a recognised open license and is jurisdiction-neutral by design, feeding the European and global digital commons rather than a single company's moat. The production service is EU-hosted (Germany) under GDPR.
- **European stakeholder engagement.** The reference implementation and conformance work are developed in the open and piloted with European creator and creator-rights communities, whose provenance needs under the AI Act are the most acute.

---

## Before you submit — checklist

- [ ] ⟨FILL⟩ launch date, public repo URL.
- [ ] European dimension rests on the NGI-vision contribution (Door 2), not a named collaborator — accepted risk. Optional cheap de-risk on a hard gate: a **letter of support from a European creator-rights org**, a named European advisor, or a committed European pilot community. Any one concrete European stakeholder helps; a letter of support is just an email ask.
- [ ] Confirm licensing reads as *recognised open source in its entirety* — done: AGPL-3.0 (services/reference impl), Apache-2.0 (SDKs/conformance suite), CC-BY-SA-4.0 (docs).
- [ ] One-line question to NLnet: is commercial dual-licensing of the AGPL reference implementation acceptable? (The AGPL release exists in full regardless.)
- [ ] Keep every milestone phrased as an inspectable deliverable — reviewers pay against those, not against effort.
