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

## The minimum is contactability, not identity

The thing being established is **that a real entity stands behind the authorship** — not who it is.

DAON does not identify people; [`decisions.md`](./decisions.md) says it "does not decide who owns
anything." And for the population brokerage serves first, pseudonymity is protective rather than
incidental: fan creators have concrete reasons not to be linkable to a legal name, and a registry
that pushed platforms toward stronger identity assurance would be working against the creators it
exists for.

So the bar is lower and more useful: **is there someone there, and can they be reached?**

### Which is why the identifier is `user@broker`

`federated_identities.full_identity` is `username || '@' || domain` — `pseud@archiveofourown.org` —
and deliberately **not an email address.**

It is a routable handle with a delegated delivery path. DAON cannot contact the author. The platform
can. The identifier therefore carries the claim *"someone is here and this platform can reach them"*
while exposing no address, no legal name, and nothing that links across sites.

This is the same move the main registry already makes: `ai_training_policy: contact_required`
demands a `licensing_email` or `licensing_uri` — a channel, not an identity. Brokerage supplies the
channel indirectly, through the platform, which is what lets it be pseudonymous and reachable at
once.

Contactability is also load-bearing rather than decorative. Disputes need a reachable party
(`content_ownership.disputed`); so does any future path for an author to repudiate a registration
made in their name. Both route through the broker, because that is where the channel is.

### The ladder

`verification_method` is an ordered scale of **how well demonstrated that channel is** — not how
identified anyone is.

| Method | What was established | Contactability |
| --- | --- | --- |
| `broker_signature` | The platform asserts an entity exists. | **Claimed.** Nothing demonstrated. |
| `email_verification` | Someone answered a message. | **Demonstrated.** The channel works. |
| `platform_oauth` | Someone with live account control acted. | **Demonstrated, with agency.** |

`platform_oauth` is unbuilt, and it is where OAuth belongs in this system — the *author* proving
control of their own platform account, not the broker proving it is the broker.

**It is optional, and DAON does not perform it.** Identity is optional on the direct registration
path, so requiring it here would be inconsistent. The broker owns the recordkeeping: how they
established that someone is there is their process, their policy and their liability.
`verification_method` is therefore a **broker-supplied attribute** — what the platform says it did —
recorded and attributed like any other assertion, never assessed.

That is the same discipline [`c2pa-ingest.md`](./c2pa-ingest.md) arrives at from an unrelated
direction: read assertions about people and rights, attribute them, endorse nothing. Two problems
converging on one rule.

### The same floor, reached two ways

Worth naming because it makes the two registration paths consistent rather than parallel:

| Path | Live channel | Recovery |
| --- | --- | --- |
| Direct | The account itself | The account's own email |
| Broker | `user@broker`, delegated to the platform | An email supplied by the broker with the author's consent |

**Contactability is the floor on both. Identity is required on neither.** Closing anonymous
registration on the direct path is not separate cleanup; it is this same principle applied where
there is no broker to delegate to.

**What it does not establish, and must not be read as establishing:** a real-world identity. It
inherits the platform's account security as its ceiling, and AO3 accounts are email-and-invite. A
successful OAuth handshake means *someone controls this account*, which is exactly as strong as that
platform's signup, and no stronger. That is sufficient for contactability and insufficient for
anything else — which is the correct amount for a registry that refuses to adjudicate ownership.

> **Not to be confused with the OAuth in `docs/api/index.md`.** That documents an OAuth 2.0
> `client_credentials` flow at `POST /oauth/token` "for platforms" — machine-to-machine *broker*
> authentication, with no author involved. **No such endpoint exists.** It should be removed from the
> docs rather than built: `client_credentials` issues a bearer token from a client secret, which is
> the leaked-credential problem with an extra round trip, and strictly worse than signing each
> request.

---

## Contested ownership runs over an API, not email

DAON holds an author's address for recovery, but that is not the channel for reaching them about a
live dispute — the address is for the author walking up to DAON, not for DAON walking up to the
author. The right way to reach an Archive of Our Own author is through Archive of Our Own, which has
the moderation, blocking and norms they already rely on. So reaching the author is a call to the
broker rather than a message to the person.

**Most of this exists.** `content.disputed` is already an enumerated webhook event, and the delivery
machinery around it is built — signing, retries, delivery tracking, per-broker event subscriptions in
`broker_webhooks.events`. It is simply never fired: only `content.protected` and
`content.transferred` are triggered anywhere in the codebase.

The shape:

1. **Outbound.** DAON fires `content.disputed` to the broker — the dispute id, the content hash, the
   identity concerned, what is contested, and a deadline.
2. **The broker relays internally.** Their channel, their process, their recordkeeping. DAON does not
   see it and should not.
3. **Inbound.** The broker posts the answer back to an endpoint that does not yet exist.
4. **Silence refuses.** No answer by the deadline is itself an outcome, and the unanswered dispute
   stays on the record, dated.

**Pull as well as push.** A broker can also list open disputes: `GET /api/v1/broker/disputes`,
defaulting to the last **24 hours**, with `since` and `until` date parameters for a wider window.
Webhooks fail, brokers go offline, and retries expire — a delivery that never landed must not become
a dispute nobody knew about. Push is the notification; pull is the record.

Step 4 is not a new invention: [`decisions.md`](./decisions.md) § *Silence refuses* already settled
it for provenance associations — a pending association expires after five days and is refused,
because *"if silence accepted, the winning move would be to assert against somebody on holiday and
say nothing."* An expired row stays, because that the assertion was made is a fact. The same
reasoning applies here unchanged.

### The broker relays; it does not decide

The load-bearing constraint. § *The gate is the owner of record, not the previous asserter* puts the
gate on the owner — and here the owner is a pseudonymous identity reachable only through the
platform. **The broker is the channel to the gate, not the gate.**

So the record must say *"archiveofourown.org reported that `pseud@archiveofourown.org` responded X"*
and never *"`pseud@archiveofourown.org` responded X."* Collapsing those would make a compromised
broker able to resolve disputes in its own favour, which is precisely the failure the attribution
discipline exists to prevent. It is the same rule as everywhere else in this document: record the
assertion, attribute it, endorse nothing.

### Contact is a route, not an address

What a record shows is **contact** — a way to reach the author — never the means of reaching them.
The same move as § *What a reader is shown*: attribution and a route, nothing that reads as
disclosure.

**The broker's channel is preferred, not merely first available.** The right way to reach an
Archive of Our Own author is through Archive of Our Own. The platform has moderation, blocking and
norms the author already relies on, and routing around it would strip protections they chose, even
where a direct address exists.

### The broker is a convenience, not a gate — decided

The consequence of contactability having the broker's lifespan is not that ownership is fragile. It
is that **ownership must not depend on the broker continuing to exist.**

So: **the broker supplies the author's email address, and it is required.** Without it, ownership is
only guaranteed for as long as the platform is around, which is not a guarantee.

What that buys is recovery as a *default* rather than an opt-in. An author signs in to DAON at any
point — years later, after the platform is gone — verifies their email, and the works registered
against it are theirs to claim. They never needed a DAON account at registration time, and they do
not need the broker's cooperation to recover. The broker made it convenient. It was never the thing
holding the ownership.

**The address is never displayed.** Not on a verification page, not in an API response, not to
another broker. It exists for recovery and for nothing else.

### Consent is obtained at source, and that is a condition of certification

A bulk transfer of a platform's user table would be its own problem. GDPR Art. 14 governs personal
data obtained from a third party and requires the data subject to be *informed*, generally within a
month — so "we never display it" would not settle it, and DAON would owe unsolicited mail to every
fan creator on the platform explaining that their address had been handed over.

**The broker asks at registration time instead.** *"Register this work with DAON? Your email is
shared for ownership recovery."* That makes it per-work consent, obtained by the party that actually
has the relationship with the author, rather than a bulk disclosure by a party the author never
dealt with.

This is a **condition of being a certified broker**, not a technical detail — an obligation on the
platform alongside the rate limits and the signing key. A broker that will not ask cannot be a
broker, for the same reason one that cannot generate a keypair cannot: it is a capability and
conduct bar for infrastructure partners.

It also fits the framing above. The author chose. The broker is still a convenience.

### Matching offers a claim; it does not grant one

A verified email match must **not** silently reveal or transfer works.

Whoever controls a mailbox would otherwise collect them, and mailboxes are recycled, resold and taken
over. For a pseudonymous author the damage is worse than losing the works: the match is the link
between a DAON account and an `@archiveofourown.org` pseud, so a mailbox takeover exposes the
pseudonym itself.

So a match surfaces an *offer to claim*, and a claim fires `content.disputed` to the broker — the
same channel described above. The platform tells the author someone is claiming their works, and the
author can object. **Silence refuses**, per [`decisions.md`](./decisions.md).

### A side effect worth having

DAON stores no contact details for brokered authors — not an email, not a token, nothing. The channel
is a `user@domain` handle and a webhook URL belonging to the platform.

~~That is a real privacy property rather than an accident.~~ **Superseded** by the decision above:
DAON does hold an author email, supplied by the broker with the author's consent, for recovery. It is
never displayed, and it is subject to Art. 17 like any other personal data — with the consequence,
which should be said plainly to anyone who asks for erasure, that deleting it removes the only route
by which their works could be recovered if the platform disappears. See
[`erasure-and-the-ledger.md`](../legal/erasure-and-the-ledger.md) — brokered identities hold nothing
that a deletion request would need to reach.

### What is missing

- `content.disputed` is never fired.
- No inbound endpoint for a broker to relay a response.
- No deadline or expiry on a dispute. `disputes.status` exists (`pending`, `investigating`,
  `resolved`, `dismissed`) with no mechanism moving anything between those states, and
  `content_ownership.disputed` is written by no code at all.

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
9. Remove the phantom OAuth 2.0 `client_credentials` section from `docs/api/index.md`. It documents
   an endpoint that does not exist and should not be built.
10. Build `platform_oauth` — the author demonstrating the contact channel themselves.
11. Fire `content.disputed`, add the inbound response endpoint and the `GET /broker/disputes` pull,
    and give disputes a deadline.
12. Require the author's email at broker registration, store it undisplayed, and build recovery by
    verified email match — offering a claim rather than granting one.
13. Reconcile the three documents that describe this system as complete.

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
  claim an identity; there is no path to disown one. The dispute API above is the mechanism —
  repudiation is a contested-ownership case where the contest is with the broker rather than another
  claimant. Registrations are append-only and the ledger cannot be withdrawn, so what is added is a
  dated dispute record, not a deletion.
- **What happens when a broker outlives its usefulness but its assertions do not?** Contactability
  has the broker's lifespan. If a platform shuts down, is acquired, or is decertified, the channel
  behind every identity it asserted goes with it, and nothing in the record reflects that. A
  `claim_proof` from the author is the only channel that survives the platform, which makes it less
  of a convenience than it looks. Given that registrations are append-only and the
  ledger cannot be withdrawn, this may be a dispute record rather than a deletion —
  `content_ownership.disputed` exists and is unused.
