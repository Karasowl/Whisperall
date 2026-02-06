import { test, expect } from '@playwright/test';

test.describe('Overlay Widget', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/overlay.html');
  });

  test('loads in pill mode', async ({ page }) => {
    await expect(page.locator('.widget-pill')).toBeVisible();
    await expect(page.locator('.pill-surface')).toBeVisible();
  });

  test('click expands to full widget', async ({ page }) => {
    await page.locator('.widget-pill').click();
    await expect(page.locator('.widget-expanded')).toBeVisible();
    await expect(page.locator('.widget-title')).toHaveText('Whisperall');
  });

  test('expanded widget shows record button', async ({ page }) => {
    await page.locator('.widget-pill').click();
    await expect(page.locator('.widget-btn-record')).toBeVisible();
    await expect(page.locator('.widget-btn-record')).toHaveText(/Dictate/);
  });

  test('expanded widget has dismiss button', async ({ page }) => {
    await page.locator('.widget-pill').click();
    await expect(page.locator('.widget-btn-icon')).toBeVisible();
  });
});
