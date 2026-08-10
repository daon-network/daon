# Editor Integration Spec — DAON Provenance Versioning

**Status:** draft for implementers · **Companion to:** [`provenance-data-model.md`](./provenance-data-model.md)

This is the contract between an editing tool and the DAON versioning layer. It is written so
that an editor team can build against it without reading the data model, and without being able
to violate it by accident.

The versioning layer is a **local library plus a local agent**. It is not a network service, it
does not require the DAON chain, and no content ever leaves the machine.

---

## 1. The one rule

> **The editor reports what it observed. It never reports what the content is.**

An editor cannot know whether text came from a person, a notes app, or a model. Any field
claiming to know is either a lie or a guess, and both are worse than silence.

So the API has no `source`, no `is_human`, no `ai_generated`, no confidence score, and no field
that could be reduced to one. `Observation.authoritative` is hard-coded `false` — a structural
reminder that tools observe and never adjudicate.

**An editor that infers source and reports it is not a conforming client.** If a future editor
wants to display a guess to its own user, that is its business — but it must not enter the log,
because the log is evidence and a guess is not.

---

## 2. Trust boundary

```
┌─ editor process ──────────────┐   ┌─ versioning agent ─────────────────┐
│                               │   │                                    │
│  keystrokes, paste events,    │──▶│  coalescing        rate limits      │
│  cursor, buffer state         │   │  leaf construction  Merkle append   │
│                               │   │  author key         witness batch   │
│  reports observations         │   │  local content store                │
│  requests commits             │◀──│  → OpenTimestamps (the only egress) │
└───────────────────────────────┘   └────────────────────────────────────┘
        untrusted for                       enforces everything
      timing, identity, rates                 that matters
```

The editor is trusted to report its own observations honestly. It is **not** trusted for
timing, identity, ordering, or restraint. Specifically:

| Concern | Enforced by | Why not the editor |
| --- | --- | --- |
| Rate limiting | agent | a buggy editor in a hot loop must not reach the witness |
| Wall-clock time | agent + beacon | `local_time` is creator-asserted and explicitly untrusted |
| Leaf ordering / `seq` | agent | must be monotonic even if the editor crashes or reorders |
| Signing | agent | the author key never enters editor memory |
| Witness cadence | agent | the shared resource; see §5 |

A hostile editor can pollute *its own* creator's log with false observations. It cannot forge
another creator's history, backdate a leaf below its beacon, or exhaust the witness on anyone
else's behalf. Those are the properties worth defending.

---

## 3. API

Local HTTP on loopback, or a language binding over the same shapes. Loopback so any editor in
any language can integrate without an FFI story.

### `POST /v1/session/open`

Begin editing an entity. Returns a session handle used for subsequent calls.

```jsonc
// request
{ "entity_id": "sha256:…",   // omit to create a new entity (genesis)
  "tool_id":   "acme-editor/0.4.1" }

// response
{ "session":  "s_01J…",
  "entity_id":"sha256:…",
  "head":     "sha256:…",
  "head_seq": 41,
  "limits":   { "min_commit_interval_ms": 2000,
                "daily_leaf_budget": 2000,
                "leaves_remaining_today": 1974 } }
```

The agent returns its live limits so the editor can pace itself rather than discover them by
being refused. **Clients must read these rather than hard-coding the defaults in §5.**

### `POST /v1/observe`

Report authoring activity. Cheap, frequent, non-committing. The agent accumulates observations
and decides when they become a leaf.

```jsonc
{ "session": "s_01J…",
  "ingress": "keystroke_stream",   // | paste | import | programmatic | unknown
  "span_bytes": { "added": 214, "removed": 12 },
  "op_count": 87,
  "duration_ms": 45200 }
```

`ingress` must reflect the **mechanism observed**, not an inference about origin:

| Value | Means |
| --- | --- |
| `keystroke_stream` | characters arrived as individual input events |
| `paste` | a clipboard or drop insertion occurred |
| `import` | content was loaded from a file or external document |
| `programmatic` | the buffer was modified by the tool or an extension, not the user |
| `unknown` | the tool genuinely cannot tell — **a valid and honest answer** |

`unknown` is not a failure. A tool that cannot distinguish should say so rather than guess.
Mixed activity is reported as multiple `observe` calls, not averaged into one.

### `POST /v1/commit`

Request that accumulated observations become a revision leaf.

```jsonc
// request
{ "session": "s_01J…",
  "content": "…",              // full buffer; the agent computes the delta
  "reason":  "idle" }          // | save | close | explicit

// response — committed
{ "committed": true,
  "seq": 42,
  "head": "sha256:…",
  "leaf": "sha256:…" }

// response — coalesced (not an error)
{ "committed": false,
  "reason": "coalesced",
  "retry_after_ms": 1400 }
```

**`commit` is a request, not a command.** The agent may coalesce, defer, or refuse it. An editor
that treats a non-commit as an error is misreading the contract — §4 covers why.

### `GET /v1/entity/{id}/proof?seq=N`

Returns `(leaf, inclusion_proof, witness_receipt)` — the input to the four-step verifier. If the
enclosing head is not yet witnessed, `witness_receipt` is `null` and `witness_state` is
`pending`. This is normal and expected; see §5.

---

## 4. Coalescing: why commits are advisory

The editor asks for a commit whenever it thinks one is warranted. The agent decides.

This exists because leaf granularity is an **evidential** property, not a UI one. Too fine and
the log is enormous while each leaf proves almost nothing; too coarse and the history says
little about how the work was made. That judgement has to be consistent across every tool
touching an entity, so it belongs on one side of the boundary — and it is baked into every
historic leaf, so it cannot be renegotiated later.

Default policy: coalesce until **90 s idle**, or an explicit `reason: "save" | "close"`, subject
to the §5 floor. Editors should call `commit` liberally and let the agent absorb it.

`duration_ms` is measured across the coalesced window, so it stays meaningful regardless of how
often the editor asked.

---

## 5. Rate limits

Two tiers, because the two rates have completely different costs.

### Leaves — local, generous

| Limit | Default | Behaviour on breach |
| --- | --- | --- |
| Minimum commit interval | 2 s | coalesce, return `retry_after_ms` |
| Daily leaf budget per entity | 2 000 | `429`, `Retry-After` |
| Observations per minute per session | 600 | drop excess, set `"throttled": true` |

A leaf costs local disk and one level of Merkle depth. At 2 000 leaves/day an inclusion proof is
~11 hashes; at 100× that it is ~18. **Proof size is not the reason for these limits** — they
exist to catch a runaway client before it fills a disk, not to ration a scarce resource. Tune
them up freely.

### Witnesses — shared, strict

This is the tier that matters. OpenTimestamps aggregators are a **public good operated at
someone else's expense**, and every submission consumes calendar capacity that other people are
relying on.

| Limit | Default | Rationale |
| --- | --- | --- |
| Witness submissions | **1 per 10 min, process-wide** | not per entity — see batching |
| Entities per submission | unlimited | batching is the point |
| Minimum interval per entity head | 1 h | a head is only worth witnessing once it has moved meaningfully |
| Burst allowance | none | there is no legitimate reason to burst a timestamp |

**Batching is mandatory, not an optimisation.** All pending entity heads are combined into one
Merkle root and submitted as a *single* OTS request. Each entity then keeps an inclusion proof
from its head into that batch root, so:

```
  N documents  →  1 OTS submission  →  N inclusion proofs
```

External load is **O(1) per interval regardless of how many documents are open.** A client that
bypassed batching and submitted per-entity would be the exact bad-citizen behaviour these limits
exist to prevent — which is why the editor cannot reach the witness at all. It has no path to
it; only the agent does.

### Backpressure

The agent **never drops work silently.** A refused commit is queued or explicitly reported with
`retry_after_ms`. A witness submission that is rate-limited stays pending and is picked up in the
next window. Pending is a normal steady state, not an error: OTS proofs begin pending and upgrade
on Bitcoin confirmation ~1 h later anyway, which is why the design specifies a publish-only
cadence in the first place.

Editors must not implement their own retry loops on `429`. Honour `Retry-After`.

---

## 6. What the editor must never do

1. **Infer or report content source.** No `source`, `is_human`, `ai_generated`, or equivalent —
   including via `tool_id`, `ingress`, or a vendor extension field.
2. **Reach the witness directly.** All egress is the agent's.
3. **Send timestamps as truth.** `local_time` is recorded as creator-asserted and untrusted; the
   beacon and witness establish real bounds.
4. **Retry around a limit.** Honour `Retry-After`.
5. **Fabricate `ingress`.** `unknown` is always available and always acceptable.
6. **Emit content outside `commit`.** Observations carry counts and spans, never bytes.

---

## 7. Conformance checklist

- [ ] Reads `limits` from `session/open` rather than hard-coding §5
- [ ] Treats `committed: false` as normal flow, not an error
- [ ] Reports `ingress: "unknown"` rather than guessing
- [ ] Emits separate observations for mixed activity instead of averaging
- [ ] Honours `Retry-After` with no client-side retry loop
- [ ] Contains no field, anywhere, asserting content source
- [ ] Never opens a network connection on the versioning layer's behalf

---

## 8. Open questions

- **Content store.** `content_commit = hash(delta from parent)` with bytes staying local is
  precisely what git already is — a content-addressed delta store with append-only history.
  Worth a deliberate decision on using it as the backing store rather than reimplementing it.
- **Key loss.** Losing the author key ends the ability to append to an entity; history stays
  verifiable but frozen. Needs a recovery story before anyone depends on this.
- **Multi-device.** Out of MVP scope (single-writer), but the `seq`/`parent_head` shape should be
  checked against a future where two devices append to one entity.
- **Limit defaults.** The §5 numbers are reasoned, not measured. Revisit against real editing
  traffic once instrumented.
