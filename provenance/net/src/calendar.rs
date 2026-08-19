//! Submitting a digest to an OpenTimestamps calendar, and collecting the proof.
//!
//! A calendar is a free public aggregator. You give it 32 bytes; it merges them
//! with everyone else's into a Merkle tree and periodically writes that tree's
//! root into a Bitcoin transaction. One fee covers everybody who submitted in
//! that interval, which is why timestamping is affordable at all.
//!
//! Our batching sits on top of theirs: we merge a creator's heads into one root,
//! the calendar merges that root with the world's.
//!
//! # The two-step shape, which is easy to get wrong
//!
//! Submission returns immediately with a **pending** proof — a receipt saying a
//! calendar has the digest, carrying no Bitcoin attestation. It parses cleanly
//! and looks finished and proves nothing about time.
//!
//! The real proof exists only after a Bitcoin transaction confirms, which takes
//! hours. Something has to come back and fetch it. Until it does, the head is
//! not witnessed, whatever the file on disk looks like.
//!
//! # What a calendar learns
//!
//! A 32-byte digest and the fact that somebody timestamped something. Not what,
//! not whose, not how large, not how many heads are inside it. Submitting to
//! several is normal and is what the public pool does.

use daon_provenance_core::Hash;
use daon_provenance_witness::ots::{Attestation, DetachedTimestamp};

use crate::http::{Http, HttpError};

/// The public calendars operated by the OpenTimestamps project.
///
/// Submitting to more than one is deliberate redundancy: any single calendar
/// may vanish, and a proof from a calendar that no longer exists is still valid
/// — but only if it was upgraded before it went. More submissions, more chances
/// the upgrade succeeds.
pub const PUBLIC_CALENDARS: &[&str] = &[
    "https://alice.btc.calendar.opentimestamps.org",
    "https://bob.btc.calendar.opentimestamps.org",
    "https://finney.calendar.eternitywall.com",
];

/// Why a calendar interaction failed.
#[derive(Debug)]
pub enum CalendarError {
    /// The request did not complete.
    Http(HttpError),
    /// The calendar answered with something that is not a timestamp.
    Malformed(String),
    /// Asked for an upgrade that is not ready. Expected, and not a failure —
    /// Bitcoin confirmation takes hours.
    NotReadyYet,
}

impl std::fmt::Display for CalendarError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CalendarError::Http(e) => write!(f, "{e}"),
            CalendarError::Malformed(m) => write!(f, "calendar returned {m}"),
            CalendarError::NotReadyYet => {
                write!(f, "not yet anchored; try again after the next block")
            }
        }
    }
}

impl std::error::Error for CalendarError {}

impl From<HttpError> for CalendarError {
    fn from(e: HttpError) -> Self {
        CalendarError::Http(e)
    }
}

/// A client for one calendar.
pub struct Calendar<'a, H: Http> {
    base_url: String,
    http: &'a H,
}

impl<'a, H: Http> Calendar<'a, H> {
    /// Point a client at a calendar. The URL is used as given, with no
    /// discovery and no redirects followed to somewhere else.
    pub fn new(base_url: impl Into<String>, http: &'a H) -> Self {
        Calendar {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            http,
        }
    }

    /// Submit a digest. Returns the **pending** proof.
    ///
    /// The calendar's response is a timestamp *fragment*: the operations
    /// leading from your digest into its aggregation tree, ending in a pending
    /// attestation. It is not a `.ots` file — that framing is added here, so
    /// what gets stored is a complete detached proof rather than a fragment
    /// only this code knows how to read.
    pub fn submit(&self, digest: &Hash) -> Result<DetachedTimestamp, CalendarError> {
        let body = self.http.post(
            &format!("{}/digest", self.base_url),
            digest,
            "application/octet-stream",
        )?;

        let timestamp = daon_provenance_witness::ots::parse_fragment(&body)
            .map_err(|e| CalendarError::Malformed(format!("{e:?}")))?;

        Ok(DetachedTimestamp {
            file_hash_op: daon_provenance_witness::ots::Op::Sha256,
            digest: digest.to_vec(),
            timestamp,
        })
    }

    /// Fetch the upgraded proof for a digest, once Bitcoin has confirmed it.
    ///
    /// [`CalendarError::NotReadyYet`] is the ordinary answer for hours after
    /// submission and callers should treat it as such rather than as an error
    /// worth reporting to anyone.
    pub fn upgrade(&self, digest: &Hash) -> Result<DetachedTimestamp, CalendarError> {
        let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
        let body = match self.http.get(&format!("{}/timestamp/{hex}", self.base_url)) {
            Ok(b) => b,
            // A calendar answers 404 while a digest is known but not yet
            // anchored. That is "come back later", not "no such thing".
            Err(HttpError::Status { code: 404, .. }) => return Err(CalendarError::NotReadyYet),
            Err(e) => return Err(e.into()),
        };

        let timestamp = daon_provenance_witness::ots::parse_fragment(&body)
            .map_err(|e| CalendarError::Malformed(format!("{e:?}")))?;

        let proof = DetachedTimestamp {
            file_hash_op: daon_provenance_witness::ots::Op::Sha256,
            digest: digest.to_vec(),
            timestamp,
        };

        // A calendar can answer with a still-pending fragment. Returning it as
        // an upgrade would let a caller overwrite a good proof with a worthless
        // one, so it is refused here rather than trusted to be checked later.
        let has_bitcoin = proof
            .attestations()
            .map_err(|e| CalendarError::Malformed(format!("{e:?}")))?
            .iter()
            .any(|(a, _)| matches!(a, Attestation::Bitcoin { .. }));

        if !has_bitcoin {
            return Err(CalendarError::NotReadyYet);
        }
        Ok(proof)
    }
}

/// What a round of submissions produced: the proofs, and who could not be
/// reached. Named because a bare tuple of two vectors of tuples is unreadable.
pub type SubmitResults = (
    Vec<(String, DetachedTimestamp)>,
    Vec<(String, CalendarError)>,
);

/// Submit to several calendars, keeping every proof that came back.
///
/// Failures are returned alongside successes rather than aborting: one calendar
/// being down is not a reason to discard a proof another one gave you, and a
/// single surviving proof is enough to establish a time.
pub fn submit_to_all<H: Http>(http: &H, digest: &Hash, calendars: &[&str]) -> SubmitResults {
    let mut proofs = Vec::new();
    let mut failures = Vec::new();
    for url in calendars {
        match Calendar::new(*url, http).submit(digest) {
            Ok(p) => proofs.push((url.to_string(), p)),
            Err(e) => failures.push((url.to_string(), e)),
        }
    }
    (proofs, failures)
}
