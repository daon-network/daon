//! The daemon over a real Unix socket.
//!
//! These are the parts the route tests cannot cover: that the socket is created
//! with the permissions the spec requires, that a real HTTP exchange completes
//! over it, and that two daemons cannot fight over one path.

use std::io::{Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::UnixStream;
use std::sync::Arc;

use daon_provenance_agent::policy::Limits;
use daon_provenance_agent::witness::WitnessLog;
use daon_provenance_agent::{Signer, Store};
use daon_provenance_agentd::{api::Agent, server};
use daon_provenance_core::Hash;
use tempfile::TempDir;

struct TestSigner;
impl Signer for TestSigner {
    fn author_key(&self) -> Hash {
        [0xa1; 32]
    }
    fn recovery_key(&self) -> Hash {
        [0xb2; 32]
    }
    fn sign(&self, _: &Hash) -> [u8; 64] {
        [0xcc; 64]
    }
}

fn running() -> (TempDir, std::path::PathBuf) {
    let dir = TempDir::new().unwrap();
    let sock = dir.path().join("agent.sock");

    let store = Store::open(dir.path()).unwrap();
    let witness = std::sync::Arc::new(WitnessLog::open(dir.path()).unwrap());
    let agent = Arc::new(Agent::new(
        store,
        witness,
        Box::new(TestSigner),
        Limits::default(),
    ));

    let listener = server::bind(&sock).expect("bind");
    std::thread::spawn(move || server::serve_forever(agent, listener, || 1_000_000));
    (dir, sock)
}

/// One request over the socket, returning the raw response.
fn request(sock: &std::path::Path, raw: &str) -> String {
    let mut stream = UnixStream::connect(sock).expect("connect");
    stream.write_all(raw.as_bytes()).unwrap();
    stream.flush().unwrap();
    let mut response = String::new();
    stream.read_to_string(&mut response).unwrap();
    response
}

/// The spec requires mode 0600. This is the check that would otherwise only
/// fail in the field, on a machine with a permissive umask.
#[test]
fn the_socket_is_only_readable_by_its_owner() {
    let (_dir, sock) = running();
    let mode = std::fs::metadata(&sock).unwrap().permissions().mode();
    assert_eq!(
        mode & 0o777,
        0o600,
        "socket mode was {:o}, expected 600",
        mode & 0o777
    );
}

#[test]
fn a_real_request_gets_a_real_response() {
    let (_dir, sock) = running();
    let body = r#"{"tool_id":"socket-test/1.0"}"#;
    let response = request(
        &sock,
        &format!(
            "POST /v1/session/open HTTP/1.1\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        ),
    );

    assert!(response.starts_with("HTTP/1.1 200 OK\r\n"), "{response}");
    assert!(response.contains("Content-Type: application/json\r\n"));
    let json = response.split("\r\n\r\n").nth(1).expect("body");
    let parsed: serde_json::Value = serde_json::from_str(json).expect("json body");
    assert!(parsed["session"].as_str().unwrap().starts_with("s_"));
}

/// A full session over the socket: open, observe, commit, then read the proof
/// back. This is the flow an editor performs.
#[test]
fn an_editor_can_complete_a_session() {
    let (_dir, sock) = running();

    let post = |path: &str, body: String| -> serde_json::Value {
        let raw = format!(
            "POST {path} HTTP/1.1\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        );
        let response = request(&sock, &raw);
        serde_json::from_str(response.split("\r\n\r\n").nth(1).unwrap()).unwrap()
    };

    let session = post(
        "/v1/session/open",
        r#"{"tool_id":"socket-test/1.0"}"#.to_string(),
    )["session"]
        .as_str()
        .unwrap()
        .to_string();

    let observed = post(
        "/v1/observe",
        format!(
            r#"{{"session":"{session}","ingress":"keystroke_stream",
                 "span_bytes":{{"added":300,"removed":10}},
                 "op_count":120,"duration_ms":45000}}"#
        ),
    );
    assert_eq!(observed["accepted"], true);

    let committed = post(
        "/v1/commit",
        format!(r#"{{"session":"{session}","content":"a manuscript","reason":"explicit"}}"#),
    );
    assert_eq!(committed["committed"], true, "{committed}");
    let entity = committed["entity_id"].as_str().unwrap();

    let raw = format!("GET /v1/entity/{entity}/proof?seq=0 HTTP/1.1\r\n\r\n");
    let response = request(&sock, &raw);
    let proof: serde_json::Value =
        serde_json::from_str(response.split("\r\n\r\n").nth(1).unwrap()).unwrap();

    assert_eq!(proof["seq"], 0);
    assert_eq!(proof["witness_state"], "pending", "not yet anchored");
    assert_eq!(proof["leaf"].as_str().unwrap().len(), 218 * 2);
}

/// Binding over a live agent must fail rather than stealing its path and
/// leaving two daemons on one store.
#[test]
fn a_second_agent_refuses_to_steal_the_socket() {
    let (_dir, sock) = running();
    match server::bind(&sock) {
        Err(e) => assert!(e.contains("already listening"), "wrong error: {e}"),
        Ok(_) => panic!("bound over a live socket"),
    }
}

/// A leftover socket from a crashed run must not block startup forever.
#[test]
fn a_stale_socket_is_reclaimed() {
    let dir = TempDir::new().unwrap();
    let sock = dir.path().join("agent.sock");

    // Bind and drop: the file stays behind with nothing listening.
    drop(server::bind(&sock).expect("first bind"));
    assert!(sock.exists(), "socket file should remain");

    server::bind(&sock).expect("stale socket should be reclaimed");
}

#[test]
fn a_malformed_request_gets_a_400_not_a_hang() {
    let (_dir, sock) = running();
    let response = request(&sock, "GARBAGE\r\n\r\n");
    assert!(response.starts_with("HTTP/1.1 400"), "{response}");
}

/// A socket path longer than `sun_path` must fail with something actionable
/// rather than the operating system's "path must be shorter than SUN_LEN",
/// which names neither the path nor the remedy.
#[test]
fn an_over_long_socket_path_explains_itself() {
    let dir = TempDir::new().unwrap();
    let deep = dir.path().join("a".repeat(120));
    let err = server::bind(&deep).expect_err("should refuse");
    assert!(err.contains("--socket"), "unhelpful error: {err}");
    assert!(err.contains("bytes"), "no length in error: {err}");
}
