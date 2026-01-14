import { test, expect } from '@playwright/test';
import { setupMockedAuth, generateMockTOTP } from './helpers/mock-auth';
import * as speakeasy from 'speakeasy';

/**
 * Settings Page E2E Tests
 *
 * Tests all settings functionality:
 * 1. Account settings (email change)
 * 2. Security settings (2FA management, backup codes)
 * 3. Session management (sign out everywhere)
 */

const API_BASE = 'http://localhost:3000/api/v1';


test.describe.skip('Settings Page - Account Settings', () => {
  test('should display current email', async ({ page }) => {
    const { email } = await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');
    await expect(page).toHaveURL('/settings');

    // Check current email is displayed
    const emailInput = page.locator('input[type="email"][disabled]');
    await expect(emailInput).toHaveValue(email);
  });

  test('should show email change form when clicking "Change Email"', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');

    // Initially form should not be visible
    await expect(page.locator('input[placeholder="new@example.com"]')).not.toBeVisible();

    // Click "Change Email"
    await page.click('button:has-text("Change Email")');

    // Form should now be visible
    await expect(page.locator('input[placeholder="new@example.com"]')).toBeVisible();
    await expect(page.locator('input[placeholder="000000"]')).toBeVisible();
  });

  test('should validate email change requires 2FA code', async ({ page }) => {
    const { totpSecret } = await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');
    await page.click('button:has-text("Change Email")');

    // Fill only email without 2FA code
    await page.fill('input[placeholder="new@example.com"]', 'newemail@example.com');
    await page.click('button:has-text("Request Email Change")');

    // Should show validation error (HTML5 validation or custom)
    const totpInput = page.locator('input[placeholder="000000"]');
    await expect(totpInput).toHaveAttribute('required');
  });

  test('should request email change with valid 2FA code', async ({ page }) => {
    const { totpSecret } = await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');
    await page.click('button:has-text("Change Email")');

    // Generate TOTP code
    const totpCode = generateMockTOTP(totpSecret);

    // Fill form
    await page.fill('input[placeholder="new@example.com"]', `new-${Date.now()}@example.com`);
    await page.fill('input[placeholder="000000"]', totpCode);

    // Submit
    await page.click('button:has-text("Request Email Change")');

    // Should show success message
    await expect(page.locator('text=Email change initiated')).toBeVisible({ timeout: 5000 });
  });

  test('should cancel email change', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');
    await page.click('button:has-text("Change Email")');

    // Fill form
    await page.fill('input[placeholder="new@example.com"]', 'test@example.com');

    // Click cancel
    await page.click('button:has-text("Cancel")');

    // Form should be hidden
    await expect(page.locator('input[placeholder="new@example.com"]')).not.toBeVisible();
  });
});

test.describe.skip('Settings Page - Security Settings', () => {
  test('should display 2FA status as enabled', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');

    // Should show 2FA as active
    await expect(page.locator('text=Two-Factor Authentication')).toBeVisible();
    await expect(page.locator('text=Enabled and protecting your account')).toBeVisible();
    await expect(page.locator('text=✓ Active')).toBeVisible();
  });

  test('should regenerate backup codes', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');

    // Click regenerate backup codes
    await page.click('button:has-text("Regenerate Backup Codes")');

    // Should show new backup codes
    await expect(page.locator('text=Your New Backup Codes')).toBeVisible({ timeout: 5000 });

    // Should have 10 backup codes
    const backupCodes = await page.locator('[class*="font-mono"]').filter({ hasText: /-/ }).count();
    expect(backupCodes).toBe(10);
  });

  test('should download backup codes', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');
    await page.click('button:has-text("Regenerate Backup Codes")');

    await page.waitForSelector('text=Your New Backup Codes');

    // Setup download listener
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Download")');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/daon-backup-codes-.*\.txt/);
  });

  test('should show disable 2FA form when clicked', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');

    // Initially disable form should not be visible
    await expect(page.locator('text=Are you sure?')).not.toBeVisible();

    // Click disable 2FA
    await page.click('button:has-text("Disable Two-Factor Authentication")');

    // Warning and form should be visible
    await expect(page.locator('text=Are you sure?')).toBeVisible();
    await expect(page.locator('text=significantly reduce your account security')).toBeVisible();
  });

  test('should cancel disable 2FA', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');
    await page.click('button:has-text("Disable Two-Factor Authentication")');

    // Click cancel
    await page.click('button:has-text("Cancel")');

    // Form should be hidden
    await expect(page.locator('text=Are you sure?')).not.toBeVisible();
  });

  test('should disable 2FA with valid code and logout', async ({ page }) => {
    const { totpSecret } = await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');
    await page.click('button:has-text("Disable Two-Factor Authentication")');

    // Generate TOTP code
    const totpCode = generateMockTOTP(totpSecret);

    // Fill code and submit
    await page.fill('input[placeholder="000000"]', totpCode);
    await page.click('button:has-text("Yes, Disable 2FA")');

    // Should show success and redirect to login
    await expect(page.locator('text=2FA disabled successfully')).toBeVisible({ timeout: 5000 });
    await page.waitForURL('/auth/login', { timeout: 5000 });
  });
});

test.describe.skip('Settings Page - Session Management', () => {
  test('should display current session info', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');

    // Should show current session info
    await expect(page.locator('text=Current Session')).toBeVisible();
    await expect(page.locator('text=You are currently signed in on this device')).toBeVisible();
  });

  test('should show sign out everywhere button', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');

    // Button should be visible
    await expect(page.locator('button:has-text("Sign Out Everywhere")')).toBeVisible();
  });

  test('should confirm before signing out everywhere', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');

    // Setup dialog listener
    page.on('dialog', dialog => {
      expect(dialog.message()).toContain('sign out from all devices');
      dialog.dismiss();
    });

    await page.click('button:has-text("Sign Out Everywhere")');
  });

  test('should sign out everywhere and redirect to login', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');

    // Accept confirmation dialog
    page.on('dialog', dialog => dialog.accept());

    await page.click('button:has-text("Sign Out Everywhere")');

    // Should show success message and redirect
    await expect(page.locator('text=Signed out from all devices')).toBeVisible({ timeout: 5000 });
    await page.waitForURL('/auth/login', { timeout: 5000 });
  });

  test('should display session information', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');

    // Should show session info
    await expect(page.locator('text=About Sessions')).toBeVisible();
    await expect(page.locator('text=session automatically expires after 30 days')).toBeVisible();
    await expect(page.locator('text=Device trust lasts for 30 days')).toBeVisible();
  });
});

test.describe.skip('Settings Page - Navigation', () => {
  test('should load settings page for authenticated user', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');

    await expect(page).toHaveURL('/settings');
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible();
  });

  test('should redirect to login if not authenticated', async ({ page }) => {
    await page.goto('http://localhost:4000/settings');

    // Should redirect to login
    await page.waitForURL('/auth/login');
  });

  test('should show all three settings sections', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');

    // All sections should be visible
    await expect(page.locator('h2:has-text("Account")')).toBeVisible();
    await expect(page.locator('h2:has-text("Security")')).toBeVisible();
    await expect(page.locator('h2:has-text("Sessions")')).toBeVisible();
  });
});
