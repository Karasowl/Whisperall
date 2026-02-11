import { test, expect } from '@playwright/test';

test.describe('History Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-history').click();
  });

  test('shows sign-in prompt when not authenticated', async ({ page }) => {
    await expect(page.getByTestId('history-page')).toBeVisible();
    await expect(page.getByTestId('history-page')).toContainText('Sign in to view');
  });

  test('has login icon in empty state', async ({ page }) => {
    await expect(page.locator('.material-symbols-outlined', { hasText: 'login' })).toBeVisible();
  });
});
