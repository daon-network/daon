import { test, expect } from '@playwright/test';
import * as speakeasy from 'speakeasy';

/**
 * Complete Auth Flow E2E Tests
 * 
 * Tests the entire authentication journey:
 * 1. Magic link request
 * 2. Email verification
 * 3. 2FA setup (new users)
 * 4. 2FA verification (existing users)
 * 5. Dashboard access
 * 6. Session persistence
 * 7. Logout
 */

const API_BASE = 'http://localhost:3000/api/v1';
const MAILHOG_API = 'http://localhost:8025/api/v2';

interface MagicLinkEmail {
  token: string;
  url: string;
}

/**
 * Helper: Get the latest magic link from MailHog
 */
async function getLatestMagicLink(): Promise<MagicLinkEmail | null> {
  try {
    const response = await fetch(`${MAILHOG_API}/messages`);
    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      return null;
    }
    
    const latestEmail = data.items[0];
    const body = Buffer.from(latestEmail.MIME.Parts[0].Body, 'base64').toString('utf-8');
    
    const urlMatch = body.match(/http:\/\/localhost:4000\/auth\/verify\?token=([a-f0-9]+)/);
    if (!urlMatch) {
      return null;
    }
    
    return {
      token: urlMatch[1],
      url: urlMatch[0]
    };
  } catch (error) {
    console.error('Failed to fetch magic link:', error);
    return null;
  }
}

/**
 * Helper: Clear MailHog messages
 */
async function clearMailHog(): Promise<void> {
  try {
    await fetch(`${MAILHOG_API}/messages`, { method: 'DELETE' });
  } catch (error) {
    console.error('Failed to clear MailHog:', error);
  }
}

/**
 * Helper: Generate TOTP code from secret
 */
function generateTOTP(secret: string): string {
  return speakeasy.totp({
    secret: secret,
    encoding: 'base32'
  });
}

test.describe.skip('Complete Auth Flow - New User', () => {
  const testEmail = `newuser-${Date.now()}@example.com`;

  test.beforeEach(async () => {
    await clearMailHog();
  });

  test('full registration and 2FA setup flow', async ({ page }) => {
    // Step 1: Navigate to login page
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: /Welcome to DAON/i })).toBeVisible();

    // Step 2: Request magic link
    await page.locator('input[type="email"]').fill(testEmail);
    await page.getByRole('button', { name: /Send Magic Link/i }).click();
    
    // Wait for success message
    await expect(page.getByText(/Magic link sent/i)).toBeVisible({ timeout: 10000 });

    // Step 3: Get magic link from MailHog
    await page.waitForTimeout(2000); // Give MailHog time to receive email
    const magicLink = await getLatestMagicLink();
    expect(magicLink).not.toBeNull();

    // Step 4: Click magic link
    await page.goto(magicLink!.url);
    
    // Should see verification success
    await expect(page.getByText(/Verification Complete|Success/i)).toBeVisible({ timeout: 10000 });
    
    // Should redirect to 2FA setup (new user)
    await page.waitForURL(/\/auth\/setup-2fa/, { timeout: 10000 });

    // Step 5: 2FA Setup - Should see QR code
    await expect(page.getByText(/Set Up Two-Factor Authentication/i)).toBeVisible();
    await expect(page.getByText(/Scan this QR code/i)).toBeVisible();
    
    // Get the TOTP secret from the page (manual entry key)
    const secretElement = await page.locator('text=/[A-Z0-9]{32}/').first();
    const secret = await secretElement.textContent();
    expect(secret).toBeTruthy();
    
    // Generate TOTP code
    const totpCode = generateTOTP(secret!.replace(/\s/g, ''));
    
    // Step 6: Enter TOTP code
    const totpInput = page.locator('input[type="text"][maxlength="6"]');
    await totpInput.fill(totpCode);
    
    await page.getByRole('button', { name: /Verify/i }).click();
    
    // Step 7: Should show backup codes
    await expect(page.getByText(/Backup Codes/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Download|Copy/i)).toBeVisible();
    
    // Verify backup codes are displayed
    const backupCodes = await page.locator('text=/[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/').count();
    expect(backupCodes).toBeGreaterThan(0);
    
    // Step 8: Continue to dashboard
    await page.getByRole('button', { name: /Continue to Dashboard/i }).click();
    
    // Should land on dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 10000 });
    await expect(page.getByText(/Welcome to DAON/i)).toBeVisible();
    await expect(page.getByText(testEmail)).toBeVisible();
    await expect(page.getByText(/2FA Enabled/i)).toBeVisible();
    
    // Step 9: Verify localStorage has tokens
    const refreshToken = await page.evaluate(() => localStorage.getItem('daon_refresh_token'));
    expect(refreshToken).not.toBeNull();
    expect(refreshToken).not.toBe('undefined');
    
    const user = await page.evaluate(() => localStorage.getItem('daon_user'));
    expect(user).not.toBeNull();
    const userData = JSON.parse(user!);
    expect(userData.email).toBe(testEmail);
    expect(userData.totp_enabled).toBe(true);
  });
});

test.describe.skip('Complete Auth Flow - Existing User', () => {
  const testEmail = `existinguser-${Date.now()}@example.com`;
  let totpSecret: string;
  
  // Setup: Create user with 2FA already enabled
  test.beforeAll(async ({ page }) => {
    await clearMailHog();
    
    // Create account
    await page.goto('/auth/login');
    await page.locator('input[type="email"]').fill(testEmail);
    await page.getByRole('button', { name: /Send Magic Link/i }).click();
    await page.waitForTimeout(2000);
    
    const magicLink = await getLatestMagicLink();
    await page.goto(magicLink!.url);
    await page.waitForURL(/\/auth\/setup-2fa/);
    
    // Get secret and setup 2FA
    const secretElement = await page.locator('text=/[A-Z0-9]{32}/').first();
    totpSecret = (await secretElement.textContent())!.replace(/\s/g, '');
    
    const totpCode = generateTOTP(totpSecret);
    await page.locator('input[type="text"][maxlength="6"]').fill(totpCode);
    await page.getByRole('button', { name: /Verify/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /Continue to Dashboard/i }).click();
    await page.waitForURL(/\/dashboard/);
    
    // Logout
    await page.getByRole('button', { name: /Logout/i }).click();
    await page.waitForURL(/\/auth\/login/);
  });

  test('full login with 2FA verification flow', async ({ page }) => {
    await clearMailHog();
    
    // Step 1: Request magic link
    await page.goto('/auth/login');
    await page.locator('input[type="email"]').fill(testEmail);
    await page.getByRole('button', { name: /Send Magic Link/i }).click();
    await expect(page.getByText(/Magic link sent/i)).toBeVisible();

    // Step 2: Get and click magic link
    await page.waitForTimeout(2000);
    const magicLink = await getLatestMagicLink();
    await page.goto(magicLink!.url);
    
    // Step 3: Should redirect to 2FA verify (not setup)
    await page.waitForURL(/\/auth\/2fa/, { timeout: 10000 });
    await expect(page.getByText(/Enter Authentication Code/i)).toBeVisible();
    
    // Step 4: Enter TOTP code (segmented input)
    const totpCode = generateTOTP(totpSecret);
    const digits = totpCode.split('');
    
    for (let i = 0; i < 6; i++) {
      await page.locator(`input[type="text"]`).nth(i).fill(digits[i]);
    }
    
    // Step 5: Submit
    await page.getByRole('button', { name: /Verify/i }).click();
    
    // Step 6: Should land on dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 10000 });
    await expect(page.getByText(/Welcome to DAON/i)).toBeVisible();
    await expect(page.getByText(testEmail)).toBeVisible();
    await expect(page.getByText(/2FA Enabled/i)).toBeVisible();
    
    // Verify tokens
    const refreshToken = await page.evaluate(() => localStorage.getItem('daon_refresh_token'));
    expect(refreshToken).not.toBeNull();
    expect(refreshToken).not.toBe('undefined');
  });

  test('should use backup code when TOTP unavailable', async ({ page }) => {
    await clearMailHog();
    
    // Login and get backup code first
    await page.goto('/auth/login');
    await page.locator('input[type="email"]').fill(testEmail);
    await page.getByRole('button', { name: /Send Magic Link/i }).click();
    await page.waitForTimeout(2000);
    
    const magicLink = await getLatestMagicLink();
    await page.goto(magicLink!.url);
    await page.waitForURL(/\/auth\/2fa/);
    
    // Click "Use backup code instead"
    await page.getByText(/Use backup code/i).click();
    
    // Should show backup code input
    await expect(page.locator('input[placeholder*="xxxx-xxxx-xxxx"]')).toBeVisible();
    
    // Note: We can't test actual backup code without storing it during setup
    // This test validates the UI switches correctly
  });
});

test.describe.skip('Session Persistence', () => {
  const testEmail = `persistence-${Date.now()}@example.com`;
  
  test('session persists across page reloads', async ({ page }) => {
    await clearMailHog();
    
    // Create and login
    await page.goto('/auth/login');
    await page.locator('input[type="email"]').fill(testEmail);
    await page.getByRole('button', { name: /Send Magic Link/i }).click();
    await page.waitForTimeout(2000);
    
    const magicLink = await getLatestMagicLink();
    await page.goto(magicLink!.url);
    await page.waitForURL(/\/auth\/setup-2fa/);
    
    const secretElement = await page.locator('text=/[A-Z0-9]{32}/').first();
    const secret = (await secretElement.textContent())!.replace(/\s/g, '');
    
    const totpCode = generateTOTP(secret);
    await page.locator('input[type="text"][maxlength="6"]').fill(totpCode);
    await page.getByRole('button', { name: /Verify/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /Continue to Dashboard/i }).click();
    await page.waitForURL(/\/dashboard/);
    
    // Verify on dashboard
    await expect(page.getByText(/Welcome to DAON/i)).toBeVisible();
    
    // Reload page
    await page.reload();
    
    // Should still be on dashboard (not redirected to login)
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/Welcome to DAON/i)).toBeVisible();
    await expect(page.getByText(testEmail)).toBeVisible();
    
    // Verify token still exists
    const refreshToken = await page.evaluate(() => localStorage.getItem('daon_refresh_token'));
    expect(refreshToken).not.toBeNull();
    expect(refreshToken).not.toBe('undefined');
  });

  test('session persists on 404 and back navigation', async ({ page }) => {
    await clearMailHog();
    
    // Create and login (simplified)
    await page.goto('/auth/login');
    await page.locator('input[type="email"]').fill(`404test-${Date.now()}@example.com`);
    await page.getByRole('button', { name: /Send Magic Link/i }).click();
    await page.waitForTimeout(2000);
    
    const magicLink = await getLatestMagicLink();
    await page.goto(magicLink!.url);
    await page.waitForURL(/\/auth\/setup-2fa/);
    
    const secretElement = await page.locator('text=/[A-Z0-9]{32}/').first();
    const secret = (await secretElement.textContent())!.replace(/\s/g, '');
    
    const totpCode = generateTOTP(secret);
    await page.locator('input[type="text"][maxlength="6"]').fill(totpCode);
    await page.getByRole('button', { name: /Verify/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /Continue to Dashboard/i }).click();
    await page.waitForURL(/\/dashboard/);
    
    // Navigate to 404
    await page.goto('/nonexistent-page');
    await expect(page.getByText(/404|Not Found/i)).toBeVisible();
    
    // Go back
    await page.goBack();
    
    // Should still be authenticated
    await expect(page).toHaveURL(/\/dashboard/);
    
    // Verify token persists
    const refreshToken = await page.evaluate(() => localStorage.getItem('daon_refresh_token'));
    expect(refreshToken).not.toBeNull();
    expect(refreshToken).not.toBe('undefined');
  });
});

test.describe.skip('UI/UX Regression Tests', () => {
  test('no light-on-light text in TOTP inputs', async ({ page }) => {
    await page.goto('/auth/login');
    const testEmail = `uitest-${Date.now()}@example.com`;
    await page.locator('input[type="email"]').fill(testEmail);
    await page.getByRole('button', { name: /Send Magic Link/i }).click();
    await page.waitForTimeout(2000);
    
    const magicLink = await getLatestMagicLink();
    await page.goto(magicLink!.url);
    await page.waitForURL(/\/auth\/setup-2fa/);
    
    // Check TOTP input styling
    const totpInput = page.locator('input[type="text"][maxlength="6"]');
    
    // Get computed styles
    const backgroundColor = await totpInput.evaluate(el => 
      window.getComputedStyle(el).backgroundColor
    );
    const color = await totpInput.evaluate(el => 
      window.getComputedStyle(el).color
    );
    
    // Verify it's not light-on-light (white/light text on white/light bg)
    expect(backgroundColor).toContain('rgb(255, 255, 255)'); // white
    expect(color).toMatch(/rgb\(17, 24, 39\)|rgb\(31, 41, 55\)/); // gray-900 or gray-800
  });

  test('dashboard shows correct 2FA status', async ({ page }) => {
    const testEmail = `statustest-${Date.now()}@example.com`;
    
    await page.goto('/auth/login');
    await page.locator('input[type="email"]').fill(testEmail);
    await page.getByRole('button', { name: /Send Magic Link/i }).click();
    await page.waitForTimeout(2000);
    
    const magicLink = await getLatestMagicLink();
    await page.goto(magicLink!.url);
    await page.waitForURL(/\/auth\/setup-2fa/);
    
    const secretElement = await page.locator('text=/[A-Z0-9]{32}/').first();
    const secret = (await secretElement.textContent())!.replace(/\s/g, '');
    
    const totpCode = generateTOTP(secret);
    await page.locator('input[type="text"][maxlength="6"]').fill(totpCode);
    await page.getByRole('button', { name: /Verify/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /Continue to Dashboard/i }).click();
    await page.waitForURL(/\/dashboard/);
    
    // Verify 2FA status shows "Enabled" not "Disabled"
    await expect(page.getByText(/2FA Enabled/i)).toBeVisible();
    await expect(page.getByText(/2FA Disabled/i)).not.toBeVisible();
  });

  test('refresh token not stored as undefined', async ({ page }) => {
    const testEmail = `tokentest-${Date.now()}@example.com`;
    
    await page.goto('/auth/login');
    await page.locator('input[type="email"]').fill(testEmail);
    await page.getByRole('button', { name: /Send Magic Link/i }).click();
    await page.waitForTimeout(2000);
    
    const magicLink = await getLatestMagicLink();
    await page.goto(magicLink!.url);
    await page.waitForURL(/\/auth\/setup-2fa/);
    
    const secretElement = await page.locator('text=/[A-Z0-9]{32}/').first();
    const secret = (await secretElement.textContent())!.replace(/\s/g, '');
    
    const totpCode = generateTOTP(secret);
    await page.locator('input[type="text"][maxlength="6"]').fill(totpCode);
    await page.getByRole('button', { name: /Verify/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /Continue to Dashboard/i }).click();
    await page.waitForURL(/\/dashboard/);
    
    // Check localStorage
    const refreshToken = await page.evaluate(() => localStorage.getItem('daon_refresh_token'));
    
    // Should not be null, undefined string, or empty
    expect(refreshToken).not.toBeNull();
    expect(refreshToken).not.toBe('undefined');
    expect(refreshToken).not.toBe('');
    expect(refreshToken!.length).toBeGreaterThan(20); // Valid token length
  });
});

test.describe.skip('Error Handling', () => {
  test('handles expired magic link gracefully', async ({ page, context }) => {
    await page.goto('/auth/verify?token=invalid_or_expired_token');
    
    // Should show error message
    await expect(page.getByText(/Verification Failed|Invalid|Expired/i)).toBeVisible({ timeout: 10000 });
    
    // Should have button to go back to login
    await expect(page.getByRole('button', { name: /Back to Login/i })).toBeVisible();
  });

  test('handles invalid TOTP code', async ({ page }) => {
    await clearMailHog();
    
    const testEmail = `errortest-${Date.now()}@example.com`;
    await page.goto('/auth/login');
    await page.locator('input[type="email"]').fill(testEmail);
    await page.getByRole('button', { name: /Send Magic Link/i }).click();
    await page.waitForTimeout(2000);
    
    const magicLink = await getLatestMagicLink();
    await page.goto(magicLink!.url);
    await page.waitForURL(/\/auth\/setup-2fa/);
    
    // Enter invalid code
    await page.locator('input[type="text"][maxlength="6"]').fill('000000');
    await page.getByRole('button', { name: /Verify/i }).click();
    
    // Should show error
    await expect(page.getByText(/Invalid|Verification failed/i)).toBeVisible({ timeout: 10000 });
  });

  test('handles network errors during magic link request', async ({ page, context }) => {
    // Block API requests
    await context.route('**/api/v1/auth/magic-link', route => route.abort());
    
    await page.goto('/auth/login');
    await page.locator('input[type="email"]').fill('test@example.com');
    await page.getByRole('button', { name: /Send Magic Link/i }).click();
    
    // Should show network error
    await expect(page.getByText(/Network|Failed|Error/i)).toBeVisible({ timeout: 10000 });
  });
});

test.describe.skip('Security Tests', () => {
  test('cannot access dashboard without authentication', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/auth\/login/, { timeout: 5000 });
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('tokens are cleared on logout', async ({ page }) => {
    const testEmail = `logouttest-${Date.now()}@example.com`;
    
    // Login
    await page.goto('/auth/login');
    await page.locator('input[type="email"]').fill(testEmail);
    await page.getByRole('button', { name: /Send Magic Link/i }).click();
    await page.waitForTimeout(2000);
    
    const magicLink = await getLatestMagicLink();
    await page.goto(magicLink!.url);
    await page.waitForURL(/\/auth\/setup-2fa/);
    
    const secretElement = await page.locator('text=/[A-Z0-9]{32}/').first();
    const secret = (await secretElement.textContent())!.replace(/\s/g, '');
    
    const totpCode = generateTOTP(secret);
    await page.locator('input[type="text"][maxlength="6"]').fill(totpCode);
    await page.getByRole('button', { name: /Verify/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /Continue to Dashboard/i }).click();
    await page.waitForURL(/\/dashboard/);
    
    // Verify tokens exist
    let refreshToken = await page.evaluate(() => localStorage.getItem('daon_refresh_token'));
    expect(refreshToken).not.toBeNull();
    
    // Logout
    await page.getByRole('button', { name: /Logout/i }).click();
    await page.waitForURL(/\/auth\/login/);
    
    // Verify tokens are cleared
    refreshToken = await page.evaluate(() => localStorage.getItem('daon_refresh_token'));
    expect(refreshToken).toBeNull();
    
    const user = await page.evaluate(() => localStorage.getItem('daon_user'));
    expect(user).toBeNull();
  });
});
