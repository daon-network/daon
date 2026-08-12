# Registry and Provenance — How the Two Systems Relate

**Status:** design, pre-implementation · **Companion to:** [`provenance-data-model.md`](./provenance-data-model.md), [`key-authorization.md`](./key-authorization.md)

DAON will have two things that both look like "proving a work is yours." They are different
systems with different trust models, and conflating them would quietly weaken the stronger one.

---

## What exists today

Registration through the web app and API:

```js
creator: this.address        // api-server/src/blockchain.ts — the API wallet
```

```sql
user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL
content_hash  VARCHAR(64) UNIQUE NOT NULL
```

Three consequences, none of them criticisms — this is a reasonable design for what it does:

- **On-chain, the signer is DAON.** Every registration is signed by the API wallet. The chain
  records that *DAON registered this hash at this time*, not that a particular person did.
- **Ownership lives only in Postgres**, in a nullable column that is set to `NULL` when a user is
  deleted. It is an application fact, not a cryptographic one.
- **The content hash is already the primary identifier**, unique and publicly queryable at
  `GET /api/v1/verify/:hash`.

The registry answers a real question well: *did this exact content exist in DAON's registry by
this date.* Its trust anchor is DAON.

## What provenance adds

The creator's own key signs each revision; the chain is witnessed against Bitcoin. Its trust
anchor is Bitcoin, deliberately, so DAON is never the anchor for its own claims.

| | Registry | Provenance |
| --- | --- | --- |
| Who signs | the API wallet | the creator's key |
| Where the user is | a database row | nowhere on our servers |
| Trust anchor | DAON | Bitcoin |
| Proves | this hash was registered by date T | this chain of revisions existed, under one key |
| Survives DAON disappearing | no | yes |

Neither replaces the other. The registry is a service; provenance is evidence.

---

## The link is the content hash, not an account

The obvious instinct is to require sign-in: the user authenticates, and DAON records that their
account owns both the registration and the provenance chain.

**Don't.** The linkage already exists, publicly and verifiably:

```
registry:    content_hash X, registered at T
provenance:  genesis leaf whose content_commit derives from the same bytes
```

Anyone holding the content can check both sides themselves. No account, no server assertion, no
authority in the middle — which makes it *stronger* than a sign-in-based link, because a third
party can confirm it without trusting us.

### Why an account link would be worse

**Accounts are recoverable; keys are not.** Every service must offer 2FA recovery, and it is on
DAON's own roadmap. If an account is authoritative for "this key is that person's," then account
recovery becomes an attack path on provenance: take over the account, attest a different key. The
account protects a login; the chain proves fourteen months of revisions. Binding the stronger
claim to the weaker one lets the weaker one set the ceiling, and 2FA does not fix it because the
hole is in recovery rather than authentication.

**It rebuilds the aggregation surface.** A key→account map lets DAON answer *"what has this
person registered."* That is the surface ruled out for collections, for the same reasons:
subpoenable, breachable, pressure-able, and it makes *"there is no endpoint to query a creator's
profile"* false.

**For existing records it does not even work.** Ownership is a nullable column that has already
been lost once. Sign-in would retrieve a database row, not a fact.

---

## "Someone else could claim my registered hash"

They can. Anyone holding the content can start a chain about it. This is not a flaw to be closed;
it is the model working.

**Chains compete on evidence, not authority.** A claimant's chain starts today, with today's
witness. Yours reaches back months, witnessed at every step against blocks nobody controls.
Earlier witnessed history wins, and no registry adjudicates between them.

Closing this "hole" would mean appointing DAON to decide whose claim is real — which is the
gatekeeping role the project exists to refuse. The right answer to a competing claim is better
evidence, not a higher authority.

---

## What sign-in is actually for

**Convenience, never protocol.** Legitimate uses:

- the dashboard, settings, existing registry flows
- showing a creator which registrations correspond to content they hold

That second one is worth being precise about. Matching a local file against the registry is a
**local computation**: hash the file, query the public endpoint. Sign-in is not needed to *do* it,
only to conveniently list what a user has already registered.

**Requirements:**

1. Creating a key and starting a chain **must not require an account.** The moment it does, the
   account is load-bearing again.
2. The agent **must never send content or keys to the API.** Its only egress remains
   OpenTimestamps.
3. If a creator wants their key publicly associated with them, that is an affirmative act they
   publish — optionally counter-attested by their account, where 2FA genuinely helps make the
   attestation credible. It is not a registry DAON maintains and answers queries about.

---

## Adding provenance to an existing registration

The flow, with no account required:

1. Creator has content that was registered previously, and the file.
2. The agent starts an entity whose genesis commits to that content.
3. Subsequent revisions extend the chain normally.
4. The registry record is unchanged. It remains what it always was: a timestamped statement that
   this hash was registered by date T.

The two coexist without either being subordinate. A relying party sees:

> The registry says this hash existed by 2026-03-14. The creator's chain shows revisions from
> 2025-11 through 2026-08, witnessed independently, under a single key.

Those are separate claims from separate anchors, and both can be checked. **The registration
becomes one fact among several rather than the root of the claim** — which is a strengthening,
since the registry's anchor is us and the chain's is not.

### For the records whose ownership was lost

The reindexed records have no `user_id`. Under an account-linked design that would be
unrecoverable. Under content-hash linkage it does not matter: a creator who still holds the
content can start a chain about it and needs nothing from the database.

The lost column stops being a problem to solve.

---

## The `revision_history` fossil

`content_record.revision_history` exists on-chain as `repeated string` — a bare list of hashes,
with no Merkle structure, no witnesses and no signatures. It is a remnant of an earlier
chain-based versioning idea that the provenance data model supersedes.

It should be **left alone, unused**. Writing to it would create a second, weaker version history
that says something different from the real one, and two histories that can disagree is worse
than one.

Removing it is a chain migration for no benefit. It stays as dead weight until there is another
reason to touch the module.

---

## Open

- **Does the app surface provenance at all in the MVP?** The editor needs it. Whether
  daon.network displays chain state is a product question, and displaying it invites exactly the
  comparisons `editor-integration-spec.md` §6 forbids.
- **Discovery.** With no key→account registry, a reader who wants to check a claim must be given
  the disclosure by the creator. That is the intended default and it is also a UX problem nobody
  has designed.
- **Whether the registry should record that a hash has a chain.** A boolean would be harmless
  and useful; it is also the first step toward a queryable profile, so it needs deciding
  deliberately rather than drifting into existence.
