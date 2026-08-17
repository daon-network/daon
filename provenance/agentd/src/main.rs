//! The DAON provenance agent daemon.
//!
//! ```text
//! daon-provenance-agentd --store ~/.daon/provenance [--socket PATH] [--identity NAME]
//! ```
//!
//! Binds a Unix domain socket and serves the four routes in
//! `editor-integration-spec.md` §3. Everything it does is composed from crates
//! that are separately tested; this binary is the wiring and the parts that
//! cannot be tested without a real filesystem and a real socket.
//!
//! # Transport, and why there is no `--port`
//!
//! The spec is normative: a Unix domain socket, mode `0600`, **never a TCP port,
//! loopback included**. Its reasoning is worth repeating because it is the kind
//! of thing that erodes — *"a debug flag that opens a port is a debug flag that
//! ships."* So there is no flag. Adding one later means arguing with the spec,
//! which is the point.
//!
//! A caller that can open the socket is already running as the creator and could
//! read the key material directly. The socket is not defending against that. It
//! is defending against every other process on a shared machine.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use daon_provenance_agent::keychain::KeychainSigner;
use daon_provenance_agent::keystore;
use daon_provenance_agent::policy::Limits;
use daon_provenance_agent::witness::WitnessLog;
use daon_provenance_agent::Store;

use daon_provenance_agentd::{api::Agent, server};

fn main() -> std::process::ExitCode {
    match run() {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("daon-provenance-agentd: {e}");
            std::process::ExitCode::FAILURE
        }
    }
}

struct Args {
    store: PathBuf,
    socket: PathBuf,
    identity: String,
}

fn parse_args() -> Result<Args, String> {
    let mut store = None;
    let mut socket = None;
    let mut identity = "default".to_string();

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--store" => store = Some(PathBuf::from(need(&mut args, "--store")?)),
            "--socket" => socket = Some(PathBuf::from(need(&mut args, "--socket")?)),
            "--identity" => identity = need(&mut args, "--identity")?,
            "-h" | "--help" => {
                println!(
                    "daon-provenance-agentd --store PATH [--socket PATH] [--identity NAME]\n\
                     \n\
                       --store     where leaves, blobs and witness state live (required)\n\
                       --socket    socket path (default: <store>/agent.sock)\n\
                       --identity  which keychain identity to sign with (default: default)\n\
                     \n\
                     There is deliberately no --port. See the module docs."
                );
                std::process::exit(0);
            }
            other => return Err(format!("unknown argument {other}")),
        }
    }

    let store = store.ok_or("--store is required")?;
    let socket = socket.unwrap_or_else(|| store.join("agent.sock"));
    Ok(Args {
        store,
        socket,
        identity,
    })
}

fn need(args: &mut impl Iterator<Item = String>, flag: &str) -> Result<String, String> {
    args.next().ok_or(format!("{flag} needs a value"))
}

fn run() -> Result<(), String> {
    let args = parse_args()?;

    let store = Store::open(&args.store).map_err(|e| format!("opening store: {e}"))?;
    let witness = WitnessLog::open(&args.store).map_err(|e| format!("witness state: {e}"))?;

    // Load, or create on first run. Creating returns the recovery secret exactly
    // once, and this is the only moment it can be shown to anyone.
    let signer = match KeychainSigner::load(&args.identity) {
        Ok(s) => s,
        Err(_) => {
            let (signer, recovery) = KeychainSigner::create(&args.identity)
                .map_err(|e| format!("creating identity: {e}"))?;
            announce_new_identity(recovery, &args.identity);
            signer
        }
    };

    let backend = keystore::init();
    eprintln!("credential store: {backend:?}");
    if !backend.sync_requested() {
        eprintln!(
            "note: this build's keys stay on this device. Sync needs a signed app \
             with the iCloud entitlement -- see keystore.rs."
        );
    }

    let agent = Arc::new(Agent::new(
        store,
        witness,
        Box::new(signer),
        Limits::default(),
    ));

    let listener = server::bind(&args.socket)?;
    eprintln!("listening on {}", args.socket.display());
    server::serve_forever(agent, listener, now_ms);
    Ok(())
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        // A clock before the epoch is nonsense, but `local_time_ms` is declared
        // untrusted and signed i64 precisely so it can hold nonsense rather than
        // panicking here.
        .unwrap_or(0)
}

/// Show the recovery secret. Once.
fn announce_new_identity(
    recovery: daon_provenance_agent::keychain::RecoverySecret,
    identity: &str,
) {
    let managed = keystore::is_managed_device();
    let secret = hex::encode(recovery.reveal());

    eprintln!("\n  A new identity '{identity}' was created.\n");
    eprintln!("  Recovery key (shown once, never stored):\n");
    eprintln!("      {secret}\n");
    eprintln!("  Write it somewhere the signing key is not. If this laptop dies,");
    eprintln!("  this is the only thing that can continue your chains.\n");
    if managed {
        eprintln!("  ⚠  This machine appears to be centrally managed by an organisation.");
        eprintln!("     Do not store the recovery key anywhere your employer controls --");
        eprintln!("     not this laptop, not a corporate password vault, not work email.");
        eprintln!("     See docs/design/key-recovery.md, 'Custody domains'.\n");
    }
}
