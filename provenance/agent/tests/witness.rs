//! Witness state, and the end-to-end path from a local leaf to a checkable claim.

use daon_provenance_agent::witness::WitnessLog;
use daon_provenance_witness::batch::BatchPolicy;
use tempfile::TempDir;

fn head(b: u8) -> [u8; 32] {
    [b; 32]
}

fn log() -> (TempDir, WitnessLog) {
    let dir = TempDir::new().unwrap();
    let log = WitnessLog::open(dir.path()).unwrap();
    (dir, log)
}

#[test]
fn queued_heads_come_back_oldest_first() {
    let (_d, log) = log();
    log.queue(&head(3), 300).unwrap();
    log.queue(&head(1), 100).unwrap();
    log.queue(&head(2), 200).unwrap();

    let pending = log.pending().unwrap();
    assert_eq!(
        pending.iter().map(|p| p.queued_ms).collect::<Vec<_>>(),
        vec![100, 200, 300]
    );
}

/// Re-queuing must not refresh the timestamp. An agent that re-scans its log on
/// every start would otherwise keep pushing the deadline back and never anchor.
#[test]
fn requeuing_keeps_the_original_timestamp() {
    let (_d, log) = log();
    log.queue(&head(1), 100).unwrap();
    log.queue(&head(1), 999_999).unwrap();

    let pending = log.pending().unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].queued_ms, 100);
}

#[test]
fn sealing_covers_everything_pending() {
    let (_d, log) = log();
    for i in 0..6u8 {
        log.queue(&head(i), i as i64).unwrap();
    }
    let sealed = log.seal().unwrap().expect("sealed");
    assert_eq!(sealed.members.len(), 6);
    for m in &sealed.members {
        assert!(sealed.verify_member(m));
    }
}

#[test]
fn nothing_pending_seals_to_nothing() {
    let (_d, log) = log();
    assert!(log.seal().unwrap().is_none());
}

/// A head stays pending until its proof is actually anchored. Submission alone
/// is not resolution -- a request can be lost or sit pending forever.
#[test]
fn recording_a_submission_does_not_resolve_the_heads() {
    let (_d, log) = log();
    log.queue(&head(1), 10).unwrap();
    let sealed = log.seal().unwrap().unwrap();

    log.record(&sealed, b"pretend .ots bytes", 1_000).unwrap();
    assert_eq!(log.pending().unwrap().len(), 1, "still pending");

    log.resolve(&head(1)).unwrap();
    assert!(log.pending().unwrap().is_empty());
}

#[test]
fn memberships_survive_a_round_trip_to_disk() {
    let (_d, log) = log();
    for i in 0..7u8 {
        log.queue(&head(i), i as i64).unwrap();
    }
    let sealed = log.seal().unwrap().unwrap();
    log.record(&sealed, b"ots", 1).unwrap();

    let loaded = log.members(&sealed.root).unwrap();
    assert_eq!(loaded, sealed.members);
    for m in &loaded {
        assert!(sealed.verify_member(m), "proof survived serialization");
    }
}

#[test]
fn upgrading_replaces_the_stored_proof() {
    let (_d, log) = log();
    log.queue(&head(9), 1).unwrap();
    let sealed = log.seal().unwrap().unwrap();

    log.record(&sealed, b"pending proof", 1).unwrap();
    assert_eq!(log.proof(&sealed.root).unwrap(), b"pending proof");

    log.upgrade(&sealed.root, b"upgraded proof").unwrap();
    assert_eq!(log.proof(&sealed.root).unwrap(), b"upgraded proof");
    assert_eq!(log.batches().unwrap(), vec![sealed.root]);
}

#[test]
fn upgrading_an_unknown_batch_is_refused() {
    let (_d, log) = log();
    assert!(log.upgrade(&head(0xff), b"x").is_err());
}

#[test]
fn submission_respects_the_rate_floor() {
    let (_d, log) = log();
    let policy = BatchPolicy {
        max_heads: 1,
        max_wait_ms: 0,
        min_interval_ms: 600_000,
    };
    log.queue(&head(1), 0).unwrap();
    assert!(
        log.should_submit(&policy, 1_000).unwrap(),
        "nothing sent yet"
    );

    let sealed = log.seal().unwrap().unwrap();
    log.record(&sealed, b"ots", 1_000).unwrap();

    assert!(
        !log.should_submit(&policy, 2_000).unwrap(),
        "inside the floor"
    );
    assert!(log.should_submit(&policy, 601_001).unwrap());
}

/// The whole point, end to end: a leaf written locally becomes a claim a
/// stranger can check against a Bitcoin block.
#[test]
fn a_local_leaf_becomes_a_verifiable_claim() {
    use daon_provenance_core::{Beacon, BeaconChain, Ingress, Observation, RevisionLeaf};
    use daon_provenance_verify::{verify, Claim, WitnessAttestation};
    use daon_provenance_witness::attest::{establish_for_head, BlockHeader, BlockSource};
    use daon_provenance_witness::ots::{Attestation, DetachedTimestamp};

    struct OneBlock {
        height: u64,
        header: BlockHeader,
    }
    impl BlockSource for OneBlock {
        fn header(&self, h: u64) -> Option<BlockHeader> {
            (h == self.height).then_some(self.header)
        }
    }

    // A leaf, as the agent would build one.
    let observation = Observation {
        tool_id: b"test-editor".to_vec(),
        ingress: Ingress::KeystrokeStream,
        added: 120,
        removed: 4,
        duration_ms: 60_000,
        op_count: 130,
    };
    let leaf = RevisionLeaf {
        seq: 0,
        parent_head: [0u8; 32],
        content_commit: daon_provenance_core::content_commit(b"the manuscript, at this moment"),
        meta_commit: daon_provenance_core::meta_commit(&[observation]).unwrap(),
        beacon: Beacon {
            chain: BeaconChain::Bitcoin,
            height: 800_000,
            block_hash: [0x42; 32],
        },
        author_key: [0xaa; 32],
        recovery_key: [0xbb; 32],
        local_time_ms: 1_700_000_000_000,
    };
    let leaf_id = leaf.leaf_id();

    // A single-leaf entity: the head is the leaf id.
    let (_d, log) = log();
    log.queue(&leaf_id, 1_700_000_000_000).unwrap();
    let sealed = log.seal().unwrap().unwrap();

    // A calendar timestamps the batch root; a block commits to it.
    let mut proof = DetachedTimestamp::new(sealed.root);
    proof
        .timestamp
        .attestations
        .push(Attestation::Bitcoin { height: 810_000 });
    log.record(&sealed, &proof.encode().unwrap(), 1_700_000_001_000)
        .unwrap();

    let chain = OneBlock {
        height: 810_000,
        header: BlockHeader {
            merkle_root: sealed.root,
            time_secs: 1_700_003_600,
        },
    };

    // Reload from disk, exactly as a verifier would.
    let stored = DetachedTimestamp::decode(&log.proof(&sealed.root).unwrap()).unwrap();
    let member = log
        .members(&sealed.root)
        .unwrap()
        .into_iter()
        .find(|m| m.head == leaf_id)
        .expect("head is in the batch");

    let anchor = establish_for_head(&stored, &member, &chain).expect("anchor");
    assert_eq!(anchor.digest, leaf_id);

    let verified = verify(&Claim {
        leaf: &leaf,
        proof: &[],
        head: leaf_id,
        attestation: WitnessAttestation {
            witnessed_head: leaf_id,
            witness_time_ms: anchor.time_ms,
        },
        signature: None,
        parent: None,
    })
    .expect("verifies");

    assert_eq!(verified.existed_by_ms, 1_700_003_600_000);
    assert!(!verified.author_signature_checked, "no signature supplied");
}
