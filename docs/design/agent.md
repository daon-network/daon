---
layout: default
title: "Running the Agent"
description: "What the provenance agent is, how to build and run it, and what it deliberately refuses to do."
permalink: /design/agent/
mermaid: true
---
# Running the Agent

The agent is the piece a creator actually runs. It watches authoring activity, coalesces it into
revision leaves, signs them, batches heads and — eventually — gets them witnessed against Bitcoin.
Everything it holds stays on the creator's machine.

> **Status: pre-`0.1.0`, nothing published.** The wire format is not frozen. The full and honest
> status table is in [`provenance/README.md`](https://github.com/daon-network/daon/blob/main/provenance/README.md);
> the short version is that **no head is witnessed yet**, because nothing submits to a calendar.

---

## The shape of it

```mermaid
flowchart LR
    E["your editor"] -->|"Unix socket<br/>mode 0600"| A["agentd"]
    A --> S["local store<br/><i>leaves · blobs · witness state</i>"]
    A -.->|"the only egress,<br/>not built yet"| O["OpenTimestamps<br/>→ Bitcoin"]
    A -x|"never"| D["DAON"]
```

The editor reports **what it observed** — keystrokes, a paste, an import — and asks for commits.
It never reports what the content *is*, and the agent never sends content anywhere.

---

## Quickstart

```sh
cargo install --git https://github.com/daon-network/daon daon-provenance-agentd

daon-provenance-agentd --store ~/.daon/provenance --socket /tmp/daon-agent.sock
```

No package registry is involved; `cargo` installs from git directly. Pin with `--tag` or `--rev`
for anything reproducible.

On first run it creates a signing identity and prints a **recovery key, once**. Put it somewhere
the signing key is not — and if the machine belongs to an employer, read
[`key-recovery.md`]({{ '/design/key-recovery/' | relative_url }}) § *Custody domains* first.

**If it refuses to start**, the usual cause is the socket path. Operating systems cap these at 104
bytes (macOS) or 108 (Linux), and the default socket sits inside your store, so a deeply nested
store makes the daemon unstartable. Pass a short `--socket`.

---

## Talking to it

Any HTTP client that can speak to a Unix socket. The contract is normative in
[`editor-integration-spec.md`]({{ '/design/editor-integration-spec/' | relative_url }}) §3.

```sh
curl --unix-socket /tmp/daon-agent.sock -X POST \
     http://localhost/v1/session/open -d '{"tool_id":"my-editor/1.0"}'
```

Four routes: `session/open`, `observe`, `commit`, and `entity/{id}/proof`.

**Two things integrators reliably get wrong:**

- **`commit` is a request, not a command.** A `200` carrying `"committed": false` means the agent
  coalesced your request into the current window. That is the system working. An editor that
  treats it as an error has misread the contract — see the spec, §4.
- **A newly committed head reports `"witness_state": "pending"`.** That is correct for minutes to
  hours afterwards. It is not a failure and should not be surfaced as one.

---

## What it cannot do

Worth knowing before the guarantees, because it bounds them.

The chain proves you wrote something, by a date, with keys you control. It **cannot detect a
competing fork or resolve one** — a thief works from a copy, so their leaf and yours share a parent
and branch rather than sequence, and timestamp calendars do not index, so neither side can look for
the other. Competing claims meet at the registry or nowhere.

## What it refuses to do

These are load-bearing, not oversights:

- **No TCP.** A Unix socket, mode `0600`, and no flag to change it. *"A debug flag that opens a
  port is a debug flag that ships."*
- **No content leaves the machine.** The agent's only egress is OpenTimestamps, and what goes
  there is a batch root — 32 bytes committing to a set of heads.
- **No clock is trusted.** Witness time comes from a Bitcoin block header. The agent's own clock
  decides only when to make a request.
- **No hashed bytes are normalised.** A normalised hash would depend on the Unicode revision the
  implementation was built against, and would stop verifying after a library upgrade.

---

## Building from source

```sh
cd provenance
rustup toolchain install     # honours rust-toolchain.toml
cargo test --all-features
```

The toolchain is pinned because the verifier's value depends on a skeptic rebuilding it and
getting the same bytes, which is not true if the compiler floats.

Two worked examples explain the cryptography with real values rather than prose:

```sh
cargo run -p daon-provenance-core --example explain   # Merkle proofs, step by step
cargo run -p daon-provenance-core --example link      # how commit, leaf, head and batch stack
```
