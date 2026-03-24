import { test, expect, request as playwrightRequest } from '@playwright/test';

/**
 * Live integration tests for the /verify pages.
 *
 * These tests exercise the exact frontend → nginx → API → blockchain path
 * without requiring MailHog or local infrastructure.
 *
 * Environment variables:
 *   BASE_URL  - Frontend URL (default: http://localhost:4000, set by playwright.config.ts)
 *   API_URL   - API URL for seeding test content (default: https://api.daon.network)
 */

// These tests require a live frontend+API. Skip them in local/CI runs where
// BASE_URL is not explicitly set — use `npm run test:e2e:remote` instead.
const isRemote = !!process.env.BASE_URL;
test.skip(!isRemote, 'verification-live tests only run with BASE_URL set (use npm run test:e2e:remote)');

const API_URL = process.env.API_URL || 'https://api.daon.network';

let testContentHash: string;
let testContent: string;

test.beforeAll(async () => {
  // Seed a known piece of content so we have a hash to verify against.
  // Uses Playwright's request API (no browser needed).
  const apiContext = await playwrightRequest.newContext();
  testContent = `Live E2E Verification Test — ${Date.now()}`;

  const response = await apiContext.post(`${API_URL}/api/v1/protect`, {
    data: {
      content: testContent,
      metadata: { title: 'Live E2E Test', type: 'test' },
    },
  });

  if (!response.ok()) {
    throw new Error(
      `Failed to seed test content: ${response.status()} ${await response.text()}`
    );
  }

  const body = await response.json();
  if (!body.success || !body.contentHash) {
    throw new Error(`Unexpected protect response: ${JSON.stringify(body)}`);
  }

  testContentHash = body.contentHash;

  // Give the blockchain a moment to mine the transaction before the tests run.
  await new Promise((r) => setTimeout(r, 3000));
  await apiContext.dispose();
});

test.describe('DAON Verification Live', () => {
  test('verify by hash shows Content Verified', async ({ page }) => {
    await page.goto(`/verify/${testContentHash}`);

    // Wait for loading spinner to disappear
    await expect(page.getByText('Verifying Content...')).not.toBeVisible({ timeout: 15000 });

    await expect(page.getByRole('heading', { name: /Content Verified!/i })).toBeVisible();
    await expect(page.getByText('Verified on Blockchain')).toBeVisible();

    // The hash should be displayed on the page
    await expect(page.getByText(testContentHash)).toBeVisible();
  });

  test('verify by content pasting text shows Content Verified', async ({ page }) => {
    await page.goto('/verify');

    // Paste text into the textarea
    await page.locator('textarea').fill(testContent);
    await page.getByRole('button', { name: /Verify Content/i }).click();

    // Wait for the result
    await expect(page.getByText('Verifying...')).not.toBeVisible({ timeout: 15000 });

    await expect(page.getByRole('heading', { name: /Content Verified!/i })).toBeVisible();
    await expect(page.getByText('Verified on Blockchain')).toBeVisible();
  });

  test('unknown hash shows Content Not Found (not Verification Failed)', async ({ page }) => {
    const unknownHash = '0'.repeat(64);
    await page.goto(`/verify/${unknownHash}`);

    await expect(page.getByText('Verifying Content...')).not.toBeVisible({ timeout: 15000 });

    // Regression guard: must show "Content Not Found", not "Verification Failed"
    await expect(page.getByRole('heading', { name: /Content Not Found/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Verification Failed/i })).not.toBeVisible();
  });
});
