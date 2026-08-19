//! Tests for the agent's store.
//!
//! The load-bearing property is that anything the store produces verifies with
//! the minimum verifier — a store that writes leaves nobody can check is worse
//! than no store. So most of these end in `verify_inclusion` rather than in an
//! assertion about the store's own bookkeeping.

use daon_provenance_agent::{Error as StoreError, Signer, Store};
use daon_provenance_core::*;
use ed25519_dalek::{Signer as _, SigningKey};

/// In-memory signer. The keychain-backed one is platform code above this layer;
/// this exists so no test can read a private key from disk.
struct TestSigner {
    key: SigningKey,
    recovery: Hash,
}

impl TestSigner {
    fn new(seed: u8) -> Self {
        TestSigner {
            key: SigningKey::from_bytes(&[seed; 32]),
            recovery: [seed.wrapping_add(100); 32],
        }
    }
}

impl Signer for TestSigner {
    fn author_key(&self) -> Hash {
        self.key.verifying_key().to_bytes()
    }
    fn recovery_key(&self) -> Hash {
        self.recovery
    }
    fn sign(&self, leaf_id: &Hash) -> [u8; 64] {
        self.key.sign(leaf_id).to_bytes()
    }
}

fn obs(added: u64) -> Observation {
    Observation {
        tool_id: b"test/1.0".to_vec(),
        ingress: Ingress::KeystrokeStream,
        added,
        removed: 0,
        duration_ms: 1000,
        op_count: added,
    }
}

fn beacon() -> Beacon {
    Beacon {
        chain: BeaconChain::Bitcoin,
        height: 880_000,
        block_hash: [0xab; 32],
    }
}

fn store() -> (tempfile::TempDir, Store) {
    let dir = tempfile::tempdir().unwrap();
    let s = Store::open(dir.path()).unwrap();
    (dir, s)
}

#[test]
fn genesis_entity_id_is_its_own_leaf_id() {
    let (_d, s) = store();
    let signer = TestSigner::new(7);
    let (entity, stored) = s
        .append(None, b"hello", &[obs(5)], beacon(), &signer, 1_000)
        .unwrap();

    assert_eq!(
        entity,
        stored.leaf.leaf_id(),
        "entity id is content-addressed"
    );
    assert_eq!(stored.leaf.seq, 0);
    assert_eq!(stored.leaf.parent_head, [0u8; 32], "genesis sentinel");
}

#[test]
fn appended_leaves_chain_and_verify() {
    let (_d, s) = store();
    let signer = TestSigner::new(3);
    let (entity, _) = s
        .append(None, b"draft one", &[obs(9)], beacon(), &signer, 1)
        .unwrap();

    for i in 1..6u64 {
        let content = format!("draft {i}");
        let (_, stored) = s
            .append(
                Some(&entity),
                content.as_bytes(),
                &[obs(i)],
                beacon(),
                &signer,
                i as i64,
            )
            .unwrap();
        assert_eq!(stored.leaf.seq, i);
    }

    assert_eq!(s.len(&entity).unwrap(), 6);

    // Every leaf must prove against the current head.
    let head = s.head(&entity).unwrap();
    for seq in 0..6u64 {
        let (stored, proof) = s.proof(&entity, seq).unwrap();
        assert!(
            verify_inclusion(&stored.leaf.leaf_id(), &proof, &head),
            "leaf {seq} must prove under the head"
        );
    }
}

#[test]
fn a_leaf_recovers_byte_identically_from_disk() {
    let (_d, s) = store();
    let signer = TestSigner::new(11);
    let (entity, written) = s
        .append(None, b"content", &[obs(7)], beacon(), &signer, -5_000)
        .unwrap();

    let read = s.leaf(&entity, 0).unwrap();
    assert_eq!(
        read.leaf.encode(),
        written.leaf.encode(),
        "body round-trips"
    );
    assert_eq!(read.leaf.leaf_id(), written.leaf.leaf_id());
    assert_eq!(read.signature, written.signature);
    assert_eq!(
        read.leaf.local_time_ms, -5_000,
        "negative local_time survives: it is untrusted and must hold nonsense"
    );
}

#[test]
fn signatures_verify_against_the_committed_author_key() {
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};
    let (_d, s) = store();
    let signer = TestSigner::new(23);
    let (entity, _) = s
        .append(None, b"signed", &[obs(1)], beacon(), &signer, 1)
        .unwrap();

    let stored = s.leaf(&entity, 0).unwrap();
    let vk = VerifyingKey::from_bytes(&stored.leaf.author_key).unwrap();
    assert!(vk
        .verify(
            &stored.leaf.leaf_id(),
            &Signature::from_bytes(&stored.signature)
        )
        .is_ok());
}

/// Deduplication of *stored* segments. Storage is off by default now, so this
/// opens a store that keeps them -- the property still matters for a caller who
/// opts in.

#[test]
fn content_segments_are_deduplicated() {
    let dir = tempfile::tempdir().unwrap();
    let s = Store::open_keeping_content(dir.path()).unwrap();
    let big = vec![b'x'; SEGMENT_SIZE * 3];
    s.put_content(&big).unwrap();
    let count = |d: &std::path::Path| walkdir(d.join("blobs")).len();
    let after_first = count(dir.path());

    // Same content again: no new blobs.
    s.put_content(&big).unwrap();
    assert_eq!(
        count(dir.path()),
        after_first,
        "identical content adds nothing"
    );

    // Change only the final segment: exactly one new blob.
    let mut edited = big.clone();
    *edited.last_mut().unwrap() = b'y';
    s.put_content(&edited).unwrap();
    assert_eq!(
        count(dir.path()),
        after_first + 1,
        "editing one segment costs one segment, not a copy of the document"
    );
}

fn walkdir(p: std::path::PathBuf) -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&p) {
        for e in rd.flatten() {
            let path = e.path();
            if path.is_dir() {
                out.extend(walkdir(path));
            } else {
                out.push(path);
            }
        }
    }
    out
}

#[test]
fn content_commit_matches_the_core_crate() {
    let (_d, s) = store();
    let content = b"the store must not invent its own commitment";
    assert_eq!(
        s.put_content(content).unwrap(),
        content_commit(content),
        "the store commits exactly what the format says"
    );
}

#[test]
fn empty_entity_has_no_head() {
    let (_d, s) = store();
    let missing = [0x99u8; 32];
    assert!(matches!(s.head(&missing), Err(StoreError::EmptyEntity)));
    assert!(s.is_empty(&missing).unwrap());
}

#[test]
fn a_leaf_must_commit_to_at_least_one_observation() {
    let (_d, s) = store();
    let signer = TestSigner::new(1);
    assert!(matches!(
        s.append(None, b"x", &[], beacon(), &signer, 1),
        Err(StoreError::NoObservations)
    ));
}

#[test]
fn reopening_the_store_sees_prior_leaves() {
    let dir = tempfile::tempdir().unwrap();
    let signer = TestSigner::new(42);
    let entity = {
        let s = Store::open(dir.path()).unwrap();
        let (e, _) = s
            .append(None, b"first", &[obs(1)], beacon(), &signer, 1)
            .unwrap();
        s.append(Some(&e), b"second", &[obs(2)], beacon(), &signer, 2)
            .unwrap();
        e
    };

    let s = Store::open(dir.path()).unwrap();
    assert_eq!(
        s.len(&entity).unwrap(),
        2,
        "state is on disk, not in memory"
    );
    let head = s.head(&entity).unwrap();
    let (stored, proof) = s.proof(&entity, 1).unwrap();
    assert!(verify_inclusion(&stored.leaf.leaf_id(), &proof, &head));
}

#[test]
fn a_tampered_leaf_on_disk_fails_its_proof() {
    let dir = tempfile::tempdir().unwrap();
    let signer = TestSigner::new(5);
    let s = Store::open(dir.path()).unwrap();
    let (entity, _) = s
        .append(None, b"a", &[obs(1)], beacon(), &signer, 1)
        .unwrap();
    for i in 1..4u64 {
        s.append(Some(&entity), b"b", &[obs(i)], beacon(), &signer, i as i64)
            .unwrap();
    }
    let head = s.head(&entity).unwrap();
    let (before, proof) = s.proof(&entity, 1).unwrap();
    assert!(verify_inclusion(&before.leaf.leaf_id(), &proof, &head));

    // Flip one byte of a stored leaf body.
    let path = walkdir(dir.path().join("entities"))
        .into_iter()
        .find(|p| p.to_string_lossy().ends_with("00000000000000000001.leaf"))
        .expect("leaf 1 on disk");
    let mut bytes = std::fs::read(&path).unwrap();
    bytes[210] ^= 0x01; // one bit of local_time_ms
    std::fs::write(&path, &bytes).unwrap();

    let after = Store::open(dir.path()).unwrap().leaf(&entity, 1).unwrap();
    assert_ne!(after.leaf.leaf_id(), before.leaf.leaf_id());
    assert!(
        !verify_inclusion(&after.leaf.leaf_id(), &proof, &head),
        "a tampered leaf must not prove under the old head"
    );
}

/// Content is not written to disk unless asked for.
///
/// The segments were write-only: nothing reconstructed content from them,
/// because nothing recorded a revision's segment order. Meanwhile a fixed 1 KiB
/// boundary means an edit near the top of a document makes every later segment
/// new, so a revision pass cost a full copy of the manuscript each time.
#[test]
fn content_is_not_stored_by_default() {
    let (dir, s) = store();
    assert!(!s.keeps_content());

    let commit = s.put_content(&vec![b'a'; 8 * 1024]).unwrap();

    assert_eq!(
        commit,
        daon_provenance_core::content_commit(&vec![b'a'; 8 * 1024]),
        "the commitment is unchanged -- only the storage is gone"
    );
    assert!(
        !dir.path().join("blobs").exists(),
        "no blobs directory is even created"
    );
}

/// A chain stays cheap regardless of how much is written.
#[test]
fn a_long_chain_costs_only_its_leaves() {
    let (dir, s) = store();
    let signer = TestSigner::new(9);

    // Edits at the *top*, which is the pattern that defeats segment dedup.
    let mut text = vec![b'a'; 64 * 1024];
    let mut entity = None;
    for i in 0..50 {
        text.insert(0, b'x');
        let (e, _) = s
            .append(entity.as_ref(), &text, &[obs(5)], beacon(), &signer, i)
            .unwrap();
        entity = Some(e);
    }

    let bytes: u64 = walk(dir.path())
        .iter()
        .filter_map(|p| std::fs::metadata(p).ok())
        .map(|m| m.len())
        .sum();

    // 50 revisions of a 64 KB document. Storing segments would have cost
    // megabytes; leaves and signatures cost 282 bytes each.
    assert!(
        bytes < 32 * 1024,
        "50 revisions should cost well under 32 KB, cost {bytes} bytes"
    );
}

fn walk(p: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(p) {
        for e in rd.flatten() {
            let path = e.path();
            if path.is_dir() {
                out.extend(walk(&path));
            } else {
                out.push(path);
            }
        }
    }
    out
}
