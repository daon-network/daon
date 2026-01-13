import { test, expect } from '@playwright/test';
import { setupMockedAuth, generateMockTOTP } from './helpers/mock-auth';
import * as speakeasy from 'speakeasy';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Bulk Registration E2E Tests
 *
 * Tests bulk content protection functionality:
 * 1. CSV file upload
 * 2. JSON file upload
 * 3. Batch processing
 * 4. Progress tracking
 * 5. Results download
 */

const API_BASE = 'http://localhost:3000/api/v1';

/**
 * Helper: Setup mock protect endpoint
 */
async function setupProtectMock(page: any) {
  await page.route('**/api/v1/protect', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        hash: 'mock-hash-' + Math.random().toString(36).substring(7),
        transactionId: 'mock-tx-' + Math.random().toString(36).substring(7)
      })
    });
  });
}

/**
 * Helper: Create test CSV file
 */
function createTestCSV(items: number): string {
  const timestamp = Date.now();
  const tmpDir = '/tmp';
  const filePath = path.join(tmpDir, `test-bulk-${timestamp}.csv`);

  const lines = ['title,author,content,license'];
  for (let i = 0; i < items; i++) {
    lines.push(`Test Title ${i + 1},Test Author,Test content for item ${i + 1},liberation_v1`);
  }

  fs.writeFileSync(filePath, lines.join('\n'));
  return filePath;
}

/**
 * Helper: Create test JSON file
 */
function createTestJSON(items: number): string {
  const timestamp = Date.now();
  const tmpDir = '/tmp';
  const filePath = path.join(tmpDir, `test-bulk-${timestamp}.json`);

  const data = [];
  for (let i = 0; i < items; i++) {
    data.push({
      title: `Test Title ${i + 1}`,
      author: 'Test Author',
      content: `Test content for item ${i + 1}`,
      license: 'liberation_v1'
    });
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

test.describe('Bulk Registration - Navigation', () => {
  test('should navigate to bulk registration tab', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');

    // Click bulk registration tab
    await page.click('button:has-text("Bulk Register")');

    // Should show bulk registration form
    await expect(page.locator('text=How to Use Bulk Registration')).toBeVisible();
  });

  test('should show instructions', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');
    await page.click('button:has-text("Bulk Register")');

    // Should show instructions
    await expect(page.locator('text=Prepare a CSV or JSON file')).toBeVisible();
    await expect(page.locator('text=max 100 items')).toBeVisible();
  });
});

test.describe('Bulk Registration - CSV Upload', () => {
  test('should upload CSV file successfully', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');
    await page.click('button:has-text("Bulk Register")');

    // Create test CSV
    const csvPath = createTestCSV(3);

    // Upload file
    const fileInput = page.locator('input[type="file"][accept=".csv"]');
    await fileInput.setInputFiles(csvPath);

    // Should show items
    await expect(page.locator('text=3 items loaded')).toBeVisible({ timeout: 5000 });

    // Cleanup
    fs.unlinkSync(csvPath);
  });

  test('should display uploaded CSV items in table', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');
    await page.click('button:has-text("Bulk Register")');

    // Create test CSV
    const csvPath = createTestCSV(5);

    // Upload file
    const fileInput = page.locator('input[type="file"][accept=".csv"]');
    await fileInput.setInputFiles(csvPath);

    // Should show table with items
    await expect(page.locator('table')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Test Title 1')).toBeVisible();
    await expect(page.locator('text=Test Author')).toBeVisible();

    // Should show all 5 items
    const rows = await page.locator('tbody tr').count();
    expect(rows).toBe(5);

    // Cleanup
    fs.unlinkSync(csvPath);
  });

  test('should show Start Registration button after upload', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');
    await page.click('button:has-text("Bulk Register")');

    // Create test CSV
    const csvPath = createTestCSV(2);

    // Upload file
    const fileInput = page.locator('input[type="file"][accept=".csv"]');
    await fileInput.setInputFiles(csvPath);

    // Should show start button
    await expect(page.locator('button:has-text("Start Registration")')).toBeVisible();

    // Cleanup
    fs.unlinkSync(csvPath);
  });

  test('should allow clearing uploaded items', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');
    await page.click('button:has-text("Bulk Register")');

    // Create and upload CSV
    const csvPath = createTestCSV(2);
    const fileInput = page.locator('input[type="file"][accept=".csv"]');
    await fileInput.setInputFiles(csvPath);

    await page.waitForTimeout(1000);

    // Click clear
    await page.click('button:has-text("Clear")');

    // Should go back to upload form
    await expect(page.locator('text=Upload CSV File')).toBeVisible();
    await expect(page.locator('table')).not.toBeVisible();

    // Cleanup
    fs.unlinkSync(csvPath);
  });
});

test.describe('Bulk Registration - JSON Upload', () => {
  test('should upload JSON file successfully', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');
    await page.click('button:has-text("Bulk Register")');

    // Create test JSON
    const jsonPath = createTestJSON(4);

    // Upload file
    const fileInput = page.locator('input[type="file"][accept=".json"]');
    await fileInput.setInputFiles(jsonPath);

    // Should show items
    await expect(page.locator('text=4 items loaded')).toBeVisible({ timeout: 5000 });

    // Cleanup
    fs.unlinkSync(jsonPath);
  });

  test('should display uploaded JSON items', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');
    await page.click('button:has-text("Bulk Register")');

    // Create test JSON
    const jsonPath = createTestJSON(3);

    // Upload file
    const fileInput = page.locator('input[type="file"][accept=".json"]');
    await fileInput.setInputFiles(jsonPath);

    // Should show table
    await expect(page.locator('table')).toBeVisible({ timeout: 5000 });
    const rows = await page.locator('tbody tr').count();
    expect(rows).toBe(3);

    // Cleanup
    fs.unlinkSync(jsonPath);
  });

  test('should handle invalid JSON gracefully', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');
    await page.click('button:has-text("Bulk Register")');

    // Create invalid JSON file
    const timestamp = Date.now();
    const filePath = path.join('/tmp', `invalid-${timestamp}.json`);
    fs.writeFileSync(filePath, 'this is not valid JSON{[}');

    // Setup dialog listener for alert
    page.on('dialog', dialog => {
      expect(dialog.message()).toContain('Invalid JSON');
      dialog.accept();
    });

    // Upload file
    const fileInput = page.locator('input[type="file"][accept=".json"]');
    await fileInput.setInputFiles(filePath);

    // Wait for dialog
    await page.waitForTimeout(1000);

    // Cleanup
    fs.unlinkSync(filePath);
  });
});

test.describe('Bulk Registration - Processing', () => {
  test('should process items sequentially', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');
    await page.click('button:has-text("Bulk Register")');

    // Upload small batch
    const csvPath = createTestCSV(3);
    const fileInput = page.locator('input[type="file"][accept=".csv"]');
    await fileInput.setInputFiles(csvPath);

    await page.waitForTimeout(1000);

    // Start registration
    await page.click('button:has-text("Start Registration")');

    // Should show progress
    await expect(page.locator('text=Processing:')).toBeVisible({ timeout: 2000 });

    // Wait for completion
    await expect(page.locator('text=/\\d+ successful/')).toBeVisible({ timeout: 15000 });

    // Cleanup
    fs.unlinkSync(csvPath);
  });

  test('should show progress bar during processing', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');
    await page.click('button:has-text("Bulk Register")');

    // Upload batch
    const csvPath = createTestCSV(5);
    const fileInput = page.locator('input[type="file"][accept=".csv"]');
    await fileInput.setInputFiles(csvPath);

    await page.waitForTimeout(1000);

    // Start registration
    await page.click('button:has-text("Start Registration")');

    // Should show progress bar
    await expect(page.locator('[class*="bg-blue-600"]')).toBeVisible({ timeout: 2000 });

    // Cleanup
    fs.unlinkSync(csvPath);
  });

  test('should update status for each item', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');
    await page.click('button:has-text("Bulk Register")');

    // Upload batch
    const csvPath = createTestCSV(2);
    const fileInput = page.locator('input[type="file"][accept=".csv"]');
    await fileInput.setInputFiles(csvPath);

    await page.waitForTimeout(1000);

    // All should start as "Pending"
    const pendingCount = await page.locator('text=Pending').count();
    expect(pendingCount).toBe(2);

    // Start registration
    await page.click('button:has-text("Start Registration")');

    // Should change to Processing, then Success
    await expect(page.locator('text=Processing')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('text=✓ Success')).toBeVisible({ timeout: 10000 });

    // Cleanup
    fs.unlinkSync(csvPath);
  });

  test('should show summary after completion', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');
    await page.click('button:has-text("Bulk Register")');

    // Upload batch
    const csvPath = createTestCSV(3);
    const fileInput = page.locator('input[type="file"][accept=".csv"]');
    await fileInput.setInputFiles(csvPath);

    await page.waitForTimeout(1000);

    // Start registration
    await page.click('button:has-text("Start Registration")');

    // Wait for completion
    await expect(page.locator('text=/\\d+ successful/'), { timeout: 15000 }).toBeVisible();

    // Should show download button
    await expect(page.locator('button:has-text("Download Results")')).toBeVisible();

    // Cleanup
    fs.unlinkSync(csvPath);
  });

  test('should disable buttons during processing', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');
    await page.click('button:has-text("Bulk Register")');

    // Upload batch
    const csvPath = createTestCSV(5);
    const fileInput = page.locator('input[type="file"][accept=".csv"]');
    await fileInput.setInputFiles(csvPath);

    await page.waitForTimeout(1000);

    // Start registration
    await page.click('button:has-text("Start Registration")');

    // Buttons should not be clickable during processing
    await page.waitForTimeout(500);

    // Clear and Start buttons should not be visible
    await expect(page.locator('button:has-text("Clear")')).not.toBeVisible();
    await expect(page.locator('button:has-text("Start Registration")')).not.toBeVisible();

    // Cleanup
    fs.unlinkSync(csvPath);
  });
});

test.describe('Bulk Registration - Results', () => {
  test('should allow downloading results', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');
    await page.click('button:has-text("Bulk Register")');

    // Upload batch
    const csvPath = createTestCSV(2);
    const fileInput = page.locator('input[type="file"][accept=".csv"]');
    await fileInput.setInputFiles(csvPath);

    await page.waitForTimeout(1000);

    // Start registration
    await page.click('button:has-text("Start Registration")');

    // Wait for completion
    await expect(page.locator('text=/\\d+ successful/')).toBeVisible({ timeout: 15000 });

    // Setup download listener
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Download Results")');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/bulk-registration-results-.*\.csv/);

    // Cleanup
    fs.unlinkSync(csvPath);
  });

  test('should show success count', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');
    await page.click('button:has-text("Bulk Register")');

    // Upload batch
    const csvPath = createTestCSV(3);
    const fileInput = page.locator('input[type="file"][accept=".csv"]');
    await fileInput.setInputFiles(csvPath);

    await page.waitForTimeout(1000);

    // Start registration
    await page.click('button:has-text("Start Registration")');

    // Wait for completion
    await expect(page.locator('text=✓ 3 successful')).toBeVisible({ timeout: 15000 });

    // Cleanup
    fs.unlinkSync(csvPath);
  });
});

test.describe('Bulk Registration - Limits', () => {
  test('should enforce maximum 100 items limit', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');
    await page.click('button:has-text("Bulk Register")');

    // Create CSV with 101 items
    const csvPath = createTestCSV(101);
    const fileInput = page.locator('input[type="file"][accept=".csv"]');
    await fileInput.setInputFiles(csvPath);

    await page.waitForTimeout(1000);

    // Setup alert listener
    page.on('dialog', dialog => {
      expect(dialog.message()).toContain('between 1 and 100');
      dialog.accept();
    });

    // Try to start (should show alert)
    await page.click('button:has-text("Start Registration")');

    // Cleanup
    fs.unlinkSync(csvPath);
  });

  test('should require at least 1 item', async ({ page }) => {
    await setupMockedAuth(page);
    await setupProtectMock(page);

    await page.goto('http://localhost:4000/assets');
    await page.click('button:has-text("Bulk Register")');

    // Create empty CSV (just headers)
    const csvPath = createTestCSV(0);
    const fileInput = page.locator('input[type="file"][accept=".csv"]');
    await fileInput.setInputFiles(csvPath);

    await page.waitForTimeout(1000);

    // Should not show items table (no items loaded)
    await expect(page.locator('table')).not.toBeVisible();

    // Cleanup
    fs.unlinkSync(csvPath);
  });
});
