import { test, expect } from '@playwright/test';

test.describe('Dictate Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows record button and language selector', async ({ page }) => {
    await expect(page.locator('.btn-record')).toBeVisible();
    await expect(page.locator('.btn-record')).toHaveText(/Record/);
    await expect(page.locator('select')).toHaveValue('en');
  });

  test('language selector has expected options', async ({ page }) => {
    const options = page.locator('select option');
    await expect(options).toHaveCount(7);
    await expect(options.first()).toHaveText('English');
  });

  test('clear button is visible', async ({ page }) => {
    await expect(page.locator('.btn-ghost', { hasText: 'Clear' })).toBeVisible();
  });

  test('output textarea has placeholder', async ({ page }) => {
    const textarea = page.locator('.text-output');
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveAttribute('placeholder', 'Dictated text will appear here...');
  });

  test('paste and copy buttons are disabled when no text', async ({ page }) => {
    await expect(page.locator('.btn-primary', { hasText: 'Paste' })).toBeDisabled();
    await expect(page.locator('.btn-ghost', { hasText: 'Copy' })).toBeDisabled();
  });
});
