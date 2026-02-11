import { test, expect } from '@playwright/test';

test('dashboard shows auth fallback for unauthenticated user', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByTestId('auth-fallback')).toBeVisible();
  await expect(page.locator('text=Sign in required')).toBeVisible();
});

test('auth fallback has sign-in link to /?signin=1', async ({ page }) => {
  await page.goto('/dashboard');
  const link = page.getByTestId('auth-fallback').locator('a[href="/?signin=1"]');
  await expect(link).toBeVisible();
});

test('footer privacy link goes to /privacy', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('footer a[href="/privacy"]');
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/privacy/);
});

test('footer terms link goes to /terms', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('footer a[href="/terms"]');
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/terms/);
});
