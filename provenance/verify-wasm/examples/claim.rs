//! Emit one verifiable claim in the FFI buffer format, so a non-Rust caller can
//! be checked against something this codebase agrees is valid.
use daon_provenance_core::*;
use ed25519_dalek::{Signer, SigningKey};

fn main() {
    let author = SigningKey::from_bytes(&[7u8; 32]);
    let obs = Observation {
        tool_id: b"emit".to_vec(),
        ingress: Ingress::KeystrokeStream,
        added: 10,
        removed: 0,
        duration_ms: 100,
        op_count: 3,
    };
    let leaf = RevisionLeaf {
        seq: 0,
        parent_head: [0; 32],
        content_commit: content_commit(b"the manuscript"),
        meta_commit: meta_commit(&[obs]).unwrap(),
        beacon: Beacon {
            chain: BeaconChain::Bitcoin,
            height: 800_000,
            block_hash: [0x42; 32],
        },
        author_key: author.verifying_key().to_bytes(),
        recovery_key: [0xbb; 32],
        local_time_ms: 1_700_000_000_000,
    };
    let id = leaf.leaf_id();
    let head = merkle_root(&[id]);
    let sig = author.sign(&id).to_bytes();

    let mut b = Vec::new();
    b.extend_from_slice(&leaf.encode());
    b.extend_from_slice(&head);
    b.extend_from_slice(&head);
    b.extend_from_slice(&1_700_003_600_000i64.to_be_bytes());
    b.push(0b01);
    b.extend_from_slice(&0u32.to_be_bytes());
    b.extend_from_slice(&sig);

    println!(
        "{}",
        b.iter().map(|x| format!("{x:02x}")).collect::<String>()
    );
}
