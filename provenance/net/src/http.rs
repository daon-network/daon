//! The seam between this crate and the network.
//!
//! Narrow on purpose. Two verbs, bytes in and bytes out, no headers a caller can
//! set and no methods beyond what the two clients need. A wider interface would
//! let future code make requests this crate's docs do not describe.

use std::time::Duration;

/// Why a request failed.
#[derive(Debug)]
pub enum HttpError {
    /// The request never completed — DNS, connection, TLS, timeout.
    Transport(String),
    /// A response arrived with a status this client does not accept.
    Status {
        /// The status code returned.
        code: u16,
        /// Body text, truncated. Calendars explain refusals in prose.
        body: String,
    },
    /// The response body could not be read.
    Body(String),
}

impl std::fmt::Display for HttpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HttpError::Transport(e) => write!(f, "transport: {e}"),
            HttpError::Status { code, body } => write!(f, "http {code}: {body}"),
            HttpError::Body(e) => write!(f, "reading body: {e}"),
        }
    }
}

impl std::error::Error for HttpError {}

/// Everything this crate can do to the outside world.
///
/// Implemented once for real requests and substituted in tests, so nothing in
/// this workspace reaches the network during a build or a test run.
pub trait Http {
    /// POST bytes, return the response body.
    fn post(&self, url: &str, body: &[u8], content_type: &str) -> Result<Vec<u8>, HttpError>;
    /// GET a URL, return the response body.
    fn get(&self, url: &str) -> Result<Vec<u8>, HttpError>;
}

/// Response bodies larger than this are refused.
///
/// A calendar proof is a few hundred bytes and a block header is smaller. A
/// remote server should not be able to make this process allocate without
/// bound, and a body far outside the expected size is a sign something is wrong
/// rather than something to parse.
const MAX_RESPONSE: usize = 1024 * 1024;

/// The real client.
pub struct UreqHttp {
    agent: ureq::Agent,
}

impl UreqHttp {
    /// A client with sensible timeouts.
    ///
    /// Timeouts rather than none: a calendar that accepts a connection and then
    /// stops talking would otherwise hang the witness loop indefinitely, and an
    /// unwitnessed head is better than a stuck agent.
    pub fn new() -> Self {
        UreqHttp {
            agent: ureq::AgentBuilder::new()
                .timeout_connect(Duration::from_secs(10))
                .timeout(Duration::from_secs(30))
                .user_agent(concat!("daon-provenance/", env!("CARGO_PKG_VERSION")))
                .build(),
        }
    }
}

impl Default for UreqHttp {
    fn default() -> Self {
        Self::new()
    }
}

fn read_capped(resp: ureq::Response) -> Result<Vec<u8>, HttpError> {
    let mut buf = Vec::new();
    resp.into_reader()
        .take(MAX_RESPONSE as u64 + 1)
        .read_to_end(&mut buf)
        .map_err(|e| HttpError::Body(e.to_string()))?;
    if buf.len() > MAX_RESPONSE {
        return Err(HttpError::Body("response exceeds the size limit".into()));
    }
    Ok(buf)
}

use std::io::Read;

fn convert(e: ureq::Error) -> HttpError {
    match e {
        ureq::Error::Status(code, resp) => {
            let body = resp.into_string().unwrap_or_default();
            HttpError::Status {
                code,
                body: body.chars().take(300).collect(),
            }
        }
        other => HttpError::Transport(other.to_string()),
    }
}

impl Http for UreqHttp {
    fn post(&self, url: &str, body: &[u8], content_type: &str) -> Result<Vec<u8>, HttpError> {
        let resp = self
            .agent
            .post(url)
            .set("Content-Type", content_type)
            .send_bytes(body)
            .map_err(convert)?;
        read_capped(resp)
    }

    fn get(&self, url: &str) -> Result<Vec<u8>, HttpError> {
        let resp = self.agent.get(url).call().map_err(convert)?;
        read_capped(resp)
    }
}
