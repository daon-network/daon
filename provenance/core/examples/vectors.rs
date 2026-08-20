//! Emits the wire-format vectors in a stable `name<TAB>hex` form.
//!
//! Exists so CI can diff this against `scripts/provenance/wire_ref.py`. The unit
//! tests assert hardcoded expectations, which means they would keep passing if
//! the Python reference drifted — each implementation checking itself proves
//! nothing about the format. This is the check that actually catches a fork.

use daon_provenance_core::*;

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn main() {
    let o1 = Observation {
        tool_id: b"ref/1.0".to_vec(),
        ingress: Ingress::Paste,
        added: 214,
        removed: 12,
        duration_ms: 45200,
        op_count: 87,
    };
    let o2 = Observation {
        tool_id: b"ref/1.0".to_vec(),
        ingress: Ingress::KeystrokeStream,
        added: 1180,
        removed: 96,
        duration_ms: 51000,
        op_count: 1431,
    };
    let mc2 = meta_commit(&[o1.clone(), o2.clone()]).unwrap();
    let cc = content_commit(b"the quick brown fox");

    let leaf = RevisionLeaf {
        seq: 0,
        parent_head: [0u8; 32],
        content_commit: cc,
        meta_commit: mc2,
        beacon: Beacon {
            chain: BeaconChain::Bitcoin,
            height: 880_000,
            block_hash: {
                let mut b = [0u8; 32];
                b[28..].copy_from_slice(&[0xde, 0xad, 0xbe, 0xef]);
                b
            },
        },
        author_key: [0x11u8; 32],
        recovery_key: [0x22u8; 32],
        local_time_ms: 1_754_000_000_000,
    };

    let leaves: Vec<Hash> = (0u8..5).map(|i| merkle_leaf(&[i])).collect();
    let root = merkle_root(&leaves);
    let proof = inclusion_proof(&leaves, 3);

    let seg_doc: Vec<u8> = [1u8, 2, 3]
        .iter()
        .flat_map(|b| core::iter::repeat_n(*b, 1024))
        .collect();

    println!("observation0\t{}", hex(&o1.encode().unwrap()));
    println!("obs_leaf0\t{}", hex(&o1.leaf_hash().unwrap()));
    println!("obs_leaf1\t{}", hex(&o2.leaf_hash().unwrap()));
    println!("meta_commit1\t{}", hex(&meta_commit(&[o1]).unwrap()));
    println!("meta_commit2\t{}", hex(&mc2));
    println!("content_commit\t{}", hex(&cc));
    println!("seg_root\t{}", hex(&content_commit(&seg_doc)));
    println!("leaf_body\t{}", hex(&leaf.encode()));
    println!("leaf_id\t{}", hex(&leaf.leaf_id()));
    // Composite works. `aligned` vs `flat_of_aligned` is the collision the
    // 0x04 part tag exists to prevent: a first part of exactly SEGMENT_SIZE
    // gives the parts tree the same shape as the concatenation.
    let comp: Vec<&[u8]> = vec![
        b"page one text",
        b"\x89PNG\r\n\x1a\n figure bytes",
        b"page two text",
    ];
    let aligned_a = vec![b'x'; 1024];
    let aligned_b = vec![b'y'; 500];
    let aligned: Vec<&[u8]> = vec![&aligned_a, &aligned_b];
    let mut concat = aligned_a.clone();
    concat.extend_from_slice(&aligned_b);

    println!("part_commit_text\t{}", hex(&part_commit(comp[0])));
    println!("part_commit_image\t{}", hex(&part_commit(comp[1])));
    println!("parts_root\t{}", hex(&content_commit_parts(&comp)));
    println!(
        "parts_root_single\t{}",
        hex(&content_commit_parts(&[comp[1]]))
    );
    println!("parts_root_empty\t{}", hex(&content_commit_parts(&[])));
    println!(
        "parts_root_aligned\t{}",
        hex(&content_commit_parts(&aligned))
    );
    println!("flat_of_aligned\t{}", hex(&content_commit(&concat)));
    for (i, (side, sib)) in part_proof(&comp, 1).iter().enumerate() {
        let s = match side {
            Side::Left => "L",
            Side::Right => "R",
        };
        println!("part_proof{i}\t{s}:{}", hex(sib));
    }

    for (i, l) in leaves.iter().enumerate() {
        println!("leaf{i}\t{}", hex(l));
    }
    println!("merkle_root\t{}", hex(&root));
    for (i, (side, sib)) in proof.iter().enumerate() {
        let s = match side {
            Side::Left => "L",
            Side::Right => "R",
        };
        println!("proof{i}\t{s}:{}", hex(sib));
    }
}
