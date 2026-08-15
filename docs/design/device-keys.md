# Secure Enclave and Device Enrollment — What It Would Cost

**Status:** analysis, no decision taken · **Companion to:** [`wire-format.md`](./wire-format.md), [`key-recovery.md`](./key-recovery.md)

The question: what does adding Secure Enclave keys actually cost, and could an average person
enroll a second device without calling for help?

Short version: **the enrollment flow is genuinely easy — it's the Signal flow, and millions of
people do it weekly. The costs are elsewhere, and one of them is a design principle we already
committed to protecting.** Also, and this is the good news, **nothing forecloses it.** Waiting
costs nothing.

---

## Why the keychain, not the Enclave — restated

A Secure Enclave key is generated inside the chip and the private half cannot leave it. That is
the entire security property, and it is also why an Enclave key **can never sync**. Not policy —
there is nothing to transmit. iCloud Keychain syncs precisely *because* the material is
extractable and can be re-encrypted for another device.

So: sync and Enclave are mutually exclusive. We chose sync, and as of PR #112 the agent actually
asks for it rather than quietly writing to the non-syncing file keychain.

---

## What Secure Enclave would cost

### 1. The wire format — the big one

The Enclave only does ECC **P-256**. It has never exposed Ed25519 and there is no sign it will.
`wire-format.md` §5:

| offset | width | field |
| --- | --- | --- |
| 146 | 32 | `author_key` — Ed25519 public key |
| 178 | 32 | `recovery_key` |

A compressed P-256 public key is **33 bytes**. It does not fit a 32-byte field. So this is not a
configuration change; it is a new format version, which means the spec, the Python reference
encoder, the Rust core, the verifier, and all 18 CI vectors move together.

**But the escape hatch already exists.** Offset 0 is a format version byte. A v2 leaf can widen
the key fields and declare a different algorithm without breaking a single existing v1 leaf, and
verifiers already have to read that byte. We did not need to plan for this — we get it free from a
decision already made.

### 2. ECDSA is a worse signature scheme than what we have

Ed25519 is deterministic, has one valid signature per message, and has no malleability. ECDSA has
**two** valid signatures for every message (`s` and `n-s`), so it needs low-`s` normalisation, and
forgetting that is a classic bug. The Enclave also returns DER, variable length ~70–72 bytes,
against our fixed 64-byte `.sig` — so there is a DER→`r||s` conversion on every signature.

Neither is hard. Both are new places to be wrong, in the part of the system where being wrong is
worst.

### 3. FFI, but only on the signing side

There is no pure-Rust path to the Enclave: `SecKeyCreateRandomKey` with
`kSecAttrTokenIDSecureEnclave`, `SecAccessControlCreateWithFlags`, `SecKeyCreateSignature`, all
through `security-framework`/`objc2`.

The **verifier stays pure Rust and stays wasm-compatible** — the `p256` crate handles
verification with no platform code. That matters: the thing that has to run everywhere doesn't
inherit the platform dependency.

### 4. It makes the agent Apple-first

The Enclave is Apple-only. Windows has TPM-backed keys via CNG's Platform Crypto Provider; Linux
has no universal equivalent. Today `keyring` gives us macOS, Windows and Linux through one
interface. Enclave support forks that into a per-platform hardware story, and the platforms are
not equally good.

### 5. Per-device keys were already rejected, and for this reason

Enclave keys are device-bound, so they push toward **one chain signed by several keys** — a
verifier walking an authorisation graph (B was authorised by A at seq N) with revocation effective
dates, instead of checking one signature against one committed key.

[`key-authorization.md`](./key-authorization.md) already ruled on this and chose **Option A, one
key moved deliberately**, explicitly because it is the only option that leaves the verifier at
four steps. Option D, device-bound entities, was considered and not taken.

So this is not a fresh objection — it is the existing decision still holding. Enclave support that
stayed inside Option A (one identity key, Enclave-held, moved by rotation) would not incur the
graph cost. Enclave support that drifted into per-device identities would reopen a question that
is closed.

---

## Enrollment: the friction question

### The flow itself is easy

1. New device: install, it generates an Enclave key, shows a QR (public key + nonce).
2. Old device: **Add a device** → camera → scan.
3. Old device signs an authorisation: *"author key A authorises device key B from seq N."*
4. New device receives it. Done.

Install, scan, confirm. Under a minute, no typing, nothing to understand. This is exactly how
Signal and WhatsApp link devices, and it is how passkeys move between ecosystems. **An average
person does this successfully today, repeatedly, without help.** I don't think the enrollment
ceremony is where the fear should sit.

### Where the friction actually is

**a) You must still have the old device.** This is the cliff. Enrollment requires an existing
authorised device to vouch. If the only laptop is dead, stolen, or in a drawer at an old job,
there is no enrollment — there is only the recovery phrase, and people lose recovery phrases at a
rate that should inform the whole design. Every "add a device" flow is easy; every "I have no
devices" flow is a support ticket or a loss.

The employment case is the sharp edge of this and it is worse than loss. When the employer owns
the laptop, the key is not gone — it is **held by someone else, entirely legitimately**, and they
can sign as the creator. See [`key-recovery.md`](./key-recovery.md) § *Custody domains*: the
answer is structural (the recovery key never enters the employer's custody, and work runs under a
work identity) rather than a ceremony anyone has to remember to perform on their last day.

**b) The mental model fights everything else in their life.** Email, photos, passwords and notes
all follow people between devices now. "Your signing key is on this Mac only" violates a
twenty-year-old expectation. The scan takes forty seconds; the confusion about *why a scan is
necessary at all* is the recurring cost, and it lands on whoever answers support mail.

**c) Multiple keys leak into what a reader sees.** A certificate that says "signed by three
different keys, two of them authorised by the first, one since revoked" is worse than one that
says "signed by the creator." We have been careful that certificates do not shape guilt or invite
interpretation. This hands readers something to interpret.

---

## What the Enclave actually buys

Worth stating plainly, because it is not nothing.

With a synced keychain, an attacker who compromises the Apple ID **and** obtains a device passcode
gets the key material, once, and can then sign anywhere forever. With an Enclave key, malware on
the machine can *use* the key while it is resident but can never *extract* it — evict the malware
and the capability is gone with it.

For a key that an agent uses continuously and unattended, "can use but cannot steal" is a
meaningful difference. A stolen provenance key lets someone forge revision history going forward,
which is precisely the thing this system exists to make hard.

That is a real argument. It is just not an argument that beats "most creators will never enroll a
second device successfully if the first one dies."

---

## Recommendation

**Ship the synced keychain as the default and do not build Enclave support now.**

- Zero enrollment, zero new mental model, zero verifier complexity. The key follows the creator
  the way everything else in their life does.
- The security delta is real but smaller than the delta between *a creator who still has their
  identity* and *one who lost it with a laptop*.
- **Deferring costs nothing.** The format version byte at offset 0 is the agility mechanism, and
  it is already there. Adding P-256 in a v2 leaf later costs the same as adding it today; there is
  no premium for waiting and no decision being foreclosed.

If Enclave support is ever built, it should be an **opt-in high-assurance mode** for people who
ask for it by name — not a default, and not something an average creator is routed into.

### The thing actually worth building next

Not the Enclave. **Recovery**, because that is where average people fail, and it fails the same
way whichever key store we pick:

- Confirm the synced keychain genuinely propagates, against a signed build on two devices on one
  Apple ID. Until that is measured, the whole "no enrollment needed" story is unverified — see
  `keystore.rs`, which deliberately reports `SyncRequested` rather than `Synced` for this reason.
- Make the recovery phrase survivable for someone who will not store it correctly. This is the
  real problem, and it is unsolved regardless of what happens with the Enclave.
