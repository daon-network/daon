//! Against a real OpenTimestamps calendar.
//!
//! `#[ignore]` by default, like the keychain tests: it makes a real outbound
//! request to a public service. Run it deliberately.
//!
//!     cargo test -p daon-provenance-net -- --ignored --nocapture
//!
//! Offline tests prove the loop's logic against responses this codebase wrote.
//! Only this proves the wire shape is what a calendar actually sends — the one
//! thing a canned transport can never tell you.

use daon_provenance_net::calendar::{Calendar, CalendarError};
use daon_provenance_net::UreqHttp;
use daon_provenance_witness::attest::needs_upgrade;
use daon_provenance_witness::ots::{Attestation, DetachedTimestamp};

/// A digest nobody else will submit, so the result is about our request.
fn unique_digest() -> [u8; 32] {
    use std::time::{SystemTime, UNIX_EPOCH};
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let mut d = [0u8; 32];
    d[..16].copy_from_slice(&n.to_be_bytes());
    d[16..].copy_from_slice(b"daon-live-test--");
    d
}

const CAL: &str = "https://alice.btc.calendar.opentimestamps.org";

#[test]
#[ignore = "makes a real request to a public calendar"]
fn a_real_calendar_returns_a_parseable_pending_proof() {
    let http = UreqHttp::new();
    let digest = unique_digest();

    let proof = Calendar::new(CAL, &http)
        .submit(&digest)
        .expect("submit to a real calendar");
    println!("  submitted {}", hex::encode(&digest[..8]));

    // It must round-trip through our own encoder, or what we store on disk is
    // not what we parsed.
    let bytes = proof.encode().expect("encodes to a .ots file");
    let reparsed = DetachedTimestamp::decode(&bytes).expect("decodes again");
    assert_eq!(reparsed, proof, "round trip through the .ots framing");
    println!("  proof is {} bytes and round-trips", bytes.len());

    let attestations = proof.attestations().expect("walk the tree");
    assert!(
        !attestations.is_empty(),
        "a calendar returns at least one attestation"
    );

    let pending = attestations
        .iter()
        .any(|(a, _)| matches!(a, Attestation::Pending { .. }));
    assert!(
        pending,
        "a fresh submission must be pending, got {attestations:?}"
    );
    assert!(
        needs_upgrade(&proof).unwrap(),
        "and must therefore need upgrading"
    );

    for (a, _) in &attestations {
        if let Attestation::Pending { uri } = a {
            println!("  pending at {}", String::from_utf8_lossy(uri));
        }
    }
}

/// The upgrade path, against a digest that cannot be anchored yet.
#[test]
#[ignore = "makes a real request to a public calendar"]
fn upgrading_something_unanchored_reports_not_ready() {
    let http = UreqHttp::new();
    let digest = unique_digest();
    let cal = Calendar::new(CAL, &http);
    cal.submit(&digest).expect("submit");

    // Bitcoin confirmation takes hours, so this must be NotReadyYet rather than
    // an error the witness loop would count as a failure.
    match cal.upgrade(&digest) {
        Err(CalendarError::NotReadyYet) => println!("  correctly reported not-ready"),
        Ok(_) => panic!("cannot already be anchored seconds after submitting"),
        Err(e) => panic!("expected NotReadyYet, got {e}"),
    }
}
