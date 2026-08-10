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

### Transport — normative

The agent holds the author key. **TCP loopback is not a security boundary**: any local process,
including anything malicious that gains a foothold, can connect to it. There is no listener on
any TCP port, loopback included.

| Platform | Transport | Protection |
| --- | --- | --- |
| macOS, Linux | Unix domain socket | file mode `0600`, owned by the running user |
| Windows | named pipe | DACL restricted to the current user SID |

HTTP semantics over that socket, so any language with an HTTP client can integrate without an
FFI story. Implementations **must not** offer a TCP fallback, including as a development
convenience — a debug flag that opens a port is a debug flag that ships.

A caller that can open the socket is already running as the creator and can read the key
material directly; the socket is not trying to defend against that. It is defending against every
process that cannot, which on a shared or compromised machine is the population that matters.

### What an entity is — normative

**An entity is one canonical assembled artifact.** The manuscript, not the project; the
manuscript, not the chapter file.

The data model defines an entity structurally — identity is its genesis, position is its head —
but not what it corresponds to in the world. That is the first decision an implementer faces, and
getting it wrong is silently corrosive rather than loud.

**Why not one entity per file.** Long-form writing is mostly restructuring. Move a scene from
chapter 3 to chapter 7 and, with chapter files as entities, chapter 7 records `ingress: paste` —
byte-identical to pasting from a model. Split a chapter and you create a fresh genesis with no
lineage at all until forks land in P2.

So an author reorganising their own manuscript would accumulate exactly the pattern §6 warns
against reading as suspicious, *by doing the ordinary work of writing a book.* The system would
be manufacturing the signal, then disclaiming it. That is worse than not recording it.

**Why the assembled artifact works.** Internal restructuring adds no bytes from outside the
entity, so it produces no `paste` and needs no fork. Which is correct: **reorganising your own
work is not an evidentiary event.** Bytes crossing the boundary — from another document, another
person, a model — are, and those still register.

**Project-level is too coarse** for the opposite reason: unrelated works would share a head, so
witnessing one would carry the others, and disclosing about one would mean disclosing a head
covering all of them.

An editor that stores a work as multiple files opens **one session per assembled artifact** and
sends the assembled content at `commit`. How it maps files to that assembly is its business; the
entity boundary is not.

**Collections are a non-goal.** There is no series, anthology, or body-of-work primitive, and
there should not be one.

Provenance is a property of a work. Grouping works is cataloguing, and it is cataloguing with a
cost: a collection is an **aggregation surface**, and aggregation is where scoring becomes
possible. "Prove this manuscript is yours" and "show me your body of work" are different asks,
and only the first is answerable without characterising a person. A grouping primitive would make
a creator's whole output legible as a unit, which is the creator profile
`provenance-data-model.md` refuses to build.

The legitimate need is already met without one: works by the same creator share an `author_key`.
That link exists for any creator who chooses to reveal it, and exists for nobody else — which is
the correct default. A collection primitive would move that from something disclosed to something
queryable.

Lineage *between* entities, where one work genuinely derives from another, is what forks are for
(P2). That is a provenance relation. Belonging to the same series is not.

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

**Mixed activity is reported as multiple `observe` calls, never averaged into one.** Averaging a
paste and a typing burst into a single blended record destroys precisely the distinction the log
exists to preserve. The agent commits all observations in a window to the leaf as a Merkle tree
over the sequence, so a leaf carries each one intact and a holder can later disclose one without
the others. See `wire-format.md` §3.

### `POST /v1/commit`

Request that accumulated observations become a revision leaf.

```jsonc
// request
{ "session": "s_01J…",
  "content": "…",              // full buffer; committed as SHA256(0x03‖bytes)
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

Default policy: coalesce until **90 s idle**, or `reason: "save" | "close" | "explicit"`, subject
to the §5 minimum interval. Editors should call `commit` liberally and let the agent absorb it.

**`explicit` always produces a leaf.** It is the one reason the agent may not coalesce away.

`explicit` means the creator named this moment — "Draft 2 complete", the version going to a
committee, the state submitted to a publisher. That is the most evidentially significant leaf in
a chain, and it is the only one whose position the creator chose deliberately rather than as a
side effect of when they stopped typing. Absorbing it into surrounding idle work would discard
precisely the boundary that was worth recording.

The §5 minimum interval still applies, so `explicit` cannot be used to bypass rate limiting — a
client sending it in a loop is refused like any other. It bypasses *coalescing*, not the floor.

Note that an `explicit` leaf carries no name. The milestone is the leaf's position in the chain,
witnessed like any other; a creator-supplied label would have to enter the hashed layer, where it
would become part of what a disclosure reveals. A title can be sensitive on its own. If labelling
is ever wanted it is a format decision, not something a client may add.

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

## 6. What a history does not mean

Normative, and aimed at whatever renders this data — the editor, a viewer, a future dashboard.

A DAON history is **evidence a creator may choose to offer**. It is not a credential, and its
absence is not a deficiency. Almost all writing that exists was made without one, including
almost all of the writing anyone reading a history has ever valued.

### Absence and sparseness carry no meaning

- **No history is the norm.** Anyone writing in Google Docs, on paper, in Notes, or in any tool
  that has never heard of this spec has none. That is the overwhelming majority of all work.
- **A thin history is not a weak one.** Someone who saves twice a day produces a fraction of the
  leaves of someone who saves constantly. The difference is a habit, not a fact about authorship.
- **A creator who never discloses has said nothing**, and must not be treated as having said
  something. Default silence is the design's position (`provenance-data-model.md`), not evasion.

### The metrics describe writing, not authorship

`op_count`, `duration_ms`, `span_bytes` and `ingress` record mechanism. They do not measure
effort, originality, or honesty, and they are not comparable between people:

| Pattern that looks "suspicious" | What it actually is |
| --- | --- |
| Mostly `paste` | drafted somewhere else — a notes app, Docs, a phone, a collaborator's message |
| Very few, very large leaves | writes in long sittings; saves rarely |
| Fast `op_count`, short `duration_ms` | a touch typist, or dictation, or an assistive input device |
| Long gaps, sporadic bursts | a job, children, illness, a life |

Every row is ordinary. A reading that treats any of them as a red flag is not detecting anything
— it is penalising people for how they work, and it will land hardest on the people with the
least control over how they work.

### Therefore, implementations must not

1. **Score, rank, grade, or rate** a history, or compute any single number intended to summarise
   its trustworthiness.
2. **Compare** one creator's history to another's, to an average, or to a threshold.
3. **Present absence as negative** — no "unverified" badges, no warning colours, no empty-state
   copy implying something is missing or wrong.
4. **Present `paste` as negative** — no highlighting, no distinct warning styling, no ordering
   that surfaces it as exceptional.
5. **Nudge toward more leaves** — no streaks, no completeness meters, no prompts to save more
   often "for better provenance." That converts a record into a performance.

A tool that ships any of these has built the gatekeeping instrument this project exists to
refuse, regardless of what its documentation says.

### Why this is in a wire format spec's companion

Because the pressure is structural, not accidental. The moment a history is legible, someone will
want to read it as a verdict — and the people asking will usually have more power than the person
being asked. The format's job is to leave that reading unsupported: no score to cite, no
comparison to draw. Implementations must not reintroduce at the presentation layer what the
format deliberately withholds.

**The distinction to hold onto is capability versus surface.** A creator may choose to prove a
single segment of a revision (`wire-format.md` §6) — that exists so they can disclose *less*,
since the alternative is revealing an entire manuscript to answer one question. But nothing this
system issues, renders, or accepts works at that grain. There is no endpoint taking a segment
index, no certificate showing one, no view that invites the question. What a holder can
volunteer and what an adversary can demand are not the same surface, and only the second one is
ours to close.

---

## 7. What the editor must never do

1. **Infer or report content source.** No `source`, `is_human`, `ai_generated`, or equivalent —
   including via `tool_id`, `ingress`, or a vendor extension field.
2. **Reach the witness directly.** All egress is the agent's.
3. **Send timestamps as truth.** `local_time` is recorded as creator-asserted and untrusted; the
   beacon and witness establish real bounds.
4. **Retry around a limit.** Honour `Retry-After`.
5. **Fabricate `ingress`.** `unknown` is always available and always acceptable.
6. **Emit content outside `commit`.** Observations carry counts and spans, never bytes.

---

## 8. Conformance checklist

- [ ] Reads `limits` from `session/open` rather than hard-coding §5
- [ ] Treats `committed: false` as normal flow, not an error
- [ ] Reports `ingress: "unknown"` rather than guessing
- [ ] Emits separate observations for mixed activity instead of averaging
- [ ] Honours `Retry-After` with no client-side retry loop
- [ ] Contains no field, anywhere, asserting content source
- [ ] Never opens a network connection on the versioning layer's behalf
- [ ] Connects over a Unix socket or named pipe, never TCP — including in debug builds
- [ ] Displays no score, rank, grade, or trustworthiness summary of a history
- [ ] Compares no history to another, to an average, or to a threshold
- [ ] Styles absence and `paste` neutrally — no badges, warnings, or highlighting
- [ ] Offers no streak, meter, or prompt encouraging more frequent commits
- [ ] Opens one session per assembled artifact, not per file (§3)
- [ ] Sends `reason: "explicit"` only for creator-named milestones, and never in a loop

---

## 9. Open questions

- **Content store.** `content_commit` is over content bytes, not a delta (`wire-format.md` §6),
  so storage is now purely a local decision with no effect on any commitment. Git remains a
  strong candidate — a content-addressed delta store with append-only history — and choosing it
  no longer constrains anything an adjudicator has to reproduce.
- **Key loss.** Losing the author key ends the ability to append to an entity; history stays
  verifiable but frozen. Needs a recovery story before anyone depends on this.
- **Multi-device.** Out of MVP scope (single-writer), but the `seq`/`parent_head` shape should be
  checked against a future where two devices append to one entity.
- **Limit defaults.** The §5 numbers are reasoned, not measured. Revisit against real editing
  traffic once instrumented.
