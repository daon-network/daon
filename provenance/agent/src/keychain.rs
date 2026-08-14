//! OS keychain-backed [`Signer`](crate::Signer).
//!
//! macOS Keychain, Windows Credential Manager, Linux Secret Service — the OS
//! handles encryption at rest and unlock, so there is no cipher or KDF of ours
//! to get wrong.
//!
//! # The recovery key is deliberately not stored here
//!
//! `key-recovery.md` is normative on this: *"an agent must not store both keys
//! in the same medium by default."* If the author key and the recovery key sit
//! in the same keychain on the same laptop, a stolen laptop takes both and a
//! lost one loses both — and the field buys nothing.
//!
//! So [`KeychainSigner::create`] returns the recovery **secret** once, to be
//! shown to the creator and then dropped. Only the recovery *public* key is
//! persisted, because it has to be committed in every leaf. There is no method
//! on this type that can retrieve a recovery secret, because it was never
//! written down.

use crate::Signer;
use daon_provenance_core::Hash;
use ed25519_dalek::{Signer as _, SigningKey, VerifyingKey};
use keyring::Entry;

/// Something that went wrong talking to the keychain.
#[derive(Debug)]
pub enum KeychainError {
    /// The platform keychain refused or failed.
    Keyring(keyring::Error),
    /// No key is stored for this identity.
    NotFound,
    /// Stored bytes are not a valid key.
    Malformed(&'static str),
    /// A key already exists and would have been overwritten.
    ///
    /// Refused rather than replaced: overwriting an author key orphans every
    /// entity it signed, and no chain could be extended again.
    AlreadyExists,
}

impl std::fmt::Display for KeychainError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            KeychainError::Keyring(e) => write!(f, "keychain: {e}"),
            KeychainError::NotFound => write!(f, "no key stored for this identity"),
            KeychainError::Malformed(w) => write!(f, "stored {w} is malformed"),
            KeychainError::AlreadyExists => {
                write!(f, "a key already exists; refusing to overwrite it")
            }
        }
    }
}

impl std::error::Error for KeychainError {}

impl From<keyring::Error> for KeychainError {
    fn from(e: keyring::Error) -> Self {
        match e {
            keyring::Error::NoEntry => KeychainError::NotFound,
            other => KeychainError::Keyring(other),
        }
    }
}

const SERVICE: &str = "network.daon.provenance";

fn author_entry(identity: &str) -> Result<Entry, KeychainError> {
    Ok(Entry::new(SERVICE, &format!("{identity}.author"))?)
}

fn recovery_pub_entry(identity: &str) -> Result<Entry, KeychainError> {
    Ok(Entry::new(SERVICE, &format!("{identity}.recovery-public"))?)
}

/// The recovery secret, returned exactly once at creation.
///
/// Not `Clone` and not `Debug`, so it cannot be duplicated casually or leaked
/// into a log line. Consume it with [`RecoverySecret::reveal`], show it to the
/// creator, and let it drop.
pub struct RecoverySecret(SigningKey);

impl RecoverySecret {
    /// The 32 secret bytes, for display to the creator.
    ///
    /// Consumes `self`: an agent gets one chance to put this in front of a
    /// person, which is the point. Anything that could hand it over twice would
    /// invite storing it "just in case", which is the failure this design is
    /// avoiding.
    pub fn reveal(self) -> [u8; 32] {
        self.0.to_bytes()
    }

    /// The matching public key, which is what gets committed in every leaf.
    pub fn public(&self) -> Hash {
        self.0.verifying_key().to_bytes()
    }
}

/// A [`Signer`](crate::Signer) whose author key lives in the OS keychain.
pub struct KeychainSigner {
    author: SigningKey,
    recovery_public: Hash,
}

impl KeychainSigner {
    /// Create a new identity.
    ///
    /// Generates an author keypair and a recovery keypair. The author secret is
    /// stored in the keychain; the recovery secret is **returned and never
    /// written anywhere**. Only its public half is persisted.
    ///
    /// Refuses if an author key already exists for `identity`. Overwriting one
    /// would orphan every entity it signed.
    pub fn create(identity: &str) -> Result<(Self, RecoverySecret), KeychainError> {
        let entry = author_entry(identity)?;
        if entry.get_secret().is_ok() {
            return Err(KeychainError::AlreadyExists);
        }

        let mut rng = rand::rngs::OsRng;
        let author = SigningKey::generate(&mut rng);
        let recovery = SigningKey::generate(&mut rng);
        let recovery_public = recovery.verifying_key().to_bytes();

        entry.set_secret(&author.to_bytes())?;
        recovery_pub_entry(identity)?.set_secret(&recovery_public)?;

        Ok((
            KeychainSigner {
                author,
                recovery_public,
            },
            RecoverySecret(recovery),
        ))
    }

    /// Load an existing identity.
    pub fn load(identity: &str) -> Result<Self, KeychainError> {
        let secret = author_entry(identity)?.get_secret()?;
        let bytes: [u8; 32] = secret
            .as_slice()
            .try_into()
            .map_err(|_| KeychainError::Malformed("author key"))?;
        let author = SigningKey::from_bytes(&bytes);

        let rp = recovery_pub_entry(identity)?.get_secret()?;
        let recovery_public: Hash = rp
            .as_slice()
            .try_into()
            .map_err(|_| KeychainError::Malformed("recovery public key"))?;

        // A recovery key that is not a valid point would be committed into every
        // leaf and only fail years later, when someone needed it.
        VerifyingKey::from_bytes(&recovery_public)
            .map_err(|_| KeychainError::Malformed("recovery public key"))?;

        Ok(KeychainSigner {
            author,
            recovery_public,
        })
    }

    /// Remove an identity from the keychain.
    ///
    /// Destroys the ability to extend every entity this key signed. Existing
    /// history stays verifiable — it is witnessed and does not depend on the key
    /// still existing — but nothing can be appended again except through
    /// recovery.
    pub fn delete(identity: &str) -> Result<(), KeychainError> {
        author_entry(identity)?.delete_credential()?;
        let _ = recovery_pub_entry(identity)?.delete_credential();
        Ok(())
    }
}

impl Signer for KeychainSigner {
    fn author_key(&self) -> Hash {
        self.author.verifying_key().to_bytes()
    }

    fn recovery_key(&self) -> Hash {
        self.recovery_public
    }

    fn sign(&self, leaf_id: &Hash) -> [u8; 64] {
        self.author.sign(leaf_id).to_bytes()
    }
}
