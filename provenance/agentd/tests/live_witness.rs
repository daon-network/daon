//! The witness loop, against real calendars, end to end.
//!
//! `#[ignore]` by default, like the calendar and keychain tests: it makes real
//! outbound requests to a public service. Run it deliberately.
//!
//!     cargo test -p daon-provenance-agentd --test live_witness -- --ignored --nocapture
//!
//! `net/tests/live_calendar.rs` proves one request has the shape a calendar
//! actually sends. This proves the thing above it: that a head queued by the
//! store gets sealed into a batch, submitted, and recorded — driven by `tick`
//! rather than by a test reaching past it into the calendar client.
//!
//! # Why this exists
//!
//! Every part of this was independently tested and the loop still could not be
//! observed doing its job, because the default policy submits after **an hour**
//! or **512 heads** — the ten-minute `min_interval_ms` is a floor that
//! suppresses bursts, not a trigger. So a freshly started daemon with a couple
//! of heads correctly does nothing for an hour, which is indistinguishable from
//! a loop that is broken, unless you either wait out the hour or do this.
//!
//! `tick` takes `now_ms` for exactly this reason. Nothing here fakes the
//! network.

use std::time::{SystemTime, UNIX_EPOCH};

use daon_provenance_agent::witness::WitnessLog;
use daon_provenance_agentd::witness_loop::tick;
use daon_provenance_net::calendar::PUBLIC_CALENDARS;
use daon_provenance_net::UreqHttp;
use daon_provenance_witness::batch::BatchPolicy;

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

/// A head nobody else will submit, so the result is about our request.
fn unique_head(tag: u8) -> [u8; 32] {
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let mut h = [0u8; 32];
    h[..16].copy_from_slice(&n.to_be_bytes());
    h[16..31].copy_from_slice(b"daon-live-witne");
    h[31] = tag;
    h
}

#[test]
#[ignore = "makes real requests to public calendars"]
fn a_queued_head_is_sealed_submitted_and_recorded() {
    let dir = tempfile::tempdir().expect("tempdir");
    let witness = WitnessLog::open(dir.path()).expect("open witness log");
    let http = UreqHttp::new();
    let policy = BatchPolicy::default();
    let now = now_ms();

    for tag in 0..2u8 {
        witness.queue(&unique_head(tag), now).expect("queue a head");
    }
    assert_eq!(witness.pending().expect("pending").len(), 2);

    // Before the policy's window, the loop must do nothing. This is the state a
    // freshly started daemon sits in, and mistaking it for a fault is the whole
    // reason this test is here.
    let quiet = tick(&witness, &http, PUBLIC_CALENDARS, &policy, now);
    assert_eq!(quiet.submitted, 0, "submitted before the policy allows it");
    assert!(
        witness.batches().expect("batches").is_empty(),
        "sealed a batch before the policy allows it"
    );
    println!("  before the window: nothing submitted, as intended");

    // An hour later the oldest head has waited out `max_wait_ms`. Real request,
    // real calendars.
    let later = now + 60 * 60 * 1000 + 1;
    let out = tick(&witness, &http, PUBLIC_CALENDARS, &policy, later);

    assert_eq!(
        out.submitted, 2,
        "both heads should have gone up in one batch (unreachable: {})",
        out.unreachable
    );

    let batches = witness.batches().expect("batches");
    assert_eq!(batches.len(), 1, "two heads should share one batch");
    let root = batches[0];

    let proof = witness.proof(&root).expect("stored proof");
    assert!(!proof.is_empty(), "recorded an empty proof");
    println!(
        "  submitted 2 heads as batch {} · proof {} bytes",
        hex::encode(&root[..8]),
        proof.len()
    );

    // Both heads stay pending: a head is not witnessed until its proof carries a
    // Bitcoin attestation, which is hours away. Resolving here would be the bug
    // this asserts against.
    assert_eq!(
        witness.pending().expect("pending").len(),
        2,
        "a head must stay pending until its batch is genuinely anchored"
    );
    assert_eq!(out.resolved, 0, "resolved a head that is not yet anchored");

    // And the floor holds: an immediate second tick must not submit again.
    let again = tick(&witness, &http, PUBLIC_CALENDARS, &policy, later + 1000);
    assert_eq!(again.submitted, 0, "submitted again inside min_interval_ms");
    println!("  the floor holds: no second submission");
}
