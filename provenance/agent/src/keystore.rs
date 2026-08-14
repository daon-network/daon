//! Which OS credential store the author key goes into.
//!
//! On Apple platforms there are two, and the difference is not cosmetic:
//!
//! - the **file keychain** (`~/Library/Keychains/login.keychain-db`) is the old
//!   one. It works for any binary, signed or not, and it **never syncs**.
//! - the **protected store** (data protection, the iOS-style API) is
//!   application-scoped and can set `kSecAttrSynchronizable`, which is what asks
//!   iCloud Keychain to carry an item to the creator's other devices.
//!
//! We want the second one. A creator who writes on a laptop and a tablet has one
//! identity, not two, and making them run a key-transfer ceremony to move
//! between their own devices is the kind of friction that ends with the feature
//! unused.
//!
//! # Sync is a property of the packaged app, not of this crate
//!
//! The upstream crate says the protected store needs a code-signed application,
//! and that *"since command-line tools cannot be code-signed, there's not much
//! point in their using this module."* Measured on macOS 15 / Apple Silicon,
//! that is exactly right: an ad-hoc linker-signed `cargo` binary gets
//! `errSecMissingEntitlement` on the first write to **either** protected store,
//! synchronized or local. Only the file keychain accepts it.
//!
//! So the agent reaches iCloud Keychain only when it ships as a signed app with
//! the iCloud entitlement in its provisioning profile. `cargo build` will always
//! report [`Backend::FileKeychain`], and that is not a bug to chase — it is the
//! honest answer for an unsigned binary.
//!
//! Even in a properly signed build, [`Backend::SyncRequested`] is not named
//! `Synced`, because `kSecAttrSynchronizable` is a *request*. The keychain
//! accepts the attribute locally; whether `syncd` carries the item depends on
//! state no process can introspect about itself. Confirming real propagation
//! takes two devices on one Apple ID. Until someone has done that against a
//! signed build, no caller should print "your key is on all your devices."

use std::collections::HashMap;
use std::sync::OnceLock;

/// Which store the author key landed in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Backend {
    /// Protected store with `kSecAttrSynchronizable` set: iCloud Keychain has
    /// been *asked* to carry the key to the creator's other Apple devices.
    ///
    /// Whether it does depends on entitlements this process cannot inspect. See
    /// the module docs — do not render this to a creator as "synced."
    SyncRequested,
    /// Protected store, device-local. Better isolation than the file keychain,
    /// since the item sits in this application's access group rather than in a
    /// keychain any process running as this user can query. Does not sync.
    LocalProtected,
    /// File-based login keychain. Works everywhere on macOS. Does not sync.
    FileKeychain,
    /// Windows Credential Manager or Linux Secret Service, via keyring's
    /// defaults. Neither has a synchronized variant to opt into.
    Platform,
}

impl Backend {
    /// Whether sync was *requested* for keys in this store.
    ///
    /// Deliberately not named `syncs()`. This is the strongest claim available
    /// from inside the process, and it is weaker than the one a UI wants to
    /// make.
    pub fn sync_requested(self) -> bool {
        matches!(self, Backend::SyncRequested)
    }
}

static BACKEND: OnceLock<Backend> = OnceLock::new();

/// Register the credential store, once per process.
///
/// Must run before any credential is built. Note that this crate deliberately
/// does not use `keyring::Entry`: that shim's `new` forces a `LazyLock` which
/// calls `set_default_store` with the file keychain, discarding whatever was
/// registered here. Every entry point in [`crate::keychain`] calls this, so
/// callers do not have to remember.
///
/// Falls back rather than failing. A creator whose platform refuses the
/// protected store still gets a working agent with a device-local key, which is
/// a real if lesser thing; the return value says which one they got.
pub fn init() -> Backend {
    *BACKEND.get_or_init(register)
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
fn register() -> Backend {
    use keyring_core::api::CredentialStoreApi;
    use std::sync::Arc;

    type Store = Arc<dyn CredentialStoreApi + Send + Sync>;
    type Candidate = (Backend, fn() -> keyring_core::Result<Store>);

    // Constructing a store proves nothing: `new_with_configuration` succeeds on
    // an unentitled process and only the first *write* reports
    // errSecMissingEntitlement. So each candidate is probed with a real
    // round-trip against a throwaway item before we commit to it.
    let candidates: [Candidate; 3] = [
        (Backend::SyncRequested, || {
            apple_native_keyring_store::protected::Store::new_with_configuration(&HashMap::from([
                ("cloud-sync", "true"),
            ]))
            .map(|s| s as Store)
        }),
        (Backend::LocalProtected, || {
            apple_native_keyring_store::protected::Store::new().map(|s| s as Store)
        }),
        (Backend::FileKeychain, || {
            apple_native_keyring_store::keychain::Store::new().map(|s| s as Store)
        }),
    ];

    for (backend, build) in candidates {
        let Ok(store) = build() else { continue };
        if probe(&store) {
            keyring_core::set_default_store(store);
            return backend;
        }
    }

    // Every candidate refused. Leave keyring's lazy default alone; the next
    // `Entry` will surface the platform's own error, which says more than
    // anything we could invent here.
    Backend::FileKeychain
}

/// Write and read back a throwaway item, then remove it.
///
/// The item is namespaced so a half-failed probe cannot collide with a real
/// author key. A store that cannot round-trip one byte cannot hold a signing
/// key, and finding that out now beats finding out at the creator's first save.
#[cfg(any(target_os = "macos", target_os = "ios"))]
fn probe(store: &std::sync::Arc<dyn keyring_core::api::CredentialStoreApi + Send + Sync>) -> bool {
    let Ok(cred) = store.build("network.daon.provenance.probe", "probe", None) else {
        return false;
    };
    if cred.set_secret(b"probe").is_err() {
        return false;
    }
    let ok = matches!(cred.get_secret(), Ok(v) if v == b"probe");
    let _ = cred.delete_credential();
    ok
}

#[cfg(not(any(target_os = "macos", target_os = "ios")))]
fn register() -> Backend {
    // Windows Credential Manager and Linux Secret Service are what keyring
    // installs by default, and neither offers a synchronized variant.
    let _ = HashMap::<&str, &str>::new();
    Backend::Platform
}
