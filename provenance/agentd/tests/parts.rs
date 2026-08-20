//! Registering a work that is text with pictures in it.
//!
//! `POST /v1/part` streams the work past the agent one part at a time. The agent
//! keeps 32 bytes per part and drops the bytes, so what these tests are really
//! about is that the leaf ends up committing to exactly the parts that were sent,
//! in the order they were sent, without the daemon ever holding the whole work.

use daon_provenance_agent::policy::Limits;
use daon_provenance_agent::witness::WitnessLog;
use daon_provenance_agent::{Signer, Store};
use daon_provenance_agentd::api::Agent;
use daon_provenance_agentd::http::Request;
use daon_provenance_core::{content_commit_parts, Hash, RevisionLeaf};
use serde_json::{json, Value};
use tempfile::TempDir;

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
    let witness = std::sync::Arc::new(WitnessLog::open(dir.path()).unwrap());
    (
        dir,
        Agent::new(store, witness, Box::new(TestSigner), Limits::default()),
    )
}

fn post(agent: &Agent, path: &str, body: Value, now_ms: i64) -> (u16, Value) {
    raw_post(agent, path, body.to_string().as_bytes(), now_ms)
}

/// A request whose body is bytes rather than JSON — the point of `/v1/part`.
fn raw_post(agent: &Agent, path: &str, body: &[u8], now_ms: i64) -> (u16, Value) {
    let mut req = format!(
        "POST {path} HTTP/1.1\r\nContent-Length: {}\r\n\r\n",
        body.len()
    )
    .into_bytes();
    req.extend_from_slice(body);
    let parsed = Request::read(&req[..]).expect("request parses");
    let reply = agent.handle(&parsed, now_ms);
    (
        reply.status,
        serde_json::from_slice(&reply.body).unwrap_or(Value::Null),
    )
}

fn open_session(agent: &Agent, now_ms: i64) -> String {
    let (s, b) = post(
        agent,
        "/v1/session/open",
        json!({"tool_id": "test-editor/1.0"}),
        now_ms,
    );
    assert_eq!(s, 200, "{b}");
    b["session"].as_str().unwrap().to_string()
}

fn observe(agent: &Agent, session: &str, now_ms: i64) {
    let (s, b) = post(
        agent,
        "/v1/observe",
        json!({"session": session, "ingress": "keystroke_stream",
               "span_bytes": {"added": 120, "removed": 4},
               "op_count": 40, "duration_ms": 30000}),
        now_ms,
    );
    assert_eq!(s, 200, "{b}");
}

/// A PNG header and some bytes: not valid UTF-8, which is the thing a JSON
/// string could not have carried.
fn png(seed: u8, len: usize) -> Vec<u8> {
    let mut v = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    v.extend((0..len).map(|i| seed.wrapping_add((i * 37) as u8)));
    v
}

#[test]
fn a_work_of_text_and_pictures_commits_to_exactly_those_parts() {
    let (_d, agent) = agent();
    let s = open_session(&agent, 1_000);
    observe(&agent, &s, 1_000);

    let page = b"The lighthouse keeper wrote this by hand.".to_vec();
    let figure = png(7, 5000);
    let after = b"And then the storm came in.".to_vec();

    for (i, part) in [&page, &figure, &after].iter().enumerate() {
        let (status, body) = raw_post(&agent, &format!("/v1/part?session={s}"), part, 1_000);
        assert_eq!(status, 200, "{body}");
        assert_eq!(body["index"].as_u64().unwrap() as usize, i);
        assert_eq!(body["parts_total"].as_u64().unwrap() as usize, i + 1);
    }

    let (status, body) = post(
        &agent,
        "/v1/commit",
        json!({"session": s, "reason": "explicit"}),
        1_000,
    );
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["committed"], true);

    // The leaf must carry the composite root, not something merely plausible.
    let entity = body["entity_id"].as_str().unwrap().to_string();
    let (status, proof) = {
        let req = format!("GET /v1/entity/{entity}/proof?seq=0 HTTP/1.1\r\n\r\n");
        let parsed = Request::read(req.as_bytes()).unwrap();
        let reply = agent.handle(&parsed, 1_000);
        (
            reply.status,
            serde_json::from_slice::<Value>(&reply.body).unwrap(),
        )
    };
    assert_eq!(status, 200, "{proof}");

    let leaf_hex = proof["leaf"].as_str().unwrap();
    let leaf_bytes = hex::decode(leaf_hex).unwrap();
    let leaf = RevisionLeaf::decode(&leaf_bytes).expect("leaf decodes");

    let expected: Vec<&[u8]> = vec![&page, &figure, &after];
    assert_eq!(
        leaf.content_commit,
        content_commit_parts(&expected),
        "the leaf must commit to the parts that were sent, in order"
    );
}

#[test]
fn order_is_the_order_of_calls() {
    let a = b"alpha".to_vec();
    let b = png(3, 900);

    let root_of = |order: [&Vec<u8>; 2]| {
        let (_d, agent) = agent();
        let s = open_session(&agent, 1_000);
        observe(&agent, &s, 1_000);
        for p in order {
            raw_post(&agent, &format!("/v1/part?session={s}"), p, 1_000);
        }
        let (_, body) = post(
            &agent,
            "/v1/commit",
            json!({"session": s, "reason": "explicit"}),
            1_000,
        );
        let entity = body["entity_id"].as_str().unwrap().to_string();
        let req = format!("GET /v1/entity/{entity}/proof?seq=0 HTTP/1.1\r\n\r\n");
        let parsed = Request::read(req.as_bytes()).unwrap();
        let reply = agent.handle(&parsed, 1_000);
        let v: Value = serde_json::from_slice(&reply.body).unwrap();
        let leaf =
            RevisionLeaf::decode(&hex::decode(v["leaf"].as_str().unwrap()).unwrap()).unwrap();
        leaf.content_commit
    };

    assert_ne!(root_of([&a, &b]), root_of([&b, &a]));
}

#[test]
fn parts_belong_to_the_revision_that_committed_them() {
    let (_d, agent) = agent();
    let s = open_session(&agent, 1_000);

    observe(&agent, &s, 1_000);
    let first = png(1, 700);
    raw_post(&agent, &format!("/v1/part?session={s}"), &first, 1_000);
    let (_, r1) = post(
        &agent,
        "/v1/commit",
        json!({"session": s, "reason": "explicit"}),
        1_000,
    );
    assert_eq!(r1["committed"], true);

    // A second revision sending one part must commit to *that* part alone. If
    // the first revision's parts leaked forward, this root would cover two.
    observe(&agent, &s, 60_000);
    let second = png(2, 700);
    let (status, body) = raw_post(&agent, &format!("/v1/part?session={s}"), &second, 60_000);
    assert_eq!(status, 200, "{body}");
    assert_eq!(
        body["parts_total"].as_u64().unwrap(),
        1,
        "the previous revision's parts must not still be pending"
    );

    let (_, r2) = post(
        &agent,
        "/v1/commit",
        json!({"session": s, "reason": "explicit"}),
        60_000,
    );
    assert_eq!(r2["committed"], true);

    let entity = r2["entity_id"].as_str().unwrap().to_string();
    let req = format!("GET /v1/entity/{entity}/proof?seq=1 HTTP/1.1\r\n\r\n");
    let parsed = Request::read(req.as_bytes()).unwrap();
    let v: Value = serde_json::from_slice(&agent.handle(&parsed, 60_000).body).unwrap();
    let leaf = RevisionLeaf::decode(&hex::decode(v["leaf"].as_str().unwrap()).unwrap()).unwrap();

    let only_second: Vec<&[u8]> = vec![&second];
    assert_eq!(leaf.content_commit, content_commit_parts(&only_second));
}

#[test]
fn sending_both_parts_and_content_is_refused_rather_than_guessed() {
    let (_d, agent) = agent();
    let s = open_session(&agent, 1_000);
    observe(&agent, &s, 1_000);
    raw_post(&agent, &format!("/v1/part?session={s}"), b"a part", 1_000);

    let (status, body) = post(
        &agent,
        "/v1/commit",
        json!({"session": s, "content": "and a buffer", "reason": "explicit"}),
        1_000,
    );
    assert_eq!(status, 400, "{body}");
    assert_eq!(body["error"], "ambiguous_content");
}

#[test]
fn a_part_needs_a_known_session() {
    let (_d, agent) = agent();
    let (status, body) = raw_post(&agent, "/v1/part?session=s_00000000deadbeef", b"x", 1_000);
    assert_eq!(status, 404, "{body}");
    assert_eq!(body["error"], "unknown_session");

    let (status, body) = raw_post(&agent, "/v1/part", b"x", 1_000);
    assert_eq!(status, 400, "{body}");
    assert_eq!(body["error"], "missing_session");
}

#[test]
fn a_plain_text_commit_still_works_exactly_as_before() {
    let (_d, agent) = agent();
    let s = open_session(&agent, 1_000);
    observe(&agent, &s, 1_000);

    let (status, body) = post(
        &agent,
        "/v1/commit",
        json!({"session": s, "content": "just prose", "reason": "explicit"}),
        1_000,
    );
    assert_eq!(status, 200, "{body}");

    let entity = body["entity_id"].as_str().unwrap().to_string();
    let req = format!("GET /v1/entity/{entity}/proof?seq=0 HTTP/1.1\r\n\r\n");
    let parsed = Request::read(req.as_bytes()).unwrap();
    let v: Value = serde_json::from_slice(&agent.handle(&parsed, 1_000).body).unwrap();
    let leaf = RevisionLeaf::decode(&hex::decode(v["leaf"].as_str().unwrap()).unwrap()).unwrap();

    assert_eq!(
        leaf.content_commit,
        daon_provenance_core::content_commit(b"just prose"),
        "a work with no parts must still commit flat, not as a one-part composite"
    );
}

/// The memory claim, made checkable: the daemon's state for a work is 32 bytes
/// per part regardless of how large the parts are.
#[test]
fn the_agent_does_not_retain_the_bytes() {
    let (dir, agent) = agent();
    let s = open_session(&agent, 1_000);
    observe(&agent, &s, 1_000);

    // Four megabytes of parts through a store that does not keep content.
    for i in 0..4u8 {
        let big = png(i, 1024 * 1024);
        let (status, _) = raw_post(&agent, &format!("/v1/part?session={s}"), &big, 1_000);
        assert_eq!(status, 200);
    }
    post(
        &agent,
        "/v1/commit",
        json!({"session": s, "reason": "explicit"}),
        1_000,
    );

    // Nothing resembling the content reached the disk: leaves and signatures
    // only, 218 + 64 bytes per revision.
    let mut total = 0u64;
    for e in walkdir(dir.path()) {
        total += std::fs::metadata(&e).map(|m| m.len()).unwrap_or(0);
    }
    assert!(
        total < 64 * 1024,
        "store grew to {total} bytes for 4 MiB of parts -- content is being kept"
    );
}

fn walkdir(root: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else {
            continue;
        };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
            } else {
                out.push(p);
            }
        }
    }
    out
}
