//! Format tests for the OpenTimestamps detached proof.
//!
//! The bytes here are built by hand from the spec rather than copied from a
//! calendar response, so a bug in our own writer cannot make our own reader
//! look correct.

use daon_provenance_witness::ots::{Attestation, DetachedTimestamp, Error, Op, Timestamp, MAGIC};

fn digest(b: u8) -> [u8; 32] {
    [b; 32]
}

/// A proof whose single path ends in a Bitcoin attestation.
fn bitcoin_proof(height: u64) -> DetachedTimestamp {
    let mut p = DetachedTimestamp::new(digest(0xaa));
    p.timestamp.ops.push((
        Op::Sha256,
        Timestamp {
            attestations: vec![Attestation::Bitcoin { height }],
            ops: vec![],
        },
    ));
    p
}

#[test]
fn round_trips_through_bytes() {
    let p = bitcoin_proof(800_000);
    let bytes = p.encode().expect("encode");
    assert_eq!(DetachedTimestamp::decode(&bytes).expect("decode"), p);
}

#[test]
fn starts_with_the_magic_header() {
    let bytes = bitcoin_proof(1).encode().unwrap();
    assert!(bytes.starts_with(MAGIC));
    assert_eq!(bytes[MAGIC.len()], 1, "version varint");
}

#[test]
fn rejects_a_file_that_is_not_a_proof() {
    assert_eq!(
        DetachedTimestamp::decode(b"not an ots file at all, not even close"),
        Err(Error::BadMagic)
    );
}

#[test]
fn rejects_trailing_bytes() {
    let mut bytes = bitcoin_proof(42).encode().unwrap();
    bytes.push(0x00);
    assert_eq!(DetachedTimestamp::decode(&bytes), Err(Error::TrailingBytes));
}

#[test]
fn rejects_a_truncated_proof() {
    let bytes = bitcoin_proof(42).encode().unwrap();
    let cut = &bytes[..bytes.len() - 2];
    assert_eq!(DetachedTimestamp::decode(cut), Err(Error::Truncated));
}

/// Multiple branches exercise the fork marker, which is the part of this format
/// easiest to get wrong: 0xff precedes every item but the last, attestations
/// included -- not just operation branches.
#[test]
fn round_trips_a_forked_tree_with_several_attestations() {
    let mut p = DetachedTimestamp::new(digest(0x11));
    p.timestamp.attestations.push(Attestation::Pending {
        uri: b"https://alice.btc.calendar.opentimestamps.org".to_vec(),
    });
    p.timestamp.attestations.push(Attestation::Pending {
        uri: b"https://bob.btc.calendar.opentimestamps.org".to_vec(),
    });
    p.timestamp.ops.push((
        Op::Append(vec![0xde, 0xad]),
        Timestamp {
            attestations: vec![Attestation::Bitcoin { height: 700_001 }],
            ops: vec![],
        },
    ));
    p.timestamp.ops.push((
        Op::Prepend(vec![0xbe, 0xef]),
        Timestamp {
            attestations: vec![Attestation::Bitcoin { height: 700_002 }],
            ops: vec![],
        },
    ));

    let bytes = p.encode().expect("encode");
    assert_eq!(DetachedTimestamp::decode(&bytes).expect("decode"), p);
}

/// An unrecognised attestation type must survive a round trip rather than being
/// dropped, or re-serializing someone's proof would silently discard part of it.
#[test]
fn preserves_unknown_attestations() {
    let mut p = DetachedTimestamp::new(digest(0x22));
    p.timestamp.attestations.push(Attestation::Unknown {
        tag: [1, 2, 3, 4, 5, 6, 7, 8],
        payload: b"something from the future".to_vec(),
    });
    let bytes = p.encode().unwrap();
    assert_eq!(DetachedTimestamp::decode(&bytes).unwrap(), p);
}

#[test]
fn replays_operations_to_the_attested_digest() {
    use sha2::{Digest, Sha256};

    let mut p = DetachedTimestamp::new(digest(0x33));
    p.timestamp.ops.push((
        Op::Append(vec![0x99]),
        Timestamp {
            attestations: vec![],
            ops: vec![(
                Op::Sha256,
                Timestamp {
                    attestations: vec![Attestation::Bitcoin { height: 5 }],
                    ops: vec![],
                },
            )],
        },
    ));

    let expected = Sha256::digest([digest(0x33).as_slice(), &[0x99]].concat()).to_vec();
    let found = p.attestations().unwrap();
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].0, Attestation::Bitcoin { height: 5 });
    assert_eq!(found[0].1, expected, "digest the path computes");
}

/// SHA-1 has been collidable since 2017. A proof routed through it could be
/// forged, so it is refused rather than replayed.
#[test]
fn refuses_to_replay_sha1() {
    assert_eq!(Op::Sha1.execute(b"anything"), Err(Error::UnknownOp(0x02)));
}

#[test]
fn refuses_to_write_an_empty_tree() {
    let p = DetachedTimestamp::new(digest(0x44));
    assert_eq!(p.encode(), Err(Error::EmptyTimestamp));
}

/// A length prefix is attacker-controlled, so it must not be able to make us
/// allocate arbitrarily.
#[test]
fn refuses_an_absurd_length_prefix() {
    let mut bytes = Vec::from(MAGIC);
    bytes.push(1); // version
    bytes.push(0x08); // sha256 file hash op
    bytes.extend_from_slice(&digest(0x55));
    bytes.push(0xf0); // append
    bytes.extend_from_slice(&[0xff, 0xff, 0xff, 0xff, 0x0f]); // huge varint
    assert_eq!(
        DetachedTimestamp::decode(&bytes),
        Err(Error::LengthOutOfRange)
    );
}
