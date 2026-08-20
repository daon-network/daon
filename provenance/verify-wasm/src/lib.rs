//! A C ABI over the verifier, so it can be used from outside Rust.
//!
//! Separate from `daon-provenance-verify` because that crate carries
//! `#![forbid(unsafe_code)]` and any FFI must read memory a caller wrote. The
//! property is worth defending, so the unsafe lives here, in a shim thin enough
//! to read in one sitting, and the verifier itself stays provably free of it.
//!
//! This exists so **there is exactly one verifier**. DAON's API is TypeScript
//! and needs to check claims; a TypeScript reimplementation would be a second
//! implementation of the one thing in this system that must never drift, and
//! two verifiers that disagree is worse than one that is inconvenient to call.
//!
//! So the API loads the same `wasm32` artifact CI already builds — the same
//! bytes a skeptic runs in a browser to check a claim without trusting us.
//!
//! # Calling convention
//!
//! No allocator tricks and no shared structs. A caller writes one flat buffer,
//! calls [`daon_verify`], and reads a status code. Everything is fixed-width
//! and big-endian, matching `wire-format.md`, so a JavaScript caller builds the
//! buffer with a `DataView` and no schema library.
//!
//! ```text
//!   0    218   leaf body
//!   218  32    head
//!   250  32    attestation.witnessed_head
//!   282  8     attestation.witness_time_ms, i64 BE
//!   290  1     flags: bit0 signature present, bit1 parent present
//!   291  4     proof step count, u32 BE
//!   295  ...   proof steps: 1 byte side (0 left, 1 right) + 32 bytes, repeated
//!        64    signature, if bit0
//!        218   parent leaf body, if bit1
//! ```
//!
//! The verifier never allocates for the caller and never returns a pointer, so
//! there is nothing to free and no way to leak.

use daon_provenance_core::{ContentHasher, Hash, ProofStep, RevisionLeaf, Side, LEAF_BODY_LEN};
use daon_provenance_verify::{verify, Claim, Failure, WitnessAttestation};

/// The claim verified. Positive results are distinguishable so a caller can
/// tell "checked, and the signature held" from "checked, no signature offered".
pub const OK_NO_SIGNATURE: i32 = 1;
/// Verified, and a signature was checked against the committed key.
pub const OK_SIGNATURE_CHECKED: i32 = 2;

/// The input buffer was not the shape described above.
pub const ERR_MALFORMED_INPUT: i32 = -1;
/// The leaf could not be decoded.
pub const ERR_BAD_LEAF: i32 = -2;
/// Step 2: the leaf does not prove into the head.
pub const ERR_NOT_IN_HEAD: i32 = -3;
/// Step 3: the attestation is about a different head.
pub const ERR_HEAD_MISMATCH: i32 = -4;
/// Step 4: the signature does not verify.
pub const ERR_BAD_SIGNATURE: i32 = -5;
/// This build cannot check signatures.
pub const ERR_NO_SIGNATURE_SUPPORT: i32 = -6;
/// A key event that changed no key.
pub const ERR_MALFORMED_KEY_EVENT: i32 = -7;

/// Scratch space a caller writes its buffer into.
///
/// A fixed arena rather than an allocator: the largest possible claim is a leaf,
/// a parent, a signature and a proof deep enough for more revisions than anyone
/// will write, so bounding it removes memory management from the interface
/// entirely.
const ARENA: usize = 64 * 1024;
static mut BUFFER: [u8; ARENA] = [0; ARENA];

/// Where to write the claim before calling [`daon_verify`].
///
/// # Safety
///
/// Single-threaded use only, which is what a wasm module in Node is. A caller
/// writes at most [`daon_buffer_len`] bytes and then calls `daon_verify`.
#[no_mangle]
pub extern "C" fn daon_buffer() -> *mut u8 {
    &raw mut BUFFER as *mut u8
}

/// How much may be written at [`daon_buffer`].
#[no_mangle]
pub extern "C" fn daon_buffer_len() -> usize {
    ARENA
}

/// Verify a claim written into the buffer. Returns one of the codes above.
///
/// # Safety
///
/// `len` must be the number of bytes the caller actually wrote.
#[no_mangle]
pub unsafe extern "C" fn daon_verify(len: usize) -> i32 {
    if len > ARENA {
        return ERR_MALFORMED_INPUT;
    }
    let buf = &*core::ptr::addr_of!(BUFFER);
    decode_and_verify(&buf[..len])
}

/// When the content existed, in milliseconds, valid only after a positive
/// [`daon_verify`]. Separate because the ABI returns a status, not a struct.
#[no_mangle]
pub extern "C" fn daon_existed_by_ms() -> i64 {
    unsafe { LAST_EXISTED_BY }
}

// ── Content commitment, streamed ──────────────────────────────────────────
//
// DAON's API has to commit to an uploaded file, and the file does not fit in the
// arena — a photograph is larger than 64 KiB and a scan is much larger. It could
// have reimplemented the rule in TypeScript in about fifteen lines, which is
// exactly the temptation this crate exists to remove: a second implementation of
// the format is a second thing to keep correct, and the first symptom of it
// drifting would be a creator's file failing to verify against its own record.
//
// So the caller feeds the file through the same arena in pieces. Chunk
// boundaries do not affect the result, so it can read the file however it likes.

static mut HASHER: Option<ContentHasher> = None;

/// Begin (or restart) a streamed content commitment.
#[no_mangle]
pub extern "C" fn daon_content_begin() {
    unsafe { HASHER = Some(ContentHasher::new()) }
}

/// Feed the first `len` bytes of [`daon_buffer`] into the running commitment.
///
/// Returns 0, or [`ERR_MALFORMED_INPUT`] if `len` exceeds the arena or no
/// [`daon_content_begin`] has been called.
///
/// # Safety
///
/// `len` must be the number of bytes the caller actually wrote.
#[no_mangle]
pub unsafe extern "C" fn daon_content_update(len: usize) -> i32 {
    if len > ARENA {
        return ERR_MALFORMED_INPUT;
    }
    let buf = &*core::ptr::addr_of!(BUFFER);
    match (*core::ptr::addr_of_mut!(HASHER)).as_mut() {
        Some(h) => {
            h.update(&buf[..len]);
            0
        }
        None => ERR_MALFORMED_INPUT,
    }
}

/// Finish, writing the 32-byte commitment to the start of [`daon_buffer`].
///
/// Returns 32 on success, or [`ERR_MALFORMED_INPUT`] if no commitment was begun.
/// The hasher is consumed: a further `update` needs a fresh `begin`.
///
/// # Safety
///
/// Single-threaded use only, as with the rest of this interface.
#[no_mangle]
pub unsafe extern "C" fn daon_content_finish() -> i32 {
    match (*core::ptr::addr_of_mut!(HASHER)).take() {
        Some(h) => {
            let out = h.finish();
            let buf = &mut *core::ptr::addr_of_mut!(BUFFER);
            buf[..32].copy_from_slice(&out);
            32
        }
        None => ERR_MALFORMED_INPUT,
    }
}

static mut LAST_EXISTED_BY: i64 = 0;

fn decode_and_verify(b: &[u8]) -> i32 {
    const HEAD: usize = LEAF_BODY_LEN;
    const ATT_HEAD: usize = HEAD + 32;
    const ATT_TIME: usize = ATT_HEAD + 32;
    const FLAGS: usize = ATT_TIME + 8;
    const COUNT: usize = FLAGS + 1;
    const STEPS: usize = COUNT + 4;

    if b.len() < STEPS {
        return ERR_MALFORMED_INPUT;
    }

    let leaf = match RevisionLeaf::decode(&b[..LEAF_BODY_LEN]) {
        Ok(l) => l,
        Err(_) => return ERR_BAD_LEAF,
    };
    let head: Hash = b[HEAD..HEAD + 32].try_into().unwrap();
    let witnessed_head: Hash = b[ATT_HEAD..ATT_HEAD + 32].try_into().unwrap();
    let witness_time_ms = i64::from_be_bytes(b[ATT_TIME..ATT_TIME + 8].try_into().unwrap());

    let flags = b[FLAGS];
    let has_signature = flags & 1 != 0;
    let has_parent = flags & 2 != 0;

    let count = u32::from_be_bytes(b[COUNT..COUNT + 4].try_into().unwrap()) as usize;
    let steps_len = count.saturating_mul(33);
    let mut at = STEPS;
    if b.len() < at + steps_len {
        return ERR_MALFORMED_INPUT;
    }

    let mut proof: Vec<ProofStep> = Vec::with_capacity(count.min(256));
    for i in 0..count {
        let o = at + i * 33;
        let side = match b[o] {
            0 => Side::Left,
            1 => Side::Right,
            _ => return ERR_MALFORMED_INPUT,
        };
        let h: Hash = b[o + 1..o + 33].try_into().unwrap();
        proof.push((side, h));
    }
    at += steps_len;

    let signature: Option<[u8; 64]> = if has_signature {
        if b.len() < at + 64 {
            return ERR_MALFORMED_INPUT;
        }
        let s: [u8; 64] = b[at..at + 64].try_into().unwrap();
        at += 64;
        Some(s)
    } else {
        None
    };

    let parent = if has_parent {
        if b.len() < at + LEAF_BODY_LEN {
            return ERR_MALFORMED_INPUT;
        }
        match RevisionLeaf::decode(&b[at..at + LEAF_BODY_LEN]) {
            Ok(p) => Some(p),
            Err(_) => return ERR_BAD_LEAF,
        }
    } else {
        None
    };

    let claim = Claim {
        leaf: &leaf,
        proof: &proof,
        head,
        attestation: WitnessAttestation {
            witnessed_head,
            witness_time_ms,
        },
        signature: signature.as_ref(),
        parent: parent.as_ref(),
    };

    match verify(&claim) {
        Ok(v) => {
            unsafe { LAST_EXISTED_BY = v.existed_by_ms };
            if v.author_signature_checked {
                OK_SIGNATURE_CHECKED
            } else {
                OK_NO_SIGNATURE
            }
        }
        Err(Failure::NotInWitnessedHead) => ERR_NOT_IN_HEAD,
        Err(Failure::AttestationHeadMismatch) => ERR_HEAD_MISMATCH,
        Err(Failure::MalformedKeyEvent) => ERR_MALFORMED_KEY_EVENT,
        // Everything remaining is a signature problem: a bad signature, a
        // malformed key, or a build without signature support. Collapsed
        // deliberately -- a caller learns the claim failed step four, and the
        // distinction between "wrong signature" and "unparseable key" is not
        // one it can act on differently.
        Err(_) => ERR_BAD_SIGNATURE,
    }
}
