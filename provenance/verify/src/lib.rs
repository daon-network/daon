//! The four-step minimum verifier for DAON provenance claims.
//!
//! From `docs/design/provenance-data-model.md`, given `(leaf, inclusion_proof,
//! witness_receipt)`:
//!
//! 1. Recompute the leaf hash from disclosed fields.
//! 2. Walk `inclusion_proof` from leaf → `witnessed_head` — O(log n).
//! 3. Verify the witness attestation resolves to a Bitcoin block ≥ `witness_time`.
//! 4. *(optional)* Verify the author signature on the leaf.
//!
//! > One trusted anchor. One log-depth walk. Constant in leaf count. Multi-witness,
//! > consistency chains, selective-disclosure ZK and fork traversal are **later
//! > features, never part of this path.**
//!
//! That instruction is why this crate exists separately from anything that stores,
//! coalesces or witnesses. Keeping the verifier small is a design goal with teeth:
//! it is the thing a skeptic runs, and every dependency it grows is something they
//! have to trust or audit.
//!
//! # What this crate does not decide
//!
//! Step 3 takes an already-established [`WitnessAttestation`]. Parsing an
//! OpenTimestamps proof and resolving it against Bitcoin headers is a distinct
//! trust anchor with its own failure modes, and folding it in here would mean a
//! verifier that cannot run without a chain source. Separating them lets a
//! relying party choose how they establish Bitcoin state — their own node, a
//! header chain they already trust, or an OTS client — without this crate having
//! an opinion.
//!
//! **A caller that fabricates an attestation gets a meaningless answer.** That is
//! stated rather than defended against, because it cannot be defended against
//! here: the verifier's job is to check a claim against an anchor, not to decide
//! what anchors are real.

#![cfg_attr(not(feature = "std"), no_std)]
#![forbid(unsafe_code)]
#![deny(missing_docs)]

extern crate alloc;
use daon_provenance_core::{
    hash_tagged, tag, verify_inclusion, AuthorisingKey, Hash, ProofStep, RevisionLeaf,
};

/// An established statement that a head existed by a given time.
///
/// Existence and ordering only. A witness attests that these bytes existed by
/// this time — never anything about who made them, how, or whether the content
/// is any good.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WitnessAttestation {
    /// The head this attestation covers.
    pub witnessed_head: Hash,
    /// Unix milliseconds. The upper time bound for every leaf beneath the head.
    pub witness_time_ms: i64,
}

/// Why a claim did not verify.
///
/// Each variant names the step that failed, so a caller can report something
/// more useful than "invalid".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Failure {
    /// A key-event leaf in which neither key changed. It commits to no content
    /// and announces no change, so there is nothing it could mean.
    MalformedKeyEvent,
    /// Step 2: the inclusion proof does not fold to the witnessed head.
    NotInWitnessedHead,
    /// Step 3: the attestation covers a different head than the proof reaches.
    AttestationHeadMismatch,
    /// Step 3: the leaf claims a beacon later than the witness time, so the
    /// sandwich is inverted and no honest leaf could sit here.
    TimeBoundsInverted,
    /// Step 4: the signature does not verify under the leaf's `author_key`.
    #[cfg(feature = "signatures")]
    BadSignature,
    /// Step 4 was requested but the key is not a valid Ed25519 point.
    #[cfg(feature = "signatures")]
    MalformedAuthorKey,
    /// Step 4 was requested of a verifier built without signature support.
    #[cfg(not(feature = "signatures"))]
    SignaturesUnsupported,
}

/// What a successful verification establishes — and, as importantly, what it does not.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Verified {
    /// This leaf existed no later than here.
    pub existed_by_ms: i64,
    /// Whether step 4 ran. `false` means existence is proven but authorship is not
    /// — a distinction a caller must not flatten.
    pub author_signature_checked: bool,
}

/// A claim to be checked.
pub struct Claim<'a> {
    /// The leaf, with whatever fields the holder disclosed.
    pub leaf: &'a RevisionLeaf,
    /// Sibling hashes from the leaf to the witnessed head.
    pub proof: &'a [ProofStep],
    /// The head the proof should reach.
    pub head: Hash,
    /// An established witness statement about that head.
    pub attestation: WitnessAttestation,
    /// Ed25519 signature over the leaf id. `None` skips step 4.
    pub signature: Option<&'a [u8; 64]>,
    /// The leaf this one follows. Needed only to check a **key event's**
    /// signature.
    ///
    /// A key event is signed by whichever key it is not replacing, and for a
    /// transfer that key lives only in the parent. Leave it `None` for content
    /// revisions, where the signing key is the leaf's own `author_key`; leaving
    /// it `None` for a key event simply means the signature goes unchecked.
    pub parent: Option<&'a RevisionLeaf>,
}

/// Run the four steps.
///
/// Returns what was established, or the first step that failed. Steps run in
/// order and stop at the first failure, so the error names the earliest thing
/// wrong rather than an arbitrary one.
pub fn verify(claim: &Claim<'_>) -> Result<Verified, Failure> {
    // Step 1 — recompute the leaf hash from disclosed fields.
    let leaf_id = claim.leaf.leaf_id();

    // Step 2 — walk the proof to the witnessed head.
    if !verify_inclusion(&leaf_id, claim.proof, &claim.head) {
        return Err(Failure::NotInWitnessedHead);
    }

    // Step 3 — the attestation must be about the head we actually reached.
    if claim.attestation.witnessed_head != claim.head {
        return Err(Failure::AttestationHeadMismatch);
    }

    // The beacon's lower bound is checked by `beacon_lower_bound`, not here:
    // resolving a block height to a timestamp needs a chain source, and the
    // minimum verifier does not get to require one.
    let existed_by_ms = claim.attestation.witness_time_ms;

    // Step 4 — optional, and for key events it needs the parent leaf.
    //
    // A key event is signed by whichever key is *not* changing, so the signing
    // key is decided by comparing this leaf's keys against its parent's. From
    // the leaf alone a verifier can see that it *is* a key event and cannot
    // tell which kind -- and for a transfer both keys change, so the signing
    // key is not in this leaf at all. It is the parent's.
    //
    // Without the parent, the signature is reported unchecked rather than
    // guessed at. A verifier that cannot check something must say so; accepting
    // a signature from "either committed key" would be a weaker claim wearing
    // the same name.
    //
    // Note what this still does not do: it never asks whether the key change
    // was *legitimate*. That remains an audit question answered by walking the
    // chain, deliberately not a fifth step.
    let signing_key: Option<&Hash> = if claim.leaf.is_key_event() {
        match claim.parent {
            None => None,
            Some(parent) => match claim.leaf.key_event(parent) {
                None => return Err(Failure::MalformedKeyEvent),
                Some(event) => Some(match event.authorised_by() {
                    AuthorisingKey::Author => &parent.author_key,
                    AuthorisingKey::Recovery => &parent.recovery_key,
                }),
            },
        }
    } else {
        Some(&claim.leaf.author_key)
    };

    let author_signature_checked = match (claim.signature, signing_key) {
        (Some(sig), Some(key)) => {
            check_signature(key, &leaf_id, sig)?;
            true
        }
        _ => false,
    };

    Ok(Verified {
        existed_by_ms,
        author_signature_checked,
    })
}

/// Check the beacon sandwich once a caller has resolved the beacon block to a time.
///
/// Separate from [`verify`] because resolving a block height to a timestamp needs
/// a chain source, and the minimum verifier does not get to require one. A caller
/// that can resolve it should call this too; one that cannot still gets steps 1, 2
/// and 4.
pub fn beacon_lower_bound(
    beacon_time_ms: i64,
    attestation: &WitnessAttestation,
) -> Result<(), Failure> {
    if beacon_time_ms > attestation.witness_time_ms {
        return Err(Failure::TimeBoundsInverted);
    }
    Ok(())
}

#[cfg(feature = "signatures")]
fn check_signature(author_key: &Hash, leaf_id: &Hash, sig: &[u8; 64]) -> Result<(), Failure> {
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};
    let key = VerifyingKey::from_bytes(author_key).map_err(|_| Failure::MalformedAuthorKey)?;
    key.verify(leaf_id, &Signature::from_bytes(sig))
        .map_err(|_| Failure::BadSignature)
}

#[cfg(not(feature = "signatures"))]
fn check_signature(_: &Hash, _: &Hash, _: &[u8; 64]) -> Result<(), Failure> {
    // Fail closed. Returning Ok here would report author_signature_checked: true
    // having verified nothing at all -- a build without the feature would silently
    // accept any signature. A caller asking for step 4 in a verifier that cannot
    // perform step 4 must be told so.
    Err(Failure::SignaturesUnsupported)
}

/// Prove one content segment against a leaf's `content_commit`.
///
/// This is a **creator-initiated** disclosure. DAON issues no endpoint taking a
/// segment index and no certificate rendering one; a holder produces this from
/// content only they possess and hands it to whoever they choose.
///
/// Callers must not treat a missing segment proof as meaningful. Declining to
/// disclose is the default, not an admission.
pub fn verify_segment(segment_bytes: &[u8], proof: &[ProofStep], content_commit: &Hash) -> bool {
    let leaf = hash_tagged(tag::CONTENT, segment_bytes);
    verify_inclusion(&leaf, proof, content_commit)
}
