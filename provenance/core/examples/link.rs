use daon_provenance_core::*;
fn s(h: &[u8; 32]) -> String {
    h[..6].iter().map(|b| format!("{b:02x}")).collect()
}
fn main() {
    let work = b"It was the best of times, it was the worst of times.";

    // ── What the REGISTRY computes ──
    use sha2::{Digest, Sha256};
    let registry_hash: [u8; 32] = Sha256::digest(work).into();

    // ── What PROVENANCE computes, from the same bytes ──
    let commit = content_commit(work);

    println!("Same bytes, two independent computations:\n");
    println!(
        "  registry  content_hash    {}…   plain SHA-256 of the text",
        s(&registry_hash)
    );
    println!(
        "  provenance content_commit {}…   Merkle root over 1 KiB segments",
        s(&commit)
    );
    println!(
        "\n  equal? {}   <- they are NOT the same number, and never were",
        registry_hash == commit
    );

    println!("\n─── Where content_commit DOES get re-committed ───\n");
    let obs = Observation {
        tool_id: b"editor".to_vec(),
        ingress: Ingress::KeystrokeStream,
        added: 52,
        removed: 0,
        duration_ms: 9000,
        op_count: 30,
    };
    let leaf = RevisionLeaf {
        seq: 0,
        parent_head: [0; 32],
        content_commit: commit,
        meta_commit: meta_commit(&[obs]).unwrap(),
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
    let head = merkle_root(&[leaf_id]);
    let batch_root = merkle_root(&[head, [0x11; 32], [0x22; 32]]);

    println!(
        "  content_commit {}…  sits INSIDE the 218-byte leaf, at offset 41",
        s(&commit)
    );
    println!(
        "        leaf_id  {}…  = hash of that whole leaf body",
        s(&leaf_id)
    );
    println!(
        "           head  {}…  = Merkle root over the entity's leaf_ids",
        s(&head)
    );
    println!(
        "     batch root  {}…  = Merkle root over many heads",
        s(&batch_root)
    );
    println!("                        ^ this is what goes to OpenTimestamps");

    println!("\n  Each one commits to the one above it. The registry hash is in none of them.");
}
