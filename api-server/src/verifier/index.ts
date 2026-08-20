/**
 * The provenance verifier, loaded as WebAssembly.
 *
 * There is exactly one verifier in this system and it is written in Rust. This
 * loads that same artifact rather than reimplementing it here.
 *
 * A TypeScript reimplementation would be a second implementation of the one
 * thing that must never drift: two verifiers that disagree about a claim is
 * worse than one that is awkward to call. It is also the same `wasm32` build a
 * skeptic runs in a browser to check a claim without trusting us, so any bug
 * here is a bug they would hit too — which is the right incentive.
 *
 * Buffer layout is documented in `provenance/verify-wasm/src/lib.rs`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Status codes from the shim. Mirrors the Rust constants. */
export const OK_NO_SIGNATURE = 1;
export const OK_SIGNATURE_CHECKED = 2;

const REASONS: Record<number, string> = {
  [-1]: 'the claim was malformed',
  [-2]: 'the leaf could not be decoded',
  [-3]: 'the leaf does not prove into the witnessed head',
  [-4]: 'the attestation is about a different head',
  [-5]: 'the signature does not verify',
  [-6]: 'this build cannot check signatures',
  [-7]: 'a key event that changed no key',
};

export interface VerifyResult {
  verified: boolean;
  /** When the content existed, from the witness. Only meaningful if verified. */
  existedByMs: number | null;
  signatureChecked: boolean;
  /** Why it failed, in words, for a log or a response. */
  reason?: string;
}

interface Exports {
  memory: WebAssembly.Memory;
  daon_buffer(): number;
  daon_buffer_len(): number;
  daon_verify(len: number): number;
  daon_existed_by_ms(): bigint;
  daon_content_begin(): void;
  daon_content_update(len: number): number;
  daon_content_finish(): number;
}

let loaded: Exports | null = null;

/**
 * Load the module once.
 *
 * Returns null if the artifact is absent rather than throwing at import time.
 * An API that refuses to boot because an optional verification feature has no
 * wasm file would turn a missing build step into an outage.
 */
export function loadVerifier(): Exports | null {
  if (loaded) return loaded;
  // Resolved from the process root rather than the module's own path, because
  // this file is loaded both as ESM at runtime and through a transform in
  // tests, and only one of those has import.meta.
  const candidates = [
    process.env.DAON_VERIFIER_WASM,
    path.join(process.cwd(), 'src/verifier/daon_provenance_verify_wasm.wasm'),
    path.join(process.cwd(), 'dist/verifier/daon_provenance_verify_wasm.wasm'),
    path.join(
      process.cwd(),
      '../provenance/target/wasm32-unknown-unknown/release/daon_provenance_verify_wasm.wasm'
    ),
  ].filter(Boolean) as string[];

  for (const file of candidates) {
    try {
      const mod = new WebAssembly.Module(readFileSync(file));
      loaded = new WebAssembly.Instance(mod, {}).exports as unknown as Exports;
      return loaded;
    } catch {
      // Try the next candidate. A missing or unreadable file is not fatal.
    }
  }
  return null;
}

/**
 * Check a claim.
 *
 * The claim arrives already in the shim's buffer layout, because assembling it
 * is the caller's job and doing it here would mean this file knowing the wire
 * format — a third place for it to drift.
 */
export function verifyClaim(claim: Buffer): VerifyResult {
  const w = loadVerifier();
  if (!w) {
    return {
      verified: false,
      existedByMs: null,
      signatureChecked: false,
      reason: 'the verifier is not available on this server',
    };
  }

  if (claim.length > w.daon_buffer_len()) {
    return {
      verified: false,
      existedByMs: null,
      signatureChecked: false,
      reason: 'the claim is larger than the verifier accepts',
    };
  }

  const ptr = w.daon_buffer();
  new Uint8Array(w.memory.buffer, ptr, claim.length).set(claim);
  const code = w.daon_verify(claim.length);

  if (code === OK_NO_SIGNATURE || code === OK_SIGNATURE_CHECKED) {
    return {
      verified: true,
      existedByMs: Number(w.daon_existed_by_ms()),
      signatureChecked: code === OK_SIGNATURE_CHECKED,
    };
  }
  return {
    verified: false,
    existedByMs: null,
    signatureChecked: false,
    reason: REASONS[code] ?? `verification failed (${code})`,
  };
}

/**
 * Commit to file bytes, using the same rule the provenance agent uses.
 *
 * This is deliberately not a `sha256` of the file. A creator who registers a
 * photograph here and later verifies it through the local agent must get the
 * same identity, or neither lookup finds the other and they own one file with
 * two records. So the rule is `content_commit` from `wire-format.md` §6 — a
 * Merkle root over 1 KiB segments, which for content under 1 KiB reduces to a
 * single tagged hash.
 *
 * Reimplementing that in TypeScript would take about fifteen lines and would be
 * a second implementation of the format. The first symptom of it drifting would
 * be a creator's own file failing to verify against their own record, which is
 * the worst failure this system has. So it streams through the wasm instead.
 *
 * Returns null when the verifier is unavailable — callers must treat that as
 * "cannot commit", never as "committed to nothing".
 */
export function contentCommit(bytes: Buffer): Buffer | null {
  const w = loadVerifier();
  if (!w) return null;

  const ptr = w.daon_buffer();
  const cap = w.daon_buffer_len();

  w.daon_content_begin();
  for (let off = 0; off < bytes.length; off += cap) {
    const chunk = bytes.subarray(off, Math.min(off + cap, bytes.length));
    new Uint8Array(w.memory.buffer, ptr, chunk.length).set(chunk);
    if (w.daon_content_update(chunk.length) !== 0) return null;
  }
  if (w.daon_content_finish() !== 32) return null;

  // Copy out before anything else touches the arena.
  return Buffer.from(new Uint8Array(w.memory.buffer, ptr, 32));
}
