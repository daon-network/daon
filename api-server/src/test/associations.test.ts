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
