//! Key events: the sentinel, and reading an event from what changed.

use daon_provenance_core::*;

fn leaf(author: u8, recovery: u8, content: Hash) -> RevisionLeaf {
    RevisionLeaf {
        seq: 1,
        parent_head: [0x11; 32],
        content_commit: content,
        meta_commit: [0x22; 32],
        beacon: Beacon {
            chain: BeaconChain::Bitcoin,
            height: 800_000,
            block_hash: [0x42; 32],
        },
        author_key: [author; 32],
        recovery_key: [recovery; 32],
        local_time_ms: 1_700_000_000_000,
    }
}

/// The sentinel must be unreachable by content, or a real revision could be
/// mistaken for a key change.
#[test]
fn no_content_produces_the_sentinel() {
    assert_ne!(content_commit(b""), KEY_EVENT_SENTINEL);
    assert_ne!(content_commit(b"a"), KEY_EVENT_SENTINEL);
    assert_ne!(content_commit(&[0u8; 4096]), KEY_EVENT_SENTINEL);
    assert_ne!(content_commit(&vec![0xff; 1024]), KEY_EVENT_SENTINEL);
}

#[test]
fn a_content_leaf_is_not_a_key_event() {
    let parent = leaf(0xaa, 0xbb, content_commit(b"draft one"));
    let child = leaf(0xaa, 0xbb, content_commit(b"draft two"));
    assert!(!child.is_key_event());
    assert_eq!(child.key_event(&parent), None);
}

#[test]
fn replacing_the_author_key_is_a_rotation() {
    let parent = leaf(0xaa, 0xbb, content_commit(b"work"));
    let child = leaf(0xcc, 0xbb, KEY_EVENT_SENTINEL);
    assert!(child.is_key_event());
    assert_eq!(child.key_event(&parent), Some(KeyEvent::Rotation));
    // Authorised by the key it is not replacing.
    assert_eq!(KeyEvent::Rotation.authorised_by(), AuthorisingKey::Recovery);
}

#[test]
fn replacing_the_recovery_key_is_a_recovery_rotation() {
    let parent = leaf(0xaa, 0xbb, content_commit(b"work"));
    let child = leaf(0xaa, 0xdd, KEY_EVENT_SENTINEL);
    assert_eq!(child.key_event(&parent), Some(KeyEvent::RecoveryRotation));
    assert_eq!(
        KeyEvent::RecoveryRotation.authorised_by(),
        AuthorisingKey::Author
    );
}

#[test]
fn replacing_both_is_a_transfer() {
    let parent = leaf(0xaa, 0xbb, content_commit(b"work"));
    let child = leaf(0xcc, 0xdd, KEY_EVENT_SENTINEL);
    assert_eq!(child.key_event(&parent), Some(KeyEvent::Transfer));
    assert_eq!(KeyEvent::Transfer.authorised_by(), AuthorisingKey::Author);
}

/// A key-event leaf that changes nothing commits to no content and announces no
/// change. wire-format.md calls it malformed.
#[test]
fn a_key_event_that_changes_no_key_is_malformed() {
    let parent = leaf(0xaa, 0xbb, content_commit(b"work"));
    let child = leaf(0xaa, 0xbb, KEY_EVENT_SENTINEL);
    assert!(child.is_key_event());
    assert_eq!(child.key_event(&parent), None, "must not classify");
}

/// Each key may replace the other; neither may replace itself. That invariant is
/// what makes counter-rotation possible, so it is asserted directly.
#[test]
fn neither_key_authorises_its_own_replacement() {
    assert_ne!(
        KeyEvent::Rotation.authorised_by(),
        AuthorisingKey::Author,
        "the author key must not authorise replacing itself"
    );
    assert_ne!(
        KeyEvent::RecoveryRotation.authorised_by(),
        AuthorisingKey::Recovery,
        "the recovery key must not authorise replacing itself"
    );
}

/// Key events encode into the same 218 bytes as any other leaf, which is what
/// lets a verifier that does not understand them still compute the head.
#[test]
fn a_key_event_leaf_is_an_ordinary_218_bytes() {
    let child = leaf(0xcc, 0xbb, KEY_EVENT_SENTINEL);
    assert_eq!(child.encode().len(), LEAF_BODY_LEN);
    let round_tripped = child.leaf_id();
    assert_eq!(round_tripped, child.leaf_id(), "hashing is stable");
}
