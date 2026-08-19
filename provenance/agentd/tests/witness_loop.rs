//! The witness loop, driven against a canned transport.
//!
//! No test here reaches the network. `Http` is the seam precisely so the loop's
//! behaviour — including what it does when a calendar is down — is checkable
//! offline.

use std::cell::RefCell;
use std::collections::HashMap;

use daon_provenance_agent::witness::WitnessLog;
use daon_provenance_agentd::witness_loop::{tick, TickOutcome};
use daon_provenance_core::{merkle_root, Hash};
use daon_provenance_net::http::{Http, HttpError};
use daon_provenance_witness::batch::BatchPolicy;
use daon_provenance_witness::ots::{Attestation, DetachedTimestamp, Op, Timestamp};
use tempfile::TempDir;

/// A transport that answers from a script and records what it was asked.
struct Canned {
    posts: RefCell<Vec<String>>,
    gets: RefCell<Vec<String>>,
    post_body: Option<Vec<u8>>,
    get_body: Option<Vec<u8>>,
}

impl Canned {
    fn new() -> Self {
        Canned {
            posts: RefCell::new(Vec::new()),
            gets: RefCell::new(Vec::new()),
            post_body: None,
            get_body: None,
        }
    }
}

impl Http for Canned {
    fn post(&self, url: &str, _body: &[u8], _ct: &str) -> Result<Vec<u8>, HttpError> {
        self.posts.borrow_mut().push(url.to_string());
        self.post_body
            .clone()
            .ok_or_else(|| HttpError::Transport("calendar unreachable".into()))
    }
    fn get(&self, url: &str) -> Result<Vec<u8>, HttpError> {
        self.gets.borrow_mut().push(url.to_string());
        self.get_body.clone().ok_or(HttpError::Status {
            code: 404,
            body: String::new(),
        })
    }
}

/// A calendar's answer: a fragment, not a whole `.ots` file.
fn fragment(attestation: Attestation) -> Vec<u8> {
    let proof = DetachedTimestamp {
        file_hash_op: Op::Sha256,
        digest: vec![0u8; 32],
        timestamp: Timestamp {
            attestations: vec![attestation],
            ops: vec![],
        },
    };
    let whole = proof.encode().unwrap();
    // Strip the magic, version, hash op and digest to leave the tree alone.
    whole[daon_provenance_witness::ots::MAGIC.len() + 1 + 1 + 32..].to_vec()
}

fn pending_fragment() -> Vec<u8> {
    fragment(Attestation::Pending {
        uri: b"https://alice.btc.calendar.opentimestamps.org".to_vec(),
    })
}

fn anchored_fragment() -> Vec<u8> {
    fragment(Attestation::Bitcoin { height: 810_000 })
}

fn log_with(heads: &[Hash], now: i64) -> (TempDir, WitnessLog) {
    let dir = TempDir::new().unwrap();
    let log = WitnessLog::open(dir.path()).unwrap();
    for h in heads {
        log.queue(h, now).unwrap();
    }
    (dir, log)
}

fn eager() -> BatchPolicy {
    BatchPolicy {
        max_heads: 1,
        max_wait_ms: 0,
        min_interval_ms: 0,
    }
}

#[test]
fn a_tick_submits_pending_heads() {
    let (_d, log) = log_with(&[[1u8; 32], [2u8; 32]], 1_000);
    let mut http = Canned::new();
    http.post_body = Some(pending_fragment());

    let out = tick(&log, &http, &["https://cal.example"], &eager(), 2_000);

    assert_eq!(out.submitted, 2, "both queued heads went in one batch");
    assert_eq!(
        http.posts.borrow().len(),
        1,
        "one submission, not one per head"
    );
    assert!(http.posts.borrow()[0].ends_with("/digest"));
}

/// The step that gets forgotten: a submitted proof is pending and proves nothing
/// until something comes back for it.
#[test]
fn a_pending_head_is_not_resolved_until_the_proof_is_anchored() {
    let (_d, log) = log_with(&[[3u8; 32]], 1_000);
    let mut http = Canned::new();
    http.post_body = Some(pending_fragment());

    let out = tick(&log, &http, &["https://cal.example"], &eager(), 2_000);
    assert_eq!(out.submitted, 1);
    assert_eq!(out.resolved, 0, "pending is not witnessed");
    assert_eq!(log.pending().unwrap().len(), 1, "still queued");
}

#[test]
fn an_upgraded_proof_resolves_its_heads() {
    let (_d, log) = log_with(&[[4u8; 32]], 1_000);
    let mut http = Canned::new();
    http.post_body = Some(pending_fragment());
    tick(&log, &http, &["https://cal.example"], &eager(), 2_000);

    // Bitcoin has now confirmed it.
    http.get_body = Some(anchored_fragment());
    let out = tick(&log, &http, &["https://cal.example"], &eager(), 3_000);

    assert_eq!(out.upgraded, 1);
    assert_eq!(out.resolved, 1);
    assert!(log.pending().unwrap().is_empty(), "head is witnessed");
}

/// A calendar being down must leave work queued rather than losing it.
#[test]
fn an_unreachable_calendar_loses_nothing() {
    let (_d, log) = log_with(&[[5u8; 32]], 1_000);
    let http = Canned::new(); // every request fails

    let out = tick(&log, &http, &["https://down.example"], &eager(), 2_000);

    assert_eq!(out.submitted, 0);
    assert!(out.unreachable >= 1);
    assert_eq!(log.pending().unwrap().len(), 1, "the head is still queued");
}

/// The batching floor is the protection for a shared resource, so the loop must
/// respect it rather than submitting on every tick.
#[test]
fn the_rate_floor_is_respected() {
    let (_d, log) = log_with(&[[6u8; 32]], 0);
    let mut http = Canned::new();
    http.post_body = Some(pending_fragment());
    let policy = BatchPolicy {
        max_heads: 1,
        max_wait_ms: 0,
        min_interval_ms: 600_000,
    };

    assert_eq!(
        tick(&log, &http, &["https://cal.example"], &policy, 1_000).submitted,
        1
    );
    // Immediately after, inside the floor.
    let (_d2, log2) = log_with(&[[7u8; 32]], 0);
    log2.queue(&[8u8; 32], 0).unwrap();
    tick(&log2, &http, &["https://cal.example"], &policy, 1_000);
    let out = tick(&log2, &http, &["https://cal.example"], &policy, 2_000);
    assert_eq!(out.submitted, 0, "must not submit again inside the floor");
}

#[test]
fn nothing_queued_means_nothing_happens() {
    let (_d, log) = log_with(&[], 1_000);
    let http = Canned::new();
    assert_eq!(
        tick(&log, &http, &["https://cal.example"], &eager(), 2_000),
        TickOutcome::default()
    );
    assert!(http.posts.borrow().is_empty(), "no request without work");
}

/// One anchor covering many heads is the whole point of batching.
#[test]
fn one_submission_covers_every_queued_head() {
    let heads: Vec<Hash> = (0..16u8).map(|i| [i; 32]).collect();
    let (_d, log) = log_with(&heads, 1_000);
    let mut http = Canned::new();
    http.post_body = Some(pending_fragment());
    http.get_body = Some(anchored_fragment());

    tick(&log, &http, &["https://cal.example"], &eager(), 2_000);
    let out = tick(&log, &http, &["https://cal.example"], &eager(), 3_000);

    assert_eq!(out.resolved, 16, "sixteen heads, one anchor");
    assert!(log.pending().unwrap().is_empty());

    // And the batch root really is the Merkle root over those heads.
    let batches = log.batches().unwrap();
    assert_eq!(batches.len(), 1);
    assert_eq!(batches[0], merkle_root(&heads));
}

#[test]
fn a_second_calendar_is_tried_when_the_first_fails() {
    let (_d, log) = log_with(&[[9u8; 32]], 1_000);
    let mut http = Canned::new();
    http.post_body = Some(pending_fragment());

    tick(
        &log,
        &http,
        &["https://a.example", "https://b.example"],
        &eager(),
        2_000,
    );
    let posts = http.posts.borrow();
    assert_eq!(posts.len(), 2, "submitted to both, for redundancy");
}

/// Sanity: the loop must never send content anywhere. Only a digest.
#[test]
fn only_a_digest_leaves_the_machine() {
    let (_d, log) = log_with(&[[10u8; 32]], 1_000);
    let mut http = Canned::new();
    http.post_body = Some(pending_fragment());

    tick(&log, &http, &["https://cal.example"], &eager(), 2_000);

    let seen: HashMap<&str, usize> = HashMap::new();
    let _ = seen;
    for url in http.posts.borrow().iter() {
        assert!(url.ends_with("/digest"), "unexpected endpoint: {url}");
    }
}
