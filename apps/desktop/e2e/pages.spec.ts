import { test, expect } from '@playwright/test';

test.describe('Transcribe Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.sidebar-link', { hasText: 'Transcribe' }).click();
  });

  test('shows dropzone for file upload', async ({ page }) => {
    await expect(page.locator('.dropzone')).toBeVisible();
    await expect(page.locator('.dropzone')).toHaveText(/Drop audio\/video file/);
  });

  test('has hidden file input accepting audio/video', async ({ page }) => {
    const input = page.locator('input[type="file"]');
    await expect(input).toHaveAttribute('accept', 'audio/*,video/*');
  });
});

test.describe('Editor Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.sidebar-link', { hasText: 'Editor' }).click();
  });

  test('shows empty state when no transcript loaded', async ({ page }) => {
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-state')).toHaveText(/No transcript loaded/);
  });
});

test.describe('History Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.sidebar-link', { hasText: 'History' }).click();
  });

  test('shows sign-in prompt when not authenticated', async ({ page }) => {
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-state')).toHaveText(/Sign in to view/);
  });
});
