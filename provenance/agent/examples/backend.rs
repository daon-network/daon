//! Reports which credential store this build gets, and whether the machine
//! looks centrally managed.
//!
//! The store depends on how the binary was signed, so packaging has to check it
//! against the shipped artifact rather than assume it. An unsigned or ad-hoc
//! signed build — anything `cargo build` produces — reports `FileKeychain`.
fn main() {
    let backend = daon_provenance_agent::keystore::init();
    println!("backend        = {backend:?}");
    println!("sync requested = {}", backend.sync_requested());
    println!(
        "managed device = {} (hint only; false means \"not detected\")",
        daon_provenance_agent::keystore::is_managed_device()
    );
}
