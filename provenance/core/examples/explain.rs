//! A walk through what a Merkle root is and what a proof of inclusion buys.
use daon_provenance_core::{
    inclusion_proof, merkle_leaf, merkle_root, node, verify_inclusion, Side,
};

fn short(h: &[u8; 32]) -> String {
    h[..4].iter().map(|b| format!("{b:02x}")).collect()
}

fn main() {
    // Four chunks of a manuscript.
    let chunks: [&[u8]; 4] = [
        b"It was the best of times,",
        b"it was the worst of times,",
        b"it was the age of wisdom,",
        b"it was the age of foolishness,",
    ];

    let leaves: Vec<_> = chunks.iter().map(|c| merkle_leaf(c)).collect();

    println!("Each chunk is hashed on its own:\n");
    for (i, (c, l)) in chunks.iter().zip(&leaves).enumerate() {
        println!("  L{i}  {}…   \"{}\"", short(l), String::from_utf8_lossy(c));
    }

    let n01 = node(&leaves[0], &leaves[1]);
    let n23 = node(&leaves[2], &leaves[3]);
    let root = merkle_root(&leaves);

    println!("\nPairs are hashed together, then those pairs, until one hash is left:\n");
    println!("              ROOT {}…", short(&root));
    println!("             /            \\");
    println!("      {}…              {}…", short(&n01), short(&n23));
    println!("      /      \\            /      \\");
    println!(
        "  {}…  {}…    {}…  {}…",
        short(&leaves[0]),
        short(&leaves[1]),
        short(&leaves[2]),
        short(&leaves[3])
    );
    println!("   L0      L1        L2      L3");

    // Prove L2 belongs, without handing over L0, L1 or L3.
    let proof = inclusion_proof(&leaves, 2);
    println!("\n─── Proving chunk 2 is in there ───\n");
    println!("You reveal:  \"{}\"", String::from_utf8_lossy(chunks[2]));
    println!("Plus {} sibling hashes:", proof.len());
    for (side, h) in &proof {
        println!("     {:?}  {}…", side, short(h));
    }

    println!("\nThe verifier recomputes upward:");
    let mut cur = merkle_leaf(chunks[2]);
    println!("     hash the chunk              -> {}…", short(&cur));
    for (side, sib) in &proof {
        cur = match side {
            Side::Left => node(sib, &cur),
            Side::Right => node(&cur, sib),
        };
        println!("     combine with {:?} sibling  -> {}…", side, short(&cur));
    }
    println!("\n     computed {}…", short(&cur));
    println!("     expected {}…   match: {}", short(&root), cur == root);

    println!("\nWhat the verifier did NOT learn:");
    for (i, c) in chunks.iter().enumerate() {
        if i != 2 {
            println!(
                "     chunk {i}: \"{}\"  — never sent, only its hash",
                String::from_utf8_lossy(c)
            );
        }
    }

    // Substitution must fail.
    let forged = verify_inclusion(&merkle_leaf(b"it was the age of DIFFERENT,"), &proof, &root);
    println!(
        "\nSwapping the chunk for different text and reusing the proof: {}",
        if forged {
            "VERIFIES — broken!"
        } else {
            "fails, as it must"
        }
    );

    println!("\nProof size grows with the logarithm of the number of chunks:");
    for n in [4usize, 1_024, 1_048_576] {
        let leaves: Vec<_> = (0..n)
            .map(|i| merkle_leaf(&(i as u32).to_be_bytes()))
            .collect();
        println!(
            "     {:>9} chunks -> {} hashes to prove one",
            n,
            inclusion_proof(&leaves, 0).len()
        );
    }
}
