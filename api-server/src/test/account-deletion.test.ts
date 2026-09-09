/**
 * Account deletion — GDPR Art. 17.
 *
 * Two things are worth defending here, and neither is "the endpoint exists".
 *
 *   1. **The scrubs run before the DELETE.** `activity_log` and `api_usage`
 *      reference users with `ON DELETE SET NULL`, so the instant the user row
 *      goes, every one of those rows has `user_id = NULL` and there is no
 *      remaining way to tell which were this person's. Reorder these statements
 *      and the erasure silently stops erasing IP addresses while still
 *      reporting success — the worst possible failure for this feature, because
 *      nothing looks wrong.
 *
 *   2. **The confirmation phrase is required**, and is checked before anything
 *      touches the database.
 *
 * Neither test needs a live database. (1) drives the transaction through a fake
 * client that records the SQL it is given; (2) is rejected at the route before
 * any query runs.
 */
import { test, describe, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import app from '../server.js';
import { db } from '../database/client.js';
import { generateAccessToken } from '../utils/jwt.js';

/** Records every statement it is asked to run, answering plausibly. */
function recordingClient(statements: string[], userExists = true) {
  return {
    async query(text: string, _params?: any[]) {
      statements.push(text.trim().split(/\s+/).slice(0, 4).join(' '));

      if (/^SELECT id FROM users/i.test(text.trim())) {
        return { rowCount: userExists ? 1 : 0, rows: userExists ? [{ id: 1 }] : [] };
      }
      if (/COUNT\(\*\)/i.test(text)) {
        return { rowCount: 1, rows: [{ n: 3 }] };
      }
      return { rowCount: 2, rows: [] };
    },
  };
}

const realTransaction = db.transaction;

afterEach(() => {
  db.transaction = realTransaction;
});

describe('account deletion — erasure order', () => {
  test('scrubs activity_log and api_usage before deleting the user', async () => {
    const statements: string[] = [];
    db.transaction = (async (cb: any) => cb(recordingClient(statements))) as any;

    const result = await db.users.deleteAccount(1);

    const scrubActivity = statements.findIndex((s) => /UPDATE activity_log/i.test(s));
    const scrubUsage = statements.findIndex((s) => /UPDATE api_usage/i.test(s));
    const countRegs = statements.findIndex((s) => /SELECT COUNT/i.test(s));
    const deleteUser = statements.findIndex((s) => /DELETE FROM users/i.test(s));

    assert.notEqual(scrubActivity, -1, 'activity_log was never scrubbed');
    assert.notEqual(scrubUsage, -1, 'api_usage was never scrubbed');
    assert.notEqual(deleteUser, -1, 'the user was never deleted');

    // The whole point. After the DELETE these rows are indistinguishable.
    assert.ok(
      scrubActivity < deleteUser,
      'activity_log must be scrubbed before the user row is deleted'
    );
    assert.ok(
      scrubUsage < deleteUser,
      'api_usage must be scrubbed before the user row is deleted'
    );
    assert.ok(
      countRegs < deleteUser,
      'registrations must be counted before the user row is deleted'
    );

    assert.equal(result?.registrationsOrphaned, 3);
  });

  test('returns null rather than reporting a successful erasure of nothing', async () => {
    const statements: string[] = [];
    db.transaction = (async (cb: any) => cb(recordingClient(statements, false))) as any;

    const result = await db.users.deleteAccount(4242);

    assert.equal(result, null);
    assert.ok(
      !statements.some((s) => /DELETE FROM users/i.test(s)),
      'must not issue a DELETE for a user that does not exist'
    );
  });
});

describe('account deletion — confirmation gate', () => {
  const token = generateAccessToken(1);

  test('rejects a request with no confirmation', async () => {
    const res = await request(app)
      .delete('/api/v1/auth/account')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'confirmation_required');
  });

  test('rejects confirm: true — a boolean is what a mis-wired client sends', async () => {
    const res = await request(app)
      .delete('/api/v1/auth/account')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirm: true });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'confirmation_required');
  });

  test('rejects a near-miss phrase', async () => {
    const res = await request(app)
      .delete('/api/v1/auth/account')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirm: 'delete my account' });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'confirmation_required');
  });

  test('requires authentication', async () => {
    const res = await request(app)
      .delete('/api/v1/auth/account')
      .send({ confirm: 'DELETE MY ACCOUNT' });

    assert.equal(res.status, 401);
  });
});
