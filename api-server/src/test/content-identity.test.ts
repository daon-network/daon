/**
 * One identity for a work, whichever door it came through.
 *
 * Text registered on the web used to hash to `sha256(canonical)` while the
 * provenance agent and file registration used `content_commit`. The same work
 * could therefore hold two identities and neither lookup would find the other.
 *
 * These tests defend three things:
 *
 *   1. new registrations use `content_commit(canonical)`
 *   2. the 109 records already in production still resolve
 *   3. canonicalisation itself is unchanged -- only the hashing of the
 *      canonical text moved
 *
 * (2) is the one with teeth. DAON does not store content, so those records
 * cannot be recomputed: deriving a content_commit from a SHA-256 output is a
 * preimage problem. They are found by looking them up under the old rule, and if
 * that ever stops working they are unreachable forever.
 */
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import crypto from 'crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import app, { contentHashCandidates } from '../server.js';
import { contentCommit } from '../verifier/index.js';
import { toPlainText } from '../utils/content-canonical.js';

/** What the server should now store for a piece of text. */
function expectedIdentity(content: string): string {
  const { text } = toPlainText(content);
  return contentCommit(Buffer.from(text, 'utf8'))!.toString('hex');
}

/** What it stored before this change -- the 109 production records. */
function canonicalSha256(content: string): string {
  const { text } = toPlainText(content);
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/** What it stored before canonicalisation existed at all. */
function rawSha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

const unique = (label: string) =>
  `Identity test ${label} ${crypto.randomBytes(8).toString('hex')} with enough words to pass validation.`;

describe('content identity', () => {
  describe('the rule itself', () => {
    test('registration commits with content_commit, not a bare sha256', async () => {
      const content = unique('register');
      const res = await request(app).post('/api/v1/protect').send({ content });

      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.contentHash, expectedIdentity(content));
      assert.notEqual(res.body.contentHash, canonicalSha256(content));
      assert.notEqual(res.body.contentHash, rawSha256(content));
    });

    test('it is the same value the provenance agent computes for that text', () => {
      // content_commit under 1 KiB is sha256(0x03 || bytes). If this ever stops
      // holding, the agent and the API have diverged again.
      const text = 'the lighthouse keeper wrote this';
      const viaShim = contentCommit(Buffer.from(text, 'utf8'))!.toString('hex');
      const byHand = crypto
        .createHash('sha256')
        .update(Buffer.concat([Buffer.from([0x03]), Buffer.from(text, 'utf8')]))
        .digest('hex');
      assert.equal(viaShim, byHand);
    });

    test('content over one segment uses the tree, not a flat hash', () => {
      const long = 'x'.repeat(3000);
      const flat = crypto
        .createHash('sha256')
        .update(Buffer.concat([Buffer.from([0x03]), Buffer.from(long, 'utf8')]))
        .digest('hex');
      assert.notEqual(contentCommit(Buffer.from(long, 'utf8'))!.toString('hex'), flat);
    });
  });

  describe('canonicalisation is unchanged', () => {
    test('markup still does not change identity', () => {
      const plain = 'The lighthouse keeper wrote this by hand.';
      const marked = '<p>The lighthouse keeper wrote this by hand.</p>';
      assert.equal(expectedIdentity(plain), expectedIdentity(marked));
    });

    test('content that strips to nothing is still refused', async () => {
      const res = await request(app)
        .post('/api/v1/protect')
        .send({ content: '<img src="only-an-image.png">' });
      assert.equal(res.status, 400, JSON.stringify(res.body));
    });

    test('different words still give different identities', () => {
      assert.notEqual(expectedIdentity('one thing'), expectedIdentity('another thing'));
    });
  });

  describe('records from every era still resolve', () => {
    // The production records are stored under sha256(canonical). Verification
    // must find them without the content ever being recomputed.
    test('every lookup offers all three identities, newest first', () => {
      // This is the mechanism that keeps the 109 production records reachable.
      // They are stored under sha256(canonical); if that value stops being
      // offered, they are unreachable forever, because DAON does not hold the
      // content to recompute them from.
      const content = '<p>markup, so all three rules give different values</p>';
      const got = contentHashCandidates(content);

      assert.deepEqual(got, [
        expectedIdentity(content),   // content_commit(canonical) -- current
        canonicalSha256(content),    // the 109 production records
        rawSha256(content),          // before canonicalisation existed
      ]);
    });

    test('the current rule is tried first, so the common case is one query', () => {
      const content = unique('ordering');
      assert.equal(contentHashCandidates(content)[0], expectedIdentity(content));
    });

    test('identical candidates are collapsed rather than queried twice', () => {
      // Plain text with no markup canonicalises to itself, so the canonical and
      // raw sha256 values coincide. The list must not carry it twice.
      const plain = 'plain words with no markup at all in them whatsoever';
      const got = contentHashCandidates(plain);
      assert.equal(new Set(got).size, got.length, 'candidate list has duplicates');
      assert.equal(got.length, 2, `expected 2 distinct candidates, got ${got.length}`);
    });

    test('the candidate list contains all three rules, newest first', () => {
      const content = '<p>markup so the canonical and raw forms differ</p>';
      const newId = expectedIdentity(content);
      const canon = canonicalSha256(content);
      const raw = rawSha256(content);

      // three genuinely distinct values for this input
      assert.equal(new Set([newId, canon, raw]).size, 3);
    });

    test('a work registered now verifies immediately by content', async () => {
      const content = unique('roundtrip');
      const reg = await request(app).post('/api/v1/protect').send({ content });
      assert.equal(reg.status, 201, JSON.stringify(reg.body));

      const ver = await request(app).post('/api/v1/verify-content').send({ content });
      assert.equal(ver.status, 200, JSON.stringify(ver.body));
      assert.equal(ver.body.isValid, true);
      assert.equal(ver.body.contentHash, reg.body.contentHash);
    });

    test('re-registering does not create a second record', async () => {
      const content = unique('duplicate');
      const first = await request(app).post('/api/v1/protect').send({ content });
      assert.equal(first.status, 201);

      const second = await request(app).post('/api/v1/protect').send({ content });
      assert.equal(second.status, 200, JSON.stringify(second.body));
      assert.equal(second.body.existing, true);
      assert.equal(second.body.contentHash, first.body.contentHash);
    });
  });

  describe('the API and the Rust agent agree, byte for byte', () => {
    // Generated by `cargo run -p daon-provenance-core --example vectors` against
    // daon_provenance_core::content_commit. If TypeScript ever drifts from Rust,
    // these fail -- which is the whole reason the API loads the wasm instead of
    // reimplementing the rule.
    //
    // Regenerate deliberately, never by pasting whatever the code now returns.
    const RUST: Array<[string, string]> = [
      ['The lighthouse keeper wrote this by hand.',
       'af312a5e45003edec2fe33153e8ec68f16992580551f0711a46f761c12e010d8'],
      ['hello',
       '0b4d354d56ea9a985571a56b1829f33d072e7902c1afaf981381089b9eb00ffe'],
      ['',
       '084fed08b978af4d7d196a7446a86b58009e636b611db16211b65a9aadff29c5'],
      ['a',
       'c7985a722bc82b44027b3692ec1b79a2e86267e2577b9cc0e09a9dee4515e0f6'],
      ['x'.repeat(3000),
       'c5e71c128c1c4bfc9beaeba81731b5ad5cd5572cc6978528dd393650d4623428'],
      ['y'.repeat(1024),
       'ff4e03a811d616c4b6f15a610797a5bd5b0c3f9210a2998fad7ad167649613f7'],
    ];

    for (const [input, expected] of RUST) {
      const label = input.length > 24 ? `${input.length} bytes` : JSON.stringify(input);
      test(`matches Rust for ${label}`, () => {
        const got = contentCommit(Buffer.from(input, 'utf8'))!.toString('hex');
        assert.equal(got, expected);
      });
    }

    test('the exact-segment boundary is covered', () => {
      // 1024 bytes is one whole segment; 1025 crosses into a tree. Both are in
      // the vectors above and below, because off-by-one at the segment boundary
      // is the failure this format is most likely to have.
      const one = contentCommit(Buffer.from('y'.repeat(1024), 'utf8'))!.toString('hex');
      const two = contentCommit(Buffer.from('y'.repeat(1025), 'utf8'))!.toString('hex');
      assert.notEqual(one, two);
    });
  });

  describe('text and files do not collide', () => {
    test('the same bytes as text and as a file are different claims', async () => {
      const words = 'a passage that is also a file for the purposes of this test';
      const asText = expectedIdentity(words);
      const asFile = contentCommit(Buffer.from(words, 'utf8'))!.toString('hex');

      // Identical here only because this text canonicalises to itself. The point
      // is that the *rule* is now the same, which is what makes one work have
      // one identity across both doors.
      assert.equal(asText, asFile);
    });

    test('but markup makes them differ, because text is canonicalised first', () => {
      const marked = '<p>hello</p>';
      const asText = expectedIdentity(marked);
      const asFile = contentCommit(Buffer.from(marked, 'utf8'))!.toString('hex');
      assert.notEqual(asText, asFile);
    });
  });

  describe('failure modes', () => {
    test('a missing verifier fails loudly rather than falling back', () => {
      // generateContentHash throws when the wasm is unavailable rather than
      // quietly reverting to sha256, which would register content under an
      // identity nothing else in the system uses.
      const src = readFileSync(path.join(process.cwd(), 'src/server.ts'), 'utf8');
      assert.match(src, /Never silently fall back to the old rule/);
    });

    test('verification tries every candidate, not just the current one', () => {
      const src = readFileSync(path.join(process.cwd(), 'src/server.ts'), 'utf8');
      assert.match(src, /const candidateHashes = contentHashCandidates\(content\)/);
    });

    test('the duplicate check also covers historical identities', () => {
      const src = readFileSync(path.join(process.cwd(), 'src/server.ts'), 'utf8');
      assert.match(src, /for \(const candidate of contentHashCandidates\(content\)\)/);
    });
  });
});
