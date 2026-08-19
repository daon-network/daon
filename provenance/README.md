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
| [`net`](net/) | **The only crate that opens a socket.** Calendar client, block source | core, witness |
| [`agentd`](agentd/) | The daemon: the editor socket, and the witness loop | all of the above |

### What each one refuses to do

The boundaries are deliberate and worth knowing before you go looking for a function that is not
there.

- **Only `net` reaches the network, and only `agentd` listens.** The daemon opens one Unix domain
  socket, mode `0600`, with no TCP option. Everything outbound is in `net`, which exists so the
  agent's egress is enumerable: a reviewer confirms what can leave the machine by reading one
  crate. A calendar learns a 32-byte digest and nothing else — not what, not whose, not how large.
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
| `.ots` parsing, batching, anchor establishment | **Works** |
| Calendar submission and upgrade | **Works.** `net` is the only crate that opens a socket |
| A Bitcoin header source | **Works.** Esplora-compatible, and one implementation among several a caller might prefer |
| The witness loop | **Works.** Runs on a timer from daemon startup; `--no-witness` opts out |
| The daemon and its four routes | **Works** |
| Rotation, recovery rotation and transfer | **Works.** Effective at their own `seq` — there is deliberately no delay |
| Calendar client, against a real calendar | **Verified.** `net/tests/live_calendar.rs`, `#[ignore]`d — run it with `-- --ignored` |
| Storing content | **Off by default.** Segments were write-only, and a fixed 1 KiB boundary makes a revision pass cost a full copy of the document. `open_keeping_content` opts in |
| **Binary and image registration** | **Missing.** Text only |

A chain can now be written, batched, submitted, upgraded and verified end to end.

The creator keeps their own file, which `wire-format.md` §6 already assumed — it has a creator
generating segment proofs "from content only they hold". A chain costs 282 bytes per revision, so a
thousand revisions is a few hundred kilobytes.

What remains is binary and image registration, which makes the system narrower rather than
unfinished.
