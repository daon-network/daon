# v2 Wishlist

**Assembled 9 September 2026.** Companion to [`FEATURES.md`](FEATURES.md), which says what exists.
This says what is next and why, in the order it should be done.

Each item is marked **[verified]** if it was checked against the code on the date shown, or
**[carried]** if it comes from earlier notes and has not been re-checked. Carried items are starting
points for a grep, not facts.

---

## Tier 1 — Shipped to users and wrong

Things a real person hits today.

### 1. `docs.daon.network` does not resolve, and we send people there

**[verified 9 Sep 2026 — `dig` returns nothing]**

It is shipped in at least three places:

- `api-server/src/server.ts:514` — the `/health` response advertises it
- `api-server/src/utils/email.ts:160` — the footer of outgoing email
- `api-server/package.json` — `homepage`

The live docs host is the apex, `daon.network`. Either point the three references there or configure
the CNAME. Cheap, and it is a broken link in mail we send to strangers.

*Note `docs/get-started/2fa-setup.md:425` already labels the link `docs.daon.network` while pointing
at `daon.network` — the confusion is in the docs too.*

### 2. `@vitest/mocker` — path traversal, dev dependency

**[verified 9 Sep 2026]**

Open in `daon-frontend` and `daon-frontend/liberation-ui`. Needs vitest 5, a breaking major, so it
was deliberately left out of the 9 Sep dependency sweep. Dev-only, hence Tier 1 bottom rather than top.

---

## Tier 2 — Decided, not implemented

The reasoning is already done. These are just unbuilt.

### 3. Anonymous registration should require an email

**[verified 9 Sep 2026 — both handlers still `optionalAuth`]**

`server.ts:586` and `server.ts:671` both use `optionalAuth` and store `user_id: req.userId || null`.
The decision on 1 Sep 2026 was to require an email at minimum. Not done.

This is now entangled with account deletion in a way worth thinking about before building: an
ownerless registration cannot be erased on request, because there is nobody to authenticate as its
owner. Requiring an email is what makes Art. 17 answerable for future registrations.

### 4. The dead perceptual code — seed or delete

**[carried]**

`PROTECTION_SYSTEM_FINAL.md` still says "APPROVED" and its unwired perceptual code is still in the
repo. `protected_content` still carries `perceptual_hash` and an index on it. Pick one and do it —
the risk of leaving it is that someone wires it up and lands a similarity score by accident, against
the boundary that says never.

### 5. `duplicate_detections` — give it a `user_id` or drop the columns

**[verified 9 Sep 2026]**

Annotated in the schema on 9 Sep but not fixed. It collects `ip_address` and `user_agent`, has no
`user_id`, and nothing calls `logDetection`. Harmless while dead; creates personal data outside the
reach of Art. 17 the moment it is wired up.

---

## Tier 3 — Honesty debt

Claims that are ahead of the code. The project treats this as a first-class defect, so it is not the
bottom of the list.

### 6. Three documents call the broker complete

**[carried — FEATURES.md]**

Endpoints, auth, webhooks and rate limiting exist and are tested. It is still partial. Either finish
it or correct the three documents; the current state is the same failure as a testimonial from
someone who does not exist.

### 7. Eighteen stale files in `documentation/project/`

**[carried]**

FEATURES.md warns about them. Every one is a trap for a future reader — and for anyone using an
assistant that reads them as current. Archive, date, or delete.

### 8. Four of five SDKs are unpublished

**[carried, confirmed 1 Sep 2026]**

`daon-sdk` resolves on npm; PyPI, RubyGems and Packagist all 404. The workflows can publish. No name
has been claimed, which is also a squatting risk.

---

## Tier 4 — Open decisions

Not work items. Questions that block work items.

### 9. PR #148 against "no similarity, ever"

**[verified 9 Sep 2026 — open, not draft]**

*"docs(design): what survives a re-encode, and what we refuse to decide."* Needs reconciling with the
boundary before merge. The permitted phrasing is that canonical text *corresponds*, with its limits
attached — never that two artifacts are the same work.

### 10. C2PA ingest

**[design written 9 Sep 2026, unverified in two places]**

`docs/design/c2pa-ingest.md` sets the rule: DAON reads assertions about people and rights, and
ignores assertions about process. Before any of it is built:

- Verify the Apple Reference Image mechanism against Apple's own documentation. The doc is currently
  sourced from launch-day live blogs.
- Verify that CAWG's do-not-train assertion exists in the form assumed. The whole
  *"this is the part worth building"* recommendation depends on it.
- Decide the two open questions in that doc: whether DAON validates a manifest's signature chain at
  ingest (which means carrying a trust list), and what the presentation surface may show.

### 11. C2PA `ingredients` / derivation lineage

**[deferred by name, 9 Sep 2026]**

Passes the people-and-rights rule, is already a P2 item in `provenance-data-model.md`, and collides
with *"DAON never asserts two artifacts are the same work."* Deserves its own argued decision rather
than arriving inside another change.

### 12. Registry ownership is not key-backed

**[carried]**

The chain's `creator` is the API's own wallet for every registration; ownership is a Postgres row,
and `decisions.md` calls that association *"a finding aid, not evidence."* Only the provenance agent
path has a creator-held key.

This is the largest open architectural question in the project. It is also — as the 9 Sep erasure
work showed — the reason the ledger holds no personal data and GDPR erasure is tractable at all. Any
proposal to key-back the registry has to answer what it does to that.

---

## Tier 5 — Build-out

Real features, none of them urgent.

### 13. Status page

**[carried — FEATURES.md]** `/health` reports build, chain height and memory. Nothing presents it.

### 14. Blockchain beacon

**[carried — FEATURES.md]** Leaves carry a zero beacon until the daemon has a block source. Honest
rather than wrong, but it is a stub.

### 15. CD pipeline consolidation

**[carried]** The dual-project issue needs a proper fix rather than another workaround.

---

## Funding and licensing

Not engineering, tracked here so it does not get lost.

- **Licensing is still Liberation License v1.0.** The AGPL/Apache/CC-BY-SA relicensing was never
  merged — PR #89 closed 6 Aug 2026, branch kept.
- **NGI Zero Commons (NLnet)** was deferred past its deadline. Calls recur, so the relicense branch
  is worth keeping. The R&D framing must lead with the unsolved parts — threat model, witness
  independence, interop — and the European dimension is a hard eligibility gate.

---

## Done since the last list

- **Account deletion (#145)** — shipped 9 Sep 2026, PR #152.
- **Dependabot** — 6 shipped-code alerts fixed, 5 dismissed as `not_used` against an undeployed
  module, 1 dev-only deferred (item 2 above). 9 Sep 2026.
- **2FA backup codes** — these were never missing. Verified working end to end 1 Sep 2026. Recorded
  here because the claim that they were absent kept coming back.
