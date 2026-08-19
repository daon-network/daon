//! Local store and leaf construction for DAON provenance versioning.
//!
//! This is a **library**, not a daemon. iOS forbids background processes and
//! cross-app sockets, so the agent has to be linkable directly into an app; a
//! CLI and a desktop daemon are shells around this, not the other way round.
//!
//! # What lives here and what does not
//!
//! Here: the append-only leaf log, the content-addressed blob store, and leaf
//! construction against [`daon_provenance_core`].
//!
//! Not here, deliberately:
//!
//! - **Witnessing.** Nothing in this crate reaches OpenTimestamps. Witness
//!   submission is batched process-wide and rate limited, and a library that
//!   could witness would hand every consumer a way around that.
//! - **Key material.** [`Signer`] is a trait. The keychain-backed implementation
//!   is platform code that belongs above this layer, and tests use an in-memory
//!   signer, so nothing here can accidentally read a private key from disk.
//! - **Coalescing and rate limits.** Policy, layered on top. This crate appends
//!   exactly what it is asked to.

#![forbid(unsafe_code)]
#![deny(missing_docs)]

#[cfg(feature = "keychain")]
pub mod keychain;
pub mod keyevent;
#[cfg(feature = "keychain")]
pub mod keystore;
pub mod policy;
pub mod witness;

use daon_provenance_core::{
    content_commit, inclusion_proof, merkle_root, meta_commit, tag, Beacon, Hash, Observation,
    ProofStep, RevisionLeaf, SEGMENT_SIZE,
};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// Anything that can sign a leaf without surrendering the key.
///
/// A trait rather than a key, so the private key can live in an OS keychain — or
/// a Secure Enclave, if the format ever supports one — and never enter this
/// crate's memory. Implementations sign `leaf_id`, never the leaf body.
pub trait Signer {
    /// Ed25519 public key, committed as `author_key`.
    fn author_key(&self) -> Hash;
    /// Ed25519 public key committed as `recovery_key`.
    ///
    /// Returning 32 zero bytes marks the entity unrecoverable, which the wire
    /// format permits and which an agent should make the creator opt into
    /// rather than choose for them.
    fn recovery_key(&self) -> Hash;
    /// Sign a leaf id.
    fn sign(&self, leaf_id: &Hash) -> [u8; 64];
}

/// Something the store could not do.
#[derive(Debug)]
pub enum Error {
    /// Filesystem failure.
    Io(std::io::Error),
    /// The entity has no leaves, so it has no head.
    EmptyEntity,
    /// A leaf was requested that this entity does not have.
    NoSuchLeaf(u64),
    /// A stored leaf is not the expected size, so the store is damaged.
    CorruptLeaf {
        /// Sequence number of the offending leaf.
        seq: u64,
        /// Bytes actually found.
        len: usize,
    },
    /// A leaf must commit to at least one observation.
    NoObservations,
    /// A key event was signed by the wrong key.
    ///
    /// Each key may replace the other and neither may replace itself, so a
    /// rotation must be signed by the recovery key and a recovery rotation or
    /// transfer by the author key. Checked before anything is written: a leaf
    /// signed by the wrong key would be unverifiable, and discovering that later
    /// means discovering it when the proof was needed.
    WrongAuthorisingKey,
    /// A key event that replaces a key with itself. It would commit to no
    /// content and announce no change, which `wire-format.md` calls malformed.
    KeyUnchanged,
    /// Witness state on disk is not the shape this code writes.
    ///
    /// Carries what was being read rather than an offset, because the useful
    /// question when this fires is which file to look at, not which byte.
    Malformed(&'static str),
}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Error::Io(e)
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Io(e) => write!(f, "io: {e}"),
            Error::EmptyEntity => write!(f, "entity has no leaves"),
            Error::NoSuchLeaf(s) => write!(f, "no leaf at seq {s}"),
            Error::Malformed(what) => write!(f, "malformed {what}"),
            Error::WrongAuthorisingKey => {
                write!(f, "this key does not authorise that key event")
            }
            Error::KeyUnchanged => write!(f, "a key event must actually change a key"),
            Error::CorruptLeaf { seq, len } => {
                write!(f, "leaf {seq} is {len} bytes, expected 218")
            }
            Error::NoObservations => write!(f, "a leaf must commit to at least one observation"),
        }
    }
}

impl std::error::Error for Error {}

/// A stored revision: the leaf itself plus the signature over its id.
///
/// Carried together because the signature is excluded from the hashed body, so
/// it cannot be recovered from the leaf.
#[derive(Debug, Clone)]
pub struct StoredLeaf {
    /// The leaf.
    pub leaf: RevisionLeaf,
    /// Ed25519 signature over `leaf.leaf_id()`.
    pub signature: [u8; 64],
}

/// An on-disk store for one creator's entities.
///
/// Layout:
///
/// ```text
/// <root>/
///   blobs/<first two hex>/<full hex>     content segments, only when kept
///   entities/<entity_id hex>/
///     leaves/<seq padded to 20>.leaf     218-byte body
///     leaves/<seq padded to 20>.sig      64-byte signature
/// ```
///
/// Segments are the unit of storage because they are already the unit of
/// commitment, so deduplication falls out: an unchanged 1 KiB run costs nothing
/// on the next revision. For a manuscript edited in place that is most of it.
pub struct Store {
    root: PathBuf,
    keep_content: bool,
}

fn hex32(h: &Hash) -> String {
    hex::encode(h)
}

impl Store {
    /// Open or create a store rooted at `path`.
    /// Open a store. Content segments are **not** kept — see
    /// [`Store::put_content_with`] for why, and [`Store::open_keeping_content`]
    /// if you want them.
    pub fn open(path: impl AsRef<Path>) -> Result<Self, Error> {
        Self::open_with(path, false)
    }

    /// Open a store that also writes content segments to disk.
    ///
    /// Costs a full copy of the document per revision whenever an edit lands
    /// near the top, because segment boundaries are fixed and a shifted
    /// boundary makes every later segment new. Nothing in this crate reads the
    /// segments back yet, so this is storage for a future reader rather than a
    /// present one.
    pub fn open_keeping_content(path: impl AsRef<Path>) -> Result<Self, Error> {
        Self::open_with(path, true)
    }

    fn open_with(path: impl AsRef<Path>, keep_content: bool) -> Result<Self, Error> {
        let root = path.as_ref().to_path_buf();
        if keep_content {
            fs::create_dir_all(root.join("blobs"))?;
        }
        fs::create_dir_all(root.join("entities"))?;
        Ok(Store { root, keep_content })
    }

    fn blob_path(&self, h: &Hash) -> PathBuf {
        let s = hex32(h);
        self.root.join("blobs").join(&s[..2]).join(&s)
    }

    fn entity_dir(&self, entity: &Hash) -> PathBuf {
        self.root.join("entities").join(hex32(entity))
    }

    pub(crate) fn leaf_path(&self, entity: &Hash, seq: u64, ext: &str) -> PathBuf {
        self.entity_dir(entity)
            .join("leaves")
            .join(format!("{seq:020}.{ext}"))
    }

    /// Write bytes to a path atomically: a partial write must never be mistaken
    /// for a complete one, since a truncated leaf would fail verification in a
    /// way that looks like tampering.
    pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), Error> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let tmp = path.with_extension("tmp");
        {
            let mut f = fs::File::create(&tmp)?;
            f.write_all(bytes)?;
            f.sync_all()?;
        }
        fs::rename(&tmp, path)?;
        Ok(())
    }

    /// Commit to a revision's content, storing the segments only if asked.
    ///
    /// Returns the `content_commit` either way — that is what a leaf needs, and
    /// computing it requires no storage at all.
    ///
    /// # Why storing is off by default
    ///
    /// It cost a great deal and bought nothing. Segments were written and never
    /// read: no code path reconstructed content from them, because nothing
    /// recorded the *order* of a revision's segments, so the bytes were on disk
    /// with no recipe for reassembling them.
    ///
    /// And the cost is worse than it looks. Segment boundaries are fixed at
    /// 1 KiB, so inserting a character near the top of a document shifts every
    /// boundary after it and makes every subsequent segment new. Deduplication
    /// saves nothing on exactly the edit pattern a revision pass produces: a
    /// 500 KB manuscript revised from the top costs 500 KB *per revision*.
    ///
    /// So the default is to commit without storing. A leaf is 282 bytes with its
    /// signature, so a thousand-revision chain costs a few hundred kilobytes and
    /// the creator keeps their own file — which `wire-format.md` §6 already
    /// assumes, since it has a creator generating segment proofs "from content
    /// only they hold".
    ///
    /// Passing `true` restores the old behaviour for a caller who wants it and
    /// understands the bill.
    pub fn put_content_with(&self, content: &[u8], store_segments: bool) -> Result<Hash, Error> {
        if !store_segments {
            return Ok(content_commit(content));
        }
        for seg in content.chunks(SEGMENT_SIZE.max(1)) {
            let h = daon_provenance_core::hash_tagged(tag::CONTENT, seg);
            let p = self.blob_path(&h);
            if !p.exists() {
                Self::write_atomic(&p, seg)?;
            }
        }
        if content.is_empty() {
            let h = daon_provenance_core::hash_tagged(tag::CONTENT, &[]);
            let p = self.blob_path(&h);
            if !p.exists() {
                Self::write_atomic(&p, &[])?;
            }
        }
        Ok(content_commit(content))
    }

    /// Commit to content without storing it. See [`Store::put_content_with`].
    pub fn put_content(&self, content: &[u8]) -> Result<Hash, Error> {
        self.put_content_with(content, self.keep_content)
    }

    /// Whether this store writes content segments to disk.
    pub fn keeps_content(&self) -> bool {
        self.keep_content
    }

    /// Number of leaves in an entity.
    pub fn len(&self, entity: &Hash) -> Result<u64, Error> {
        let dir = self.entity_dir(entity).join("leaves");
        if !dir.exists() {
            return Ok(0);
        }
        let mut n = 0u64;
        for e in fs::read_dir(dir)? {
            let e = e?;
            if e.path().extension().is_some_and(|x| x == "leaf") {
                n += 1;
            }
        }
        Ok(n)
    }

    /// Whether an entity has no leaves.
    pub fn is_empty(&self, entity: &Hash) -> Result<bool, Error> {
        Ok(self.len(entity)? == 0)
    }

    /// Read one stored leaf.
    pub fn leaf(&self, entity: &Hash, seq: u64) -> Result<StoredLeaf, Error> {
        let body =
            fs::read(self.leaf_path(entity, seq, "leaf")).map_err(|_| Error::NoSuchLeaf(seq))?;
        if body.len() != daon_provenance_core::LEAF_BODY_LEN {
            return Err(Error::CorruptLeaf {
                seq,
                len: body.len(),
            });
        }
        let sig_bytes =
            fs::read(self.leaf_path(entity, seq, "sig")).map_err(|_| Error::NoSuchLeaf(seq))?;
        let mut signature = [0u8; 64];
        signature.copy_from_slice(&sig_bytes[..64.min(sig_bytes.len())]);
        Ok(StoredLeaf {
            leaf: decode_leaf(&body),
            signature,
        })
    }

    /// Every leaf id in order. The basis for the head and for proofs.
    pub fn leaf_ids(&self, entity: &Hash) -> Result<Vec<Hash>, Error> {
        let n = self.len(entity)?;
        (0..n)
            .map(|s| Ok(self.leaf(entity, s)?.leaf.leaf_id()))
            .collect()
    }

    /// Current head: the Merkle root over every leaf id.
    ///
    /// Recomputed rather than cached. At the scale one writer produces this is
    /// cheap, and a cache is a second source of truth that can disagree with the
    /// leaves — which for a structure whose purpose is proving what existed is a
    /// bad trade until it is measurably necessary.
    pub fn head(&self, entity: &Hash) -> Result<Hash, Error> {
        let ids = self.leaf_ids(entity)?;
        if ids.is_empty() {
            return Err(Error::EmptyEntity);
        }
        Ok(merkle_root(&ids))
    }

    /// An inclusion proof for one leaf against the current head.
    pub fn proof(&self, entity: &Hash, seq: u64) -> Result<(StoredLeaf, Vec<ProofStep>), Error> {
        let ids = self.leaf_ids(entity)?;
        if ids.is_empty() {
            return Err(Error::EmptyEntity);
        }
        if seq as usize >= ids.len() {
            return Err(Error::NoSuchLeaf(seq));
        }
        Ok((self.leaf(entity, seq)?, inclusion_proof(&ids, seq as usize)))
    }

    /// Append a revision.
    ///
    /// For `seq` 0 this creates the entity, whose id is the genesis leaf id —
    /// content-addressed and immutable, so an entity cannot be renamed.
    #[allow(clippy::too_many_arguments)]
    pub fn append(
        &self,
        entity: Option<&Hash>,
        content: &[u8],
        observations: &[Observation],
        beacon: Beacon,
        signer: &dyn Signer,
        local_time_ms: i64,
    ) -> Result<(Hash, StoredLeaf), Error> {
        if observations.is_empty() {
            return Err(Error::NoObservations);
        }
        let cc = self.put_content(content)?;
        let mc = meta_commit(observations).map_err(|_| Error::NoObservations)?;

        let (seq, parent_head) = match entity {
            None => (0u64, [0u8; 32]),
            Some(e) => (self.len(e)?, self.head(e)?),
        };

        let leaf = RevisionLeaf {
            seq,
            parent_head,
            content_commit: cc,
            meta_commit: mc,
            beacon,
            author_key: signer.author_key(),
            recovery_key: signer.recovery_key(),
            local_time_ms,
        };
        let id = leaf.leaf_id();
        let signature = signer.sign(&id);

        // A genesis leaf's id is the entity id.
        let entity_id = match entity {
            None => id,
            Some(e) => *e,
        };

        Self::write_atomic(&self.leaf_path(&entity_id, seq, "leaf"), &leaf.encode())?;
        Self::write_atomic(&self.leaf_path(&entity_id, seq, "sig"), &signature)?;

        Ok((entity_id, StoredLeaf { leaf, signature }))
    }
}

/// Decode a leaf body. The inverse of [`RevisionLeaf::encode`].
///
/// Total and infallible by construction: the caller has already checked the
/// length, and every field is fixed-width with no optionality, which is exactly
/// why the format was specified that way.
fn decode_leaf(b: &[u8]) -> RevisionLeaf {
    let g32 = |o: usize| -> Hash {
        let mut h = [0u8; 32];
        h.copy_from_slice(&b[o..o + 32]);
        h
    };
    let g8 = |o: usize| -> [u8; 8] {
        let mut x = [0u8; 8];
        x.copy_from_slice(&b[o..o + 8]);
        x
    };
    RevisionLeaf {
        seq: u64::from_be_bytes(g8(1)),
        parent_head: g32(9),
        content_commit: g32(41),
        meta_commit: g32(73),
        beacon: Beacon {
            chain: match b[105] {
                2 => daon_provenance_core::BeaconChain::Daon,
                _ => daon_provenance_core::BeaconChain::Bitcoin,
            },
            height: u64::from_be_bytes(g8(106)),
            block_hash: g32(114),
        },
        author_key: g32(146),
        recovery_key: g32(178),
        local_time_ms: i64::from_be_bytes(g8(210)),
    }
}
