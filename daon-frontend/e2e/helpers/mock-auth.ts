import { Page } from '@playwright/test';
import * as speakeasy from 'speakeasy';

/**
 * Mock authentication helper that doesn't require MailHog or real API
 * Sets up authenticated state directly in browser storage
 */

export async function setupMockedAuth(page: Page): Promise<{ email: string; totpSecret: string }> {
  const testEmail = `test-${Date.now()}@example.com`;
  const totpSecret = speakeasy.generateSecret({ length: 32 }).base32;
  const mockAccessToken = 'mock-access-token-' + Date.now();
  const mockRefreshToken = 'mock-refresh-token-' + Date.now();

  // Mock all auth and settings-related API endpoints
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // User profile
    if (url.includes('/auth/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: {
            email: testEmail,
            twoFactorEnabled: true,
            createdAt: new Date().toISOString()
          }
        })
      });
    }

    // Email change
    if (url.includes('/email-change')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Email change initiated' })
      });
    }

    // Regenerate backup codes
    if (url.includes('/2fa/regenerate-codes')) {
      const backupCodes = Array.from({ length: 10 }, (_, i) =>
        `${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
      );
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, backupCodes })
      });
    }

    // Disable 2FA
    if (url.includes('/2fa/disable')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: '2FA disabled successfully' })
      });
    }

    // Sign out everywhere
    if (url.includes('/revoke-all')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Signed out from all devices' })
      });
    }

    // Devices endpoints
    if (url.includes('/auth/devices')) {
      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            devices: [{
              id: 'device-1',
              deviceName: 'Test Device',
              isCurrent: true,
              lastUsed: new Date().toISOString(),
              trustedSince: new Date().toISOString(),
              trustExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              daysRemaining: 30
            }]
          })
        });
      }
      if (method === 'PATCH') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, message: 'Device renamed' })
        });
      }
      if (method === 'DELETE') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, message: 'Device trust revoked' })
        });
      }
    }

    // Content protection
    if (url.includes('/protect')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          hash: 'mock-hash-' + Math.random().toString(36).substring(7),
          transactionId: 'mock-tx-' + Math.random().toString(36).substring(7)
        })
      });
    }

    // Default: pass through
    await route.continue();
  });

  // Navigate to login to initialize the page
  await page.goto('http://localhost:4000/auth/login');

  // Set up authenticated state directly in localStorage
  await page.evaluate(({ accessToken, refreshToken, email }) => {
    localStorage.setItem('daon_refresh_token', refreshToken);
    // Note: access token is typically stored in memory, but for testing we can set it
    // The frontend will call /auth/me which we're mocking above
  }, { accessToken: mockAccessToken, refreshToken: mockRefreshToken, email: testEmail });

  // Navigate to dashboard (will trigger /auth/me call which is mocked)
  await page.goto('http://localhost:4000/dashboard');
  await page.waitForTimeout(1000);

  return { email: testEmail, totpSecret };
}

export function generateMockTOTP(secret: string): string {
  return speakeasy.totp({
    secret: secret,
    encoding: 'base32'
  });
}
