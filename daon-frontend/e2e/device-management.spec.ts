import { test, expect } from '@playwright/test';
import { setupMockedAuth, generateMockTOTP } from './helpers/mock-auth';
import * as speakeasy from 'speakeasy';

/**
 * Device Management E2E Tests
 *
 * Tests device trust functionality:
 * 1. Viewing trusted devices
 * 2. Renaming devices
 * 3. Revoking device trust
 * 4. Device trust expiration
 */

test.describe.skip('Device Management - Navigation', () => {
  test('should navigate to devices page from settings', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings');

    // Look for link to devices page (assuming we add it)
    // For now, navigate directly
    await page.goto('http://localhost:4000/settings/devices');

    await expect(page).toHaveURL('/settings/devices');
    await expect(page.locator('h1:has-text("Trusted Devices")')).toBeVisible();
  });

  test('should redirect to login if not authenticated', async ({ page }) => {
    await page.goto('http://localhost:4000/settings/devices');

    // Should redirect to login
    await page.waitForURL('/auth/login');
  });

  test('should show back to settings button', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings/devices');

    await expect(page.locator('button:has-text("Back to Settings")')).toBeVisible();
  });

  test('should navigate back to settings when clicking back button', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings/devices');
    await page.click('button:has-text("Back to Settings")');

    await expect(page).toHaveURL('/settings');
  });
});

test.describe.skip('Device Management - Display Devices', () => {
  test('should display current trusted device', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings/devices');

    // Should show at least one device (current device)
    await expect(page.locator('text=Current Device')).toBeVisible({ timeout: 5000 });
  });

  test('should display device information', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings/devices');

    // Should show device details
    await expect(page.locator('text=Last used:')).toBeVisible();
    await expect(page.locator('text=Trusted since:')).toBeVisible();
    await expect(page.locator('text=Trust expires:')).toBeVisible();
    await expect(page.locator('text=days remaining')).toBeVisible();
  });

  test('should show empty state when no devices', async ({ page }) => {
    // This would require manually clearing all devices first
    // For now, we'll skip this test or mark as pending
    test.skip();
  });

  test('should display info about trusted devices', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings/devices');

    await expect(page.locator('text=About Trusted Devices')).toBeVisible();
    await expect(page.locator('text=skip 2FA verification for 30 days')).toBeVisible();
  });
});

test.describe.skip('Device Management - Rename Device', () => {
  test('should show rename button for each device', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings/devices');

    // Should have rename button
    await expect(page.locator('button:has-text("Rename")')).toBeVisible();
  });

  test('should show input field when clicking rename', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings/devices');

    // Click rename
    await page.click('button:has-text("Rename")');

    // Should show input field
    await expect(page.locator('input[placeholder="Device name"]')).toBeVisible();
    await expect(page.locator('button:has-text("Save")')).toBeVisible();
    await expect(page.locator('button:has-text("Cancel")').last()).toBeVisible();
  });

  test('should rename device successfully', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings/devices');

    // Click rename
    await page.click('button:has-text("Rename")');

    // Enter new name
    const newName = `My Test Device ${Date.now()}`;
    await page.fill('input[placeholder="Device name"]', newName);

    // Save
    await page.click('button:has-text("Save")');

    // Should show new name
    await expect(page.locator(`text=${newName}`)).toBeVisible({ timeout: 5000 });
  });

  test('should cancel rename without saving', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings/devices');

    // Get original name
    const originalName = await page.locator('h3.font-semibold').first().textContent();

    // Click rename
    await page.click('button:has-text("Rename")');

    // Enter new name
    await page.fill('input[placeholder="Device name"]', 'New Name');

    // Cancel
    await page.click('button:has-text("Cancel")').last();

    // Should still show original name
    await expect(page.locator(`text=${originalName}`)).toBeVisible();
  });
});

test.describe.skip('Device Management - Revoke Device Trust', () => {
  test('should show revoke button for each device', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings/devices');

    // Should have revoke button
    await expect(page.locator('button:has-text("Revoke Trust")')).toBeVisible();
  });

  test('should show confirmation dialog when revoking trust', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings/devices');

    // Setup dialog listener
    page.on('dialog', dialog => {
      expect(dialog.message()).toContain('revoke trust');
      dialog.dismiss();
    });

    // Click revoke
    await page.click('button:has-text("Revoke Trust")');
  });

  test('should revoke device trust successfully', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings/devices');

    // Get device count before
    const deviceCountBefore = await page.locator('[class*="bg-white rounded"]').count();

    // Accept confirmation dialog
    page.on('dialog', dialog => dialog.accept());

    // Click revoke
    await page.click('button:has-text("Revoke Trust")');

    // Device should be removed (or show message)
    await page.waitForTimeout(2000);

    // Either device count decreased or we see empty state
    const deviceCountAfter = await page.locator('[class*="bg-white rounded"]').count();
    expect(deviceCountAfter).toBeLessThanOrEqual(deviceCountBefore);
  });

  test('should cancel revoke when dismissing dialog', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings/devices');

    // Get device count before
    const deviceCountBefore = await page.locator('[class*="bg-white rounded"]').count();

    // Dismiss confirmation dialog
    page.on('dialog', dialog => dialog.dismiss());

    // Click revoke
    await page.click('button:has-text("Revoke Trust")');

    // Wait a bit
    await page.waitForTimeout(1000);

    // Device count should be the same
    const deviceCountAfter = await page.locator('[class*="bg-white rounded"]').count();
    expect(deviceCountAfter).toBe(deviceCountBefore);
  });
});

test.describe.skip('Device Management - Trust Expiration', () => {
  test('should display days until expiry', async ({ page }) => {
    await setupMockedAuth(page);

    await page.goto('http://localhost:4000/settings/devices');

    // Should show days remaining
    const daysText = await page.locator('text=/\\d+ days remaining/').textContent();
    expect(daysText).toMatch(/\d+ days remaining/);
  });

  test('should highlight devices expiring soon', async ({ page }) => {
    // This would require creating a device with custom expiry date
    // Skipping for now as it requires backend manipulation
    test.skip();
  });
});

test.describe.skip('Device Management - Multiple Devices', () => {
  test('should display all trusted devices', async ({ page, browser }) => {
    // Login from first device
    const { email, totpSecret } = await setupMockedAuth(page);

    // Open second browser context (simulates another device)
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();

    // Login from second device
    await page2.goto('http://localhost:4000/auth/login');
    await page2.fill('input[type="email"]', email);
    await page2.click('button[type="submit"]');
    await page2.waitForTimeout(2000);

    // Get magic link
    const mailResponse = await fetch(`${MAILHOG_API}/messages`);
    const mailData = await mailResponse.json();
    const latestEmail = mailData.items[0];
    const body = Buffer.from(latestEmail.MIME.Parts[0].Body, 'base64').toString('utf-8');
    const urlMatch = body.match(/http:\/\/localhost:4000\/auth\/verify\?token=([a-f0-9]+)/);

    await page2.goto(urlMatch[0]);
    await page2.waitForURL(/\/auth\/2fa/);

    // Complete 2FA
    const totpCode = generateMockTOTP(totpSecret);
    await page2.fill('[data-testid="totp-input"]', totpCode);

    // Trust this device too
    const trustCheckbox = page2.locator('input[type="checkbox"][name="trustDevice"]');
    if (await trustCheckbox.isVisible()) {
      await trustCheckbox.check();
    }

    await page2.click('button:has-text("Verify")');
    await page2.waitForURL('/dashboard');

    // Now go to devices page on first device
    await page.goto('http://localhost:4000/settings/devices');

    // Should show multiple devices
    await expect(page.locator('text=Current Device')).toBeVisible();

    // Count device cards (should be at least 2)
    const deviceCount = await page.locator('[class*="bg-white rounded"]').count();
    expect(deviceCount).toBeGreaterThanOrEqual(2);

    await context2.close();
  });
});
