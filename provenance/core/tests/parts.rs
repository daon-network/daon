//! Composite works: text with pictures in it.
//!
//! The properties worth defending are that a part can be disclosed exactly, that
//! the boundaries between parts are committed rather than incidental, and that
//! editing one part leaves the others alone.

use daon_provenance_core::{
    content_commit, content_commit_parts, inclusion_proof, part_commit, part_proof, segments,
    verify_inclusion, SEGMENT_SIZE,
};

/// A picture: not text, and bigger than one segment.
fn picture(seed: u8, len: usize) -> Vec<u8> {
    (0..len)
        .map(|i| seed.wrapping_add((i * 31) as u8))
        .collect()
}

#[test]
fn a_part_can_be_disclosed_without_revealing_the_others() {
    let page = b"The lighthouse keeper wrote this by hand.".to_vec();
    let figure = picture(7, 4096);
    let after = b"And then the storm came in.".to_vec();
    let parts: Vec<&[u8]> = vec![&page, &figure, &after];

    let root = content_commit_parts(&parts);

    // Disclose only the figure: its bytes, and where it sits.
    let proof = part_proof(&parts, 1);
    assert!(
        verify_inclusion(&part_commit(&figure), &proof, &root),
        "the figure should prove into the work"
    );

    // The proof is siblings only -- it never carries the other parts' bytes.
    assert_eq!(proof.len(), 2, "three parts is a two-step path");
}

#[test]
fn a_part_cannot_be_moved_or_swapped() {
    let a = b"first".to_vec();
    let b = picture(3, 2048);
    let c = b"third".to_vec();

    let forward: Vec<&[u8]> = vec![&a, &b, &c];
    let swapped: Vec<&[u8]> = vec![&a, &c, &b];
    assert_ne!(
        content_commit_parts(&forward),
        content_commit_parts(&swapped),
        "order of parts must be committed"
    );

    // A proof for index 1 must not verify against the same part at a different
    // index of a different arrangement.
    let root = content_commit_parts(&forward);
    let wrong = part_proof(&swapped, 1);
    assert!(!verify_inclusion(&part_commit(&b), &wrong, &root));
}

/// The reason [`part_commit`] tags the part level rather than reusing the
/// segment hash directly.
///
/// A two-part work whose first part is exactly one segment long has the same tree
/// *shape* as the flat concatenation of both parts. Without a distinct domain tag
/// the two would produce an identical root, and the commitment would say nothing
/// about where the parts divide.
#[test]
fn a_composite_is_never_confusable_with_the_flat_concatenation() {
    let first = vec![b'x'; SEGMENT_SIZE]; // exactly one segment
    let second = vec![b'y'; 500];
    let mut flat = first.clone();
    flat.extend_from_slice(&second);

    // Same bytes, same order, same tree shape -- and still distinguishable.
    assert_eq!(segments(&flat).len(), 2, "precondition: two segments");
    let parts: Vec<&[u8]> = vec![&first, &second];
    assert_ne!(
        content_commit_parts(&parts),
        content_commit(&flat),
        "a composite must not collide with its own concatenation"
    );
}

#[test]
fn one_part_is_not_the_same_claim_as_the_bare_content() {
    let img = picture(11, 3000);
    let one: Vec<&[u8]> = vec![&img];
    assert_ne!(
        content_commit_parts(&one),
        content_commit(&img),
        "[image] and image are different claims about the same bytes"
    );
}

#[test]
fn editing_one_part_leaves_the_others_provable() {
    let text = b"chapter one".to_vec();
    let panel = picture(5, 8192);
    let tail = b"chapter two".to_vec();

    let before: Vec<&[u8]> = vec![&text, &panel, &tail];
    let redrawn = picture(6, 8192);
    let after: Vec<&[u8]> = vec![&text, &redrawn, &tail];

    assert_ne!(content_commit_parts(&before), content_commit_parts(&after));

    // The untouched first part still proves into the new revision, and its
    // part commitment did not change -- which is the property fixed 1 KiB
    // segmentation over a flat buffer cannot offer once sizes shift.
    let root_after = content_commit_parts(&after);
    assert!(verify_inclusion(
        &part_commit(&text),
        &part_proof(&after, 0),
        &root_after
    ));
}

#[test]
fn the_two_levels_compose_for_a_passage_inside_a_part() {
    let long = vec![b'p'; SEGMENT_SIZE * 3 + 17];
    let img = picture(2, 1200);
    let parts: Vec<&[u8]> = vec![&long, &img];
    let root = content_commit_parts(&parts);

    // Level one: this part is in the work.
    assert!(verify_inclusion(
        &part_commit(&long),
        &part_proof(&parts, 0),
        &root
    ));

    // Level two: this segment is in that part. Independent of level one.
    let segs = segments(&long);
    let seg_leaves: Vec<_> = segs
        .iter()
        .map(|s| {
            use sha2::{Digest, Sha256};
            let mut h = Sha256::new();
            h.update([0x03u8]);
            h.update(s);
            let out: [u8; 32] = h.finalize().into();
            out
        })
        .collect();
    assert!(verify_inclusion(
        &seg_leaves[2],
        &inclusion_proof(&seg_leaves, 2),
        &content_commit(&long)
    ));
}

#[test]
fn empty_and_absent_parts_agree() {
    let empty: Vec<&[u8]> = vec![];
    let one_empty: Vec<&[u8]> = vec![&[]];
    assert_eq!(
        content_commit_parts(&empty),
        content_commit_parts(&one_empty),
        "no parts and one empty part are the same work"
    );
}

/// A composite must never land on the key-event sentinel, for the same reason
/// content cannot: it would require a second preimage.
#[test]
fn a_composite_is_never_the_key_event_sentinel() {
    for n in 0..8usize {
        let parts: Vec<Vec<u8>> = (0..n).map(|i| picture(i as u8, 100 + i)).collect();
        let refs: Vec<&[u8]> = parts.iter().map(|p| p.as_slice()).collect();
        assert_ne!(content_commit_parts(&refs), [0u8; 32]);
    }
}
