/**
 * The wasm verifier, called the way the API calls it.
 *
 * These run the *same artifact* the Rust tests do and a browser would. If they
 * disagree with the Rust suite, one of the two is wrong — which is the point of
 * having one implementation rather than two.
 */
import { verifyClaim, loadVerifier } from '../verifier/index.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// A claim emitted by `cargo run -p daon-provenance-verify-wasm --example claim`.
const CLAIM = readFileSync(
  path.join(process.cwd(), 'src/test/fixtures/claim.hex'),
  'utf8'
).trim();

describe('the wasm verifier', () => {
  it('loads', () => {
    expect(loadVerifier()).not.toBeNull();
  });

  it('verifies a good claim and reports when it existed', () => {
    const r = verifyClaim(Buffer.from(CLAIM, 'hex'));
    expect(r.verified).toBe(true);
    expect(r.signatureChecked).toBe(true);
    expect(r.existedByMs).toBe(1_700_003_600_000);
  });

  it('refuses a tampered signature', () => {
    const b = Buffer.from(CLAIM, 'hex');
    b[b.length - 1] ^= 0xff;
    const r = verifyClaim(b);
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/signature/);
  });

  // The leaf hash changes, so it no longer proves into the witnessed head --
  // which is step 2, not a signature problem.
  it('refuses a tampered leaf', () => {
    const b = Buffer.from(CLAIM, 'hex');
    b[50] ^= 0xff;
    const r = verifyClaim(b);
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/witnessed head/);
  });

  it('refuses a truncated claim rather than reading past it', () => {
    const r = verifyClaim(Buffer.from(CLAIM, 'hex').subarray(0, 100));
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/malformed/);
  });

  it('refuses something larger than the buffer', () => {
    const r = verifyClaim(Buffer.alloc(1024 * 1024));
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/larger than/);
  });

  // Verification says the chain is real. It cannot say who owns it -- a thief's
  // rotation verifies perfectly, because the stolen key is the recorded key.
  it('is not a statement about ownership', () => {
    const r = verifyClaim(Buffer.from(CLAIM, 'hex'));
    expect(r.verified).toBe(true);
    expect(r).not.toHaveProperty('owner');
    expect(r).not.toHaveProperty('attested');
  });
});
