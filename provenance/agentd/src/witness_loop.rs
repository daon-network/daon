//! The loop that actually witnesses heads.
//!
//! Everything else in this workspace was, until this existed, machinery nobody
//! wound up. `WitnessLog` could queue heads, `Batch` could seal them, the
//! calendar client could submit — and no code called any of it, so heads
//! accumulated on disk and were never anchored. A chain in that state proves
//! *sequence* and not *time*, and time is the entire claim.
//!
//! # Three things on a timer
//!
//! | Step | When | Why not sooner |
//! | --- | --- | --- |
//! | **Submit** | policy says so | witnesses are a shared resource; see `batch.rs` |
//! | **Upgrade** | every tick | Bitcoin confirmation takes hours, so this mostly does nothing |
//! | **Resolve** | after an upgrade | a head is pending until its batch is genuinely anchored |
//!
//! The upgrade step is the one that gets forgotten. A freshly submitted proof
//! parses cleanly, looks complete, and carries no Bitcoin attestation. Without
//! something coming back for it, every head stays unwitnessed forever while the
//! files on disk look fine.
//!
//! # Failure is normal and must not be fatal
//!
//! Calendars go down. Networks drop. A tick that fails changes nothing on disk
//! except leaving work queued for the next one, because the alternative — an
//! agent that stops witnessing because a server was briefly unreachable — is
//! worse than one that retries quietly.

use std::sync::Arc;
use std::time::Duration;

use daon_provenance_agent::witness::WitnessLog;
use daon_provenance_core::Hash;
use daon_provenance_net::calendar::{submit_to_all, Calendar, CalendarError};
use daon_provenance_net::Http;
use daon_provenance_witness::attest::needs_upgrade;
use daon_provenance_witness::batch::BatchPolicy;
use daon_provenance_witness::ots::DetachedTimestamp;

/// How often the loop wakes.
///
/// Not how often it submits — [`BatchPolicy`] decides that, and its floor is
/// ten minutes. Waking more often than submitting is deliberate: the upgrade
/// step needs to run on its own schedule, and an agent that only checked when
/// it had something to send would never collect the proof for what it already
/// sent.
pub const TICK: Duration = Duration::from_secs(60);

/// What one tick did. Returned rather than logged so a caller can decide how
/// loud to be, and so tests can assert on it.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct TickOutcome {
    /// Heads sealed into a batch and sent to at least one calendar.
    pub submitted: usize,
    /// Batches whose proof now carries a Bitcoin attestation.
    pub upgraded: usize,
    /// Heads that stopped being pending because their batch is anchored.
    pub resolved: usize,
    /// Calendars that could not be reached. Expected, not fatal.
    pub unreachable: usize,
}

/// Run one tick.
///
/// Split out from the loop so it can be driven by a test with a canned
/// transport, and so a caller that wants to force a submission does not have to
/// wait out a timer.
pub fn tick<H: Http>(
    witness: &WitnessLog,
    http: &H,
    calendars: &[&str],
    policy: &BatchPolicy,
    now_ms: i64,
) -> TickOutcome {
    let mut out = TickOutcome::default();

    // ── 1. Submit, if policy allows ──────────────────────────────────────
    if witness.should_submit(policy, now_ms).unwrap_or(false) {
        if let Ok(Some(sealed)) = witness.seal() {
            let (proofs, failures) = submit_to_all(http, &sealed.root, calendars);
            out.unreachable += failures.len();

            // One proof is enough to establish a time. Recording only on
            // success means a total failure leaves the heads queued, which is
            // what the next tick is for.
            if let Some((_, proof)) = proofs.first() {
                if let Ok(bytes) = proof.encode() {
                    if witness.record(&sealed, &bytes, now_ms).is_ok() {
                        out.submitted = sealed.members.len();
                    }
                }
            }
        }
    }

    // ── 2. Upgrade anything still pending ────────────────────────────────
    //
    // Runs every tick regardless of the submission floor: this collects proofs
    // for work already sent, and rate-limiting it would only delay anchoring
    // that has already happened.
    for root in witness.batches().unwrap_or_default() {
        let stored = match witness.proof(&root) {
            Ok(b) => b,
            Err(_) => continue,
        };
        let parsed = match DetachedTimestamp::decode(&stored) {
            Ok(p) => p,
            Err(_) => continue,
        };
        // Already anchored -- nothing to fetch, and refetching would spend a
        // request to learn what is already on disk.
        if !needs_upgrade(&parsed).unwrap_or(true) {
            resolve_batch(witness, &root, &mut out);
            continue;
        }

        for url in calendars {
            match Calendar::new(*url, http).upgrade(&root) {
                Ok(upgraded) => {
                    if let Ok(bytes) = upgraded.encode() {
                        if witness.upgrade(&root, &bytes).is_ok() {
                            out.upgraded += 1;
                            resolve_batch(witness, &root, &mut out);
                        }
                    }
                    break;
                }
                // The ordinary answer for hours after submitting. Not worth
                // counting as a failure or reporting to anyone.
                Err(CalendarError::NotReadyYet) => {}
                Err(_) => out.unreachable += 1,
            }
        }
    }

    out
}

/// Stop tracking a batch's heads as pending, now that its proof is anchored.
fn resolve_batch(witness: &WitnessLog, root: &Hash, out: &mut TickOutcome) {
    for member in witness.members(root).unwrap_or_default() {
        if witness.resolve(&member.head).is_ok() {
            out.resolved += 1;
        }
    }
}

/// Run forever, on [`TICK`].
///
/// Spawned by the daemon at startup. Sleeps rather than spinning, and never
/// returns — a witness loop that exits on error would leave an agent that looks
/// healthy and silently stops anchoring, which is the failure this whole module
/// exists to prevent.
pub fn run_forever<H: Http + Send + Sync + 'static>(
    witness: Arc<WitnessLog>,
    http: Arc<H>,
    calendars: Vec<String>,
    policy: BatchPolicy,
    now: fn() -> i64,
) {
    loop {
        let refs: Vec<&str> = calendars.iter().map(String::as_str).collect();
        let outcome = tick(&witness, http.as_ref(), &refs, &policy, now());

        if outcome != TickOutcome::default() {
            eprintln!(
                "witness: submitted {} · upgraded {} · resolved {} · unreachable {}",
                outcome.submitted, outcome.upgraded, outcome.resolved, outcome.unreachable
            );
        }
        std::thread::sleep(TICK);
    }
}
