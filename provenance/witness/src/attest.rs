//! Turning an OpenTimestamps proof into something the verifier accepts.
//!
//! [`crate::ots`] can replay a proof and say "this path ends in a Bitcoin
//! attestation at height N, having computed digest D". That is not yet
//! evidence. Two things are still missing, and neither can be invented locally:
//!
//! 1. **What is actually in block N.** The attestation claims D is that block's
//!    merkle root. Believing it without checking would accept any proof at all.
//! 2. **When block N happened.** The witness time is the block's timestamp, and
//!    only a Bitcoin header carries it.
//!
//! Both come from a [`BlockSource`], which this crate does not implement. No
//! socket is opened here. An agent supplies a source backed by whatever it
//! trusts — a full node, an Electrum server, a header chain it has validated —
//! and that choice is deliberately the caller's, because it decides what the
//! whole proof rests on.

use alloc::vec::Vec;
use daon_provenance_core::Hash;

use crate::batch::BatchMembership;
use crate::ots::{Attestation, DetachedTimestamp, Error as OtsError};

/// The parts of a Bitcoin block header this needs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BlockHeader {
    /// The block's merkle root, as it appears in the header.
    pub merkle_root: [u8; 32],
    /// The header's `nTime`, in **seconds**.
    ///
    /// Bitcoin block times are not exact. A miner may set `nTime` ahead of real
    /// time, bounded by consensus to roughly two hours, and it need only exceed
    /// the median of the previous eleven blocks. So this is an *approximate
    /// upper bound* on when the data existed, which is exactly the claim the
    /// system makes -- and why nothing here should be presented as a precise
    /// moment.
    pub time_secs: u32,
}

/// Where block headers come from.
///
/// Implementations decide their own trust model. A verifier with a full node
/// answers from consensus; one with a header chain answers from proof-of-work;
/// one asking a remote API is trusting that API, and should say so to whoever
/// reads the result.
pub trait BlockSource {
    /// The header at `height`, or `None` if unknown or not yet reached.
    fn header(&self, height: u64) -> Option<BlockHeader>;
}

/// Why an attestation could not be established.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The proof did not parse or an operation could not be replayed.
    Ots(OtsError),
    /// The proof carries no Bitcoin attestation. Usually means it is still
    /// pending at a calendar and has not been upgraded -- see
    /// [`needs_upgrade`].
    NoBitcoinAttestation,
    /// The block source does not know this height.
    UnknownBlock { height: u64 },
    /// The proof's computed digest is not that block's merkle root.
    ///
    /// The proof is claiming something Bitcoin does not say.
    MerkleRootMismatch {
        height: u64,
        claimed: [u8; 32],
        actual: [u8; 32],
    },
    /// A batch membership does not lead to the timestamped root.
    NotInBatch,
}

impl From<OtsError> for Error {
    fn from(e: OtsError) -> Self {
        Error::Ots(e)
    }
}

/// An established Bitcoin anchor.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Anchor {
    /// The digest Bitcoin committed to.
    pub digest: Hash,
    /// The block it was committed in.
    pub height: u64,
    /// The block header's time, in milliseconds, for the verifier's
    /// `witness_time_ms`.
    pub time_ms: i64,
}

/// Whether this proof still needs upgrading before it proves anything.
///
/// A freshly submitted proof comes back **pending**: the calendar has the digest
/// but has not yet included it in a Bitcoin transaction. It is a receipt, not a
/// timestamp. The agent must come back later and replace it with the upgraded
/// proof, and until it does, the head is not witnessed.
///
/// This is the step most easily forgotten, because a pending proof is a
/// perfectly valid file that parses cleanly and looks finished.
pub fn needs_upgrade(proof: &DetachedTimestamp) -> Result<bool, Error> {
    let attestations = proof.attestations()?;
    let has_bitcoin = attestations
        .iter()
        .any(|(a, _)| matches!(a, Attestation::Bitcoin { .. }));
    Ok(!has_bitcoin)
}

/// Every calendar URI this proof is still waiting on.
pub fn pending_calendars(proof: &DetachedTimestamp) -> Result<Vec<Vec<u8>>, Error> {
    Ok(proof
        .attestations()?
        .into_iter()
        .filter_map(|(a, _)| match a {
            Attestation::Pending { uri } => Some(uri),
            _ => None,
        })
        .collect())
}

/// Establish the earliest Bitcoin anchor in a proof.
///
/// Every Bitcoin attestation is checked against the block source and the
/// **earliest surviving one wins**, because the claim is "this existed no later
/// than T" and a later anchor is a weaker version of the same fact.
///
/// An attestation whose digest does not match its block is not merely skipped —
/// it is reported. A proof that lies about one block should not quietly pass on
/// the strength of another.
pub fn establish<S: BlockSource>(proof: &DetachedTimestamp, source: &S) -> Result<Anchor, Error> {
    let mut best: Option<Anchor> = None;

    for (attestation, digest) in proof.attestations()? {
        let Attestation::Bitcoin { height } = attestation else {
            continue;
        };
        let header = source
            .header(height)
            .ok_or(Error::UnknownBlock { height })?;

        // OTS computes the merkle root in Bitcoin's internal byte order, which
        // is the reverse of how block explorers display it. Compare in the
        // internal order and let callers do their own presentation.
        let claimed: [u8; 32] = digest
            .as_slice()
            .try_into()
            .map_err(|_| Error::Ots(OtsError::DigestLength))?;

        if claimed != header.merkle_root {
            return Err(Error::MerkleRootMismatch {
                height,
                claimed,
                actual: header.merkle_root,
            });
        }

        let anchor = Anchor {
            digest: proof_digest(proof)?,
            height,
            time_ms: header.time_secs as i64 * 1000,
        };
        if best.is_none_or(|b| anchor.time_ms < b.time_ms) {
            best = Some(anchor);
        }
    }

    best.ok_or(Error::NoBitcoinAttestation)
}

fn proof_digest(proof: &DetachedTimestamp) -> Result<Hash, Error> {
    proof
        .digest
        .as_slice()
        .try_into()
        .map_err(|_| Error::Ots(OtsError::DigestLength))
}

/// Establish the anchor for a single head inside a batch.
///
/// The proof timestamps the batch **root**, not the head. This checks that the
/// head really is in that batch before returning the anchor, so a membership
/// belonging to some other batch cannot borrow this one's timestamp.
pub fn establish_for_head<S: BlockSource>(
    proof: &DetachedTimestamp,
    member: &BatchMembership,
    source: &S,
) -> Result<Anchor, Error> {
    let root = proof_digest(proof)?;
    if !daon_provenance_core::verify_inclusion(&member.head, &member.proof, &root) {
        return Err(Error::NotInBatch);
    }
    let anchor = establish(proof, source)?;
    Ok(Anchor {
        digest: member.head,
        ..anchor
    })
}
