---
layout: default
title: "Brokerage — What a Platform May Say on an Author's Behalf"
description: "The AO3 model: how a platform registers work for its creators, what that claim is worth, and why nothing may be marked verified that was not."
permalink: /design/brokerage/
---
# Brokerage — What a Platform May Say on an Author's Behalf

**Status:** design, no decision taken · **Companion to:** [`decisions.md`](./decisions.md),
[`registry-and-provenance.md`](./registry-and-provenance.md)

Brokerage lets a platform perform registration for its authors. The model is Archive of Our Own: a
creator posts to a site they already use, and the site registers on their behalf. The creator never
touches DAON.

That convenience is the entire point, and it is also the entire problem. **A broker registration is
a claim by the platform about a person who was not present.**

---

## The question that decides everything

Not *"is this really Archive of Our Own?"* — that is transport authentication, and it is the easier
half. The question is:

> **Did the author actually ask for this?**

DAON cannot know. The author is not in the request. Whatever arrives, arrives on the platform's word.

So the design does not try to answer it. It records what was claimed, by whom, and on what basis —
and refuses to state more than that. This is [`decisions.md`](./decisions.md) § *Boundaries* applied
to a new input: **DAON never ranks competing claims. It shows them, dated and attributed.**

---

## What the schema already gets right

Worth stating, because the gaps below are implementation gaps rather than design ones.

`federated_identities` keys on `username@domain`, and keeps three things apart that are easy to
conflate:

- **that an identity exists** — a row
- **whether it was verified** — `verified`
- **how** — `verification_method`

It also carries `user_id`, `claimed_at` and `claim_proof`: the path by which an author later claims
the identity *directly*, upgrading a platform's assertion into their own.

`content_ownership` separates `owner_*` from `registered_by_*`, with
`registered_by_type: 'user' | 'broker'`. A record can therefore say *"AO3 registered this on behalf
of X"* rather than *"X registered this"*. That distinction is the whole ballgame and it is already
expressible.

---

## The verification ladder

`verification_method` is already an ordered scale. It needs to mean something.

| Method | What actually happened | Worth |
| --- | --- | --- |
| `broker_signature` | The platform asserted it. The author did nothing. | An **assertion**, not a verification |
| `email_verification` | The author answered a message. | The author was reachable and did not object |
| `platform_oauth` | The author proved control of the platform account. | The author acted |

**Only the bottom two are verification.** The top one is a platform vouching for someone, which is
useful and worth recording and is not the same kind of fact.

`platform_oauth` is the interesting one and it is unbuilt. It is also where OAuth belongs in this
system — **the author proving they control the account, not the broker proving it is the broker.**
An OAuth handshake between the author and their own platform is the cheapest real evidence available,
because the author is already logged in there.

---

## Nothing is marked verified that was not verified

The rule, stated generally because the specific bug is less important than the pattern:

> **A boolean asserting a fact must be written by the code that established the fact.**

Today `getFederatedIdentity` does this:

```sql
INSERT INTO federated_identities (..., verified, verified_at, verification_method)
VALUES ($1, $2, $3, true, NOW(), 'broker_signature')
ON CONFLICT (username, domain) DO UPDATE SET verified = true, ...
```

`verified` is hardcoded true and the method is hardcoded `'broker_signature'` — while
`require_signature` is only set for the enterprise tier, so for community and standard brokers **no
signature was checked at all.** The `ON CONFLICT` clause then re-affirms verification on every
subsequent call, so an identity cannot decay back to unverified even if it should.

That is an unearned ranking carrying a label for a check that did not happen. It is exactly what the
boundary above forbids.

**The fix is not to set it false — it is to let the writer be the checker.** An identity created
through a broker is recorded as existing, attributed to that broker, with no verification claim.
`verified` is written only by the code path that verified something, and `verification_method` names
what that path actually did.

### Audited: every other hardcoded truth

Checked 9 Sep 2026, because one instance of this is a bug and a habit of it is a design fault.

- **`verifySignature` returns `true` when `broker.require_signature` is false.** A function of that
  name returning "valid" for a check it declined to perform is a trap for the next caller, even
  though present callers only invoke it when a signature is required. It should return a tri-state,
  or the branch should live at the call site.
- **Broker registration writes `enabled = true` beside `certification_status = 'pending'`.**
  Contradictory on its face. Not exploitable: `authenticateBroker` independently rejects any broker
  whose `certification_status !== 'active'`, so the certification gate holds. Worth resolving anyway,
  because the two fields disagree about what the row means.
- **`isUserAdmin`, `verifyTotpCode`, `isValidTotpSecret`** all return true only after a real check.
  Correct as written; listed so the next audit does not re-examine them.

---

## Transfers must not mint identities on domains the broker does not hold

`POST /api/v1/broker/transfer` validates the *source*:

```js
if (currentDomain !== broker.domain) { /* 403 */ }
```

There is no equivalent check on `newDomain`. So a broker may transfer to `anyone@some-other-site`,
and `getFederatedIdentity` will create that identity — marked verified, attributed to a
`broker_signature` from a platform with no authority over that domain.

Registration does not have this problem: it builds `${username}@${broker.domain}` from the
authenticated broker rather than from input. Transfers should be equally constrained, or cross-domain
transfer should be modelled explicitly as a two-sided handshake rather than a single broker's say-so.

---

## Transport authentication

Separate question, easier answer. The broker must prove it is the broker, and a leaked bearer
credential must not be sufficient.

**Brokers bring their own public key.** DAON does not generate keypairs for them and does not store
private material — the `private_key_encrypted` column is unused and should be dropped before someone
implements "key recovery" against it, which would destroy proof of possession. An entity that cannot
produce an Ed25519 keypair should not hold registration authority over other people's work. That is a
capability bar for infrastructure partners, not a judgment about anyone's writing.

**Use RFC 9421 HTTP Message Signatures, not a scheme of our own.** The current implementation builds
its signing string with `JSON.stringify(payload, Object.keys(payload).sort())`, where an array
second argument is a *property allowlist applied at every nesting level* rather than a sort order.
Nested objects serialise as `{}`, so `metadata.title` and `metadata.author` are not covered by the
signature at all. Two payloads differing only in metadata produce byte-identical strings to sign.

That bug is what hand-rolling costs. RFC 9421 specifies the signature base — `@method`,
`@target-uri`, `Content-Digest` over the raw body, `created`/`expires` for replay windows — with test
vectors and existing libraries.

**Why not mTLS.** It is a legitimate answer and it is stronger at the transport layer, but nginx
terminates TLS, so the application would learn the client identity from a proxy-supplied header.
That header then *is* the authentication boundary: anything able to reach the app directly and set
it is authenticated as any broker. The current deployment is not ready for that — the app never calls
`app.set('trust proxy')`, and `allowed_ip_ranges` is declared in the schema and enforced nowhere. An
application-verified request signature keeps authentication end-to-end and leaves the proxy out of
it. RFC 9421 also authenticates each *request*, where mTLS authenticates a *connection*.

If transport-level assurance is wanted later, pin per-broker certificate fingerprints rather than
running a certificate authority; a CA key is more sensitive than every broker credential combined.

---

## What is broken today

Before any of the above is reachable:

1. **The broker tables are in no schema the code loads.** They exist only in
   `002_add_broker_system.sql`; `init-db.ts` and `client.ts` both load `schema.sql` and nothing else,
   and no code path applies migrations. This is why `broker-endpoints.integration.test.ts` fails 20 of
   31 even with the full stack running — not missing fixtures, missing tables.
2. **Registration would violate a not-null constraint.** `brokers.api_key_hash` is `NOT NULL` with no
   default and the registration `INSERT` never supplies it. No later migration relaxes it. The column
   looks vestigial — `authenticateBroker` reads `broker_api_keys` by prefix — so dropping it is
   probably correct.
3. **`content_ownership` is written by no code at all.** The table that would record the
   broker-versus-author distinction is unused, so the distinction is not being captured even where the
   schema allows it.

None of this has ever run. There are no brokers, which is why every change here is free today and
expensive later.

---

## Ordered

1. Get the broker tables into a schema the code loads.
2. Fix or drop `brokers.api_key_hash` so registration can succeed.
3. Write `content_ownership` on broker registration, with `registered_by_type = 'broker'`.
4. Stop writing `verified = true`. Record identities as asserted, attributed, and dated — the
   broker's name is the whole signal a reader gets.
5. Constrain `newDomain` on transfers.
6. Require `public_key` at registration; drop `private_key_encrypted`.
7. Replace `verifySignature` with RFC 9421 verification; demote the API key to an identifier.
8. Ship a signer in the Node SDK plus a worked `openssl` example.
9. Build `platform_oauth` — the author's own proof, and the only thing that makes `verified` mean
   anything.
10. Reconcile the three documents that describe this system as complete.

Steps 1–5 are correctness and cost little. Step 7 is the security model. Step 9 is the one that makes
the ladder real.

---

## What a reader is shown — decided

**The assertion lists the broker. That is all.**

A broker-submitted registration shows the content hash, the date, and the platform that submitted
it: *registered via archiveofourown.org*. No badge, no trust indicator, no verified/unverified
distinction, no styling that reads as endorsement.

This falls out of § *Boundaries* rather than being a separate choice. Any signal beyond the broker's
name is DAON ranking a claim, and the reader is better placed to weigh a platform's reputation than
the registry is. Naming the broker is attribution; anything more is assessment.

It also disposes of the `verified` problem more cleanly than fixing the boolean would. **If nothing
surfaces it, it has no reader-facing job**, and the question stops being *"how do we make this flag
honest"* and becomes *"why is a display-shaped flag being written at all."* The honest record is: an
identity exists, this broker asserted it, on this date.

`verification_method` stays as internal bookkeeping — it is the difference between a platform's word
and an author's own act, which matters for `platform_oauth` later. It is not a display field.

---

## Open questions
- **What happens to a federated identity when its broker is decertified?** `ON DELETE RESTRICT`
  prevents deletion, which is right, but there is no defined state for "this platform is no longer
  trusted and here is what that means for what it already asserted."
- **Can an author repudiate a registration made on their behalf?** The `claim_proof` path lets them
  claim an identity; there is no path to disown one. Given that registrations are append-only and the
  ledger cannot be withdrawn, this may be a dispute record rather than a deletion —
  `content_ownership.disputed` exists and is unused.
