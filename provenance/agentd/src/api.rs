//! The routes from `editor-integration-spec.md` §3.
//!
//! Everything here is a thin composition over parts that already exist and are
//! tested — `policy` decides, `Store` appends, `WitnessLog` queues. The daemon's
//! job is to hold them together and to enforce the one rule the spec opens with:
//!
//! > The editor reports what it observed. It never reports what the content is.
//!
//! Which is why there is no route that accepts a claim about origin, and why
//! `ingress` is a closed enum with `unknown` as an honest member rather than a
//! failure.

use std::collections::HashMap;
use std::sync::Mutex;

use daon_provenance_agent::policy::{CommitReason, Decision, Limits, Observed, Session};
use daon_provenance_agent::witness::WitnessLog;
use daon_provenance_agent::{Signer, Store};
use daon_provenance_core::{Beacon, BeaconChain, Hash, Ingress, Observation};
use serde::{Deserialize, Serialize};

use crate::http::{error_body, Request};

/// A response ready to write: status, JSON body, extra headers.
pub struct Reply {
    pub status: u16,
    pub body: Vec<u8>,
    pub headers: Vec<(String, String)>,
}

impl Reply {
    fn ok<T: Serialize>(value: &T) -> Reply {
        Reply {
            status: 200,
            body: serde_json::to_vec(value)
                .unwrap_or_else(|_| error_body("internal", "response could not be serialized")),
            headers: Vec::new(),
        }
    }

    pub fn err(status: u16, code: &str, message: &str) -> Reply {
        Reply {
            status,
            body: error_body(code, message),
            headers: Vec::new(),
        }
    }

    fn with_header(mut self, k: &str, v: String) -> Reply {
        self.headers.push((k.to_string(), v));
        self
    }
}

/// Everything the daemon owns, behind one lock.
///
/// A single mutex rather than fine-grained locking: requests are infrequent and
/// short, the store is the shared resource anyway, and a coarse lock that is
/// obviously correct beats a clever one that is not. If this ever becomes a
/// bottleneck it will be visible in the timings rather than in a corrupted log.
pub struct Agent {
    inner: Mutex<Inner>,
}

struct Inner {
    store: Store,
    witness: WitnessLog,
    signer: Box<dyn Signer + Send>,
    limits: Limits,
    sessions: HashMap<String, Live>,
    next_session: u64,
}

struct Live {
    entity: Option<Hash>,
    tool_id: Vec<u8>,
    policy: Session,
}

impl Agent {
    pub fn new(
        store: Store,
        witness: WitnessLog,
        signer: Box<dyn Signer + Send>,
        limits: Limits,
    ) -> Self {
        Agent {
            inner: Mutex::new(Inner {
                store,
                witness,
                signer,
                limits,
                sessions: HashMap::new(),
                next_session: 1,
            }),
        }
    }

    /// Dispatch a request. Unknown paths 404 rather than falling through to
    /// anything.
    pub fn handle(&self, req: &Request, now_ms: i64) -> Reply {
        match (req.method.as_str(), req.path.as_str()) {
            ("POST", "/v1/session/open") => self.session_open(req, now_ms),
            ("POST", "/v1/observe") => self.observe(req, now_ms),
            ("POST", "/v1/commit") => self.commit(req, now_ms),
            ("GET", p) if p.starts_with("/v1/entity/") && p.ends_with("/proof") => {
                self.proof(req, p)
            }
            ("POST", _) | ("GET", _) => Reply::err(404, "not_found", "no such route"),
            _ => Reply::err(405, "method_not_allowed", "unsupported method"),
        }
    }
}

// ── POST /v1/session/open ─────────────────────────────────────────────────

#[derive(Deserialize)]
struct OpenReq {
    /// Omitted to create a new entity.
    entity_id: Option<String>,
    tool_id: String,
}

#[derive(Serialize)]
struct OpenResp {
    session: String,
    entity_id: Option<String>,
    head: Option<String>,
    head_seq: Option<u64>,
    limits: LimitsResp,
}

#[derive(Serialize)]
struct LimitsResp {
    min_commit_interval_ms: u64,
    daily_leaf_budget: u32,
    leaves_remaining_today: u32,
}

impl Agent {
    fn session_open(&self, req: &Request, now_ms: i64) -> Reply {
        let body: OpenReq = match parse(&req.body) {
            Ok(b) => b,
            Err(r) => return r,
        };
        if body.tool_id.is_empty() || body.tool_id.len() > 64 || !body.tool_id.is_ascii() {
            return Reply::err(400, "bad_tool_id", "tool_id must be 1-64 ASCII bytes");
        }

        let mut inner = self.inner.lock().unwrap();

        let entity = match &body.entity_id {
            Some(s) => match parse_hash(s) {
                Some(h) => Some(h),
                None => return Reply::err(400, "bad_entity_id", "expected sha256:<64 hex>"),
            },
            None => None,
        };

        // An entity named but absent is a client error, not a silent genesis.
        // Creating a fresh chain because a lookup failed would fork history
        // exactly when someone thought they were continuing it.
        let (head, head_seq) = match entity {
            Some(e) => match inner.store.head(&e) {
                Ok(h) => {
                    let seq = inner.store.len(&e).unwrap_or(0);
                    (Some(h), Some(seq.saturating_sub(1)))
                }
                Err(_) => return Reply::err(404, "unknown_entity", "no such entity in this store"),
            },
            None => (None, None),
        };

        let limits = inner.limits;
        let id = format!("s_{:016x}", inner.next_session);
        inner.next_session += 1;
        let policy = Session::new(limits, now_ms);
        let remaining = limits
            .daily_leaf_budget
            .saturating_sub(policy.leaves_today());

        inner.sessions.insert(
            id.clone(),
            Live {
                entity,
                tool_id: body.tool_id.clone().into_bytes(),
                policy,
            },
        );

        Reply::ok(&OpenResp {
            session: id,
            entity_id: entity.as_ref().map(hex_id),
            head: head.as_ref().map(hex_id),
            head_seq,
            limits: LimitsResp {
                min_commit_interval_ms: limits.min_commit_interval_ms,
                daily_leaf_budget: limits.daily_leaf_budget,
                leaves_remaining_today: remaining,
            },
        })
    }
}

// ── POST /v1/observe ──────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ObserveReq {
    session: String,
    ingress: String,
    span_bytes: Span,
    op_count: u64,
    duration_ms: u64,
}

#[derive(Deserialize)]
struct Span {
    added: u64,
    removed: u64,
}

#[derive(Serialize)]
struct ObserveResp {
    accepted: bool,
    throttled: bool,
    pending_observations: usize,
}

impl Agent {
    fn observe(&self, req: &Request, now_ms: i64) -> Reply {
        let body: ObserveReq = match parse(&req.body) {
            Ok(b) => b,
            Err(r) => return r,
        };
        // An unrecognised ingress is refused rather than mapped to `unknown`.
        // `unknown` is an honest answer a tool chooses; silently substituting it
        // for a typo would put a claim in the log the client never made.
        let Some(ingress) = ingress_from(&body.ingress) else {
            return Reply::err(400, "bad_ingress", "not a defined ingress value");
        };

        let mut inner = self.inner.lock().unwrap();
        let Some(live) = inner.sessions.get_mut(&body.session) else {
            return Reply::err(404, "unknown_session", "no such session");
        };

        let observation = Observation {
            tool_id: live.tool_id.clone(),
            ingress,
            added: body.span_bytes.added,
            removed: body.span_bytes.removed,
            duration_ms: body.duration_ms,
            op_count: body.op_count,
        };

        let outcome = live.policy.observe(observation, now_ms);
        let throttled = matches!(outcome, Observed::Throttled);
        Reply::ok(&ObserveResp {
            accepted: !throttled,
            throttled,
            pending_observations: live.policy.pending().len(),
        })
    }
}

// ── POST /v1/commit ───────────────────────────────────────────────────────

#[derive(Deserialize)]
struct CommitReq {
    session: String,
    content: String,
    reason: String,
}

#[derive(Serialize)]
struct Committed {
    committed: bool,
    seq: u64,
    head: String,
    leaf: String,
    entity_id: String,
}

#[derive(Serialize)]
struct NotCommitted {
    committed: bool,
    reason: &'static str,
    retry_after_ms: u64,
}

impl Agent {
    fn commit(&self, req: &Request, now_ms: i64) -> Reply {
        let body: CommitReq = match parse(&req.body) {
            Ok(b) => b,
            Err(r) => return r,
        };
        let Some(reason) = reason_from(&body.reason) else {
            return Reply::err(400, "bad_reason", "not a defined commit reason");
        };

        let mut inner = self.inner.lock().unwrap();
        let Some(live) = inner.sessions.get_mut(&body.session) else {
            return Reply::err(404, "unknown_session", "no such session");
        };

        match live.policy.decide(reason, now_ms) {
            Decision::Commit => {}
            Decision::Coalesce { retry_after_ms } => {
                return Reply::ok(&NotCommitted {
                    committed: false,
                    reason: "coalesced",
                    retry_after_ms,
                })
            }
            Decision::RateLimited { retry_after_ms } => {
                return Reply::ok(&NotCommitted {
                    committed: false,
                    reason: "rate_limited",
                    retry_after_ms,
                })
            }
            Decision::BudgetExhausted { retry_after_ms } => {
                return Reply::err(429, "budget_exhausted", "daily leaf budget spent")
                    .with_header("Retry-After", (retry_after_ms / 1000).max(1).to_string())
            }
        }

        let observations = live.policy.take_for_commit(now_ms);
        if observations.is_empty() {
            return Reply::err(
                400,
                "no_observations",
                "a leaf must commit to at least one observation",
            );
        }

        let entity = live.entity;
        let tool = live.tool_id.clone();
        let _ = tool;

        // The beacon is a free lower bound on time, taken from a recent Bitcoin
        // block. Until the daemon has a block source this is the zero beacon,
        // which is honest: it claims nothing rather than claiming an unverified
        // height. See the note in main.rs.
        let beacon = Beacon {
            chain: BeaconChain::Bitcoin,
            height: 0,
            block_hash: [0u8; 32],
        };

        let Inner {
            store,
            witness,
            signer,
            sessions,
            ..
        } = &mut *inner;

        let appended = store.append(
            entity.as_ref(),
            body.content.as_bytes(),
            &observations,
            beacon,
            signer.as_ref(),
            now_ms,
        );

        let (entity_id, leaf) = match appended {
            Ok(v) => v,
            Err(e) => return Reply::err(500, "append_failed", &e.to_string()),
        };

        // A new entity's id is only known after genesis, so the session learns
        // it here and subsequent commits continue the same chain.
        if let Some(live) = sessions.get_mut(&body.session) {
            live.entity = Some(entity_id);
        }

        let head = match store.head(&entity_id) {
            Ok(h) => h,
            Err(e) => return Reply::err(500, "head_failed", &e.to_string()),
        };

        // Queue for witnessing. A failure here must not lose the leaf, which is
        // already durable -- it means this head is unwitnessed until the next
        // sweep picks it up.
        if let Err(e) = witness.queue(&head, now_ms) {
            eprintln!("warning: could not queue head for witnessing: {e}");
        }

        Reply::ok(&Committed {
            committed: true,
            seq: leaf.leaf.seq,
            head: hex_id(&head),
            leaf: hex_id(&leaf.leaf.leaf_id()),
            entity_id: hex_id(&entity_id),
        })
    }
}

// ── GET /v1/entity/{id}/proof?seq=N ───────────────────────────────────────

#[derive(Serialize)]
struct ProofResp {
    leaf: String,
    seq: u64,
    inclusion_proof: Vec<ProofStepResp>,
    head: String,
    witness_state: &'static str,
    witness_receipt: Option<WitnessReceipt>,
}

#[derive(Serialize)]
struct ProofStepResp {
    side: &'static str,
    hash: String,
}

#[derive(Serialize)]
struct WitnessReceipt {
    batch_root: String,
    /// Base16 of the stored `.ots`. Opaque to the editor; it belongs to whoever
    /// verifies.
    ots: String,
}

impl Agent {
    fn proof(&self, req: &Request, path: &str) -> Reply {
        let id = path
            .trim_start_matches("/v1/entity/")
            .trim_end_matches("/proof");
        let Some(entity) = parse_hash(id) else {
            return Reply::err(400, "bad_entity_id", "expected sha256:<64 hex> or 64 hex");
        };
        let Some(seq) = req.query.get("seq").and_then(|s| s.parse::<u64>().ok()) else {
            return Reply::err(400, "bad_seq", "seq query parameter required");
        };

        let inner = self.inner.lock().unwrap();
        let (stored, proof) = match inner.store.proof(&entity, seq) {
            Ok(v) => v,
            Err(e) => return Reply::err(404, "no_such_leaf", &e.to_string()),
        };
        let head = match inner.store.head(&entity) {
            Ok(h) => h,
            Err(e) => return Reply::err(500, "head_failed", &e.to_string()),
        };

        // A head that is still queued is pending by definition. This reports
        // `pending` rather than an error, because pending is the normal state
        // for minutes to hours after writing and an editor must not treat it as
        // a failure.
        let pending = inner
            .witness
            .pending()
            .map(|p| p.iter().any(|h| h.head == head))
            .unwrap_or(true);

        let receipt = if pending {
            None
        } else {
            find_receipt(&inner.witness, &head)
        };

        Reply::ok(&ProofResp {
            leaf: hex::encode(stored.leaf.encode()),
            seq,
            inclusion_proof: proof
                .iter()
                .map(|(side, h)| ProofStepResp {
                    side: match side {
                        daon_provenance_core::Side::Left => "left",
                        daon_provenance_core::Side::Right => "right",
                    },
                    hash: hex::encode(h),
                })
                .collect(),
            head: hex_id(&head),
            witness_state: if receipt.is_some() {
                "witnessed"
            } else {
                "pending"
            },
            witness_receipt: receipt,
        })
    }
}

fn find_receipt(witness: &WitnessLog, head: &Hash) -> Option<WitnessReceipt> {
    for root in witness.batches().ok()? {
        let members = witness.members(&root).ok()?;
        if members.iter().any(|m| &m.head == head) {
            return Some(WitnessReceipt {
                batch_root: hex_id(&root),
                ots: hex::encode(witness.proof(&root).ok()?),
            });
        }
    }
    None
}

// ── helpers ───────────────────────────────────────────────────────────────

fn parse<T: for<'de> Deserialize<'de>>(body: &[u8]) -> Result<T, Reply> {
    serde_json::from_slice(body)
        .map_err(|e| Reply::err(400, "bad_request", &format!("invalid JSON body: {e}")))
}

fn hex_id(h: &Hash) -> String {
    format!("sha256:{}", hex::encode(h))
}

fn parse_hash(s: &str) -> Option<Hash> {
    let s = s.strip_prefix("sha256:").unwrap_or(s);
    if s.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    hex::decode_to_slice(s, &mut out).ok()?;
    Some(out)
}

fn ingress_from(s: &str) -> Option<Ingress> {
    Some(match s {
        "keystroke_stream" => Ingress::KeystrokeStream,
        "paste" => Ingress::Paste,
        "import" => Ingress::Import,
        "programmatic" => Ingress::Programmatic,
        "unknown" => Ingress::Unknown,
        _ => return None,
    })
}

fn reason_from(s: &str) -> Option<CommitReason> {
    Some(match s {
        "idle" => CommitReason::Idle,
        "save" => CommitReason::Save,
        "close" => CommitReason::Close,
        "explicit" => CommitReason::Explicit,
        _ => return None,
    })
}
