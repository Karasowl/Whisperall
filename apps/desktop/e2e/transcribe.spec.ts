import { test, expect } from '@playwright/test';

test.describe('Transcribe Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-transcribe').click();
  });

  test('shows upload zone', async ({ page }) => {
    await expect(page.getByTestId('upload-zone')).toBeVisible();
    await expect(page.getByTestId('upload-zone')).toContainText('Upload Audio or Video');
  });

  test('has hidden file input accepting audio/video', async ({ page }) => {
    const input = page.locator('input[type="file"]');
    await expect(input).toHaveAttribute('accept', 'audio/*,video/*');
  });

  test('shows settings sidebar with toggles', async ({ page }) => {
    await expect(page.getByTestId('transcribe-settings')).toBeVisible();
    await expect(page.getByTestId('transcribe-settings')).toContainText('Speaker Diarization');
    await expect(page.getByTestId('transcribe-settings')).toContainText('AI Summary');
    await expect(page.getByTestId('transcribe-settings')).toContainText('Smart Punctuation');
  });

  test('shows language select with auto-detect default', async ({ page }) => {
    const langSelect = page.getByTestId('transcribe-language');
    await expect(langSelect).toBeVisible();
    await expect(langSelect).toHaveValue('auto');
  });

  test('has start transcription button', async ({ page }) => {
    await expect(page.getByTestId('start-transcription-btn')).toBeVisible();
    await expect(page.getByTestId('start-transcription-btn')).toContainText('Start Transcription');
  });
});
