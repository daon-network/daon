//! Just enough HTTP/1.1 to serve the editor API over a Unix socket.
//!
//! # Why not a web framework
//!
//! The surface is four routes over a `0600` socket on the local machine. Pulling
//! in an async runtime and a full server stack for that would add far more code
//! than it replaced, and every line of it would also be reachable from the same
//! socket.
//!
//! The usual argument for a real HTTP library is that HTTP parsing is
//! security-critical because it faces the internet. This never does: the spec is
//! normative that the transport is a Unix domain socket and **never a TCP port,
//! loopback included**. Anything that can open the socket is already running as
//! the creator.
//!
//! So this parses the small, strict subset the spec needs and refuses the rest.
//! Notably it does **not** implement chunked transfer encoding, pipelining, or
//! keep-alive — a request without a `Content-Length` is rejected rather than
//! guessed at.
//!
//! JSON is a different judgement: see the note in `Cargo.toml`.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};

/// Bodies larger than this are refused before being read.
///
/// A commit carries the full buffer, so this has to accommodate a real
/// manuscript — but not an unbounded one, or a single request could exhaust
/// memory.
pub const MAX_BODY: usize = 64 * 1024 * 1024;

/// The request line and headers are tiny; anything larger is malformed.
const MAX_HEAD: usize = 16 * 1024;

/// A parsed request.
pub struct Request {
    pub method: String,
    /// Path with any query string removed.
    pub path: String,
    /// Decoded query parameters, empty if there was no query string.
    pub query: HashMap<String, String>,
    pub body: Vec<u8>,
}

/// Why a request could not be read.
#[derive(Debug)]
pub enum Error {
    Io(std::io::Error),
    /// Malformed beyond the point of a useful reply.
    Malformed(&'static str),
    /// Well-formed but larger than [`MAX_BODY`].
    TooLarge,
}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Error::Io(e)
    }
}

impl Request {
    /// Read one request. Does not support keep-alive: one request per
    /// connection, which is all the spec's flow needs and removes a whole class
    /// of framing bugs.
    pub fn read<R: Read>(stream: R) -> Result<Request, Error> {
        let mut reader = BufReader::new(stream);

        let mut line = String::new();
        read_line(&mut reader, &mut line)?;
        let mut parts = line.split_whitespace();
        let method = parts
            .next()
            .ok_or(Error::Malformed("no method"))?
            .to_string();
        let target = parts.next().ok_or(Error::Malformed("no path"))?.to_string();

        // Require a recognisable version token. Without this a request line of
        // arbitrary junk parses as a method and a path and is only rejected
        // later by the router, which reports the wrong problem.
        match parts.next() {
            Some(v) if v.starts_with("HTTP/1.") => {}
            _ => return Err(Error::Malformed("not an HTTP/1.x request line")),
        }

        let mut headers = HashMap::new();
        let mut consumed = line.len();
        loop {
            let mut h = String::new();
            read_line(&mut reader, &mut h)?;
            consumed += h.len();
            if consumed > MAX_HEAD {
                return Err(Error::Malformed("headers too large"));
            }
            let h = h.trim_end();
            if h.is_empty() {
                break;
            }
            let (k, v) = h.split_once(':').ok_or(Error::Malformed("bad header"))?;
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }

        // No Content-Length means no body. A body without one would need chunked
        // decoding, which is not implemented and is not guessed at.
        let len: usize = match headers.get("content-length") {
            Some(v) => v.parse().map_err(|_| Error::Malformed("bad length"))?,
            None => 0,
        };
        if len > MAX_BODY {
            return Err(Error::TooLarge);
        }
        let mut body = vec![0u8; len];
        reader.read_exact(&mut body)?;

        let (path, query) = match target.split_once('?') {
            Some((p, q)) => (p.to_string(), parse_query(q)),
            None => (target, HashMap::new()),
        };

        Ok(Request {
            method,
            path,
            query,
            body,
        })
    }
}

fn read_line<R: BufRead>(reader: &mut R, out: &mut String) -> Result<(), Error> {
    out.clear();
    let n = reader.read_line(out)?;
    if n == 0 {
        return Err(Error::Malformed("connection closed mid-request"));
    }
    Ok(())
}

fn parse_query(q: &str) -> HashMap<String, String> {
    q.split('&')
        .filter(|s| !s.is_empty())
        .filter_map(|pair| {
            let (k, v) = pair.split_once('=')?;
            Some((percent_decode(k), percent_decode(v)))
        })
        .collect()
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                match u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    Ok(b) => {
                        out.push(b);
                        i += 3;
                    }
                    // Not a valid escape; keep it literal rather than dropping
                    // it, so a malformed query cannot silently become a
                    // different valid one.
                    Err(_) => {
                        out.push(b'%');
                        i += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Write a JSON response.
pub fn respond<W: Write>(
    mut w: W,
    status: u16,
    body: &[u8],
    extra: &[(&str, &str)],
) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        405 => "Method Not Allowed",
        413 => "Payload Too Large",
        429 => "Too Many Requests",
        500 => "Internal Server Error",
        _ => "Unknown",
    };
    write!(
        w,
        "HTTP/1.1 {status} {reason}\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n",
        body.len()
    )?;
    for (k, v) in extra {
        write!(w, "{k}: {v}\r\n")?;
    }
    w.write_all(b"\r\n")?;
    w.write_all(body)?;
    w.flush()
}

/// A JSON error body, in one shape everywhere so clients can rely on it.
pub fn error_body(code: &str, message: &str) -> Vec<u8> {
    serde_json::json!({ "error": code, "message": message })
        .to_string()
        .into_bytes()
}
