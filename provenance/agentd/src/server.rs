//! Binding the socket and serving connections.
//!
//! Separate from `main.rs` so it can be tested against a real socket with a test
//! signer, rather than only against whatever identity happens to be in the
//! machine's keychain.

use std::io::Write;
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::Path;
use std::sync::Arc;

use crate::api::{Agent, Reply};
use crate::http;

/// Bind a Unix socket at `path` with mode `0600`.
///
/// Permissions are applied immediately after bind. A permissive umask could
/// otherwise leave a window where the socket is connectable by other users, and
/// that window falls at startup — the most predictable moment a daemon has.
///
/// A stale socket left by a crashed run is removed, but only after confirming
/// nothing is listening: removing a live one would silently steal another
/// agent's path and leave two daemons fighting over one store.
pub fn bind(path: &Path) -> Result<UnixListener, String> {
    check_length(path)?;

    if path.exists() {
        if UnixStream::connect(path).is_ok() {
            return Err(format!(
                "another agent is already listening on {}",
                path.display()
            ));
        }
        std::fs::remove_file(path).map_err(|e| format!("removing stale socket: {e}"))?;
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("creating socket directory: {e}"))?;
    }

    let listener =
        UnixListener::bind(path).map_err(|e| format!("binding {}: {e}", path.display()))?;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
        .map_err(|e| format!("securing socket: {e}"))?;
    Ok(listener)
}

/// `sockaddr_un.sun_path` is a fixed-size buffer: 104 bytes on macOS and the
/// BSDs, 108 on Linux, including the terminating NUL.
///
/// This is not a limit anyone remembers, and exceeding it fails inside `bind`
/// with "path must be shorter than SUN_LEN" -- which says nothing about which
/// path or what to do. Since the default socket lives inside the store, a store
/// in a deep directory makes the daemon unstartable for a reason that looks like
/// a bug in the daemon.
///
/// So it is checked up front, with the number and the way out.
#[cfg(any(target_os = "linux", target_os = "android"))]
const SUN_PATH_MAX: usize = 108;
#[cfg(not(any(target_os = "linux", target_os = "android")))]
const SUN_PATH_MAX: usize = 104;

fn check_length(path: &Path) -> Result<(), String> {
    let len = path.as_os_str().as_encoded_bytes().len();
    if len >= SUN_PATH_MAX {
        return Err(format!(
            "socket path is {len} bytes; the operating system allows at most {}. \
             Pass --socket with a shorter path, for example /tmp/daon-agent.sock. \
             (Path was: {})",
            SUN_PATH_MAX - 1,
            path.display()
        ));
    }
    Ok(())
}

/// Accept forever, one thread per connection.
///
/// Editors hold one connection at a time and requests are short, so an async
/// runtime would be more machinery than the problem has.
pub fn serve_forever(agent: Arc<Agent>, listener: UnixListener, now: fn() -> i64) {
    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                let agent = Arc::clone(&agent);
                std::thread::spawn(move || {
                    if let Err(e) = serve_one(&agent, stream, now()) {
                        eprintln!("connection error: {e}");
                    }
                });
            }
            Err(e) => eprintln!("accept failed: {e}"),
        }
    }
}

/// Read one request, answer it, close.
pub fn serve_one(agent: &Agent, mut stream: UnixStream, now_ms: i64) -> std::io::Result<()> {
    let reply = match http::Request::read(&stream) {
        Ok(request) => agent.handle(&request, now_ms),
        Err(http::Error::TooLarge) => {
            Reply::err(413, "too_large", "request body exceeds the limit")
        }
        Err(http::Error::Malformed(what)) => Reply::err(400, "malformed", what),
        Err(http::Error::Io(e)) => return Err(e),
    };
    write_reply(&mut stream, reply)
}

fn write_reply<W: Write>(w: &mut W, reply: Reply) -> std::io::Result<()> {
    let extra: Vec<(&str, &str)> = reply
        .headers
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    http::respond(w, reply.status, &reply.body, &extra)
}
