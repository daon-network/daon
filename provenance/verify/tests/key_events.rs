//! Step 4 against key events: which key signs, and what happens without the parent.
//!
//! Gated on `signatures`, because that is the only feature under which step 4
//! exists at all. Steps 1-3 must keep working without it, so a build that skips
//! signature checking skips these too rather than failing to compile.
#![cfg(feature = "signatures")]

use daon_provenance_core::*;
use daon_provenance_verify::*;
use ed25519_dalek::{Signer, SigningKey};

fn key(seed: u8) -> SigningKey {
    SigningKey::from_bytes(&[seed; 32])
}

fn leaf(author: &SigningKey, recovery: &SigningKey, content: Hash, seq: u64) -> RevisionLeaf {
    RevisionLeaf {
        seq,
        parent_head: [0u8; 32],
        content_commit: content,
        meta_commit: [0x22; 32],
        beacon: Beacon {
            chain: BeaconChain::Bitcoin,
            height: 800_000,
            block_hash: [0x42; 32],
        },
        author_key: author.verifying_key().to_bytes(),
        recovery_key: recovery.verifying_key().to_bytes(),
        local_time_ms: 1_700_000_000_000,
    }
}

fn claim<'a>(
    leaf: &'a RevisionLeaf,
    parent: Option<&'a RevisionLeaf>,
    sig: Option<&'a [u8; 64]>,
) -> Claim<'a> {
    let head = merkle_root(&[leaf.leaf_id()]);
    Claim {
        leaf,
        proof: &[],
        head,
        attestation: WitnessAttestation {
            witnessed_head: head,
            witness_time_ms: 1_700_003_600_000,
        },
        signature: sig,
        parent,
    }
}

/// A rotation replaces the author key and is signed by the recovery key, which
/// is unchanged and therefore present in both leaves.
#[test]
fn a_rotation_verifies_against_the_recovery_key() {
    let (old_author, recovery, new_author) = (key(1), key(2), key(3));
    let parent = leaf(&old_author, &recovery, content_commit(b"work"), 0);
    let rotation = leaf(&new_author, &recovery, KEY_EVENT_SENTINEL, 1);

    let sig = recovery.sign(&rotation.leaf_id()).to_bytes();
    let v = verify(&claim(&rotation, Some(&parent), Some(&sig))).expect("verifies");
    assert!(v.author_signature_checked);
}

/// The author key must not be able to authorise replacing itself -- that is what
/// keeps a stolen author key from locking the creator out.
#[test]
fn a_rotation_signed_by_the_author_key_is_refused() {
    let (old_author, recovery, new_author) = (key(1), key(2), key(3));
    let parent = leaf(&old_author, &recovery, content_commit(b"work"), 0);
    let rotation = leaf(&new_author, &recovery, KEY_EVENT_SENTINEL, 1);

    let sig = old_author.sign(&rotation.leaf_id()).to_bytes();
    assert!(verify(&claim(&rotation, Some(&parent), Some(&sig))).is_err());
}

/// A recovery rotation replaces the recovery key and is signed by the author
/// key, inverting the direction.
#[test]
fn a_recovery_rotation_verifies_against_the_author_key() {
    let (author, old_recovery, new_recovery) = (key(1), key(2), key(4));
    let parent = leaf(&author, &old_recovery, content_commit(b"work"), 0);
    let event = leaf(&author, &new_recovery, KEY_EVENT_SENTINEL, 1);

    let sig = author.sign(&event.leaf_id()).to_bytes();
    let v = verify(&claim(&event, Some(&parent), Some(&sig))).expect("verifies");
    assert!(v.author_signature_checked);
}

#[test]
fn a_recovery_rotation_signed_by_the_recovery_key_is_refused() {
    let (author, old_recovery, new_recovery) = (key(1), key(2), key(4));
    let parent = leaf(&author, &old_recovery, content_commit(b"work"), 0);
    let event = leaf(&author, &new_recovery, KEY_EVENT_SENTINEL, 1);

    let sig = old_recovery.sign(&event.leaf_id()).to_bytes();
    assert!(verify(&claim(&event, Some(&parent), Some(&sig))).is_err());
}

/// A transfer replaces both keys, so the signing key exists only in the parent.
/// This is the case that makes the parent necessary rather than convenient.
#[test]
fn a_transfer_verifies_against_the_parents_author_key() {
    let (old_author, old_recovery) = (key(1), key(2));
    let (new_author, new_recovery) = (key(5), key(6));
    let parent = leaf(&old_author, &old_recovery, content_commit(b"work"), 0);
    let transfer = leaf(&new_author, &new_recovery, KEY_EVENT_SENTINEL, 1);

    let sig = old_author.sign(&transfer.leaf_id()).to_bytes();
    let v = verify(&claim(&transfer, Some(&parent), Some(&sig))).expect("verifies");
    assert!(v.author_signature_checked);

    // Neither key in the transfer leaf itself can check it.
    let wrong = new_author.sign(&transfer.leaf_id()).to_bytes();
    assert!(verify(&claim(&transfer, Some(&parent), Some(&wrong))).is_err());
}

/// Without the parent a verifier cannot tell which kind of key event this is,
/// so it reports the signature unchecked rather than guessing.
#[test]
fn without_the_parent_a_key_events_signature_is_reported_unchecked() {
    let (recovery, new_author) = (key(2), key(3));
    let rotation = leaf(&new_author, &recovery, KEY_EVENT_SENTINEL, 1);
    let sig = recovery.sign(&rotation.leaf_id()).to_bytes();

    let v = verify(&claim(&rotation, None, Some(&sig))).expect("still verifies steps 1-3");
    assert!(
        !v.author_signature_checked,
        "must not claim to have checked what it could not"
    );
    assert_eq!(v.existed_by_ms, 1_700_003_600_000, "time still established");
}

#[test]
fn a_key_event_changing_no_key_is_refused() {
    let (author, recovery) = (key(1), key(2));
    let parent = leaf(&author, &recovery, content_commit(b"work"), 0);
    let empty = leaf(&author, &recovery, KEY_EVENT_SENTINEL, 1);
    let sig = author.sign(&empty.leaf_id()).to_bytes();

    assert_eq!(
        verify(&claim(&empty, Some(&parent), Some(&sig))),
        Err(Failure::MalformedKeyEvent)
    );
}

/// A content revision is unaffected: it still verifies against its own author
/// key, with or without a parent supplied.
#[test]
fn content_revisions_are_unchanged() {
    let (author, recovery) = (key(1), key(2));
    let parent = leaf(&author, &recovery, content_commit(b"one"), 0);
    let child = leaf(&author, &recovery, content_commit(b"two"), 1);
    let sig = author.sign(&child.leaf_id()).to_bytes();

    assert!(
        verify(&claim(&child, None, Some(&sig)))
            .unwrap()
            .author_signature_checked
    );
    assert!(
        verify(&claim(&child, Some(&parent), Some(&sig)))
            .unwrap()
            .author_signature_checked
    );
}
