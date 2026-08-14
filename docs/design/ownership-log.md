# Ownership Log — Durable Ownership for the Registry

**Status:** scoping · **Decision made:** the database stays authoritative; it gains an immutable log
**Companion to:** [`registry-and-provenance.md`](./registry-and-provenance.md)

Not the provenance chain. That is creator-signed and DAON-independent. This is **DAON's own
record of who owns what, attested by DAON** — a different product for a different need, and one
that requires no wallet, no key and no crypto literacy from the user.

---

## What is broken now

```sql
user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
```

Ownership is a **nullable foreign key in a mutable table**. Three consequences:

- **It has already been lost.** The reindexed content records have no owner, permanently.
- **Deleting a user silently erases attribution.** `ON DELETE SET NULL` is doing exactly what it
  says, on the one column that says who owns something.
- **Nothing records changes.** There is no history of ownership moving, being shared, or being
  removed.

The chain is immutable, and what it records is deliberate. `creator` is the API wallet because
users do not have wallets and we are not going to make them get one — so the chain says "DAON
registered this hash at T", which is exactly what DAON is in a position to attest. That is the
right claim. The gap is that **it is the only claim**, and it is not the one about ownership.

`MsgTransferOwnership` and `transfer_history` exist in the proto and **are never called from
anywhere** — the mechanism designed to log ownership changes has never logged one.

`activity_log` is not a substitute. It is an ordinary table, mutable by anyone with database
access, its `user_id` nulls on user deletion like everything else, and a relying party has no
reason to trust a row in our own database.

**So there is no durable record of ownership anywhere in DAON.** The email question is the second
failure; this is the first.

---

## What this must do

1. **Survive user deletion, email death and institutional change.** A record that nulls when an
   account goes away is not a record.
2. **Be tamper-evident against us.** "Trust our database" is not a claim a creator can rely on in
   a dispute, and it is not one we should ask them to.
3. **Require nothing of the user.** No wallet, no key, no seed phrase. Access stays email plus
   2FA, which is what the user already has.
4. **Support multiple owners.** Co-authors, an author and a publisher, a team. Expected from the
   start rather than retrofitted.
5. **Record ownership *changes*, not just current state.** "Who owned this in March 2026" must be
   answerable.

---

## Design

### Event-sourced, hash-chained, periodically anchored

Ownership becomes a log of events rather than a column. Current ownership is a fold over the log.

```
OwnershipEvent {
  seq          bigint        monotonic, global
  prev_hash    bytea         hash of the previous event — the chain
  content_hash varchar(64)   the work
  event        enum          registered | owner_added | owner_removed
                             | transferred | license_changed
  subject      bigint        the user this is about
  actor        bigint        the user who caused it
  occurred_at  timestamptz   server time
  metadata     jsonb         event-specific
  entry_hash   bytea         hash over all of the above
}
```

**Hash-chaining is the cheap 80%.** Each entry commits to its predecessor, so altering a past row
breaks every hash after it. That is tamper-*evidence* — enough to catch a careless or partial
edit, and enough that a silent change is not possible.

**Anchoring is the other 20%.** Periodically — daily is ample — the head `entry_hash` is
submitted for witnessing. Once anchored, the log's past cannot be rewritten even by us, even with
full database access, because doing so would contradict a timestamp we do not control.

This is the same shape as the provenance chain and for the same reason: a hash chain makes
tampering visible, and an external witness makes the past immutable. The difference is who signs
— here it is DAON, honestly, because DAON is the authority for this record.

### Subject and actor are separate

`subject` is who the event is about; `actor` is who did it. A publisher adding a co-owner, an
admin resolving a dispute, a user transferring their own work — all distinguishable. Collapsing
them would make "who did this" unanswerable exactly when it matters.

### Users are referenced immutably

Events must not use `ON DELETE SET NULL`. A deleted user's events keep their `subject` and
`actor`, because **the historical fact does not stop being true when an account closes.** If a
user must be erasable for privacy reasons, that is a redaction of the `users` row, not of the
log — and the log records that the redaction happened.

### Multiple owners

Ownership is a set, derived by folding `owner_added` and `owner_removed`. Nothing about the model
assumes one owner, so co-authorship, an author-plus-publisher arrangement, and a team all work
without a schema change.

Roles are deliberately left out of the first cut. "Owner" and "not owner" is a decision we can
defend; a permissions model invented before anyone has asked for one is not.

### Agent keys as a second identity binding

Email plus 2FA is the access path, and that is the whole exposure: **the account is exactly as
durable as the mailbox.** An institutional address dies on a schedule nobody controls, and the
recovery flow that ends in "we email you" cannot help when the mailbox is the thing that is gone.

But some registrations do not arrive from a browser session. They arrive from a provenance agent
that already holds a device key — Secure Enclave on Apple hardware, equivalent elsewhere — because
it needs one to sign revision leaves. That key exists for a different purpose and costs the user
nothing extra.

So when a registration comes from an agent, the agent signs it, and the ownership event records
the signing public key alongside the account. The account is still authoritative. But there is now
a second, independent thing the owner can demonstrate control of, and it does not route through
email.

What that buys, precisely:

- **A recovery path that survives the mailbox.** Someone who can sign a fresh challenge with the
  key that signed the original registration has shown continuity of control. That is materially
  stronger evidence than the usual support-ticket alternative, which is a person asserting who
  they are over a channel we cannot verify.
- **A dispute answer that does not rest on our word.** "The same key signed every registration in
  this account since 2026" is checkable by someone who does not trust DAON.

What it does not buy:

- **Anything for users who never ran an agent.** Most registrations are browser sessions. This is
  an available upgrade, not the general solve, and the email path has to stand on its own.
- **Immunity from key loss.** Trading "lost the mailbox" for "lost the laptop" is not progress by
  itself. The provenance design already carries a `recovery_key` for this, and the same recovery
  key should cover this binding — one thing to keep safe, not two.

The framing to avoid is "backdoor." A second credential that recovers an account is a second way
in, and it is only an improvement if it is at least as hard to compromise as the first. A Secure
Enclave key clears that bar comfortably against a `.edu` mailbox. It has to be *held* to that bar
in the implementation — key rotation logged, challenges bound to a nonce and an expiry, no path
where presenting a key alone silently reassigns ownership without the log recording who accepted
it and when.

---

## What this does and does not prove

**Proves:** that DAON's records said X on date D, and that they have not been altered since. That
is a real and useful claim — it is what a registry can honestly offer.

**Does not prove:** that X is true. DAON recording someone as owner does not make them the owner;
it records that our system was told so, by someone who authenticated. A relying party weighs that
accordingly.

The distinction matters because it is the honest boundary between the two systems:

| | Registry ownership | Provenance ownership |
| --- | --- | --- |
| Authority | DAON's records | the creator's key |
| Requires of the user | email and 2FA | a key they must not lose |
| Survives DAON disappearing | no | yes |
| Proves | we recorded this, unaltered | this key made these revisions |

Neither replaces the other. The registry answers *"what does DAON say"* durably. Provenance
answers *"what can I prove without DAON"*. A researcher whose `.edu` dies loses access to the
first and keeps the second, which is why both exist.

---

## Email is the access path, so it belongs in the log

Access is a magic link plus 2FA, so **control of the email is control of the account** — and
institutional addresses die and are reassigned.

The log therefore records email changes and 2FA events as first-class entries, not as
`activity_log` rows. Then "who controlled this account in March" is answerable, and a later holder
of a reassigned address cannot quietly appear to have always been the owner.

This does not fix account loss. It makes the history of access legible after the fact, which is
what a dispute needs. For users who ran an agent, the key binding above is the recovery path that
does not depend on the mailbox; for everyone else, account recovery remains an open problem that
this log does not solve — it only ensures that whatever happens to an account is recorded.

---

## Migration

The reindexed records have no owner and this design does not invent one. A `registered` event is
written with `subject` null and metadata recording that ownership was lost in a known incident,
because a log that quietly fabricates the missing answer is worse than one that says it does not
know.

If a creator can later demonstrate ownership — most obviously by holding content that hashes to
the record, per `registry-and-provenance.md` — an `owner_added` event records that, along with
who accepted the claim and when.

---

## Open

- **Where the anchor goes.** OpenTimestamps is consistent with the provenance design and costs
  nothing. The DAON chain is available and would make the anchoring self-referential, which is
  the property we avoided elsewhere. Leaning OpenTimestamps for the same reason.
- **Whether `protected_content.user_id` stays** as a derived cache of the fold, or goes entirely.
  A cache that can disagree with the log is a second source of truth; keeping it is a performance
  decision that needs justifying rather than assuming.
- **Redaction under privacy law.** A right-to-erasure request against an append-only log needs an
  answer before someone makes one. Recording that a redaction occurred, without the redacted
  content, is the usual shape.
- **Anchoring cadence.** Daily bounds the tamper window to a day. More often costs more; the
  question is what window is defensible.
- **Whether an agent key can recover an account on its own,** or only raises confidence in a
  review that a human still signs off on. Fully automatic is better UX and a larger blast radius
  if the key model is wrong; the log records the answer either way, which is the part that is not
  negotiable.
- **Whether a browser-only user can opt into a key** — a passkey is the obvious candidate, already
  hardware-backed, already familiar. It would extend the second binding past agent users without
  asking anyone to understand a wallet.
