import { test, expect } from '@playwright/test';

test.describe('App Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads with sidebar and dictate page active', async ({ page }) => {
    await expect(page.locator('.sidebar-brand')).toHaveText('Whisperall');
    await expect(page.locator('.sidebar-link.active')).toHaveText(/Dictate/);
    await expect(page.locator('h2')).toHaveText('Dictate');
  });

  test('sidebar has all 5 navigation items', async ({ page }) => {
    const links = page.locator('.sidebar-link');
    await expect(links).toHaveCount(5);
    await expect(links.nth(0)).toHaveText(/Dictate/);
    await expect(links.nth(1)).toHaveText(/Transcribe/);
    await expect(links.nth(2)).toHaveText(/Editor/);
    await expect(links.nth(3)).toHaveText(/History/);
    await expect(links.nth(4)).toHaveText(/Settings/);
  });

  test('clicking nav items switches pages', async ({ page }) => {
    await page.locator('.sidebar-link', { hasText: 'Transcribe' }).click();
    await expect(page.locator('h2')).toHaveText('Transcribe');
    await expect(page.locator('.sidebar-link.active')).toHaveText(/Transcribe/);

    await page.locator('.sidebar-link', { hasText: 'Settings' }).click();
    await expect(page.locator('h2')).toHaveText('Settings');
    await expect(page.locator('.sidebar-link.active')).toHaveText(/Settings/);

    await page.locator('.sidebar-link', { hasText: 'Dictate' }).click();
    await expect(page.locator('h2')).toHaveText('Dictate');
  });
});
