//! The hand-rolled HTTP subset: what it accepts, and what it must refuse.

use daon_provenance_agentd::http::{respond, Error, Request, MAX_BODY};

fn parse(raw: &str) -> Result<Request, Error> {
    Request::read(raw.as_bytes())
}

#[test]
fn parses_a_post_with_a_body() {
    let r = parse("POST /v1/commit HTTP/1.1\r\nContent-Length: 7\r\n\r\n{\"a\":1}").unwrap();
    assert_eq!(r.method, "POST");
    assert_eq!(r.path, "/v1/commit");
    assert_eq!(r.body, b"{\"a\":1}");
}

#[test]
fn splits_the_query_string_off_the_path() {
    let r = parse("GET /v1/entity/abc/proof?seq=42 HTTP/1.1\r\n\r\n").unwrap();
    assert_eq!(r.path, "/v1/entity/abc/proof");
    assert_eq!(r.query.get("seq").map(String::as_str), Some("42"));
}

#[test]
fn decodes_percent_escapes_and_plus() {
    let r = parse("GET /x?a=one%20two&b=three+four HTTP/1.1\r\n\r\n").unwrap();
    assert_eq!(r.query["a"], "one two");
    assert_eq!(r.query["b"], "three four");
}

#[test]
fn headers_are_case_insensitive() {
    let r = parse("POST /x HTTP/1.1\r\nCONTENT-LENGTH: 2\r\n\r\nhi").unwrap();
    assert_eq!(r.body, b"hi");
}

/// No Content-Length means no body. A body without one would need chunked
/// decoding, which is not implemented and must not be guessed at.
#[test]
fn a_missing_length_means_an_empty_body() {
    let r = parse("GET /v1/thing HTTP/1.1\r\n\r\n").unwrap();
    assert!(r.body.is_empty());
}

#[test]
fn refuses_an_oversized_body() {
    let raw = format!(
        "POST /x HTTP/1.1\r\nContent-Length: {}\r\n\r\n",
        MAX_BODY + 1
    );
    assert!(matches!(parse(&raw), Err(Error::TooLarge)));
}

/// A length prefix is client-controlled and must not be able to make the daemon
/// allocate arbitrarily before any body has arrived.
#[test]
fn refuses_an_absurd_length() {
    let raw = "POST /x HTTP/1.1\r\nContent-Length: 99999999999999999999\r\n\r\n";
    assert!(matches!(parse(raw), Err(Error::Malformed(_))));
}

#[test]
fn refuses_junk_and_truncation() {
    assert!(parse("not http at all\r\n\r\n").is_err());
    assert!(matches!(
        parse("POST /x HTTP/1.1\r\nContent-Length: 100\r\n\r\nshort"),
        Err(Error::Io(_))
    ));
    assert!(matches!(
        parse("POST /x HTTP/1.1\r\nnocolon\r\n\r\n"),
        Err(Error::Malformed(_))
    ));
}

#[test]
fn refuses_absurd_headers() {
    let big = "x-pad: ".to_string() + &"a".repeat(32 * 1024);
    let raw = format!("GET /x HTTP/1.1\r\n{big}\r\n\r\n");
    assert!(matches!(parse(&raw), Err(Error::Malformed(_))));
}

#[test]
fn responses_carry_a_length_and_close() {
    let mut out = Vec::new();
    respond(&mut out, 200, b"{\"ok\":true}", &[]).unwrap();
    let text = String::from_utf8(out).unwrap();
    assert!(text.starts_with("HTTP/1.1 200 OK\r\n"));
    assert!(text.contains("Content-Type: application/json\r\n"));
    assert!(text.contains("Content-Length: 11\r\n"));
    assert!(text.contains("Connection: close\r\n"));
    assert!(text.ends_with("\r\n\r\n{\"ok\":true}"));
}

#[test]
fn extra_headers_are_emitted() {
    let mut out = Vec::new();
    respond(&mut out, 429, b"{}", &[("Retry-After", "60")]).unwrap();
    assert!(String::from_utf8(out)
        .unwrap()
        .contains("Retry-After: 60\r\n"));
}
