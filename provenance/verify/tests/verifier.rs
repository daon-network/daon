//! Tests for the four-step minimum verifier.
//!
//! Most of these are negative. A verifier that accepts good claims is easy; the
//! whole value is in what it refuses, so every step gets a test that breaks it.

use daon_provenance_core::*;
use daon_provenance_verify::*;

fn leaf_at(seq: u64, content: &[u8]) -> RevisionLeaf {
    RevisionLeaf {
        seq,
        parent_head: [0u8; 32],
        content_commit: content_commit(content),
        meta_commit: meta_commit(&[Observation {
            tool_id: b"test/1.0".to_vec(),
            ingress: Ingress::KeystrokeStream,
            added: 100,
            removed: 0,
            duration_ms: 5000,
            op_count: 40,
        }])
        .unwrap(),
        beacon: Beacon {
            chain: BeaconChain::Bitcoin,
            height: 880_000,
            block_hash: [0xab; 32],
        },
        author_key: [0x11u8; 32],
        recovery_key: [0x22u8; 32],
        local_time_ms: 1_754_000_000_000,
    }
}

/// A small log with a real head and proofs, as an agent would produce.
fn log_of(n: u64) -> (Vec<RevisionLeaf>, Vec<Hash>, Hash) {
    let leaves: Vec<RevisionLeaf> = (0..n).map(|i| leaf_at(i, b"some content")).collect();
    let ids: Vec<Hash> = leaves.iter().map(|l| l.leaf_id()).collect();
    let head = merkle_root(&ids);
    (leaves, ids, head)
}

#[test]
fn a_good_claim_verifies() {
    let (leaves, ids, head) = log_of(5);
    let proof = inclusion_proof(&ids, 3);
    let out = verify(&Claim {
        leaf: &leaves[3],
        proof: &proof,
        head,
        attestation: WitnessAttestation {
            witnessed_head: head,
            witness_time_ms: 1_754_000_900_000,
        },
        signature: None,
    })
    .expect("should verify");

    assert_eq!(out.existed_by_ms, 1_754_000_900_000);
    assert!(
        !out.author_signature_checked,
        "no signature supplied, so authorship is not established"
    );
}

#[test]
fn step2_a_leaf_not_under_the_head_is_refused() {
    let (leaves, ids, head) = log_of(5);
    let proof = inclusion_proof(&ids, 3);
    // Same proof, different leaf.
    let err = verify(&Claim {
        leaf: &leaves[2],
        proof: &proof,
        head,
        attestation: WitnessAttestation {
            witnessed_head: head,
            witness_time_ms: 1_754_000_900_000,
        },
        signature: None,
    })
    .unwrap_err();
    assert_eq!(err, Failure::NotInWitnessedHead);
}

#[test]
fn step2_a_tampered_leaf_is_refused() {
    let (leaves, ids, head) = log_of(5);
    let proof = inclusion_proof(&ids, 1);
    let mut tampered = leaves[1].clone();
    tampered.local_time_ms += 1; // one field, one millisecond

    let err = verify(&Claim {
        leaf: &tampered,
        proof: &proof,
        head,
        attestation: WitnessAttestation {
            witnessed_head: head,
            witness_time_ms: 1_754_000_900_000,
        },
        signature: None,
    })
    .unwrap_err();
    assert_eq!(
        err,
        Failure::NotInWitnessedHead,
        "changing any hashed field must break inclusion"
    );
}

#[test]
fn step3_an_attestation_about_another_head_is_refused() {
    let (leaves, ids, head) = log_of(5);
    let proof = inclusion_proof(&ids, 0);
    let err = verify(&Claim {
        leaf: &leaves[0],
        proof: &proof,
        head,
        attestation: WitnessAttestation {
            witnessed_head: [0xff; 32], // a head this proof never reaches
            witness_time_ms: 1_754_000_900_000,
        },
        signature: None,
    })
    .unwrap_err();
    assert_eq!(err, Failure::AttestationHeadMismatch);
}

#[test]
fn beacon_sandwich_rejects_inverted_bounds() {
    let att = WitnessAttestation {
        witnessed_head: [0u8; 32],
        witness_time_ms: 1_000,
    };
    assert!(
        beacon_lower_bound(999, &att).is_ok(),
        "beacon before witness is fine"
    );
    assert!(beacon_lower_bound(1_000, &att).is_ok(), "equal is fine");
    assert_eq!(
        beacon_lower_bound(1_001, &att).unwrap_err(),
        Failure::TimeBoundsInverted,
        "a leaf cannot predate a beacon it names while being witnessed earlier"
    );
}

#[test]
fn segment_disclosure_verifies_and_rejects_tampering() {
    // Three distinct 1 KiB segments. Distinct matters: identical segments would
    // make a substituted-segment proof appear to verify, which is how a fixture
    // hides a real bug.
    let doc: Vec<u8> = [1u8, 2, 3]
        .iter()
        .flat_map(|b| core::iter::repeat_n(*b, 1024))
        .collect();
    let commit = content_commit(&doc);
    let segs = segments(&doc);
    let seg_leaves: Vec<Hash> = segs.iter().map(|s| hash_tagged(tag::CONTENT, s)).collect();
    let proof = inclusion_proof(&seg_leaves, 1);

    assert!(verify_segment(segs[1], &proof, &commit));
    assert!(
        !verify_segment(segs[2], &proof, &commit),
        "a different segment under this proof must not verify"
    );
    assert!(
        !verify_segment(&[0u8; 1024], &proof, &commit),
        "tampered content must not verify"
    );
}

#[cfg(feature = "signatures")]
mod signatures {
    use super::*;

    #[test]
    fn a_garbage_signature_is_refused() {
        let (leaves, ids, head) = log_of(3);
        let proof = inclusion_proof(&ids, 0);
        let sig = [0u8; 64];
        let err = verify(&Claim {
            leaf: &leaves[0],
            proof: &proof,
            head,
            attestation: WitnessAttestation {
                witnessed_head: head,
                witness_time_ms: 1_754_000_900_000,
            },
            signature: Some(&sig),
        })
        .unwrap_err();
        // author_key here is 0x11 repeated, which is not a valid Ed25519 point,
        // so this fails at key parsing rather than at signature checking. Either
        // way it must not report success.
        assert!(
            err == Failure::MalformedAuthorKey || err == Failure::BadSignature,
            "got {err:?}"
        );
    }

    #[test]
    fn steps_one_to_three_do_not_require_a_signature() {
        let (leaves, ids, head) = log_of(3);
        let proof = inclusion_proof(&ids, 2);
        let out = verify(&Claim {
            leaf: &leaves[2],
            proof: &proof,
            head,
            attestation: WitnessAttestation {
                witnessed_head: head,
                witness_time_ms: 42,
            },
            signature: None,
        })
        .unwrap();
        assert!(!out.author_signature_checked);
    }
}

/// Without signature support, asking for step 4 must fail rather than silently
/// pass. An earlier draft returned `Ok` here, which would have reported
/// `author_signature_checked: true` having verified nothing.
#[cfg(not(feature = "signatures"))]
#[test]
fn a_verifier_without_signature_support_fails_closed() {
    let (leaves, ids, head) = log_of(3);
    let proof = inclusion_proof(&ids, 0);
    let sig = [0u8; 64];
    let err = verify(&Claim {
        leaf: &leaves[0],
        proof: &proof,
        head,
        attestation: WitnessAttestation {
            witnessed_head: head,
            witness_time_ms: 1,
        },
        signature: Some(&sig),
    })
    .unwrap_err();
    assert_eq!(err, Failure::SignaturesUnsupported);
}
