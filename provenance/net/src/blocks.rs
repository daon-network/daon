//! Resolving a Bitcoin block height to the header fields a proof needs.
//!
//! [`daon_provenance_witness::BlockSource`] deliberately has no implementation
//! in the witness crate, because **whoever answers these questions decides what
//! the whole proof rests on.** A full node answers from consensus; a header
//! chain answers from proof-of-work; a public API answers because it says so.
//! Burying that choice in a library would hide the most consequential assumption
//! in the system.
//!
//! So this lives here, in the crate whose entire job is to be the visible place
//! where trust leaves the machine, and it is one implementation among several a
//! caller might reasonably prefer.
//!
//! # What this one trusts
//!
//! An HTTP API. That is weaker than a node and it is stated rather than
//! implied: a service that lies about a merkle root can make a forged proof
//! verify. It is a reasonable default for a creator who is not going to run
//! Bitcoin Core, and it should never be described as trustless.

use daon_provenance_witness::{BlockHeader, BlockSource};

use crate::http::Http;

/// A [`BlockSource`] backed by an Esplora-compatible HTTP API.
///
/// Esplora is what Blockstream and mempool.space run, and its shape is
/// widely reimplemented, so pointing this at a self-hosted instance is a
/// one-line change rather than a different implementation.
pub struct HttpBlockSource<'a, H: Http> {
    base_url: String,
    http: &'a H,
}

impl<'a, H: Http> HttpBlockSource<'a, H> {
    /// Point at an Esplora-compatible API.
    ///
    /// `https://blockstream.info/api` and `https://mempool.space/api` both
    /// work. Prefer your own.
    pub fn new(base_url: impl Into<String>, http: &'a H) -> Self {
        HttpBlockSource {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            http,
        }
    }

    fn fetch(&self, height: u64) -> Option<BlockHeader> {
        // Two calls, because Esplora addresses blocks by hash rather than
        // height: the first resolves the height, the second reads the header.
        let hash = String::from_utf8(
            self.http
                .get(&format!("{}/block-height/{height}", self.base_url))
                .ok()?,
        )
        .ok()?;
        let hash = hash.trim();
        if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
            return None;
        }

        let body = self
            .http
            .get(&format!("{}/block/{hash}", self.base_url))
            .ok()?;
        let text = String::from_utf8(body).ok()?;

        // A minimal field scrape rather than a JSON dependency. Two numbers and
        // a hex string are not worth a parser, and the fields are fixed shapes:
        // `"merkle_root":"<64 hex>"` and `"timestamp":<digits>`.
        let merkle_root_hex = scrape_string(&text, "merkle_root")?;
        let time_secs: u32 = scrape_number(&text, "timestamp")?.try_into().ok()?;

        // Esplora reports the merkle root in display order, which is the
        // reverse of the internal byte order a timestamp proof computes. Getting
        // this backwards makes every proof fail to verify against a block that
        // does commit to it.
        let mut root = [0u8; 32];
        for (i, byte) in root.iter_mut().enumerate() {
            let j = 31 - i;
            *byte = u8::from_str_radix(merkle_root_hex.get(j * 2..j * 2 + 2)?, 16).ok()?;
        }

        Some(BlockHeader {
            merkle_root: root,
            time_secs,
        })
    }
}

impl<H: Http> BlockSource for HttpBlockSource<'_, H> {
    fn header(&self, height: u64) -> Option<BlockHeader> {
        self.fetch(height)
    }
}

/// Pull `"key":"value"` out of a JSON object without parsing it.
fn scrape_string<'t>(text: &'t str, key: &str) -> Option<&'t str> {
    let at = text.find(&format!("\"{key}\""))?;
    let rest = &text[at + key.len() + 2..];
    let open = rest.find('"')? + 1;
    let close = rest[open..].find('"')? + open;
    Some(&rest[open..close])
}

/// Pull `"key":123` out of a JSON object without parsing it.
fn scrape_number(text: &str, key: &str) -> Option<u64> {
    let at = text.find(&format!("\"{key}\""))?;
    let rest = &text[at + key.len() + 2..];
    let start = rest.find(|c: char| c.is_ascii_digit())?;
    let end = rest[start..]
        .find(|c: char| !c.is_ascii_digit())
        .map(|e| e + start)
        .unwrap_or(rest.len());
    rest[start..end].parse().ok()
}
