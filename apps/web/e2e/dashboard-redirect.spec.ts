import { test, expect } from '@playwright/test';

test('GET /dashboard shows sign in required (no session)', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByTestId('auth-fallback')).toBeVisible();
  await expect(page.locator('text=Sign in required')).toBeVisible();
});
