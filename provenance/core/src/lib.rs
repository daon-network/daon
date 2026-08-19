//! Leaf encoding, Merkle log and inclusion proofs for DAON provenance versioning.
//!
//! This is an implementation of [`docs/design/wire-format.md`]. That document is
//! normative; where this code and the spec disagree, the spec is right and this is
//! a bug. The test vectors in `tests/vectors.rs` are lifted from spec §9 and are
//! the acceptance criterion — they also match `scripts/provenance/wire_ref.py`,
//! so the two implementations are checked against each other rather than each
//! being checked against itself.
//!
//! Deliberately absent from this crate:
//!
//! - **Witnessing.** Nothing here talks to OpenTimestamps or opens a socket. A
//!   library that could witness would let every consumer bypass the agent's rate
//!   limits, which are the only thing protecting a shared public good.
//! - **Key handling.** No signing, no key storage. Signature *verification* is
//!   optional step 4 of the verifier and will live behind its own feature.
//! - **I/O of any kind.** Everything is a pure function of its inputs, so the
//!   verifier can be compiled to WASM and audited without a sandbox.

#![cfg_attr(not(feature = "std"), no_std)]
#![forbid(unsafe_code)]
#![deny(missing_docs)]

extern crate alloc;
use alloc::vec::Vec;
use sha2::{Digest, Sha256};

/// A 32-byte SHA-256 output.
pub type Hash = [u8; 32];

/// Domain separation tags. Distinct prefixes stop a leaf preimage from ever being
/// reinterpretable as an internal node — the second-preimage attack RFC 6962
/// exists to prevent. `0x00`/`0x01` match Certificate Transparency.
pub mod tag {
    /// Revision leaf, and Merkle leaf input.
    pub const LEAF: u8 = 0x00;
    /// Internal Merkle node.
    pub const NODE: u8 = 0x01;
    /// Observation.
    pub const OBSERVATION: u8 = 0x02;
    /// Content segment.
    pub const CONTENT: u8 = 0x03;
}

/// Wire format version, carried in the first byte of every hashed structure.
pub const FORMAT_VERSION: u8 = 0x01;

/// Content is committed as a Merkle root over segments of this size.
pub const SEGMENT_SIZE: usize = 1024;

/// Fixed size of an encoded leaf body. Asserted by the tests, not merely assumed.
pub const LEAF_BODY_LEN: usize = 218;

fn sha256(parts: &[&[u8]]) -> Hash {
    let mut h = Sha256::new();
    for p in parts {
        h.update(p);
    }
    h.finalize().into()
}

/// How the tool observed content arriving. Records **mechanism**, never an
/// inference about origin.
///
/// There is deliberately no variant for content source, and no extension
/// mechanism that could carry one: a tool cannot know whether text came from a
/// person, a notes app or a model, and a field claiming otherwise is a lie or a
/// guess. `Unknown` is a valid and honest answer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Ingress {
    /// The tool genuinely cannot tell. Always available, never a failure.
    Unknown = 0,
    /// Characters arrived as individual input events.
    KeystrokeStream = 1,
    /// A clipboard or drop insertion occurred.
    Paste = 2,
    /// Content was loaded from a file or external document.
    Import = 3,
    /// The buffer was modified by the tool or an extension, not the user.
    Programmatic = 4,
}

/// What a tool saw while a revision was authored.
///
/// `authoritative` from the data model is not represented at all. It is a
/// structural constant — always false — and giving it a field would imply it
/// could be otherwise.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Observation {
    /// Identifier of the observing tool. ASCII, at most 64 bytes.
    pub tool_id: Vec<u8>,
    /// How the content arrived.
    pub ingress: Ingress,
    /// Bytes added in this observation.
    pub added: u64,
    /// Bytes removed in this observation.
    pub removed: u64,
    /// Wall-clock span this observation covers.
    pub duration_ms: u64,
    /// Number of editing operations observed.
    pub op_count: u64,
}

/// Something that cannot be encoded because it violates the format.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// `tool_id` exceeded 64 bytes.
    ToolIdTooLong(usize),
    /// `tool_id` contained a non-ASCII byte. The format forbids it so that no
    /// Unicode normalisation question can arise in hashed data.
    ToolIdNotAscii,
    /// A leaf must commit to at least one observation.
    NoObservations,
}

impl Observation {
    /// Canonical encoding. Variable length, so only its hash enters a leaf.
    pub fn encode(&self) -> Result<Vec<u8>, Error> {
        if self.tool_id.len() > 64 {
            return Err(Error::ToolIdTooLong(self.tool_id.len()));
        }
        if !self.tool_id.is_ascii() {
            return Err(Error::ToolIdNotAscii);
        }
        let mut out = Vec::with_capacity(29 + self.tool_id.len());
        out.push(FORMAT_VERSION);
        out.extend_from_slice(&(self.tool_id.len() as u16).to_be_bytes());
        out.extend_from_slice(&self.tool_id);
        out.push(self.ingress as u8);
        for v in [self.added, self.removed, self.duration_ms, self.op_count] {
            out.extend_from_slice(&v.to_be_bytes());
        }
        Ok(out)
    }

    /// This observation's Merkle leaf hash.
    pub fn leaf_hash(&self) -> Result<Hash, Error> {
        Ok(sha256(&[&[tag::OBSERVATION], &self.encode()?]))
    }
}

/// Commitment over a window's observations.
///
/// A coalescing window routinely holds several observations with different
/// ingress values. Averaging them would destroy exactly the distinction worth
/// recording, so this is a Merkle root over the sequence. With one observation
/// the root is that observation's leaf hash, so the common case is unchanged.
pub fn meta_commit(observations: &[Observation]) -> Result<Hash, Error> {
    if observations.is_empty() {
        return Err(Error::NoObservations);
    }
    let leaves = observations
        .iter()
        .map(|o| o.leaf_hash())
        .collect::<Result<Vec<_>, _>>()?;
    Ok(merkle_root(&leaves))
}

/// Split content into fixed-size segments. The last may be short; empty content
/// is a single empty segment.
///
/// Fixed size deliberately: content-defined chunking is a rolling hash, which is
/// exactly the unspecified-algorithm trap this format exists to avoid.
pub fn segments(content: &[u8]) -> Vec<&[u8]> {
    if content.is_empty() {
        return alloc::vec![&content[..0]];
    }
    content.chunks(SEGMENT_SIZE).collect()
}

/// Commitment over content bytes.
///
/// Not a delta. An adjudicator holding the content must reproduce this in an
/// arbitrary language years later, and a delta would make that depend on a diff
/// algorithm. Segmented rather than flat so a creator can prove one passage
/// instead of revealing a whole revision to answer one question — content under
/// [`SEGMENT_SIZE`] is a single segment, so small documents behave exactly as a
/// flat content hash would.
pub fn content_commit(content: &[u8]) -> Hash {
    let leaves: Vec<Hash> = segments(content)
        .iter()
        .map(|s| sha256(&[&[tag::CONTENT], s]))
        .collect();
    merkle_root(&leaves)
}

/// Which chain a beacon value came from. An enum, so adding a source is a format
/// change rather than a vendor's option.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum BeaconChain {
    /// Bitcoin. The MVP witness anchor.
    Bitcoin = 1,
    /// The DAON chain. Unused until P2 multi-witness work.
    Daon = 2,
}

/// A recent public unpredictable value, giving a free per-leaf lower time bound.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Beacon {
    /// Source chain.
    pub chain: BeaconChain,
    /// Block height.
    pub height: u64,
    /// Block hash.
    pub block_hash: Hash,
}

/// One revision. The unit of everything DAON stores, proves and certifies.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RevisionLeaf {
    /// Monotonic; 0 is genesis.
    pub seq: u64,
    /// Head this revision extended. All zeroes for genesis — a sentinel, so the
    /// encoding stays fixed-length with no optional fields.
    pub parent_head: Hash,
    /// See [`content_commit`].
    pub content_commit: Hash,
    /// See [`meta_commit`].
    pub meta_commit: Hash,
    /// Lower time bound source.
    pub beacon: Beacon,
    /// Ed25519 public key of the author.
    pub author_key: Hash,
    /// Ed25519 public key able to continue this entity if the author key is lost.
    /// All zeroes means the entity is unrecoverable.
    pub recovery_key: Hash,
    /// Creator-asserted, **untrusted**. Signed rather than unsigned because it
    /// must be able to hold nonsense — including values before the epoch —
    /// without the encoder rejecting it or wrapping it into a different number.
    /// Real bounds come from the beacon and the witness.
    pub local_time_ms: i64,
}

impl RevisionLeaf {
    /// Canonical encoding. Always [`LEAF_BODY_LEN`] bytes.
    pub fn encode(&self) -> [u8; LEAF_BODY_LEN] {
        let mut out = [0u8; LEAF_BODY_LEN];
        let mut n = 0;
        let put = |src: &[u8], out: &mut [u8; LEAF_BODY_LEN], n: &mut usize| {
            out[*n..*n + src.len()].copy_from_slice(src);
            *n += src.len();
        };
        put(&[FORMAT_VERSION], &mut out, &mut n);
        put(&self.seq.to_be_bytes(), &mut out, &mut n);
        put(&self.parent_head, &mut out, &mut n);
        put(&self.content_commit, &mut out, &mut n);
        put(&self.meta_commit, &mut out, &mut n);
        put(&[self.beacon.chain as u8], &mut out, &mut n);
        put(&self.beacon.height.to_be_bytes(), &mut out, &mut n);
        put(&self.beacon.block_hash, &mut out, &mut n);
        put(&self.author_key, &mut out, &mut n);
        put(&self.recovery_key, &mut out, &mut n);
        put(&self.local_time_ms.to_be_bytes(), &mut out, &mut n);
        debug_assert_eq!(n, LEAF_BODY_LEN);
        out
    }

    /// This leaf's identity.
    ///
    /// The signature is **not** part of this. A leaf's identity is a property of
    /// its content, not of who signed it, so re-signing cannot change what a leaf
    /// is — and verifier steps 1–3 work on an unsigned leaf, keeping signature
    /// checking optional.
    pub fn leaf_id(&self) -> Hash {
        sha256(&[&[tag::LEAF], &self.encode()])
    }
}

/// Hash bytes under a domain separation tag: `SHA256(tag || bytes)`.
///
/// Exposed so downstream crates can recompute a tagged hash — a content segment,
/// say — without taking a direct dependency on a hash implementation. Keeping the
/// verifier's dependency surface small is a design goal, not an accident.
pub fn hash_tagged(tag: u8, bytes: &[u8]) -> Hash {
    sha256(&[&[tag], bytes])
}

/// Hash arbitrary bytes as a Merkle leaf: `SHA256(0x00 || bytes)`.
///
/// Callers building a log of revisions want [`RevisionLeaf::leaf_id`]; this is
/// for hashing into a tree directly, and is what the spec's §9.4 vectors use so
/// they exercise the tree rather than the leaf encoder.
pub fn merkle_leaf(bytes: &[u8]) -> Hash {
    sha256(&[&[tag::LEAF], bytes])
}

/// Hash of an internal Merkle node.
pub fn node(left: &Hash, right: &Hash) -> Hash {
    sha256(&[&[tag::NODE], left, right])
}

/// Merkle root, RFC 6962 subtree split.
///
/// Splits at the largest power of two strictly less than `n`. **Not** last-node
/// duplication: duplicating an odd trailing node lets two different leaf
/// sequences produce the same root (CVE-2012-2459), and a root ambiguous about
/// its leaves is disqualifying for a structure whose purpose is proving which
/// revisions existed.
pub fn merkle_root(leaves: &[Hash]) -> Hash {
    match leaves.len() {
        0 => sha256(&[]),
        1 => leaves[0],
        n => {
            let mut k = 1;
            while k * 2 < n {
                k *= 2;
            }
            node(&merkle_root(&leaves[..k]), &merkle_root(&leaves[k..]))
        }
    }
}

/// Which side a sibling sits on when folding an inclusion proof.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    /// Sibling is to the left; fold as `node(sibling, acc)`.
    Left,
    /// Sibling is to the right; fold as `node(acc, sibling)`.
    Right,
}

/// One step of an inclusion proof.
pub type ProofStep = (Side, Hash);

/// Sibling hashes proving `leaves[index]` is under the root of `leaves`.
pub fn inclusion_proof(leaves: &[Hash], index: usize) -> Vec<ProofStep> {
    let n = leaves.len();
    if n <= 1 {
        return Vec::new();
    }
    let mut k = 1;
    while k * 2 < n {
        k *= 2;
    }
    if index < k {
        let mut p = inclusion_proof(&leaves[..k], index);
        p.push((Side::Right, merkle_root(&leaves[k..])));
        p
    } else {
        let mut p = inclusion_proof(&leaves[k..], index - k);
        p.push((Side::Left, merkle_root(&leaves[..k])));
        p
    }
}

/// Fold a proof and compare against an expected root.
///
/// This is step 2 of the four-step minimum verifier: O(log n), constant in leaf
/// count, one trusted anchor.
pub fn verify_inclusion(leaf: &Hash, proof: &[ProofStep], root: &Hash) -> bool {
    let mut acc = *leaf;
    for (side, sib) in proof {
        acc = match side {
            Side::Right => node(&acc, sib),
            Side::Left => node(sib, &acc),
        };
    }
    acc == *root
}

// ── Key events ────────────────────────────────────────────────────────────

/// `content_commit` value marking a leaf as a key change rather than a content
/// revision.
///
/// Unreachable by any content: empty content commits to
/// `084fed08b978af4d…`, and producing all-zero another way needs a SHA-256
/// preimage. Genesis uses the same device for `parent_head`.
pub const KEY_EVENT_SENTINEL: Hash = [0u8; 32];

/// What a key-event leaf records.
///
/// Not encoded anywhere — read from which key fields changed against the parent
/// leaf. See `wire-format.md` §6 and `key-recovery.md`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyEvent {
    /// The author key was lost or compromised and has been replaced.
    /// Authorised by the **previous** `recovery_key`.
    Rotation,
    /// The recovery key has been replaced. Authorised by the **previous**
    /// `author_key`, and takes effect only after the delay in
    /// `key-recovery.md`.
    RecoveryRotation,
    /// The entity changed hands. Both keys are replaced, authorised by the
    /// **previous** `author_key`.
    Transfer,
}

impl KeyEvent {
    /// Which key authorises this event.
    ///
    /// The inverse of the rule that each key may replace the other and neither
    /// may replace itself: whichever key is *not* changing is the one that
    /// signs.
    pub fn authorised_by(self) -> AuthorisingKey {
        match self {
            KeyEvent::Rotation => AuthorisingKey::Recovery,
            KeyEvent::RecoveryRotation | KeyEvent::Transfer => AuthorisingKey::Author,
        }
    }
}

/// Which of the parent leaf's keys a key event's signature verifies against.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthorisingKey {
    /// The parent leaf's `author_key`.
    Author,
    /// The parent leaf's `recovery_key`.
    Recovery,
}

impl RevisionLeaf {
    /// Whether this leaf records a key change rather than a content revision.
    pub fn is_key_event(&self) -> bool {
        self.content_commit == KEY_EVENT_SENTINEL
    }

    /// Classify a key-event leaf against the leaf it follows.
    ///
    /// Returns `None` if this is not a key-event leaf, or if it is one in which
    /// neither key changed — which `wire-format.md` calls malformed, since such
    /// a leaf commits to no content and announces no change.
    pub fn key_event(&self, parent: &RevisionLeaf) -> Option<KeyEvent> {
        if !self.is_key_event() {
            return None;
        }
        let author_changed = self.author_key != parent.author_key;
        let recovery_changed = self.recovery_key != parent.recovery_key;
        Some(match (author_changed, recovery_changed) {
            (true, false) => KeyEvent::Rotation,
            (false, true) => KeyEvent::RecoveryRotation,
            (true, true) => KeyEvent::Transfer,
            (false, false) => return None,
        })
    }
}
