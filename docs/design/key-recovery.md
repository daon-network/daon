# Key Recovery and Rotation

**Status:** design proposal · **The last undefined thing in the format**
**Companion to:** [`wire-format.md`](./wire-format.md) §7, [`key-authorization.md`](./key-authorization.md)

`recovery_key` is committed in every leaf and its semantics are undefined. This proposes them.

---

## The problem it exists for

Under Option A one key extends an entity for its lifetime. Lose it and the chain freezes: history
stays verifiable but can never be extended, and for a work in progress the continuity *was* the
evidence. A fourteen-month chain that stops dead is a real harm, which is why the field was
reserved before anything shipped.

## The knot

If rotation is authorised by the outgoing key, a **lost** key cannot sign its own rotation — and
loss is the entire case `recovery_key` exists for. So the rule cannot be "the old key blesses the
new one."

## What compromise can and cannot do

Worth establishing first, because it bounds how much the rest matters.

**Neither key can alter what already exists.** Every leaf is under a witnessed head anchored to
Bitcoin. Rewriting history would require a SHA-256 collision or rewriting Bitcoin. So the worst
case for *any* key compromise is control of the **future** of a chain, never its past.

That is a meaningful floor. An attacker who steals both keys still cannot make it look as though
they wrote the manuscript — the existing revisions, with their timestamps, are beyond reach.

---

## Proposal

### 1. Narrow what the recovery key may do

`recovery_key` may sign **exactly one thing**: a rotation leaf naming a new `author_key`. It may
never sign a content revision.

This is the difference between "a second key that can do everything" and "a key that can only
hand over the baton." A stolen recovery key cannot quietly append revisions in the creator's
voice; it can only perform an act that is, by construction, visible.

### 2. Rotation is an ordinary leaf

A rotation leaf sits in the chain like any other: sequenced, hashed, witnessed. It is not a
side-channel or a registry entry.

Consequences, all wanted:

- **A hostile takeover is detectable.** An unexpected rotation leaf appears in the creator's own
  chain. Detection is not prevention, but silent takeover is impossible.
- **It is ordered.** Witnesses establish when rotation happened relative to everything else, so
  "who controlled this chain on date X" is answerable.
- **It costs the verifier nothing.** A leaf signed by the `author_key` *in that leaf* is valid.
  The minimum verifier never asks whether the key legitimately changed — that is an audit
  question, answered by walking the chain, not a step in the four.

### 3. The recovery key must not live beside the author key

If both sit in the same Keychain on the same laptop, a stolen laptop takes both and a lost laptop
loses both. The field then buys nothing.

**Normative:** an agent must not store both keys in the same medium by default. The recovery key
is generated at genesis, shown to the creator once, and stored by them somewhere the author key
is not — paper, a password manager, a second device.

An agent may offer to keep it, but must make the tradeoff explicit rather than defaulting to
convenience.

### 4. Rotation cannot be undone, only superseded

A rotation leaf is append-only like everything else. A creator who discovers a hostile rotation
counter-rotates with the same recovery key, producing a later rotation leaf. Both are in the
chain, both are witnessed, and the ordering is established by Bitcoin rather than by either
party's claim.

This is why detection matters: the legitimate holder can always respond, provided they still hold
the recovery key and notice.

---

## The open decision: immediate or delayed

**Immediate.** A rotation leaf takes effect at its own `seq`. Simple, no new verifier rule, and a
stolen recovery key gives an attacker control from the moment they use it. The creator's recourse
is to counter-rotate as soon as they notice.

**Delayed.** A rotation takes effect only after N witnessed heads, or a fixed interval measured by
witness times. The creator gets a window to notice and counter-rotate before the new key can sign
anything.

Delay is genuinely stronger — it converts "detectable after the fact" into "preventable if you are
paying attention." It is also the only version that binds an attacker, because an attacker holding
the recovery key controls the agent and will ignore any policy that is not in the format.

It costs a verifier rule: the verifier must compare witness times to decide whether a rotation was
in effect for a given leaf. That is arithmetic on values it already holds rather than a chain
walk, so it is cheaper than the authorization chain Option C would have required — but it is a
fifth thing the minimum verifier does, and the data model says to protect the four.

**Recommendation: immediate, with delay reserved.** The floor established above does most of the
work — history cannot be altered, and takeover cannot be silent. Delay protects against a narrow
window in a case that requires the recovery key to already be stolen, and it spends the thing the
design most wants to keep. It can be added later behind a format version bump; the verifier rule
would be additive rather than a change to how existing leaves verify.

---

## Honest limits

- **A stolen recovery key means a stolen future.** Nothing here prevents that; it makes it visible
  and reversible-by-supersession.
- **A creator who loses both keys has lost the chain.** There is no third mechanism, deliberately.
  Anything that could restore access without either key would be a backdoor, and a backdoor with
  DAON holding it would make DAON the authority the whole design refuses to be.
- **Detection assumes someone is looking.** An abandoned chain can be rotated without anyone
  noticing. This is inherent to a system with no central registry to alert.

## Open

- Whether the recovery key may itself be rotated. It probably must be — a compromised recovery
  key otherwise permanently threatens an entity — but that needs its own rule, and "signed by the
  author key" is the obvious candidate since that inverts the trust direction cleanly.
- Encoding. A rotation leaf needs to be distinguishable from a content leaf without an
  algorithm-agility field, which the format deliberately lacks.
