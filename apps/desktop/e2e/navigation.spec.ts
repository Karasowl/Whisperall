import { test, expect } from '@playwright/test';

test.describe('App Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads with sidebar and dictate page active', async ({ page }) => {
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByTestId('nav-dictate')).toBeVisible();
    await expect(page.getByTestId('dictate-page')).toBeVisible();
  });

  test('sidebar has 5 navigation items + settings', async ({ page }) => {
    await expect(page.getByTestId('nav-dictate')).toHaveText(/Dictate/);
    await expect(page.getByTestId('nav-transcribe')).toHaveText(/Transcribe/);
    await expect(page.getByTestId('nav-reader')).toHaveText(/Reader/);
    await expect(page.getByTestId('nav-editor')).toHaveText(/Editor/);
    await expect(page.getByTestId('nav-history')).toHaveText(/History/);
    await expect(page.getByTestId('nav-settings')).toHaveText(/Settings/);
  });

  test('clicking nav items switches pages', async ({ page }) => {
    await page.getByTestId('nav-transcribe').click();
    await expect(page.getByTestId('transcribe-page')).toBeVisible();

    await page.getByTestId('nav-reader').click();
    await expect(page.getByTestId('reader-page')).toBeVisible();

    await page.getByTestId('nav-editor').click();
    await expect(page.getByTestId('editor-page')).toBeVisible();

    await page.getByTestId('nav-history').click();
    await expect(page.getByTestId('history-page')).toBeVisible();

    await page.getByTestId('nav-dictate').click();
    await expect(page.getByTestId('dictate-page')).toBeVisible();
  });

  test('settings button opens modal', async ({ page }) => {
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('settings-modal')).toBeVisible();
  });
});
