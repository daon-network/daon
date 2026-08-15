//! Persisting witness state alongside the log.
//!
//! [`crate::Store`] holds what the creator wrote. This holds what has been
//! *proven about when they wrote it*, which is separate data with a separate
//! lifecycle: a head exists the moment it is appended, and stays unwitnessed for
//! minutes or hours afterwards.
//!
//! ```text
//!   <root>/witness/pending/<head hex>       when the head entered a batch (ms)
//!          batches/<root hex>.ots           the proof, pending then upgraded
//!          batches/<root hex>.members       head, index and inclusion proof
//!          submitted                        last submission time (ms)
//! ```
//!
//! # Why proofs are stored by batch root, not by head
//!
//! One proof covers many heads. Storing a copy per head would duplicate it and,
//! worse, invite the two copies to disagree after an upgrade. Each head instead
//! records which batch it is in, and the batch owns the proof.
//!
//! # No network here either
//!
//! This module writes files. Submitting a sealed root to a calendar, and
//! fetching the upgraded proof later, belong to whatever the agent uses for
//! transport — see the note in `daon-provenance-witness`.

use crate::Error;
use daon_provenance_core::{Hash, ProofStep, Side};
use daon_provenance_witness::batch::{Batch, BatchMembership, BatchPolicy, SealedBatch};
use std::fs;
use std::path::{Path, PathBuf};

/// Witness state for one store.
pub struct WitnessLog {
    root: PathBuf,
}

/// A head that is waiting to be witnessed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PendingHead {
    /// The head.
    pub head: Hash,
    /// When it was queued, by the agent's local clock in milliseconds.
    ///
    /// Used only to decide when to submit. It is never evidence — the witness
    /// time comes from a Bitcoin header.
    pub queued_ms: i64,
}

impl WitnessLog {
    /// Open or create witness state under a store root.
    pub fn open(store_root: impl AsRef<Path>) -> Result<Self, Error> {
        let root = store_root.as_ref().join("witness");
        fs::create_dir_all(root.join("pending"))?;
        fs::create_dir_all(root.join("batches"))?;
        Ok(WitnessLog { root })
    }

    /// Queue a head for witnessing.
    ///
    /// Idempotent: re-queuing a head that is already pending keeps the original
    /// timestamp, so an agent that re-scans its log on startup cannot make an
    /// old head look freshly queued and postpone its anchor indefinitely.
    pub fn queue(&self, head: &Hash, now_ms: i64) -> Result<(), Error> {
        let path = self.pending_path(head);
        if path.exists() {
            return Ok(());
        }
        write_atomic(&path, now_ms.to_string().as_bytes())
    }

    /// Every head waiting to be witnessed, oldest first.
    pub fn pending(&self) -> Result<Vec<PendingHead>, Error> {
        let mut out = Vec::new();
        for entry in fs::read_dir(self.root.join("pending"))? {
            let entry = entry?;
            let name = entry.file_name();
            let Some(head) = name.to_str().and_then(parse_hash) else {
                continue;
            };
            let queued_ms = fs::read_to_string(entry.path())?
                .trim()
                .parse::<i64>()
                .map_err(|_| Error::Malformed("witness queue timestamp"))?;
            out.push(PendingHead { head, queued_ms });
        }
        // Ties broken by head so the order is deterministic, which keeps the
        // batch root reproducible from the same set of files.
        out.sort_by_key(|p| (p.queued_ms, p.head));
        Ok(out)
    }

    /// When the last batch was submitted, if ever.
    pub fn last_submitted_ms(&self) -> Result<Option<i64>, Error> {
        let path = self.root.join("submitted");
        if !path.exists() {
            return Ok(None);
        }
        Ok(Some(
            fs::read_to_string(path)?
                .trim()
                .parse::<i64>()
                .map_err(|_| Error::Malformed("witness submitted timestamp"))?,
        ))
    }

    /// Whether policy says to submit now, given what is pending.
    pub fn should_submit(&self, policy: &BatchPolicy, now_ms: i64) -> Result<bool, Error> {
        let pending = self.pending()?;
        let mut batch = Batch::new();
        for p in &pending {
            batch.push(p.head);
        }
        Ok(policy.should_submit(
            &batch,
            pending.first().map(|p| p.queued_ms),
            self.last_submitted_ms()?,
            now_ms,
        ))
    }

    /// Seal everything pending into a batch ready for submission.
    ///
    /// Does not clear the pending set. A head stays pending until its proof
    /// actually carries a Bitcoin attestation, because a submission that is
    /// lost, rejected or left pending forever must not silently drop the head.
    pub fn seal(&self) -> Result<Option<SealedBatch>, Error> {
        let mut batch = Batch::new();
        for p in self.pending()? {
            batch.push(p.head);
        }
        Ok(batch.seal())
    }

    /// Record a submitted batch and its proof.
    ///
    /// The proof at this stage is normally *pending* — a receipt, not a
    /// timestamp. Call again with the upgraded bytes once it carries a Bitcoin
    /// attestation.
    pub fn record(
        &self,
        sealed: &SealedBatch,
        proof_ots: &[u8],
        submitted_ms: i64,
    ) -> Result<(), Error> {
        // A membership that does not verify would be worthless later, when
        // nobody is around to notice why.
        for m in &sealed.members {
            if !sealed.verify_member(m) {
                return Err(Error::Malformed("batch membership does not prove"));
            }
        }
        write_atomic(&self.proof_path(&sealed.root), proof_ots)?;
        write_atomic(&self.members_path(&sealed.root), &encode_members(sealed)?)?;
        write_atomic(
            &self.root.join("submitted"),
            submitted_ms.to_string().as_bytes(),
        )
    }

    /// Replace a batch's proof with an upgraded one.
    pub fn upgrade(&self, batch_root: &Hash, proof_ots: &[u8]) -> Result<(), Error> {
        let path = self.proof_path(batch_root);
        if !path.exists() {
            return Err(Error::Malformed("no such batch"));
        }
        write_atomic(&path, proof_ots)
    }

    /// A batch's stored proof bytes.
    pub fn proof(&self, batch_root: &Hash) -> Result<Vec<u8>, Error> {
        Ok(fs::read(self.proof_path(batch_root))?)
    }

    /// A batch's stored memberships.
    pub fn members(&self, batch_root: &Hash) -> Result<Vec<BatchMembership>, Error> {
        decode_members(&fs::read(self.members_path(batch_root))?)
    }

    /// Every batch root that has a stored proof.
    pub fn batches(&self) -> Result<Vec<Hash>, Error> {
        let mut out = Vec::new();
        for entry in fs::read_dir(self.root.join("batches"))? {
            let name = entry?.file_name();
            let Some(stem) = name.to_str().and_then(|n| n.strip_suffix(".ots")) else {
                continue;
            };
            if let Some(h) = parse_hash(stem) {
                out.push(h);
            }
        }
        out.sort();
        Ok(out)
    }

    /// Stop tracking a head as pending, once its batch proof is anchored.
    pub fn resolve(&self, head: &Hash) -> Result<(), Error> {
        let path = self.pending_path(head);
        if path.exists() {
            fs::remove_file(path)?;
        }
        Ok(())
    }

    fn pending_path(&self, head: &Hash) -> PathBuf {
        self.root.join("pending").join(hex(head))
    }

    fn proof_path(&self, batch_root: &Hash) -> PathBuf {
        self.root
            .join("batches")
            .join(format!("{}.ots", hex(batch_root)))
    }

    fn members_path(&self, batch_root: &Hash) -> PathBuf {
        self.root
            .join("batches")
            .join(format!("{}.members", hex(batch_root)))
    }
}

// ── membership encoding ───────────────────────────────────────────────────
//
// Fixed-width and self-describing, matching the rest of the project: no serde,
// no format that can drift between versions without anyone noticing.
//
//   u32 BE   member count
//   per member:
//     32     head
//     u32 BE index
//     u32 BE proof step count
//     per step: 1 byte side (0 left, 1 right) + 32 bytes hash

fn encode_members(sealed: &SealedBatch) -> Result<Vec<u8>, Error> {
    let mut out = Vec::new();
    out.extend_from_slice(&(sealed.members.len() as u32).to_be_bytes());
    for m in &sealed.members {
        out.extend_from_slice(&m.head);
        out.extend_from_slice(&(m.index as u32).to_be_bytes());
        out.extend_from_slice(&(m.proof.len() as u32).to_be_bytes());
        for (side, hash) in &m.proof {
            out.push(match side {
                Side::Left => 0,
                Side::Right => 1,
            });
            out.extend_from_slice(hash);
        }
    }
    Ok(out)
}

fn decode_members(bytes: &[u8]) -> Result<Vec<BatchMembership>, Error> {
    let mut c = 0usize;
    let mut take = |n: usize| -> Result<&[u8], Error> {
        let s = bytes
            .get(c..c + n)
            .ok_or(Error::Malformed("batch members truncated"))?;
        c += n;
        Ok(s)
    };
    let count = u32::from_be_bytes(take(4)?.try_into().unwrap()) as usize;
    let mut out = Vec::with_capacity(count.min(1024));
    for _ in 0..count {
        let head: Hash = take(32)?.try_into().unwrap();
        let index = u32::from_be_bytes(take(4)?.try_into().unwrap()) as usize;
        let steps = u32::from_be_bytes(take(4)?.try_into().unwrap()) as usize;
        let mut proof: Vec<ProofStep> = Vec::with_capacity(steps.min(64));
        for _ in 0..steps {
            let side = match take(1)?[0] {
                0 => Side::Left,
                1 => Side::Right,
                _ => return Err(Error::Malformed("batch member proof side")),
            };
            let hash: Hash = take(32)?.try_into().unwrap();
            proof.push((side, hash));
        }
        out.push(BatchMembership { head, index, proof });
    }
    if c != bytes.len() {
        return Err(Error::Malformed("trailing bytes in batch members"));
    }
    Ok(out)
}

// ── helpers ───────────────────────────────────────────────────────────────

fn hex(h: &Hash) -> String {
    h.iter().map(|b| format!("{b:02x}")).collect()
}

fn parse_hash(s: &str) -> Option<Hash> {
    if s.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(s.get(i * 2..i * 2 + 2)?, 16).ok()?;
    }
    Some(out)
}

/// Write via a temporary file and rename, so a crash mid-write leaves the
/// previous contents rather than a half-file. An upgraded proof replacing a
/// pending one is exactly when this matters.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), Error> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)?;
    Ok(())
}
