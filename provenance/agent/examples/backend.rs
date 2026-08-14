//! Reports which credential store this build actually gets.
//!
//! The answer depends on how the binary was signed, so packaging has to check it
//! against the shipped artifact rather than assume it. An unsigned or ad-hoc
//! signed build — anything `cargo build` produces — will report `FileKeychain`.
fn main() {
    let backend = daon_provenance_agent::keystore::init();
    println!("backend        = {backend:?}");
    println!("sync requested = {}", backend.sync_requested());
}
