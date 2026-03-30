import { DAONClient, generateContentHash } from '../src/index';

// Short known SHA-256 test vector (for hash-function tests only)
const HASH_TEST_CONTENT = 'test';
const HASH_TEST_HEX = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const HASH_TEST = `sha256:${HASH_TEST_HEX}`;

// Content for HTTP tests — must be ≥ 10 chars to pass SDK validation.
// Hash derived using the same SDK function to stay consistent.
const TEST_CONTENT = 'test content for daon sdk integration tests';
const TEST_HASH = generateContentHash(TEST_CONTENT);
const TEST_HASH_HEX = TEST_HASH.slice(7);

// Minimal valid protect response
const PROTECT_RESPONSE = {
  success: true,
  contentHash: TEST_HASH_HEX,
  verificationUrl: `https://app.daon.network/verify/${TEST_HASH_HEX}`,
  timestamp: '2026-01-01T00:00:00.000Z',
  license: 'liberation_v1',
  blockchainTx: null,
  blockchain: { enabled: false, tx: null },
};

// Minimal valid verify response
const VERIFY_RESPONSE = {
  success: true,
  isValid: true,
  contentHash: TEST_HASH_HEX,
  license: 'liberation_v1',
  timestamp: '2026-01-01T00:00:00.000Z',
  verificationUrl: `https://app.daon.network/verify/${TEST_HASH_HEX}`,
  blockchain: { enabled: false, verified: false, source: 'database' },
};

function mockFetch(body: object, status = 200) {
  return jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------
// generateContentHash
// ---------------------------------------------------------------------------

describe('generateContentHash', () => {
  it('matches known SHA-256 test vector', () => {
    expect(generateContentHash(HASH_TEST_CONTENT)).toBe(HASH_TEST);
  });

  it('returns sha256: prefixed 64-char hex', () => {
    const hash = generateContentHash('any content here');
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('does NOT normalise whitespace — two spaces stays two spaces', () => {
    expect(generateContentHash('foo  bar')).not.toBe(generateContentHash('foo bar'));
  });

  it('does NOT normalise line endings — CRLF differs from LF', () => {
    expect(generateContentHash('foo\r\nbar')).not.toBe(generateContentHash('foo\nbar'));
  });

  it('does NOT strip leading/trailing whitespace', () => {
    expect(generateContentHash('  test  ')).not.toBe(generateContentHash('test'));
  });
});

// ---------------------------------------------------------------------------
// checkLiberationCompliance (pure — no network)
// ---------------------------------------------------------------------------

describe('checkLiberationCompliance', () => {
  const client = new DAONClient();

  it('blocks corporate AI training without compensation', () => {
    const r = client.checkLiberationCompliance(HASH_TEST, {
      entityType: 'corporation', useType: 'ai_training',
      purpose: 'profit', compensation: false,
    });
    expect(r.compliant).toBe(false);
    expect(r.reason).toMatch(/AI training/i);
  });

  it('blocks corporate profit use without compensation', () => {
    const r = client.checkLiberationCompliance(HASH_TEST, {
      entityType: 'corporation', useType: 'commercial',
      purpose: 'profit', compensation: false,
    });
    expect(r.compliant).toBe(false);
    expect(r.reason).toMatch(/profit/i);
  });

  it('allows corporate use when creators are compensated', () => {
    const r = client.checkLiberationCompliance(HASH_TEST, {
      entityType: 'corporation', useType: 'ai_training',
      purpose: 'profit', compensation: true,
    });
    expect(r.compliant).toBe(true);
  });

  it('allows individual personal use', () => {
    const r = client.checkLiberationCompliance(HASH_TEST, {
      entityType: 'individual', useType: 'personal',
      purpose: 'education', compensation: false,
    });
    expect(r.compliant).toBe(true);
  });

  it('allows nonprofit humanitarian use', () => {
    const r = client.checkLiberationCompliance(HASH_TEST, {
      entityType: 'nonprofit', useType: 'education',
      purpose: 'humanitarian', compensation: false,
    });
    expect(r.compliant).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// protect()
// ---------------------------------------------------------------------------

describe('protect', () => {
  it('sends content (not content_hash) in request body', async () => {
    const spy = mockFetch(PROTECT_RESPONSE);
    const client = new DAONClient();
    await client.protect({ content: TEST_CONTENT });

    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toHaveProperty('content', TEST_CONTENT);
    expect(body).not.toHaveProperty('content_hash');
    expect(body).not.toHaveProperty('creator');
    expect(body).not.toHaveProperty('platform');
  });

  it('posts to /api/v1/protect', async () => {
    const spy = mockFetch(PROTECT_RESPONSE);
    const client = new DAONClient();
    await client.protect({ content: TEST_CONTENT });

    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/protect');
  });

  it('prefixes contentHash from response with sha256:', async () => {
    mockFetch(PROTECT_RESPONSE);
    const client = new DAONClient();
    const result = await client.protect({ content: TEST_CONTENT });

    expect(result.success).toBe(true);
    expect(result.contentHash).toBe(TEST_HASH);
  });

  it('maps blockchainTx from response', async () => {
    mockFetch({ ...PROTECT_RESPONSE, blockchainTx: 'ABC123TX' });
    const client = new DAONClient();
    const result = await client.protect({ content: TEST_CONTENT });

    expect(result.txHash).toBe('ABC123TX');
  });

  it('returns success: false on network error', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('Network error'));
    const client = new DAONClient({ retries: 0 });
    const result = await client.protect({ content: TEST_CONTENT });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('validates content is not empty', async () => {
    const client = new DAONClient();
    const result = await client.protect({ content: '' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verify()
// ---------------------------------------------------------------------------

describe('verify', () => {
  it('strips sha256: prefix before calling API', async () => {
    const spy = mockFetch(VERIFY_RESPONSE);
    const client = new DAONClient();
    await client.verify(TEST_HASH);

    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain(`/api/v1/verify/${TEST_HASH_HEX}`);
    expect(url).not.toContain('sha256:');
  });

  it('hashes raw content when passed content (not a hash)', async () => {
    const spy = mockFetch(VERIFY_RESPONSE);
    const client = new DAONClient();
    await client.verify(TEST_CONTENT);

    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain(`/api/v1/verify/${TEST_HASH_HEX}`);
  });

  it('maps isValid → verified: true', async () => {
    mockFetch(VERIFY_RESPONSE);
    const client = new DAONClient();
    const result = await client.verify(TEST_HASH);

    expect(result.verified).toBe(true);
    expect(result.license).toBe('liberation_v1');
  });

  it('returns verified: false when API returns isValid: false', async () => {
    mockFetch({ ...VERIFY_RESPONSE, isValid: false });
    const client = new DAONClient();
    const result = await client.verify(TEST_HASH);

    expect(result.verified).toBe(false);
  });

  it('returns verified: false on HTTP error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false, status: 404, json: async () => ({}),
    } as Response);
    const client = new DAONClient({ retries: 0 });
    const result = await client.verify(TEST_HASH);

    expect(result.verified).toBe(false);
  });
});
