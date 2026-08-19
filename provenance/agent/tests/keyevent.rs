//! Rotation, recovery rotation and transfer, end to end through the store.

use daon_provenance_agent::keyevent::EventSigner;
use daon_provenance_agent::{Error, Signer, Store};
use daon_provenance_core::*;
use ed25519_dalek::{Signer as _, SigningKey};
use tempfile::TempDir;

fn sk(seed: u8) -> SigningKey {
    SigningKey::from_bytes(&[seed; 32])
}
fn pk(k: &SigningKey) -> Hash {
    k.verifying_key().to_bytes()
}

/// The agent's long-lived identity.
struct Ident {
    author: SigningKey,
    recovery: Hash,
}
impl Signer for Ident {
    fn author_key(&self) -> Hash {
        pk(&self.author)
    }
    fn recovery_key(&self) -> Hash {
        self.recovery
    }
    fn sign(&self, leaf_id: &Hash) -> [u8; 64] {
        self.author.sign(leaf_id).to_bytes()
    }
}

/// A secret handed over for one key event.
struct OneShot(SigningKey);
impl EventSigner for OneShot {
    fn public_key(&self) -> Hash {
        pk(&self.0)
    }
    fn sign(&self, leaf_id: &Hash) -> [u8; 64] {
        self.0.sign(leaf_id).to_bytes()
    }
}

fn beacon() -> Beacon {
    Beacon {
        chain: BeaconChain::Bitcoin,
        height: 800_000,
        block_hash: [0x42; 32],
    }
}

fn observation() -> Observation {
    Observation {
        tool_id: b"test".to_vec(),
        ingress: Ingress::KeystrokeStream,
        added: 10,
        removed: 0,
        duration_ms: 100,
        op_count: 5,
    }
}

/// A store with one entity holding a single content leaf.
fn started(author: &SigningKey, recovery: Hash) -> (TempDir, Store, Hash) {
    let dir = TempDir::new().unwrap();
    let store = Store::open(dir.path()).unwrap();
    let ident = Ident {
        author: author.clone(),
        recovery,
    };
    let (entity, _) = store
        .append(
            None,
            b"the manuscript",
            &[observation()],
            beacon(),
            &ident,
            1_000,
        )
        .unwrap();
    (dir, store, entity)
}

#[test]
fn a_rotation_replaces_the_author_key_and_keeps_the_recovery_key() {
    let (old_author, recovery, new_author) = (sk(1), sk(2), sk(3));
    let (_d, store, entity) = started(&old_author, pk(&recovery));

    let stored = store
        .rotate_author_key(
            &entity,
            pk(&new_author),
            &OneShot(recovery.clone()),
            beacon(),
            2_000,
        )
        .expect("rotates");

    assert!(stored.leaf.is_key_event());
    assert_eq!(stored.leaf.author_key, pk(&new_author));
    assert_eq!(
        stored.leaf.recovery_key,
        pk(&recovery),
        "the recovery key must survive, or counter-rotation has nothing to act with"
    );

    let parent = store.leaf(&entity, 0).unwrap().leaf;
    assert_eq!(stored.leaf.key_event(&parent), Some(KeyEvent::Rotation));
}

/// The author key must not be able to replace itself.
#[test]
fn a_rotation_signed_by_the_author_key_is_refused() {
    let (old_author, recovery, new_author) = (sk(1), sk(2), sk(3));
    let (_d, store, entity) = started(&old_author, pk(&recovery));

    let e = store
        .rotate_author_key(
            &entity,
            pk(&new_author),
            &OneShot(old_author.clone()),
            beacon(),
            2_000,
        )
        .unwrap_err();
    assert!(matches!(e, Error::WrongAuthorisingKey));
    assert_eq!(store.len(&entity).unwrap(), 1, "nothing was written");
}

#[test]
fn a_recovery_rotation_replaces_only_the_recovery_key() {
    let (author, old_recovery, new_recovery) = (sk(1), sk(2), sk(4));
    let (_d, store, entity) = started(&author, pk(&old_recovery));

    let stored = store
        .rotate_recovery_key(
            &entity,
            pk(&new_recovery),
            &OneShot(author.clone()),
            beacon(),
            2_000,
        )
        .expect("rotates");

    assert_eq!(stored.leaf.author_key, pk(&author));
    assert_eq!(stored.leaf.recovery_key, pk(&new_recovery));

    let parent = store.leaf(&entity, 0).unwrap().leaf;
    assert_eq!(
        stored.leaf.key_event(&parent),
        Some(KeyEvent::RecoveryRotation)
    );
}

#[test]
fn a_transfer_replaces_both_keys() {
    let (old_author, old_recovery) = (sk(1), sk(2));
    let (new_author, new_recovery) = (sk(5), sk(6));
    let (_d, store, entity) = started(&old_author, pk(&old_recovery));

    let stored = store
        .transfer(
            &entity,
            pk(&new_author),
            pk(&new_recovery),
            &OneShot(old_author.clone()),
            beacon(),
            2_000,
        )
        .expect("transfers");

    assert_eq!(stored.leaf.author_key, pk(&new_author));
    assert_eq!(
        stored.leaf.recovery_key,
        pk(&new_recovery),
        "carrying the seller's recovery key forward would let them take it back"
    );

    let parent = store.leaf(&entity, 0).unwrap().leaf;
    assert_eq!(stored.leaf.key_event(&parent), Some(KeyEvent::Transfer));
}

/// A transfer that kept either key would leave the outgoing owner a way back.
#[test]
fn a_transfer_must_replace_both_keys() {
    let (old_author, old_recovery, new_author) = (sk(1), sk(2), sk(5));
    let (_d, store, entity) = started(&old_author, pk(&old_recovery));

    let e = store
        .transfer(
            &entity,
            pk(&new_author),
            pk(&old_recovery), // recovery carried forward
            &OneShot(old_author.clone()),
            beacon(),
            2_000,
        )
        .unwrap_err();
    assert!(matches!(e, Error::KeyUnchanged));
}

#[test]
fn a_key_event_that_changes_nothing_is_refused() {
    let (author, recovery) = (sk(1), sk(2));
    let (_d, store, entity) = started(&author, pk(&recovery));

    let e = store
        .rotate_author_key(
            &entity,
            pk(&author),
            &OneShot(recovery.clone()),
            beacon(),
            2_000,
        )
        .unwrap_err();
    assert!(matches!(e, Error::KeyUnchanged));
}

/// Rotation is append-only. A hostile rotation is answered by rotating again,
/// with the same recovery key, and both stay in the chain.
#[test]
fn a_hostile_rotation_can_be_answered_by_counter_rotating() {
    let (creator, recovery, thief, recovered) = (sk(1), sk(2), sk(9), sk(3));
    let (_d, store, entity) = started(&creator, pk(&recovery));

    // The thief holds the recovery secret and rotates the chain to themselves.
    store
        .rotate_author_key(
            &entity,
            pk(&thief),
            &OneShot(recovery.clone()),
            beacon(),
            2_000,
        )
        .expect("hostile rotation succeeds -- detection, not prevention");

    // The creator still holds the same recovery key, so they answer.
    let answer = store
        .rotate_author_key(
            &entity,
            pk(&recovered),
            &OneShot(recovery.clone()),
            beacon(),
            3_000,
        )
        .expect("counter-rotation");

    assert_eq!(answer.leaf.author_key, pk(&recovered));
    assert_eq!(store.len(&entity).unwrap(), 3, "both rotations are kept");
    assert_eq!(
        store.leaf(&entity, 1).unwrap().leaf.author_key,
        pk(&thief),
        "the hostile rotation is not erased, only superseded"
    );
}

/// Key events extend the same Merkle log, so the head moves and earlier leaves
/// keep proving into it.
#[test]
fn key_events_extend_the_log_like_any_leaf() {
    let (author, recovery, new_author) = (sk(1), sk(2), sk(3));
    let (_d, store, entity) = started(&author, pk(&recovery));

    let before = store.head(&entity).unwrap();
    store
        .rotate_author_key(
            &entity,
            pk(&new_author),
            &OneShot(recovery.clone()),
            beacon(),
            2_000,
        )
        .unwrap();
    let after = store.head(&entity).unwrap();
    assert_ne!(before, after, "the head must move");

    let (stored, proof) = store.proof(&entity, 0).unwrap();
    assert!(
        verify_inclusion(&stored.leaf.leaf_id(), &proof, &after),
        "the original leaf still proves into the new head"
    );
}

#[test]
fn a_key_event_needs_an_entity_that_exists() {
    let dir = TempDir::new().unwrap();
    let store = Store::open(dir.path()).unwrap();
    let e = store
        .rotate_author_key(&[0xff; 32], pk(&sk(3)), &OneShot(sk(2)), beacon(), 1)
        .unwrap_err();
    assert!(matches!(e, Error::EmptyEntity));
}
