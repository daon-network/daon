//! Appending rotation, recovery-rotation and transfer leaves.
//!
//! These are the operations that let a chain survive a lost, captured or sold
//! key. They are ordinary leaves — same 218 bytes, same Merkle log, same
//! witnessing — distinguished only by an all-zero `content_commit`. See
//! `wire-format.md` §6 and `key-recovery.md`.
//!
//! # Why these do not take a [`Signer`](crate::Signer)
//!
//! Every other append signs with the agent's author key. These do not, and
//! cannot:
//!
//! - a **rotation** replaces the author key and is signed by the *recovery*
//!   key, which is deliberately not stored beside the author key and usually
//!   is not on this machine at all;
//! - a **transfer** is signed by the outgoing author key while naming keys the
//!   agent may never have seen.
//!
//! So the caller supplies the signing secret for the one operation being
//! performed. It is passed in, used, and never written to disk.
//!
//! # None of these are undoable
//!
//! Every one is append-only and witnessed. A mistaken rotation is answered by
//! rotating again, not by removing anything — the chain keeps both, and the
//! order is established by Bitcoin rather than by anyone's say-so.

use crate::{Error, Store, StoredLeaf};
use daon_provenance_core::{Beacon, Hash, RevisionLeaf, KEY_EVENT_SENTINEL};

/// The secret that authorises a key event, and nothing else.
///
/// Deliberately not a [`Signer`](crate::Signer): a `Signer` is a long-lived
/// identity the agent holds, and this is a secret handed over for one call.
pub trait EventSigner {
    /// The public key matching this secret. Checked against the parent leaf
    /// before anything is written, so a wrong key fails before it can produce a
    /// leaf nobody can verify.
    fn public_key(&self) -> Hash;
    /// Sign a leaf id.
    fn sign(&self, leaf_id: &Hash) -> [u8; 64];
}

impl Store {
    /// Replace the author key, authorised by the **recovery** key.
    ///
    /// For a key that is lost, or held by someone who should not have it. The
    /// recovery key is unchanged — §4 of `key-recovery.md` depends on that,
    /// because answering a hostile rotation means rotating again with the same
    /// recovery key, and a rotation that replaced it would leave the legitimate
    /// holder nothing to answer with.
    pub fn rotate_author_key(
        &self,
        entity: &Hash,
        new_author_key: Hash,
        recovery_signer: &dyn EventSigner,
        beacon: Beacon,
        local_time_ms: i64,
    ) -> Result<StoredLeaf, Error> {
        let parent = self.last_leaf(entity)?;

        if recovery_signer.public_key() != parent.recovery_key {
            return Err(Error::WrongAuthorisingKey);
        }
        if new_author_key == parent.author_key {
            return Err(Error::KeyUnchanged);
        }

        self.append_key_event(
            entity,
            &parent,
            new_author_key,
            parent.recovery_key,
            recovery_signer,
            beacon,
            local_time_ms,
        )
    }

    /// Replace the recovery key, authorised by the **author** key.
    ///
    /// For a recovery secret that has been exposed — typed into a machine during
    /// a recovery, photographed, left somewhere it should not have been.
    ///
    /// **This does not take effect immediately.** It governs only after a
    /// witnessed head five days later, so a creator whose author key was stolen
    /// can notice and rotate the thief out with the still-valid recovery key.
    /// The delay is a verifier rule, not something this function enforces —
    /// writing the leaf is not the same as it being in force.
    pub fn rotate_recovery_key(
        &self,
        entity: &Hash,
        new_recovery_key: Hash,
        author_signer: &dyn EventSigner,
        beacon: Beacon,
        local_time_ms: i64,
    ) -> Result<StoredLeaf, Error> {
        let parent = self.last_leaf(entity)?;

        if author_signer.public_key() != parent.author_key {
            return Err(Error::WrongAuthorisingKey);
        }
        if new_recovery_key == parent.recovery_key {
            return Err(Error::KeyUnchanged);
        }

        self.append_key_event(
            entity,
            &parent,
            parent.author_key,
            new_recovery_key,
            author_signer,
            beacon,
            local_time_ms,
        )
    }

    /// Hand the entity to someone else, authorised by the outgoing **author**
    /// key.
    ///
    /// Replaces **both** keys, and must: a transfer that carried the seller's
    /// recovery key forward would let them rotate the chain back afterwards.
    /// They would be doing it visibly, but they would be able to do it.
    ///
    /// The new owner inherits a chain they cannot alter. Everything up to here
    /// is witnessed and fixed; they can only extend it.
    pub fn transfer(
        &self,
        entity: &Hash,
        new_author_key: Hash,
        new_recovery_key: Hash,
        outgoing_author_signer: &dyn EventSigner,
        beacon: Beacon,
        local_time_ms: i64,
    ) -> Result<StoredLeaf, Error> {
        let parent = self.last_leaf(entity)?;

        if outgoing_author_signer.public_key() != parent.author_key {
            return Err(Error::WrongAuthorisingKey);
        }
        if new_author_key == parent.author_key || new_recovery_key == parent.recovery_key {
            return Err(Error::KeyUnchanged);
        }

        self.append_key_event(
            entity,
            &parent,
            new_author_key,
            new_recovery_key,
            outgoing_author_signer,
            beacon,
            local_time_ms,
        )
    }

    /// The entity's most recent leaf, which a key event is classified against.
    pub fn last_leaf(&self, entity: &Hash) -> Result<RevisionLeaf, Error> {
        let len = self.len(entity)?;
        if len == 0 {
            return Err(Error::EmptyEntity);
        }
        Ok(self.leaf(entity, len - 1)?.leaf)
    }

    #[allow(clippy::too_many_arguments)]
    fn append_key_event(
        &self,
        entity: &Hash,
        parent: &RevisionLeaf,
        author_key: Hash,
        recovery_key: Hash,
        signer: &dyn EventSigner,
        beacon: Beacon,
        local_time_ms: i64,
    ) -> Result<StoredLeaf, Error> {
        let seq = self.len(entity)?;
        let parent_head = self.head(entity)?;

        let leaf = RevisionLeaf {
            seq,
            parent_head,
            // The sentinel. No content is committed, and none should be sought.
            content_commit: KEY_EVENT_SENTINEL,
            // Carried forward rather than recomputed: a key event observes
            // nothing, and inventing an observation would put a claim in the
            // log that nobody made.
            meta_commit: parent.meta_commit,
            beacon,
            author_key,
            recovery_key,
            local_time_ms,
        };

        let id = leaf.leaf_id();
        let signature = signer.sign(&id);

        Self::write_atomic(&self.leaf_path(entity, seq, "leaf"), &leaf.encode())?;
        Self::write_atomic(&self.leaf_path(entity, seq, "sig"), &signature)?;

        Ok(StoredLeaf { leaf, signature })
    }
}
