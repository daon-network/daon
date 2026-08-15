//! Witnessing for DAON provenance — the step that makes a local log evidence.
//!
//! Everything else in `provenance/` is local and free. An agent can hash, chain
//! and sign revisions all day without asking anyone's permission, and none of it
//! proves *when*. This crate is where a head stops being a private assertion and
//! becomes something a stranger can check against Bitcoin.
//!
//! # What is here
//!
//! - [`ots`] — the OpenTimestamps detached-proof format: parse, serialize,
//!   replay operations, read attestations.
//! - [`batch`] — many heads under one anchor, via the Merkle machinery the
//!   revision log already uses.
//! - [`attest`] — turning a proof plus a Bitcoin header into the
//!   `WitnessAttestation` the verifier consumes.
//!
//! # What is deliberately not here
//!
//! **No network.** This crate opens no socket, resolves no hostname and trusts
//! no server. Submitting a digest to a calendar and fetching Bitcoin headers are
//! the caller's job, behind [`attest::BlockSource`] and whatever transport it
//! chooses.
//!
//! That is not squeamishness about dependencies. Whoever supplies the block
//! headers decides what the entire proof rests on — a full node means consensus,
//! a remote API means trusting that API — and burying that choice inside a
//! library would hide the most important assumption in the system. It stays in
//! the open, at the call site.
//!
//! **No clock.** Witness time comes from a Bitcoin block header. The agent's own
//! clock is used only to decide when to make a request, never as evidence.
//!
//! # The shape of a witnessed head
//!
//! ```text
//!   heads ──► Batch ──► seal ──► root ──► calendar ──► pending proof
//!                                                            │
//!                                            (wait for a block, then upgrade)
//!                                                            ▼
//!   verify ◄── Anchor ◄── establish_for_head ◄────────  Bitcoin proof
//! ```
//!
//! The pending stage is the one that gets forgotten: a freshly submitted proof
//! parses cleanly, looks complete, and proves nothing. See
//! [`attest::needs_upgrade`].

#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

pub mod attest;
pub mod batch;
pub mod ots;

pub use attest::{Anchor, BlockHeader, BlockSource};
pub use batch::{Batch, BatchMembership, BatchPolicy, SealedBatch};
pub use ots::{Attestation, DetachedTimestamp, Timestamp};
