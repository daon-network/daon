//! The editor-facing routes, exercised against a real store on disk.
//!
//! No socket and no keychain: the signer is a fixed test key and requests are
//! built directly. That keeps these tests about the contract in
//! `editor-integration-spec.md` rather than about transport.

use daon_provenance_agent::policy::Limits;
use daon_provenance_agent::witness::WitnessLog;
use daon_provenance_agent::{Signer, Store};
use daon_provenance_agentd::api::Agent;
use daon_provenance_agentd::http::Request;
use daon_provenance_core::Hash;
use serde_json::{json, Value};
use tempfile::TempDir;

/// A signer with fixed keys. Signatures are not what these tests are about.
struct TestSigner;

impl Signer for TestSigner {
    fn author_key(&self) -> Hash {
        [0xa1; 32]
    }
    fn recovery_key(&self) -> Hash {
        [0xb2; 32]
    }
    fn sign(&self, _leaf_id: &Hash) -> [u8; 64] {
        [0xcc; 64]
    }
}

fn agent() -> (TempDir, Agent) {
    let dir = TempDir::new().unwrap();
    let store = Store::open(dir.path()).unwrap();
    let witness = WitnessLog::open(dir.path()).unwrap();
    (
        dir,
        Agent::new(store, witness, Box::new(TestSigner), Limits::default()),
    )
}

fn post(agent: &Agent, path: &str, body: Value, now_ms: i64) -> (u16, Value) {
    let raw = body.to_string();
    let req = format!(
        "POST {path} HTTP/1.1\r\nContent-Length: {}\r\n\r\n{raw}",
        raw.len()
    );
    let parsed = Request::read(req.as_bytes()).expect("request parses");
    let reply = agent.handle(&parsed, now_ms);
    (
        reply.status,
        serde_json::from_slice(&reply.body).unwrap_or(Value::Null),
    )
}

fn get(agent: &Agent, path: &str, now_ms: i64) -> (u16, Value) {
    let req = format!("GET {path} HTTP/1.1\r\n\r\n");
    let parsed = Request::read(req.as_bytes()).expect("request parses");
    let reply = agent.handle(&parsed, now_ms);
    (
        reply.status,
        serde_json::from_slice(&reply.body).unwrap_or(Value::Null),
    )
}

fn open_session(agent: &Agent, now_ms: i64) -> String {
    let (status, body) = post(
        agent,
        "/v1/session/open",
        json!({ "tool_id": "test-editor/1.0" }),
        now_ms,
    );
    assert_eq!(status, 200, "{body}");
    body["session"].as_str().unwrap().to_string()
}

#[test]
fn opening_a_session_returns_live_limits() {
    let (_d, agent) = agent();
    let (status, body) = post(
        &agent,
        "/v1/session/open",
        json!({ "tool_id": "acme-editor/0.4.1" }),
        1_000,
    );

    assert_eq!(status, 200);
    assert!(body["session"].as_str().unwrap().starts_with("s_"));
    // A brand new entity has no head yet.
    assert!(body["entity_id"].is_null());
    assert!(body["head"].is_null());
    // The spec requires live limits so clients pace themselves rather than
    // discovering the floor by being refused.
    assert_eq!(body["limits"]["min_commit_interval_ms"], 2000);
    assert_eq!(body["limits"]["daily_leaf_budget"], 2000);
    assert_eq!(body["limits"]["leaves_remaining_today"], 2000);
}

#[test]
fn a_tool_id_must_be_short_ascii() {
    let (_d, agent) = agent();
    for bad in [json!(""), json!("é-editor"), json!("x".repeat(65))] {
        let (status, body) = post(&agent, "/v1/session/open", json!({ "tool_id": bad }), 1);
        assert_eq!(status, 400, "accepted {bad}: {body}");
    }
}

/// Naming an entity that does not exist must not quietly start a new chain.
#[test]
fn an_unknown_entity_is_refused_rather_than_created() {
    let (_d, agent) = agent();
    let (status, body) = post(
        &agent,
        "/v1/session/open",
        json!({ "tool_id": "e/1", "entity_id": format!("sha256:{}", "11".repeat(32)) }),
        1,
    );
    assert_eq!(status, 404, "{body}");
    assert_eq!(body["error"], "unknown_entity");
}

#[test]
fn observations_accumulate_without_committing() {
    let (_d, agent) = agent();
    let s = open_session(&agent, 1_000);

    for i in 1..=3 {
        let (status, body) = post(
            &agent,
            "/v1/observe",
            json!({
                "session": s,
                "ingress": "keystroke_stream",
                "span_bytes": { "added": 100, "removed": 2 },
                "op_count": 40,
                "duration_ms": 5_000
            }),
            1_000 + i * 10,
        );
        assert_eq!(status, 200);
        assert_eq!(body["accepted"], true);
        assert_eq!(body["pending_observations"], i);
    }
}

/// An unrecognised ingress must not be coerced to `unknown`: that would put a
/// claim in the log the client never made.
#[test]
fn an_undefined_ingress_is_refused_not_coerced() {
    let (_d, agent) = agent();
    let s = open_session(&agent, 1_000);
    let (status, body) = post(
        &agent,
        "/v1/observe",
        json!({
            "session": s,
            "ingress": "typed_by_a_human",
            "span_bytes": { "added": 1, "removed": 0 },
            "op_count": 1,
            "duration_ms": 1
        }),
        1_100,
    );
    assert_eq!(status, 400);
    assert_eq!(body["error"], "bad_ingress");
}

#[test]
fn explicit_commits_produce_a_leaf() {
    let (_d, agent) = agent();
    let s = open_session(&agent, 1_000);
    post(
        &agent,
        "/v1/observe",
        json!({ "session": s, "ingress": "keystroke_stream",
                "span_bytes": { "added": 200, "removed": 5 },
                "op_count": 90, "duration_ms": 30_000 }),
        1_100,
    );

    let (status, body) = post(
        &agent,
        "/v1/commit",
        json!({ "session": s, "content": "the manuscript", "reason": "explicit" }),
        60_000,
    );
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["committed"], true);
    assert_eq!(body["seq"], 0, "genesis");
    assert!(body["entity_id"].as_str().unwrap().starts_with("sha256:"));
}

/// Coalescing is not an error, and the spec says so explicitly.
#[test]
fn an_idle_commit_coalesces_rather_than_failing() {
    let (_d, agent) = agent();
    let s = open_session(&agent, 1_000);
    post(
        &agent,
        "/v1/observe",
        json!({ "session": s, "ingress": "keystroke_stream",
                "span_bytes": { "added": 10, "removed": 0 },
                "op_count": 5, "duration_ms": 1_000 }),
        1_100,
    );

    let (status, body) = post(
        &agent,
        "/v1/commit",
        json!({ "session": s, "content": "draft", "reason": "idle" }),
        1_200,
    );
    assert_eq!(status, 200, "coalescing must not be an error status");
    assert_eq!(body["committed"], false);
    assert_eq!(body["reason"], "coalesced");
    assert!(body["retry_after_ms"].as_u64().unwrap() > 0);
}

/// `explicit` bypasses coalescing but not the rate floor.
#[test]
fn explicit_does_not_bypass_the_rate_floor() {
    let (_d, agent) = agent();
    let s = open_session(&agent, 1_000);

    let observe = |now| {
        post(
            &agent,
            "/v1/observe",
            json!({ "session": s, "ingress": "paste",
                    "span_bytes": { "added": 50, "removed": 0 },
                    "op_count": 1, "duration_ms": 10 }),
            now,
        )
    };

    observe(1_100);
    let (_, first) = post(
        &agent,
        "/v1/commit",
        json!({ "session": s, "content": "a", "reason": "explicit" }),
        2_000,
    );
    assert_eq!(first["committed"], true);

    observe(2_100);
    let (status, second) = post(
        &agent,
        "/v1/commit",
        json!({ "session": s, "content": "ab", "reason": "explicit" }),
        2_200,
    );
    assert_eq!(status, 200);
    assert_eq!(second["committed"], false, "inside the 2s floor");
    assert_eq!(second["reason"], "rate_limited");
}

#[test]
fn a_leaf_needs_at_least_one_observation() {
    let (_d, agent) = agent();
    let s = open_session(&agent, 1_000);
    let (status, body) = post(
        &agent,
        "/v1/commit",
        json!({ "session": s, "content": "nothing was observed", "reason": "explicit" }),
        60_000,
    );
    assert_eq!(status, 400, "{body}");
    assert_eq!(body["error"], "no_observations");
}

/// A second commit in the same session continues the chain rather than starting
/// a new entity -- the session learns its entity id at genesis.
#[test]
fn a_session_continues_its_entity_after_genesis() {
    let (_d, agent) = agent();
    let s = open_session(&agent, 1_000);

    let mut entity = String::new();
    for (i, now) in [10_000i64, 100_000, 200_000].into_iter().enumerate() {
        post(
            &agent,
            "/v1/observe",
            json!({ "session": s, "ingress": "keystroke_stream",
                    "span_bytes": { "added": 30, "removed": 1 },
                    "op_count": 12, "duration_ms": 4_000 }),
            now - 500,
        );
        let (status, body) = post(
            &agent,
            "/v1/commit",
            json!({ "session": s, "content": format!("draft {i}"), "reason": "explicit" }),
            now,
        );
        assert_eq!(status, 200, "{body}");
        assert_eq!(body["committed"], true);
        assert_eq!(body["seq"], i as u64);
        if entity.is_empty() {
            entity = body["entity_id"].as_str().unwrap().to_string();
        } else {
            assert_eq!(body["entity_id"], entity, "forked to a new entity");
        }
    }
}

/// A freshly committed head is unwitnessed, and that is normal rather than an
/// error. The spec is explicit that clients must expect it.
#[test]
fn a_proof_is_pending_until_the_head_is_witnessed() {
    let (_d, agent) = agent();
    let s = open_session(&agent, 1_000);
    post(
        &agent,
        "/v1/observe",
        json!({ "session": s, "ingress": "import",
                "span_bytes": { "added": 900, "removed": 0 },
                "op_count": 1, "duration_ms": 50 }),
        1_100,
    );
    let (_, commit) = post(
        &agent,
        "/v1/commit",
        json!({ "session": s, "content": "imported text", "reason": "explicit" }),
        60_000,
    );
    let entity = commit["entity_id"].as_str().unwrap();

    let (status, body) = get(&agent, &format!("/v1/entity/{entity}/proof?seq=0"), 61_000);
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["witness_state"], "pending");
    assert!(body["witness_receipt"].is_null());
    assert_eq!(body["seq"], 0);
    // 218-byte leaf body, hex encoded.
    assert_eq!(body["leaf"].as_str().unwrap().len(), 218 * 2);
}

#[test]
fn unknown_routes_and_sessions_are_refused() {
    let (_d, agent) = agent();
    assert_eq!(post(&agent, "/v1/nope", json!({}), 1).0, 404);
    assert_eq!(
        post(
            &agent,
            "/v1/observe",
            json!({
            "session": "s_does_not_exist", "ingress": "unknown",
            "span_bytes": { "added": 1, "removed": 0 },
            "op_count": 1, "duration_ms": 1 }),
            1
        )
        .0,
        404
    );
}

#[test]
fn a_malformed_body_is_a_client_error() {
    let (_d, agent) = agent();
    let raw = "{not json";
    let req = format!(
        "POST /v1/session/open HTTP/1.1\r\nContent-Length: {}\r\n\r\n{raw}",
        raw.len()
    );
    let parsed = Request::read(req.as_bytes()).unwrap();
    let reply = agent.handle(&parsed, 1);
    assert_eq!(reply.status, 400);
}
