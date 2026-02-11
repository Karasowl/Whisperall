import { test, expect } from '@playwright/test';

test.describe('Dictate Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows new note and voice note buttons in list mode', async ({ page }) => {
    await expect(page.getByTestId('new-note-btn')).toBeVisible();
    await expect(page.getByTestId('voice-note-btn')).toBeVisible();
  });

  test('shows language selector with default EN-US', async ({ page }) => {
    const select = page.getByTestId('language-select');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('en');
  });

  test('language selector has 7 options', async ({ page }) => {
    const options = page.getByTestId('language-select').locator('option');
    await expect(options).toHaveCount(7);
  });

  test('new note opens editor with voice toolbar', async ({ page }) => {
    await page.getByTestId('new-note-btn').click();
    await expect(page.getByTestId('voice-toolbar')).toBeVisible();
    await expect(page.getByTestId('record-btn')).toBeVisible();
  });

  test('editor has copy and save buttons', async ({ page }) => {
    await page.getByTestId('new-note-btn').click();
    await expect(page.getByTestId('copy-btn')).toBeVisible();
    await expect(page.getByTestId('save-btn')).toBeVisible();
  });
});
