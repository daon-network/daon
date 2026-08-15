//! Establishing a Bitcoin anchor — the checks a forged proof has to get past.

use daon_provenance_witness::attest::{establish, establish_for_head, needs_upgrade, Error};
use daon_provenance_witness::batch::Batch;
use daon_provenance_witness::ots::{Attestation, DetachedTimestamp, Op, Timestamp};
use daon_provenance_witness::{BlockHeader, BlockSource};
use std::collections::HashMap;

/// A block source that knows exactly what it is told and nothing else.
#[derive(Default)]
struct Chain(HashMap<u64, BlockHeader>);

impl Chain {
    fn with(mut self, height: u64, merkle_root: [u8; 32], time_secs: u32) -> Self {
        self.0.insert(
            height,
            BlockHeader {
                merkle_root,
                time_secs,
            },
        );
        self
    }
}

impl BlockSource for Chain {
    fn header(&self, height: u64) -> Option<BlockHeader> {
        self.0.get(&height).copied()
    }
}

/// A proof that attests `digest` directly, with no intervening operations, so
/// the digest the path computes is the digest itself.
fn direct(digest: [u8; 32], height: u64) -> DetachedTimestamp {
    let mut p = DetachedTimestamp::new(digest);
    p.timestamp
        .attestations
        .push(Attestation::Bitcoin { height });
    p
}

#[test]
fn establishes_an_anchor_from_a_matching_block() {
    let d = [0xab; 32];
    let chain = Chain::default().with(800_000, d, 1_700_000_000);
    let anchor = establish(&direct(d, 800_000), &chain).expect("anchor");

    assert_eq!(anchor.height, 800_000);
    assert_eq!(anchor.digest, d);
    assert_eq!(anchor.time_ms, 1_700_000_000_000, "seconds to milliseconds");
}

/// The check that matters most: a proof claiming a digest Bitcoin does not have
/// must fail, not fall through to some other attestation.
#[test]
fn refuses_a_digest_the_block_does_not_commit_to() {
    let chain = Chain::default().with(800_000, [0x11; 32], 1_700_000_000);
    match establish(&direct([0xab; 32], 800_000), &chain) {
        Err(Error::MerkleRootMismatch { height, .. }) => assert_eq!(height, 800_000),
        other => panic!("expected a mismatch, got {other:?}"),
    }
}

#[test]
fn refuses_a_block_the_source_does_not_know() {
    let chain = Chain::default();
    assert_eq!(
        establish(&direct([0xab; 32], 999_999), &chain),
        Err(Error::UnknownBlock { height: 999_999 })
    );
}

/// A pending proof parses cleanly and looks finished. It proves nothing.
#[test]
fn a_pending_proof_is_not_an_anchor() {
    let mut p = DetachedTimestamp::new([0xcd; 32]);
    p.timestamp.attestations.push(Attestation::Pending {
        uri: b"https://a.pool.opentimestamps.org".to_vec(),
    });

    assert!(needs_upgrade(&p).unwrap(), "pending must need upgrading");
    assert_eq!(
        establish(&p, &Chain::default()),
        Err(Error::NoBitcoinAttestation)
    );
}

#[test]
fn a_bitcoin_proof_does_not_need_upgrading() {
    assert!(!needs_upgrade(&direct([1; 32], 5)).unwrap());
}

/// "Existed no later than T" means the earliest anchor is the strongest claim.
#[test]
fn the_earliest_anchor_wins() {
    let d = [0x77; 32];
    let mut p = DetachedTimestamp::new(d);
    p.timestamp
        .attestations
        .push(Attestation::Bitcoin { height: 800_000 });
    p.timestamp
        .attestations
        .push(Attestation::Bitcoin { height: 700_000 });

    let chain = Chain::default()
        .with(800_000, d, 1_700_000_000)
        .with(700_000, d, 1_600_000_000);

    let anchor = establish(&p, &chain).unwrap();
    assert_eq!(anchor.height, 700_000);
    assert_eq!(anchor.time_ms, 1_600_000_000_000);
}

/// One anchor, many heads: the proof timestamps the batch root, and each head
/// reaches it through its inclusion proof.
#[test]
fn a_batched_head_inherits_the_batch_anchor() {
    let mut batch = Batch::new();
    for i in 0..5u8 {
        batch.push([i; 32]);
    }
    let sealed = batch.seal().unwrap();

    let chain = Chain::default().with(810_000, sealed.root, 1_710_000_000);
    let proof = direct(sealed.root, 810_000);

    for member in &sealed.members {
        let anchor = establish_for_head(&proof, member, &chain).expect("anchor");
        assert_eq!(anchor.digest, member.head, "anchor names the head");
        assert_eq!(anchor.time_ms, 1_710_000_000_000);
    }
}

/// A membership from a different batch must not borrow this anchor.
#[test]
fn a_foreign_membership_is_refused() {
    let mut a = Batch::new();
    for i in 0..4u8 {
        a.push([i; 32]);
    }
    let mut b = Batch::new();
    for i in 20..24u8 {
        b.push([i; 32]);
    }
    let (sa, sb) = (a.seal().unwrap(), b.seal().unwrap());

    let chain = Chain::default().with(1, sa.root, 1_000);
    let proof = direct(sa.root, 1);

    assert_eq!(
        establish_for_head(&proof, &sb.members[0], &chain),
        Err(Error::NotInBatch)
    );
}

/// Operations must actually be replayed: the attested digest is what the path
/// computes, not the file digest.
#[test]
fn the_attested_digest_is_the_computed_one() {
    use sha2::{Digest, Sha256};

    let file = [0x5a; 32];
    let computed: [u8; 32] = Sha256::digest(file).into();

    let mut p = DetachedTimestamp::new(file);
    p.timestamp.ops.push((
        Op::Sha256,
        Timestamp {
            attestations: vec![Attestation::Bitcoin { height: 42 }],
            ops: vec![],
        },
    ));

    // The block commits to the *computed* digest, so this must verify...
    let good = Chain::default().with(42, computed, 1_650_000_000);
    assert!(establish(&p, &good).is_ok());

    // ...and committing to the raw file digest must not.
    let bad = Chain::default().with(42, file, 1_650_000_000);
    assert!(matches!(
        establish(&p, &bad),
        Err(Error::MerkleRootMismatch { .. })
    ));
}
