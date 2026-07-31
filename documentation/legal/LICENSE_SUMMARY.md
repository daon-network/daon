# DAON Network — Licensing

**Updated:** July 2026
**Supersedes:** the previous Liberation License v1.0 adoption (Nov 2025)

DAON is licensed under **recognized open-source licenses**, chosen per component
so the license fits what each part is *for*. This satisfies the "recognised open
source license, in its entirety" requirement of funders such as NLnet / NGI Zero,
and — more importantly — targets the real threat to an authorship-attestation
protocol, which is **enclosure**, not use.

## License map

| Component | License | Why |
|-----------|---------|-----|
| Reference implementation & services — `api-server/`, `daon-core/`, `ccc-core/`, `creative-commons-chain/`, `verification-service/`, `daon-frontend/` | **AGPL-3.0-only** (`LICENSE.md`) | Network copyleft: anyone running or forking the service must release their changes. Closes the SaaS loophole a plain GPL leaves open, and carries a patent grant. |
| Client SDKs — `sdks/{node,go,php,python,ruby}/` | **Apache-2.0** (`sdks/*/LICENSE`) | SDKs are meant to be embedded in third-party code, including closed-source. AGPL here would poison every integrator; permissive maximizes adoption of the standard. |
| Documentation — `docs/`, `documentation/` | **CC-BY-SA-4.0** (`docs/LICENSE`, `documentation/LICENSE`) | Openly reusable with share-alike, standard for an open specification. |
| Demos & sample integrations — `integration-demos/`, `platform-integrations/`, `wordpress-plugin/` | **MIT / Apache-2.0** | Example code people copy; permissive by design. |

## Why not a use-restriction license

A license that forbids "exploitative" use (as the former Liberation License did)
is **not a recognized open-source license** — it fails the Open Source
Definition's clause 6 (no discrimination against fields of endeavour). It also
guards the wrong threat: *usage* was never the danger to an attestation protocol.
The danger is someone taking the reference implementation, extending it privately,
and shipping a proprietary "DAON-compatible" service that quietly re-anchors trust
to a vendor. AGPL's network copyleft defends against exactly that; a
non-exploitation clause does not.

## The governance layer

Code licensing alone can't stop a technically-conformant fork that re-anchors
trust to a vendor. The **DAON name and a conformance policy** are held separately
for that purpose, so that anything calling itself "DAON" keeps its trust anchor on
the **creator**, not a device or platform. That is a governance property, and it
is where the project's ethic actually lives.

## Not covered here: content licenses

DAON also lets creators declare a license for *their own protected work* (the
`daon_default_license` / content-license feature). That is product data about a
creator's work — a separate axis from the license on DAON's own source code, and
it is unaffected by this document.
