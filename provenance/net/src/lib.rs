//! The only crate in this workspace that talks to the network.
//!
//! Everything else is deliberately offline: `core` hashes, `verify` checks,
//! `witness` parses proofs, `agent` writes files. None of them can open a
//! socket, and that is a structural fact rather than a convention — a reviewer
//! confirms it by reading one `Cargo.toml`.
//!
//! This crate exists so the agent's egress is **enumerable**. Every outbound
//! request it can make is in this file and the two beside it. If that stops
//! being true, the property the design claims has quietly stopped being true
//! too.
//!
//! # What may leave the machine
//!
//! | Destination | Sends | Never sends |
//! | --- | --- | --- |
//! | [`calendar`] | one 32-byte digest | content, keys, filenames, counts |
//! | [`blocks`] | a block height | anything about the creator |
//!
//! A calendar learns a digest and the fact that somebody timestamped something.
//! It cannot tell what, whose, or how large. That is the whole privacy story and
//! it holds only while this crate stays small.
//!
//! # Everything is behind a trait
//!
//! [`Http`] is the seam. Tests substitute a canned transport, so no test in this
//! workspace reaches the network — including the ones that check what a request
//! looks like.

#![deny(missing_docs)]

pub mod blocks;
pub mod calendar;
pub mod http;

pub use blocks::HttpBlockSource;
pub use calendar::{Calendar, CalendarError};
pub use http::{Http, HttpError, UreqHttp};
