//! Conformance tests against `docs/design/wire-format.md` §9.
//!
//! Every expected value here is also produced by `scripts/provenance/wire_ref.py`.
//! That is the point: two independent implementations, in different languages,
//! agreeing byte-for-byte. A vector that only this crate can satisfy proves
//! nothing about the format.
//!
//! If one of these fails, the format has changed. That is a decision, never an
//! accident — every historic proof depends on these bytes.

use daon_provenance_core::*;

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}

fn h32(s: &str) -> Hash {
    unhex(s).try_into().expect("32-byte hash")
}

/// §9.1 observation[0]
fn obs0() -> Observation {
    Observation {
        tool_id: b"ref/1.0".to_vec(),
        ingress: Ingress::Paste,
        added: 214,
        removed: 12,
        duration_ms: 45200,
        op_count: 87,
    }
}

/// §9.1 observation[1]
fn obs1() -> Observation {
    Observation {
        tool_id: b"ref/1.0".to_vec(),
        ingress: Ingress::KeystrokeStream,
        added: 1180,
        removed: 96,
        duration_ms: 51000,
        op_count: 1431,
    }
}

#[test]
fn observation_encoding() {
    assert_eq!(
        hex(&obs0().encode().unwrap()),
        "0100077265662f312e300200000000000000d6000000000000000c000000000000b0900000000000000057"
    );
}

#[test]
fn observation_leaf_hashes() {
    assert_eq!(
        hex(&obs0().leaf_hash().unwrap()),
        "86bf7780630473515767599095e90e35b92266e1d5860d172591e8ab6cc3da65"
    );
    assert_eq!(
        hex(&obs1().leaf_hash().unwrap()),
        "3cf97112729a2de6c51b7ae3372541d70b813e0a7c589cc4a66383e6aec1761b"
    );
}

#[test]
fn meta_commit_one_observation_degenerates_to_its_leaf() {
    let one = meta_commit(&[obs0()]).unwrap();
    assert_eq!(one, obs0().leaf_hash().unwrap());
    assert_eq!(
        hex(&one),
        "86bf7780630473515767599095e90e35b92266e1d5860d172591e8ab6cc3da65"
    );
}

#[test]
fn meta_commit_two_observations() {
    assert_eq!(
        hex(&meta_commit(&[obs0(), obs1()]).unwrap()),
        "f806164d604f0a608cc55ad1339d37a7d6a196251f09b305998b1a9078217cd8"
    );
}

#[test]
fn meta_commit_rejects_empty() {
    assert_eq!(meta_commit(&[]), Err(Error::NoObservations));
}

#[test]
fn content_commit_short_content_is_a_single_segment() {
    assert_eq!(
        hex(&content_commit(b"the quick brown fox")),
        "04d4bb06c05c7593ea1cfb3b63c92cfe061f3e737afef00b213fc4b3963ae958"
    );
}

#[test]
fn content_commit_multi_segment() {
    let doc: Vec<u8> = [1u8, 2, 3]
        .iter()
        .flat_map(|b| core::iter::repeat_n(*b, 1024))
        .collect();
    assert_eq!(segments(&doc).len(), 3);
    assert_eq!(
        hex(&content_commit(&doc)),
        "6f530589075448eb1369f2188bf4115e04aeafe4f73954c49dbfbb5b3cbaabc9"
    );
}

#[test]
fn segment_boundaries() {
    assert_eq!(
        segments(&[b'a'; 1024]).len(),
        1,
        "1024 bytes is one segment"
    );
    assert_eq!(segments(&[b'a'; 1025]).len(), 2, "1025 is two");
    assert_eq!(segments(b"").len(), 1, "empty content is one empty segment");
}

#[test]
fn genesis_leaf() {
    let leaf = RevisionLeaf {
        seq: 0,
        parent_head: [0u8; 32],
        content_commit: content_commit(b"the quick brown fox"),
        meta_commit: meta_commit(&[obs0(), obs1()]).unwrap(),
        beacon: Beacon {
            chain: BeaconChain::Bitcoin,
            height: 880_000,
            block_hash: h32("00000000000000000000000000000000000000000000000000000000deadbeef"),
        },
        author_key: [0x11u8; 32],
        recovery_key: [0x22u8; 32],
        local_time_ms: 1_754_000_000_000,
    };

    let body = leaf.encode();
    assert_eq!(body.len(), LEAF_BODY_LEN, "leaf body is fixed length");
    assert_eq!(
        hex(&body),
        // Single line deliberately: this literal is the format. Splitting it for
        // readability is how a transcription error gets into a conformance test.
        "010000000000000000000000000000000000000000000000000000000000000000000000000000000004d4bb06c05c7593ea1cfb3b63c92cfe061f3e737afef00b213fc4b3963ae958f806164d604f0a608cc55ad1339d37a7d6a196251f09b305998b1a9078217cd80100000000000d6d8000000000000000000000000000000000000000000000000000000000deadbeef1111111111111111111111111111111111111111111111111111111111111111222222222222222222222222222222222222222222222222222222222222222200000198628c0400"
    );
    assert_eq!(
        hex(&leaf.leaf_id()),
        "c6167ccbb8af644c7b7a478e8a64c0a8695bac272fa8fbcc597c4b2182efad78"
    );
}

/// §9.4 — five leaves is the smallest count exercising an unbalanced split
/// (k = 4). An implementation using last-node duplication produces a different
/// root here and fails, which is the entire reason this vector exists.
fn five_leaves() -> Vec<Hash> {
    (0u8..5).map(|i| merkle_leaf(&[i])).collect()
}

#[test]
fn merkle_root_five_leaves() {
    let leaves = five_leaves();
    let expect = [
        "96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7",
        "b413f47d13ee2fe6c845b2ee141af81de858df4ec549a58b7970bb96645bc8d2",
        "fcf0a6c700dd13e274b6fba8deea8dd9b26e4eedde3495717cac8408c9c5177f",
        "583c7dfb7b3055d99465544032a571e10a134b1b6f769422bbb71fd7fa167a5d",
        "4f35212d12f9ad2036492c95f1fe79baf4ec7bd9bef3dffa7579f2293ff546a4",
    ];
    for (i, e) in expect.iter().enumerate() {
        assert_eq!(hex(&leaves[i]), *e, "leaf[{i}]");
    }
    assert_eq!(
        hex(&merkle_root(&leaves)),
        "b855b42d6c30f5b087e05266783fbd6e394f7b926013ccaa67700a8b0c5a596f"
    );
}

#[test]
fn inclusion_proof_for_leaf_three() {
    let leaves = five_leaves();
    let root = merkle_root(&leaves);
    let proof = inclusion_proof(&leaves, 3);

    let expect = [
        (
            Side::Left,
            "fcf0a6c700dd13e274b6fba8deea8dd9b26e4eedde3495717cac8408c9c5177f",
        ),
        (
            Side::Left,
            "a20bf9a7cc2dc8a08f5f415a71b19f6ac427bab54d24eec868b5d3103449953a",
        ),
        (
            Side::Right,
            "4f35212d12f9ad2036492c95f1fe79baf4ec7bd9bef3dffa7579f2293ff546a4",
        ),
    ];
    assert_eq!(proof.len(), expect.len());
    for (i, (side, hash)) in expect.iter().enumerate() {
        assert_eq!(proof[i].0, *side, "step {i} side");
        assert_eq!(hex(&proof[i].1), *hash, "step {i} sibling");
    }

    assert!(verify_inclusion(&leaves[3], &proof, &root));
    assert!(
        !verify_inclusion(&leaves[2], &proof, &root),
        "a different leaf under this proof must not verify"
    );
}

#[test]
fn every_leaf_proves_under_its_root() {
    for n in 1..=33usize {
        let leaves: Vec<Hash> = (0..n).map(|i| merkle_leaf(&[i as u8])).collect();
        let root = merkle_root(&leaves);
        for i in 0..n {
            let proof = inclusion_proof(&leaves, i);
            assert!(verify_inclusion(&leaves[i], &proof, &root), "n={n} i={i}");
        }
    }
}

#[test]
fn tool_id_constraints_are_enforced() {
    let mut o = obs0();
    o.tool_id = vec![b'x'; 65];
    assert_eq!(o.encode(), Err(Error::ToolIdTooLong(65)));

    let mut o = obs0();
    o.tool_id = "café".as_bytes().to_vec();
    assert_eq!(
        o.encode(),
        Err(Error::ToolIdNotAscii),
        "non-ASCII is refused so no Unicode normalisation question can arise"
    );
}

#[test]
fn domain_separation_is_real() {
    // The same bytes hashed as a Merkle leaf and as content must not collide.
    // Under 1 KiB, content_commit is a single segment: SHA256(0x03 || bytes).
    let same = [7u8; 32];
    assert_ne!(merkle_leaf(&same), content_commit(&same));
}
