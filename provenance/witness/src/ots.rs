//! The OpenTimestamps detached-proof format.
//!
//! A `.ots` file is a digest plus a **tree of operations**. Each path through
//! the tree transforms the digest step by step and ends at an *attestation* —
//! either "a calendar has this, come back later" or "this is committed in
//! Bitcoin block N".
//!
//! Verification is therefore: replay the operations, and see what the result is
//! claimed to be. This module does the replaying and the parsing. It resolves
//! nothing against Bitcoin — [`crate::attest`] does that, because it needs a
//! source of block headers and this module deliberately has none.
//!
//! Reference: <https://github.com/opentimestamps/python-opentimestamps>

use alloc::vec::Vec;
use daon_provenance_core::Hash;

/// The 31-byte header every detached proof starts with.
pub const MAGIC: &[u8] = b"\x00OpenTimestamps\x00\x00Proof\x00\xbf\x89\xe2\xe8\x84\xe8\x92\x94";

/// Serialization format version. Only 1 exists.
pub const VERSION: u8 = 1;

const OP_SHA1: u8 = 0x02;
const OP_RIPEMD160: u8 = 0x03;
const OP_SHA256: u8 = 0x08;
const OP_APPEND: u8 = 0xf0;
const OP_PREPEND: u8 = 0xf1;
const OP_REVERSE: u8 = 0xf2;
const OP_HEXLIFY: u8 = 0xf3;

const TAG_ATTESTATION: u8 = 0x00;
const TAG_FORK: u8 = 0xff;

const ATTEST_BITCOIN: [u8; 8] = [0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01];
const ATTEST_PENDING: [u8; 8] = [0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e];

/// Guards against a hostile proof allocating unbounded memory. The real format
/// never needs anything close to this; OTS itself uses the same limit.
const MAX_VARBYTES: u64 = 4096;

/// A malformed or unsupported proof.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// Not an OpenTimestamps detached proof.
    BadMagic,
    /// Serialization version this code does not implement.
    UnsupportedVersion(u8),
    /// Ran out of bytes mid-structure.
    Truncated,
    /// A length prefix exceeded [`MAX_VARBYTES`], or a varint did not terminate.
    LengthOutOfRange,
    /// An operation tag this code does not implement.
    UnknownOp(u8),
    /// Bytes remain after the proof ends. Refused rather than ignored: trailing
    /// data means the file is not what it claims, and a lenient parser here
    /// would let two implementations disagree about the same file.
    TrailingBytes,
    /// The file's digest is not the length its hash op requires.
    DigestLength,
    /// A node has neither attestations nor branches, so it cannot be written in
    /// a form any reader could terminate.
    EmptyTimestamp,
}

/// One step in a proof path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Op {
    /// Concatenate the argument onto the end.
    Append(Vec<u8>),
    /// Concatenate the argument onto the front.
    Prepend(Vec<u8>),
    /// Reverse the bytes. Deprecated upstream; parsed so old proofs still read.
    Reverse,
    /// Lowercase hex encoding.
    Hexlify,
    /// Hash with SHA-1. **Broken**; see [`Op::execute`].
    Sha1,
    /// Hash with RIPEMD-160.
    Ripemd160,
    /// Hash with SHA-256.
    Sha256,
}

impl Op {
    /// Apply this operation to a message.
    ///
    /// SHA-1 is implemented as an error rather than computed. Collisions have
    /// been public since 2017, so a proof whose path runs through SHA-1 can be
    /// forged, and quietly honouring one would let a forgery verify. Old proofs
    /// that use it are rejected, not upgraded.
    pub fn execute(&self, msg: &[u8]) -> Result<Vec<u8>, Error> {
        use sha2::{Digest, Sha256};
        Ok(match self {
            Op::Append(arg) => [msg, arg].concat(),
            Op::Prepend(arg) => [arg.as_slice(), msg].concat(),
            Op::Reverse => msg.iter().rev().copied().collect(),
            Op::Hexlify => {
                let mut out = Vec::with_capacity(msg.len() * 2);
                for b in msg {
                    out.push(hex_nibble(b >> 4));
                    out.push(hex_nibble(b & 0x0f));
                }
                out
            }
            Op::Sha1 => return Err(Error::UnknownOp(OP_SHA1)),
            Op::Ripemd160 => {
                use ripemd::Ripemd160;
                Ripemd160::digest(msg).to_vec()
            }
            Op::Sha256 => Sha256::digest(msg).to_vec(),
        })
    }
}

fn hex_nibble(n: u8) -> u8 {
    if n < 10 {
        b'0' + n
    } else {
        b'a' + (n - 10)
    }
}

/// What a proof path terminates in.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Attestation {
    /// Committed in the merkle root of a Bitcoin block.
    Bitcoin { height: u64 },
    /// A calendar holds this and will have a Bitcoin attestation later. A proof
    /// with only pending attestations proves **nothing** about time yet.
    Pending { uri: Vec<u8> },
    /// A tag this code does not recognise. Kept rather than dropped so
    /// re-serialization round-trips, but never treated as evidence.
    Unknown { tag: [u8; 8], payload: Vec<u8> },
}

/// A timestamp tree: operations leading to attestations, possibly branching.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Timestamp {
    /// Attestations on the digest at this node.
    pub attestations: Vec<Attestation>,
    /// Each branch applies an operation, then continues.
    pub ops: Vec<(Op, Timestamp)>,
}

impl Timestamp {
    /// Whether this node carries nothing at all. Such a node is not
    /// serializable -- see [`DetachedTimestamp::encode`].
    pub fn is_empty(&self) -> bool {
        self.attestations.is_empty() && self.ops.is_empty()
    }
}

/// A parsed `.ots` detached proof.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetachedTimestamp {
    /// The op identifying how the file digest was produced (always SHA-256 for
    /// our use, but the format permits others).
    pub file_hash_op: Op,
    /// The digest being timestamped.
    pub digest: Vec<u8>,
    /// The tree rooted at that digest.
    pub timestamp: Timestamp,
}

impl DetachedTimestamp {
    /// Build a proof over a 32-byte digest, with no attestations yet.
    pub fn new(digest: Hash) -> Self {
        DetachedTimestamp {
            file_hash_op: Op::Sha256,
            digest: digest.to_vec(),
            timestamp: Timestamp::default(),
        }
    }

    /// Parse a `.ots` file.
    pub fn decode(bytes: &[u8]) -> Result<Self, Error> {
        let mut c = Cursor::new(bytes);
        if c.take(MAGIC.len())? != MAGIC {
            return Err(Error::BadMagic);
        }
        let version = c.varint()?;
        if version != VERSION as u64 {
            return Err(Error::UnsupportedVersion(version as u8));
        }
        let file_hash_op = c.hash_op()?;
        let digest_len = hash_op_len(&file_hash_op);
        let digest = c.take(digest_len)?.to_vec();
        let timestamp = c.timestamp()?;
        if !c.is_empty() {
            return Err(Error::TrailingBytes);
        }
        Ok(DetachedTimestamp {
            file_hash_op,
            digest,
            timestamp,
        })
    }

    /// Serialize back to `.ots` bytes.
    ///
    /// Refuses a tree with no items. A node is terminated by the *absence* of a
    /// fork marker before its final item, so an empty one has no terminator and
    /// writing it would produce a file nothing can parse -- including us.
    pub fn encode(&self) -> Result<Vec<u8>, Error> {
        if self.digest.len() != hash_op_len(&self.file_hash_op) {
            return Err(Error::DigestLength);
        }
        if self.timestamp.is_empty() {
            return Err(Error::EmptyTimestamp);
        }
        let mut out = Vec::from(MAGIC);
        put_varint(&mut out, VERSION as u64);
        out.push(hash_op_tag(&self.file_hash_op));
        out.extend_from_slice(&self.digest);
        put_timestamp(&mut out, &self.timestamp);
        Ok(out)
    }

    /// Every attestation in the tree, paired with the digest it attests to.
    ///
    /// The digest is what the path *computes*, which is the only thing that can
    /// be checked against a block's merkle root. An attestation considered
    /// without its computed digest says nothing.
    pub fn attestations(&self) -> Result<Vec<(Attestation, Vec<u8>)>, Error> {
        let mut found = Vec::new();
        walk(&self.timestamp, &self.digest, &mut found)?;
        Ok(found)
    }
}

fn walk(ts: &Timestamp, msg: &[u8], out: &mut Vec<(Attestation, Vec<u8>)>) -> Result<(), Error> {
    for a in &ts.attestations {
        out.push((a.clone(), msg.to_vec()));
    }
    for (op, next) in &ts.ops {
        let stepped = op.execute(msg)?;
        walk(next, &stepped, out)?;
    }
    Ok(())
}

fn hash_op_len(op: &Op) -> usize {
    match op {
        Op::Sha1 | Op::Ripemd160 => 20,
        _ => 32,
    }
}

fn hash_op_tag(op: &Op) -> u8 {
    match op {
        Op::Sha1 => OP_SHA1,
        Op::Ripemd160 => OP_RIPEMD160,
        _ => OP_SHA256,
    }
}

// ── decoding ──────────────────────────────────────────────────────────────

struct Cursor<'a> {
    b: &'a [u8],
    i: usize,
}

impl<'a> Cursor<'a> {
    fn new(b: &'a [u8]) -> Self {
        Cursor { b, i: 0 }
    }

    fn is_empty(&self) -> bool {
        self.i >= self.b.len()
    }

    fn byte(&mut self) -> Result<u8, Error> {
        let v = *self.b.get(self.i).ok_or(Error::Truncated)?;
        self.i += 1;
        Ok(v)
    }

    fn take(&mut self, n: usize) -> Result<&'a [u8], Error> {
        let end = self.i.checked_add(n).ok_or(Error::LengthOutOfRange)?;
        let s = self.b.get(self.i..end).ok_or(Error::Truncated)?;
        self.i = end;
        Ok(s)
    }

    /// Base-128 varint, little-endian groups, high bit as continuation.
    fn varint(&mut self) -> Result<u64, Error> {
        let mut value: u64 = 0;
        let mut shift = 0u32;
        loop {
            let b = self.byte()?;
            let part = (b & 0x7f) as u64;
            // Reject shifts that would silently drop bits rather than wrapping
            // into a different number than the writer meant.
            if shift >= 64 || (part << shift) >> shift != part {
                return Err(Error::LengthOutOfRange);
            }
            value |= part << shift;
            if b & 0x80 == 0 {
                return Ok(value);
            }
            shift += 7;
        }
    }

    fn varbytes(&mut self) -> Result<Vec<u8>, Error> {
        let n = self.varint()?;
        if n > MAX_VARBYTES {
            return Err(Error::LengthOutOfRange);
        }
        Ok(self.take(n as usize)?.to_vec())
    }

    fn hash_op(&mut self) -> Result<Op, Error> {
        match self.byte()? {
            OP_SHA1 => Ok(Op::Sha1),
            OP_RIPEMD160 => Ok(Op::Ripemd160),
            OP_SHA256 => Ok(Op::Sha256),
            other => Err(Error::UnknownOp(other)),
        }
    }

    /// A node is a list of items -- attestations and operation branches --
    /// where every item **except the last** is preceded by `0xff`. The absence
    /// of that marker is the only thing that terminates a node, which is why
    /// the last item is read outside the loop.
    fn timestamp(&mut self) -> Result<Timestamp, Error> {
        let mut ts = Timestamp::default();
        let mut tag = self.byte()?;
        while tag == TAG_FORK {
            let inner = self.byte()?;
            self.item(&mut ts, inner)?;
            tag = self.byte()?;
        }
        self.item(&mut ts, tag)?;
        Ok(ts)
    }

    /// One item: an attestation, or an operation and everything below it.
    fn item(&mut self, ts: &mut Timestamp, tag: u8) -> Result<(), Error> {
        if tag == TAG_ATTESTATION {
            ts.attestations.push(self.attestation()?);
        } else {
            let op = self.op_from(tag)?;
            let sub = self.timestamp()?;
            ts.ops.push((op, sub));
        }
        Ok(())
    }

    fn op_from(&mut self, tag: u8) -> Result<Op, Error> {
        Ok(match tag {
            OP_APPEND => Op::Append(self.varbytes()?),
            OP_PREPEND => Op::Prepend(self.varbytes()?),
            OP_REVERSE => Op::Reverse,
            OP_HEXLIFY => Op::Hexlify,
            OP_SHA1 => Op::Sha1,
            OP_RIPEMD160 => Op::Ripemd160,
            OP_SHA256 => Op::Sha256,
            other => return Err(Error::UnknownOp(other)),
        })
    }

    fn attestation(&mut self) -> Result<Attestation, Error> {
        let mut tag = [0u8; 8];
        tag.copy_from_slice(self.take(8)?);
        // The payload is length-prefixed so an unknown attestation type can be
        // skipped rather than making the whole proof unreadable.
        let payload = self.varbytes()?;
        Ok(match tag {
            ATTEST_BITCOIN => {
                let mut inner = Cursor::new(&payload);
                Attestation::Bitcoin {
                    height: inner.varint()?,
                }
            }
            ATTEST_PENDING => {
                let mut inner = Cursor::new(&payload);
                Attestation::Pending {
                    uri: inner.varbytes()?,
                }
            }
            _ => Attestation::Unknown { tag, payload },
        })
    }
}

/// Parse a bare timestamp tree, without the `.ots` framing.
///
/// A calendar answers a submission with a **fragment**: the operations leading
/// from your digest into its aggregation tree, and nothing else. No magic, no
/// version, no digest — those belong to a detached proof file, and the calendar
/// assumes you still have the digest you just sent it.
///
/// So this parses the part a calendar sends, and the caller adds the framing to
/// produce a file anything can read. Storing the fragment as-is would leave a
/// blob only this codebase knows how to interpret.
pub fn parse_fragment(bytes: &[u8]) -> Result<Timestamp, Error> {
    let mut c = Cursor::new(bytes);
    let ts = c.timestamp()?;
    if !c.is_empty() {
        return Err(Error::TrailingBytes);
    }
    Ok(ts)
}

// ── encoding ──────────────────────────────────────────────────────────────

fn put_varint(out: &mut Vec<u8>, mut v: u64) {
    loop {
        let mut b = (v & 0x7f) as u8;
        v >>= 7;
        if v != 0 {
            b |= 0x80;
        }
        out.push(b);
        if v == 0 {
            return;
        }
    }
}

fn put_varbytes(out: &mut Vec<u8>, b: &[u8]) {
    put_varint(out, b.len() as u64);
    out.extend_from_slice(b);
}

fn put_op(out: &mut Vec<u8>, op: &Op) {
    match op {
        Op::Append(a) => {
            out.push(OP_APPEND);
            put_varbytes(out, a);
        }
        Op::Prepend(a) => {
            out.push(OP_PREPEND);
            put_varbytes(out, a);
        }
        Op::Reverse => out.push(OP_REVERSE),
        Op::Hexlify => out.push(OP_HEXLIFY),
        Op::Sha1 => out.push(OP_SHA1),
        Op::Ripemd160 => out.push(OP_RIPEMD160),
        Op::Sha256 => out.push(OP_SHA256),
    }
}

/// Mirror of [`Cursor::timestamp`]: attestations first, then op branches, with
/// `0xff` before every item but the last.
fn put_timestamp(out: &mut Vec<u8>, ts: &Timestamp) {
    let total = ts.attestations.len() + ts.ops.len();
    let mut written = 0usize;
    let sep = |out: &mut Vec<u8>, written: usize| {
        if written + 1 < total {
            out.push(TAG_FORK);
        }
    };

    for a in &ts.attestations {
        sep(out, written);
        written += 1;
        out.push(TAG_ATTESTATION);
        match a {
            Attestation::Bitcoin { height } => {
                out.extend_from_slice(&ATTEST_BITCOIN);
                let mut payload = Vec::new();
                put_varint(&mut payload, *height);
                put_varbytes(out, &payload);
            }
            Attestation::Pending { uri } => {
                out.extend_from_slice(&ATTEST_PENDING);
                let mut payload = Vec::new();
                put_varbytes(&mut payload, uri);
                put_varbytes(out, &payload);
            }
            Attestation::Unknown { tag, payload } => {
                out.extend_from_slice(tag);
                put_varbytes(out, payload);
            }
        }
    }
    for (op, sub) in &ts.ops {
        sep(out, written);
        written += 1;
        put_op(out, op);
        put_timestamp(out, sub);
    }
}
