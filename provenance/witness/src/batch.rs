//! Batching heads into a single witness.
//!
//! # Why this is mandatory rather than an optimisation
//!
//! Witnessing is the one operation in this system that consumes a shared,
//! finite resource: calendar servers run on somebody else's goodwill, and every
//! Bitcoin anchor costs a real fee someone pays. Authoring events are free and
//! local, leaves are free and local, **witnesses are neither**.
//!
//! So the agent must never submit one head per save. It accumulates heads, and
//! submits a single digest covering all of them.
//!
//! # The trick is that we already have the machinery
//!
//! A batch is a Merkle tree over the pending heads, and the batch root is what
//! gets timestamped. Each head then keeps an inclusion proof against that root —
//! and `daon-provenance-core` already computes exactly these, because it is the
//! same construction the revision log uses.
//!
//! One anchor therefore witnesses any number of heads at the cost of
//! `log2(n)` extra hashes each, and verification stays the four steps: a batch
//! adds a hop to the proof, never a new kind of check.

use alloc::vec::Vec;
use daon_provenance_core::{inclusion_proof, merkle_root, verify_inclusion, Hash, ProofStep};

/// Heads waiting to be witnessed together.
#[derive(Debug, Clone, Default)]
pub struct Batch {
    heads: Vec<Hash>,
}

/// A head's place in a sealed batch.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BatchMembership {
    /// The head this is about.
    pub head: Hash,
    /// Its position in the batch.
    pub index: usize,
    /// Path from the head to the batch root.
    pub proof: Vec<ProofStep>,
}

/// A batch that has been closed and is ready to submit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SealedBatch {
    /// The digest to hand to a calendar. **This** is what gets timestamped.
    pub root: Hash,
    /// One entry per head, in batch order.
    pub members: Vec<BatchMembership>,
}

impl Batch {
    /// An empty batch.
    pub fn new() -> Self {
        Batch::default()
    }

    /// How many heads are waiting.
    pub fn len(&self) -> usize {
        self.heads.len()
    }

    /// Whether nothing is waiting.
    pub fn is_empty(&self) -> bool {
        self.heads.is_empty()
    }

    /// Queue a head.
    ///
    /// Duplicates are dropped. The same head arriving twice is the ordinary
    /// result of an idle agent re-checking its log, and submitting it twice
    /// would spend a shared resource to prove something already proven.
    pub fn push(&mut self, head: Hash) -> bool {
        if self.heads.contains(&head) {
            return false;
        }
        self.heads.push(head);
        true
    }

    /// Close the batch and compute the digest to submit.
    ///
    /// Returns `None` for an empty batch: there is nothing to witness, and
    /// submitting the Merkle root of nothing would burn a request to prove that
    /// no work happened.
    pub fn seal(&self) -> Option<SealedBatch> {
        if self.heads.is_empty() {
            return None;
        }
        let root = merkle_root(&self.heads);
        let members = self
            .heads
            .iter()
            .enumerate()
            .map(|(index, head)| BatchMembership {
                head: *head,
                index,
                proof: inclusion_proof(&self.heads, index),
            })
            .collect();
        Some(SealedBatch { root, members })
    }
}

impl SealedBatch {
    /// Check that a membership really leads to this batch's root.
    ///
    /// Worth calling before persisting. A membership that does not verify is a
    /// bug that would otherwise surface years later, when someone tried to use
    /// the proof and found it worthless.
    pub fn verify_member(&self, member: &BatchMembership) -> bool {
        verify_inclusion(&member.head, &member.proof, &self.root)
    }
}

/// When a batch should be sealed and submitted.
///
/// Both limits are ceilings, not targets. Reaching either seals the batch; the
/// interval exists so a slow writer is not left unwitnessed indefinitely, and
/// the size cap exists so a fast one does not build a proof so wide that every
/// member pays for it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BatchPolicy {
    /// Seal once this many heads are waiting.
    pub max_heads: usize,
    /// Seal once the oldest head has waited this long.
    pub max_wait_ms: i64,
    /// Never submit more often than this, whatever else is true.
    ///
    /// The backstop. Every other rule here can be argued with; this one is what
    /// stops a misbehaving caller from becoming a problem for the calendars.
    pub min_interval_ms: i64,
}

impl Default for BatchPolicy {
    fn default() -> Self {
        BatchPolicy {
            // 512 heads is a 9-deep proof: negligible per member, and far more
            // than a single creator generates between anchors.
            max_heads: 512,
            // An hour bounds how stale an unwitnessed head can be. Bitcoin's own
            // granularity is ~10 minutes, so finer would buy nothing real.
            max_wait_ms: 60 * 60 * 1000,
            // Ten minutes. One Bitcoin block; submitting faster cannot produce a
            // better timestamp, so it would be pure waste.
            min_interval_ms: 10 * 60 * 1000,
        }
    }
}

impl BatchPolicy {
    /// Whether to seal and submit now.
    ///
    /// `now_ms` and the timestamps are the agent's local clock, which is
    /// untrusted for evidence but perfectly fine for deciding when to make a
    /// request. The witness time comes from Bitcoin, not from here.
    pub fn should_submit(
        &self,
        batch: &Batch,
        oldest_head_ms: Option<i64>,
        last_submit_ms: Option<i64>,
        now_ms: i64,
    ) -> bool {
        if batch.is_empty() {
            return false;
        }
        // The floor is checked first and overrides everything, so no combination
        // of the rules below can produce a burst.
        if let Some(last) = last_submit_ms {
            if now_ms.saturating_sub(last) < self.min_interval_ms {
                return false;
            }
        }
        if batch.len() >= self.max_heads {
            return true;
        }
        match oldest_head_ms {
            Some(oldest) => now_ms.saturating_sub(oldest) >= self.max_wait_ms,
            None => false,
        }
    }
}
