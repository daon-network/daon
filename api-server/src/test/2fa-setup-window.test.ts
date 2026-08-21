/**
 * The window a new user gets to set up 2FA.
 *
 * This exists because a real signup died in it. On 19 August a student clicked
 * their magic link 31 seconds after requesting it, was shown a QR code, and the
 * session expired five minutes later with zero attempts recorded -- they never
 * entered a code. Setting up 2FA can mean installing an authenticator app
 * first; verifying it cannot.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = readFileSync(
  path.join(process.cwd(), 'src/auth/auth-service.ts'),
  'utf8'
);

describe('2FA setup window', () => {
  it('gives setup the same lifetime as the magic link, not the verify window', () => {
    expect(src).toMatch(/const SETUP_SESSION_LIFETIME = MAGIC_LINK_LIFETIME/);
  });

  it('keeps the short window for verification, where no install is needed', () => {
    expect(src).toMatch(/const TEMP_SESSION_LIFETIME = 300/);
  });

  it('chooses the lifetime by flow rather than using one constant for both', () => {
    expect(src).toMatch(/flowType === '2fa_setup'\s*\n?\s*\? SETUP_SESSION_LIFETIME/);
  });

  it('tells the client how long it has, so the page can show it', () => {
    expect(src).toMatch(/expires_in: SETUP_SESSION_LIFETIME/);
  });

  it('explains an expired setup session instead of saying "invalid"', () => {
    expect(src).toMatch(/Request a new sign-in link and you can/);
  });
});
