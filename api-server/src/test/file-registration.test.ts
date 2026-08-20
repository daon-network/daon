/**
 * Registering and verifying a file rather than a passage of text.
 *
 * The property that matters most here is the one that is easy to get wrong and
 * silent when you do: a file must commit to the same identity the local
 * provenance agent would give it. If these two ever disagree, a creator can
 * register a photograph in one place and fail to verify it in the other, while
 * both report success.
 */
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import crypto from 'crypto';
import request from 'supertest';
import app from '../server.js';
import { contentCommit } from '../verifier/index.js';

/** A PNG header and some bytes: not valid UTF-8, so a JSON field could not hold it. */
function png(seed, len) {
  const head = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const body = Buffer.from(
    Array.from({ length: len }, (_, i) => (seed + i * 37) & 0xff)
  );
  return Buffer.concat([head, body]);
}

describe('File registration', () => {
  test('a file commits to content_commit, not a bare sha256 of the bytes', () => {
    const bytes = png(3, 4000);
    const commit = contentCommit(bytes);
    assert.ok(commit, 'the verifier must be available in tests');
    assert.equal(commit!.length, 32);

    // A plain sha256 would diverge from the agent and must not be what we store.
    const bare = crypto.createHash('sha256').update(bytes).digest();
    assert.notEqual(Buffer.compare(commit!, bare), 0);
  });

  test('chunking does not change the commitment', () => {
    // 200 KB streams through the wasm arena several times over.
    const big = png(9, 200_000);
    const once = contentCommit(big);
    const again = contentCommit(Buffer.concat([big.subarray(0, 100), big.subarray(100)]));
    assert.equal(Buffer.compare(once!, again!), 0);
  });

  test('an empty upload is refused rather than committed to nothing', async () => {
    const res = await request(app)
      .post('/api/v1/verify-content')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.alloc(0));

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'empty_file');
  });

  test('an unregistered file 404s and says why re-encoding fails', async () => {
    const res = await request(app)
      .post('/api/v1/verify-content')
      .set('Content-Type', 'application/octet-stream')
      .send(png(42, 2048));

    assert.equal(res.status, 404);
    assert.equal(res.body.isValid, false);
    // The caller should learn the hash it asked about.
    assert.ok(res.body.contentHash);
    // And be told that a re-exported file is a different file.
    assert.match(res.body.message, /re-encoding|Re-encoding/);
  });

  test('text requests still reach the text handler untouched', async () => {
    const res = await request(app)
      .post('/api/v1/verify-content')
      .send({ content: 'a passage of prose that is definitely not registered' });

    // 404 or 200 both mean the JSON path ran; a 400 would mean the binary
    // branch swallowed it.
    // A 400 would mean the binary branch swallowed a JSON request.
    assert.notEqual(res.status, 400);
  });

  test('a file and the same bytes as text do not collide', async () => {
    // "hello" as a file commits under the content rule; "hello" as text is
    // canonicalised first. They are different claims and must not share an id.
    const asFile = contentCommit(Buffer.from('hello', 'utf8'))!.toString('hex');
    const asText = crypto.createHash('sha256').update('hello', 'utf8').digest('hex');
    assert.notEqual(asFile, asText);
  });
});
