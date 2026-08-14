//! Tests for the keychain-backed signer.
//!
//! **All of these are `#[ignore]` by default and that is deliberate.** They talk
//! to the real OS keychain: on macOS that can prompt and writes into the login
//! keychain, and on Linux it needs a running Secret Service (dbus plus
//! gnome-keyring or equivalent), which CI does not have. A test that cannot run
//! in CI should not be able to fail CI.
//!
//! Run them on a developer machine with:
//!
//! ```text
//! cargo test -p daon-provenance-agent --features keychain -- --ignored
//! ```
//!
//! Each uses a unique identity and deletes it afterwards, so they leave nothing
//! behind in a real user's keychain.

#![cfg(feature = "keychain")]

use daon_provenance_agent::keychain::{KeychainError, KeychainSigner};
use daon_provenance_agent::Signer;

/// A per-test identity, so a failed run cannot wedge a later one and two runs
/// cannot collide.
fn identity(tag: &str) -> String {
    format!(
        "test-{tag}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    )
}

struct Cleanup(String);
impl Drop for Cleanup {
    fn drop(&mut self) {
        let _ = KeychainSigner::delete(&self.0);
    }
}

#[test]
#[ignore = "talks to the real OS keychain"]
fn create_then_load_round_trips() {
    let id = identity("roundtrip");
    let _c = Cleanup(id.clone());

    let (signer, recovery) = KeychainSigner::create(&id).expect("create");
    let author = signer.author_key();
    let recovery_public = recovery.public();
    assert_eq!(
        signer.recovery_key(),
        recovery_public,
        "the committed recovery key is the public half of the returned secret"
    );

    let loaded = KeychainSigner::load(&id).expect("load");
    assert_eq!(loaded.author_key(), author, "author key survives a reload");
    assert_eq!(
        loaded.recovery_key(),
        recovery_public,
        "recovery public key survives a reload"
    );
}

#[test]
#[ignore = "talks to the real OS keychain"]
fn signatures_verify_and_survive_a_reload() {
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};
    let id = identity("sign");
    let _c = Cleanup(id.clone());

    let (signer, _recovery) = KeychainSigner::create(&id).expect("create");
    let leaf_id = [0x5au8; 32];
    let sig = signer.sign(&leaf_id);

    let vk = VerifyingKey::from_bytes(&signer.author_key()).unwrap();
    assert!(vk.verify(&leaf_id, &Signature::from_bytes(&sig)).is_ok());

    // The same key after a reload must produce a verifiable signature over the
    // same leaf — Ed25519 is deterministic, so it must be the identical one.
    let reloaded = KeychainSigner::load(&id).expect("load");
    assert_eq!(
        reloaded.sign(&leaf_id),
        sig,
        "Ed25519 signing is deterministic"
    );
}

#[test]
#[ignore = "talks to the real OS keychain"]
fn creating_over_an_existing_identity_is_refused() {
    let id = identity("exists");
    let _c = Cleanup(id.clone());

    let (_signer, _recovery) = KeychainSigner::create(&id).expect("first create");
    match KeychainSigner::create(&id) {
        Err(KeychainError::AlreadyExists) => {}
        Ok(_) => panic!("overwrote an existing author key — every entity it signed is orphaned"),
        Err(e) => panic!("wrong error: {e}"),
    }
}

#[test]
#[ignore = "talks to the real OS keychain"]
fn loading_an_unknown_identity_reports_not_found() {
    match KeychainSigner::load(&identity("absent")) {
        Err(KeychainError::NotFound) => {}
        Ok(_) => panic!("loaded an identity that was never created"),
        Err(e) => panic!("wrong error: {e}"),
    }
}

#[test]
#[ignore = "talks to the real OS keychain"]
fn deleting_removes_the_identity() {
    let id = identity("delete");
    let (_signer, _recovery) = KeychainSigner::create(&id).expect("create");
    KeychainSigner::delete(&id).expect("delete");
    assert!(
        matches!(KeychainSigner::load(&id), Err(KeychainError::NotFound)),
        "a deleted identity must not load"
    );
}

/// The design property, asserted structurally.
///
/// `key-recovery.md` requires that an agent not store both keys in the same
/// medium. There is no API here that returns a recovery secret after creation,
/// and this test documents that: the only way to obtain one is
/// `RecoverySecret::reveal`, which consumes the value returned by `create`.
///
/// If someone later adds a `recovery_secret()` getter, this comment is the
/// record of why they should not.
#[test]
#[ignore = "talks to the real OS keychain"]
fn a_recovery_secret_cannot_be_retrieved_after_creation() {
    let id = identity("norecover");
    let _c = Cleanup(id.clone());

    let (_signer, recovery) = KeychainSigner::create(&id).expect("create");
    let public = recovery.public();
    let _secret_bytes = recovery.reveal(); // consumes it; there is no second chance

    let loaded = KeychainSigner::load(&id).expect("load");
    assert_eq!(
        loaded.recovery_key(),
        public,
        "the public half is persisted because every leaf commits it"
    );
    // There is deliberately no `loaded.recovery_secret()` to call here.
}

/// The backend is decided once and reported honestly.
///
/// This asserts the *contract*, not a particular answer: what you get depends on
/// how the binary was signed, and `cargo test` produces an unsigned one. The
/// thing that must hold everywhere is that repeated calls agree — a process that
/// registered the file keychain and later claimed to sync would be lying about
/// where a creator's key lives.
#[test]
fn backend_is_stable_and_reports_its_sync_behaviour() {
    use daon_provenance_agent::keystore::{self, Backend};

    let first = keystore::init();
    assert_eq!(first, keystore::init(), "backend changed between calls");

    // Only the synchronized protected store syncs. Anything else must say so.
    assert_eq!(first.sync_requested(), first == Backend::SyncRequested);
}
