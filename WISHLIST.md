# v2 Wishlist

**Assembled 9 September 2026.** Companion to [`FEATURES.md`](FEATURES.md), which says what exists.
This says what is next and why, in the order it should be done.

Each item is marked **[verified]** if it was checked against the code on the date shown, or
**[carried]** if it comes from earlier notes and has not been re-checked. Carried items are starting
points for a grep, not facts.

---

## Tier 1 — Shipped to users and wrong

Things a real person hits today.

### 1. `liberation-ui` ships from a `dist/` that cannot be rebuilt

**[verified 9 Sep 2026]**

The most dangerous thing on this list, and it is one command away from breaking the site.

`daon-frontend/liberation-ui/src/` contains only `index.ts` and `utils/cn.ts`. `index.ts` exports
`LibIcon`, `KofiButton`, `./icons/types`, `./support/types` and `./theme/liberation` — **none of
which exist.** Six app pages import `LibIcon` from the package (`app/page.tsx`, `app/dashboard`,
`app/assets`, `app/verify`, `app/verify/[hash]`, `app/auth/verify`).

It works only because `dist/` is committed and resolves. **Running `npm run build` in
`liberation-ui` runs `tsup`, which will fail on the missing source and can leave the site without
`LibIcon`.** There is no recovery except `git checkout` of `dist/`.

This was recorded honestly in `ae5c611` (17 Aug 2026) as *"restoring it is a separate job."* It is
still that job. Either restore the source from wherever the package was vendored from, or inline the
two components the frontend actually uses and delete the package.

Its two test files (`tests/LibIcon.test.tsx`, `tests/KofiButton.test.tsx`) import that missing source
and have therefore never run, at any vitest version. They are noise in every CI log until the source
comes back or they go.

### 2. Integration tests need broker fixtures

**[verified 9 Sep 2026]**

`broker-endpoints.integration.test.ts` fails 20 of 31 **with the full stack running** — Postgres,
Redis, a chain and an API server all up. It needs a seeded broker row and a matching API key, which
no environment creates. Seeding an admin user (one row) was enough to get
`broker-registration.integration.test.ts` green; this one needs the broker half.

Until then it is excluded from the Integration Tests job, with the reason recorded in
`api-server/package.json`. Run it locally against a database with `npm run test:requires-db`.

~~**`@vitest/mocker` — path traversal, dev dependency**~~ — **done 9 Sep 2026.** vitest 3.2.7 → 5.0.0
in `liberation-ui`. Both projects now report 0 vulnerabilities and the frontend builds unchanged. The
orphaned tests still do not run; that is item 1, not a vitest problem.

~~**`docs.daon.network` does not resolve**~~ — **done 9 Sep 2026.** All five references repointed to
the apex `daon.network`, which is the real docs host: the `/health` response, the outgoing-email
footer, `api-server/package.json`'s `homepage`, a mislabelled link in `docs/get-started/2fa-setup.md`,
and the `docs/README.md` section that told people to set up the subdomain in the first place — which
is where the hostname came from.

---

## Tier 2 — Decided, not implemented

The reasoning is already done. These are just unbuilt.

~~**3. Anonymous registration should require an email**~~ — **done 16 Oct 2026.** Both `/protect`
handlers now use `requireAuth`. Two things the 9 Sep entry missed: `POST /protect/bulk` had no auth
at all and wrote only to the process cache that `/verify` falls back to (now `410`), and the app's
Bulk Register tab sent no token, so logged-in users registered ownerless works through it.
Registrations made before this date may still be ownerless.

**And the auth check itself was wrong.** `server.ts` verified tokens with `auth/auth.ts`'s legacy
`verifyToken`, which reads `userId`. Logins issue `utils/jwt.ts` tokens, which carry `user_id`. Where
the two secrets match (production sets one `JWT_SECRET`), a real user's token verified and their id
came out `undefined` — so **signed-in registrations were very likely stored with no owner too**, and
association attest/dispute compared against `undefined`. `requireAuth` now uses `verifyAccessToken`.
Whether the 109 ownerless records include real users' work is worth one query against production.

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

### 6. Brokerage — nothing works, and one thing lies

**[verified 9 Sep 2026]** Full analysis: [`docs/design/brokerage.md`](docs/design/brokerage.md).

The broker tables exist in no schema the code loads — `002_add_broker_system.sql` only, while
`init-db.ts` and `client.ts` load `schema.sql` and nothing applies migrations. Registration would
also violate a not-null constraint on `brokers.api_key_hash`, which the INSERT never supplies. So no
broker can be created at all, which is why `broker-endpoints.integration.test.ts` fails 20 of 31
with the full stack running.

Above that: `getFederatedIdentity` hardcodes `verified = true` with
`verification_method = 'broker_signature'` regardless of whether a signature was checked — and for
community and standard tiers none is required. Transfers validate the source domain but not the
destination, so a broker can mint a "verified" identity on a domain it does not control.
`content_ownership`, the table that would record broker-versus-author, is written by no code at all.

Free to fix now and expensive later: there are no brokers.

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

- **Test lanes and the integration job** — 9 Sep 2026, PR #156. Eight test files ran in neither
  runner; five are wired in and three have a real lane. `webhook-delivery` had six failures from
  tests drifting off the code. `test-integration` was `echo && exit 0`, and the job it runs in never
  loaded a schema or seeded a user — two stubs stacked, passing for months while standing up
  postgres, redis, a chain and an API to test nothing. Unit lane is now 188 node:test across 13
  files, up from 153 across 10, verified with no database reachable.
- **`creative-commons-chain` deleted** — 9 Sep 2026. A full Ignite scaffold with no `x/` modules and
  no DAON logic, superseded by `daon-core` before anything was written into it, deployed nowhere.
  Dismissing its alerts did not hold: five were dismissed and two more arrived the same day, because
  dismissal is per-advisory and the dependency graph reads `go.mod` regardless of CI. Recoverable
  from git history.
