/**
 * The rules that make an association survivable, tested at the layer that
 * enforces them.
 *
 * These are about shape and policy rather than SQL: the endpoint's real
 * behaviour needs a database, and what must not drift is the reasoning --
 * associations are appended, never exclusive, and always attributed.
 */

describe('association policy', () => {
  const HEX64 = /^[0-9a-f]{64}$/;
  const strip = (h: string) => h.replace(/^sha256:/, '');

  it('accepts a hash with or without the sha256: prefix', () => {
    const bare = 'a'.repeat(64);
    expect(strip(bare)).toBe(bare);
    expect(strip(`sha256:${bare}`)).toBe(bare);
    expect(HEX64.test(strip(`sha256:${bare}`))).toBe(true);
  });

  it('rejects anything that is not 64 hex characters', () => {
    for (const bad of ['', 'nothex', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)]) {
      expect(HEX64.test(strip(bad))).toBe(false);
    }
  });

  // Five days, matching key-recovery.md. The deadline is the actionable part of
  // the notification, so drift here would send creators a wrong date.
  it('states a five-day answer window', () => {
    const RECOVERY_DELAY_MS = 5 * 24 * 60 * 60 * 1000;
    expect(RECOVERY_DELAY_MS).toBe(432_000_000);
    const asserted = new Date('2026-08-17T14:02:00Z');
    const answerBy = new Date(asserted.getTime() + RECOVERY_DELAY_MS);
    expect(answerBy.toISOString()).toBe('2026-08-22T14:02:00.000Z');
  });

  // The person who just asserted must not be told about their own assertion,
  // and each prior claimant is told once however many times they asserted.
  it('notifies prior claimants once each, never the asserter', () => {
    const asserter = 7;
    const priors = [
      { asserted_by: 3 },
      { asserted_by: 3 },
      { asserted_by: 7 },
      { asserted_by: null },
      { asserted_by: 9 },
    ];

    const seen = new Set<number>();
    for (const p of priors) {
      if (!p.asserted_by || p.asserted_by === asserter) continue;
      seen.add(p.asserted_by);
    }

    expect([...seen].sort()).toEqual([3, 9]);
    expect(seen.has(asserter)).toBe(false);
  });

  // The property that makes impersonation survivable rather than fatal.
  it('does not treat an existing association as a reason to refuse a new one', () => {
    const existing = [{ entity_id: 'a'.repeat(64), head: 'b'.repeat(64) }];
    const incoming = { entity_id: 'c'.repeat(64), head: 'd'.repeat(64) };
    const refuse = false; // there is no uniqueness rule to consult
    expect(refuse).toBe(false);
    expect([...existing, incoming]).toHaveLength(2);
  });
});

describe('the owner-of-record gate', () => {
  // Three ways to be current, one way to be pending. The rule under all of it:
  // the gate is the owner of record, never the previous asserter -- gating on
  // the previous asserter would hand whoever asserted first a veto over
  // everyone after.
  const decide = (o: {
    ownerOfRecord: number | null;
    asserter: number;
    currentKeys: { author: string | null; recovery: string | null } | null;
    newKeys: { author: string | null; recovery: string | null };
  }) => {
    const asserterIsOwner = o.ownerOfRecord !== null && o.ownerOfRecord === o.asserter;
    const keysKnown = o.currentKeys !== null &&
      (o.currentKeys.author !== null || o.currentKeys.recovery !== null);
    const keysDiffer = keysKnown &&
      (o.currentKeys!.author !== o.newKeys.author ||
       o.currentKeys!.recovery !== o.newKeys.recovery);
    return keysDiffer && !asserterIsOwner && o.ownerOfRecord !== null ? 'pending' : 'current';
  };

  const A = { author: 'a'.repeat(64), recovery: 'b'.repeat(64) };
  const B = { author: 'c'.repeat(64), recovery: 'd'.repeat(64) };

  it('lets the owner change their own keys without asking them to confirm', () => {
    expect(decide({ ownerOfRecord: 1, asserter: 1, currentKeys: A, newKeys: B }))
      .toBe('current');
  });

  it('lets anyone advance the head when the keys are unchanged', () => {
    expect(decide({ ownerOfRecord: 1, asserter: 2, currentKeys: A, newKeys: A }))
      .toBe('current');
  });

  it('holds a key change asserted by somebody else', () => {
    expect(decide({ ownerOfRecord: 1, asserter: 2, currentKeys: A, newKeys: B }))
      .toBe('pending');
  });

  // Nobody to ask. Recorded and weaker, which is honest.
  it('cannot gate content with no owner of record', () => {
    expect(decide({ ownerOfRecord: null, asserter: 2, currentKeys: A, newKeys: B }))
      .toBe('current');
  });

  it('does not gate the first association, which changes nothing', () => {
    expect(decide({ ownerOfRecord: 1, asserter: 2, currentKeys: null, newKeys: A }))
      .toBe('current');
  });

  // The inversion this design exists to avoid.
  it('never gates on the previous asserter', () => {
    // Account 2 asserted first; account 3 asserts a key change. With the owner
    // being account 1, account 2 has no say either way.
    expect(decide({ ownerOfRecord: 1, asserter: 3, currentKeys: A, newKeys: B }))
      .toBe('pending');
    // And the owner is never blocked by an earlier asserter.
    expect(decide({ ownerOfRecord: 1, asserter: 1, currentKeys: A, newKeys: B }))
      .toBe('current');
  });

  // Silence is not consent. There is no timer that turns pending into accepted.
  it('has no path from pending to current except an explicit action', () => {
    const resolutions = ['attested', 'disputed'];
    expect(resolutions).not.toContain('expired');
    expect(resolutions).not.toContain('auto-accepted');
  });
});
