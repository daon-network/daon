//! Batching behaviour and the limits that protect the calendars.

use daon_provenance_witness::batch::{Batch, BatchPolicy};

fn head(b: u8) -> [u8; 32] {
    [b; 32]
}

#[test]
fn every_member_proves_into_the_root() {
    let mut batch = Batch::new();
    for i in 0..9u8 {
        batch.push(head(i));
    }
    let sealed = batch.seal().expect("non-empty");
    assert_eq!(sealed.members.len(), 9);
    for m in &sealed.members {
        assert!(sealed.verify_member(m), "member {} does not prove", m.index);
    }
}

/// One head is the degenerate case and the one most likely to be mishandled:
/// the batch root is the head itself and the proof is empty.
#[test]
fn a_single_head_still_seals() {
    let mut batch = Batch::new();
    batch.push(head(7));
    let sealed = batch.seal().unwrap();
    assert_eq!(sealed.root, head(7));
    assert!(sealed.members[0].proof.is_empty());
    assert!(sealed.verify_member(&sealed.members[0]));
}

#[test]
fn a_head_from_another_batch_does_not_verify() {
    let mut a = Batch::new();
    for i in 0..4u8 {
        a.push(head(i));
    }
    let mut b = Batch::new();
    for i in 10..14u8 {
        b.push(head(i));
    }
    let (sa, sb) = (a.seal().unwrap(), b.seal().unwrap());
    assert!(
        !sa.verify_member(&sb.members[0]),
        "borrowed another batch's proof"
    );
}

#[test]
fn duplicate_heads_are_dropped() {
    let mut batch = Batch::new();
    assert!(batch.push(head(1)));
    assert!(!batch.push(head(1)));
    assert_eq!(batch.len(), 1);
}

#[test]
fn an_empty_batch_does_not_seal() {
    assert!(Batch::new().seal().is_none());
}

#[test]
fn nothing_is_submitted_for_an_empty_batch() {
    let p = BatchPolicy::default();
    assert!(!p.should_submit(&Batch::new(), None, None, 1_000_000));
}

/// The floor outranks every other rule. A full batch that has just been
/// submitted still waits.
#[test]
fn the_rate_floor_overrides_a_full_batch() {
    let p = BatchPolicy {
        max_heads: 2,
        max_wait_ms: 0,
        min_interval_ms: 600_000,
    };
    let mut batch = Batch::new();
    batch.push(head(1));
    batch.push(head(2));

    let now = 1_000_000;
    assert!(
        !p.should_submit(&batch, Some(0), Some(now - 1), now),
        "submitted inside the minimum interval"
    );
    assert!(p.should_submit(&batch, Some(0), Some(now - 600_000), now));
}

#[test]
fn a_full_batch_submits_once_the_floor_allows() {
    let p = BatchPolicy {
        max_heads: 3,
        max_wait_ms: i64::MAX,
        min_interval_ms: 0,
    };
    let mut batch = Batch::new();
    batch.push(head(1));
    batch.push(head(2));
    assert!(!p.should_submit(&batch, Some(0), None, 1), "not full yet");
    batch.push(head(3));
    assert!(p.should_submit(&batch, Some(0), None, 1));
}

/// A slow writer must still get witnessed rather than waiting for a batch that
/// will never fill.
#[test]
fn a_stale_head_submits_before_the_batch_fills() {
    let p = BatchPolicy {
        max_heads: 500,
        max_wait_ms: 3_600_000,
        min_interval_ms: 0,
    };
    let mut batch = Batch::new();
    batch.push(head(1));
    assert!(!p.should_submit(&batch, Some(0), None, 3_599_999));
    assert!(p.should_submit(&batch, Some(0), None, 3_600_000));
}

/// A clock that jumps backwards must not unlock a burst.
#[test]
fn a_backwards_clock_does_not_release_the_floor() {
    let p = BatchPolicy::default();
    let mut batch = Batch::new();
    for i in 0..600u16 {
        batch.push(head((i % 256) as u8));
    }
    // `now` is earlier than the last submission.
    assert!(!p.should_submit(&batch, Some(0), Some(5_000_000), 1_000));
}
