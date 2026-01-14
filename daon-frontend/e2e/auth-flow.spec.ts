import { test, expect } from '@playwright/test';

test.describe('DAON Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the login page', async ({ page }) => {
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('heading', { name: /Welcome to DAON/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Send Magic Link/i })).toBeVisible();
  });

  test.skip('should show email validation error for invalid email', async ({ page }) => {
    await page.goto('/auth/login');
    await page.locator('input[type="email"]').fill('invalid-email');
    await page.getByRole('button', { name: /Send Magic Link/i }).click();
    await expect(page.getByText(/Invalid email address/i)).toBeVisible();
  });

  test.skip('should show email required error when empty', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: /Send Magic Link/i }).click();
    await expect(page.getByText(/Email is required/i)).toBeVisible();
  });

  test('should display magic link form with correct styling', async ({ page }) => {
    await page.goto('/auth/login');
    const card = page.locator('.bg-white.rounded-2xl.shadow-lg');
    await expect(card).toBeVisible();
  });

  test('should enable submit button', async ({ page }) => {
    await page.goto('/auth/login');
    const submitButton = page.getByRole('button', { name: /Send Magic Link/i });
    await expect(submitButton).toBeEnabled();
  });

  test('should have privacy footer', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByText(/Passwordless authentication/i)).toBeVisible();
    await expect(page.getByText(/Privacy-first/i)).toBeVisible();
  });
});

test.describe('DAON Navigation', () => {
  test('should redirect unauthenticated users from dashboard to login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/auth\/login/, { timeout: 5000 });
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should have proper page titles', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page).toHaveTitle(/DAON/);
  });
});

test.describe('DAON UI Components', () => {
  test('magic link form should have proper input attributes', async ({ page }) => {
    await page.goto('/auth/login');
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toHaveAttribute('type', 'email');
    await expect(emailInput).toHaveAttribute('autocomplete', 'email');
  });

  test('should handle network errors gracefully', async ({ page, context }) => {
    await context.route('**/api/v1/auth/**', route => route.abort());
    await page.goto('/auth/login');
    
    await page.locator('input[type="email"]').fill('test@example.com');
    await page.getByRole('button', { name: /Send Magic Link/i }).click();
    
    await expect(page.getByText(/Network request failed|Failed/i)).toBeVisible({ timeout: 5000 });
  });

  test('should have responsive design', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/auth/login');
    
    const card = page.locator('.bg-white.rounded-2xl');
    await expect(card).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});

test.describe('DAON Accessibility', () => {
  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/auth/login');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
  });

  test('should have labels for inputs', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByText(/Email address/i)).toBeVisible();
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/auth/login');
    
    const emailInput = page.locator('input[type="email"]');
    const submitButton = page.getByRole('button', { name: /Send Magic Link/i });
    
    await page.keyboard.press('Tab');
    await expect(emailInput).toBeFocused();
    
    await page.keyboard.type('test@example.com');
    
    await page.keyboard.press('Tab');
    await expect(submitButton).toBeFocused();
  });
});
