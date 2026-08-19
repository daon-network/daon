# DAON Provenance

An append-only, witnessed record of how a work came to exist — held by the creator, anchored to
Bitcoin, verifiable by a stranger without trusting DAON.

This directory is a Rust workspace of five crates. The design documents live in
[`docs/design/`](../docs/design/); this file is how to build and run the thing.

> **Status: pre-`0.1.0`, not published.** Every crate is `version = "0.0.0"` because the wire
> format is not frozen. See [What is missing](#what-is-missing) before depending on any of it.

---

## The crates

```
core ──── verify        the format, and the four steps that check it
  │
  ├────── witness       OpenTimestamps proofs, batching, Bitcoin anchors
  │
  └────── agent ─────── agentd
          the store     the daemon an editor talks to
```

| Crate | Does | Depends on |
| --- | --- | --- |
| [`core`](core/) | Leaf encoding, the Merkle log, inclusion proofs. The normative format | — |
| [`verify`](verify/) | The four-step verifier. `no_std`-capable, builds for `wasm32` | core |
| [`witness`](witness/) | `.ots` parsing, head batching, turning a proof into a Bitcoin anchor | core |
| [`agent`](agent/) | On-disk store, keychain signer, coalescing policy, witness state | core, witness |
| [`agentd`](agentd/) | The daemon: a Unix socket serving the editor API | all of the above |

### What the chain cannot do

Stated before the API, because it is the boundary everything else is arranged around:

| | |
| --- | --- |
| The chain proves | you wrote this, by this date, and control the keys that signed it |
| The chain **cannot** | detect a competing fork, or resolve one |

A thief works from a copy, so their rotation and your counter-rotation share a parent and **fork**
rather than sequence. And no timestamp calendar indexes, so there is no query for what else shares
a chain's prefix — the other branch is not hidden, there is nowhere to look.

Detecting competing claims needs somewhere they are collected, which is the registry. See
[`publication-and-versions.md`](../docs/design/publication-and-versions.md). A creator who never
touches DAON keeps the first row and gets nothing from the second, and that is the trade rather
than a gap.

### What each one refuses to do

The boundaries are deliberate and worth knowing before you go looking for a function that is not
there.

- **Nothing opens a socket except `agentd`,** and it opens exactly one: a Unix domain socket, mode
  `0600`. There is no TCP option. Submitting to a calendar and fetching Bitcoin headers are the
  caller's job, behind traits this workspace does not implement.
- **Nothing reads a clock for evidence.** Witness time comes from a Bitcoin block header. Local
  time appears in a leaf as `local_time_ms`, explicitly untrusted and signed `i64` so it can hold
  nonsense without panicking.
- **Nothing normalises hashed bytes.** No Unicode folding, no line-ending translation. A
  normalised hash would depend on which Unicode revision the implementation was built against.
- **`verify` never asks whether a key legitimately changed.** It checks a signature against the
  `author_key` committed in that leaf. Key rotation is an audit question answered by walking the
  chain, deliberately not a fifth step.

---

## Build and test

The toolchain is pinned in [`rust-toolchain.toml`](rust-toolchain.toml) — `rustup` reads it, so
there is nothing to select:

```sh
cd provenance
rustup toolchain install     # honours the pin, installs components and the wasm target
cargo test --all-features
```

The keychain tests are `#[ignore]` by default because they write real credentials into the
machine's keychain. To run them against a throwaway one, as CI does:

```sh
security create-keychain -p "" ci.keychain
security unlock-keychain  -p "" ci.keychain
security default-keychain -s ci.keychain

cargo test -p daon-provenance-agent --features keychain -- --ignored --test-threads=1

security delete-keychain ci.keychain
```

The verifier must keep building for the browser, since its value depends on a skeptic being able
to run it without trusting a binary we shipped:

```sh
cargo build -p daon-provenance-verify --target wasm32-unknown-unknown --release
```

### Worked examples

```sh
cargo run -p daon-provenance-core --example explain   # what a Merkle proof is, with real hashes
cargo run -p daon-provenance-core --example link      # how content_commit, leaf, head and batch stack
cargo run -p daon-provenance-core --example vectors   # emit the §9 wire-format test vectors
```

---

## Running the daemon

```sh
cargo run -p daon-provenance-agentd -- \
    --store ~/.daon/provenance \
    --socket /tmp/daon-agent.sock
```

| Flag | Default | |
| --- | --- | --- |
| `--store` | *required* | where leaves, blobs and witness state live |
| `--socket` | `<store>/agent.sock` | **keep it short** — see below |
| `--identity` | `default` | which keychain identity signs |

On first run it creates a signing identity and prints a **recovery key, once**. Write it down
somewhere the signing key is not, and see [`key-recovery.md`](../docs/design/key-recovery.md)
§ *Custody domains* before deciding where — particularly if the machine belongs to an employer.

**There is no `--port`, deliberately.** The spec's reasoning: *"a debug flag that opens a port is
a debug flag that ships."*

**Socket paths are capped by the operating system** at 104 bytes on macOS and 108 on Linux. Since
the default socket lives inside the store, a deep store path makes the daemon unstartable. It
reports this with the length, the limit and the flag to use, but the short version is: if your
store is nested, pass `--socket /tmp/daon-agent.sock`.

### Talking to it

Any HTTP client that speaks to a Unix socket. The full contract is
[`editor-integration-spec.md`](../docs/design/editor-integration-spec.md) §3.

```sh
S=$(curl -s --unix-socket /tmp/daon-agent.sock -X POST \
      http://localhost/v1/session/open \
      -d '{"tool_id":"my-editor/1.0"}' | jq -r .session)

curl -s --unix-socket /tmp/daon-agent.sock -X POST http://localhost/v1/observe \
  -d "{\"session\":\"$S\",\"ingress\":\"keystroke_stream\",
       \"span_bytes\":{\"added\":412,\"removed\":18},
       \"op_count\":167,\"duration_ms\":92000}"

curl -s --unix-socket /tmp/daon-agent.sock -X POST http://localhost/v1/commit \
  -d "{\"session\":\"$S\",\"content\":\"the manuscript\",\"reason\":\"explicit\"}"
```

Two things integrators get wrong:

- **`commit` is a request, not a command.** A `200` with `"committed": false` means the agent
  coalesced, which is normal. Treating it as an error is a misreading of the contract.
- **A fresh head is `"witness_state": "pending"`.** That is the correct state for minutes to
  hours after writing, not a failure.

---

## Installing

`cargo` installs straight from git — **no package registry is required**:

```sh
cargo install --git https://github.com/daon-network/daon daon-provenance-agentd
```

Pin it with `--tag` or `--rev` for anything reproducible.

### Why nothing is on crates.io yet

The wire format is not frozen, and publishing invites people to build against bytes that may
change. Version `0.0.0` says so.

There is one thing git installs cannot do, and it decides when publishing becomes necessary: **a
crate published to crates.io may not depend on a git dependency.** So as long as we are unpublished,
nobody else can publish a crate that builds on the verifier. They can vendor it or depend on it by
git in an application, but not release a library against it. When that becomes something we want,
the format has to be frozen first.

### Distribution to creators is a different problem

`cargo install` requires a Rust toolchain, which is not a reasonable thing to ask a novelist for.
The eventual answer is signed application bundles, and the requirement is not only convenience:
macOS grants keychain access **per code signature**, and `cargo` re-signs ad-hoc on every rebuild,
so an unsigned agent asks the creator for permission every time it starts. See
[`keystore.rs`](agent/src/keystore.rs) — an unsigned build is unusable in daily practice
regardless of entitlements.

---

## What is missing

Honest status, because the crate docs describe intent and this describes reality.

| | State |
| --- | --- |
| Wire format, Merkle log, inclusion proofs | **Works.** Cross-checked against a Python reference on 18 vectors in CI |
| The four-step verifier | **Works.** Builds for `wasm32` |
| Store, keychain signer, coalescing policy | **Works** |
| `.ots` parsing, batching, anchor establishment | **Works**, offline |
| The daemon and its four routes | **Works** |
| **Submitting to a calendar** | **Missing.** Nothing reaches OpenTimestamps, so **no head is witnessed yet** |
| **A Bitcoin header source** | **Missing.** `BlockSource` has no implementation here |
| Rotation, recovery rotation and transfer | **Works.** Effective at their own `seq` — there is deliberately no delay |
| **Reading content back out of the store** | **Missing.** Segments are stored by hash with no manifest recording their order |
| **Binary and image registration** | **Missing.** Text only |

The first two are the ones that matter most. Until a batch root reaches a calendar and a header
source can resolve it, the chain proves *sequence* but not *time* — and time is the entire claim.
Everything else here is machinery around that.
