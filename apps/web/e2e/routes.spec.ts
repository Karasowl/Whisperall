import { test, expect } from '@playwright/test';

test('GET / returns 200 and contains hero text', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/WhisperAll/);
  await expect(page.locator('text=Your voice')).toBeVisible();
});

test('GET /pricing returns 200 and contains pricing text', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.locator('text=transparent pricing')).toBeVisible();
});

test('GET /download returns 200 and contains download text', async ({ page }) => {
  await page.goto('/download');
  await expect(page.locator('text=Download WhisperAll')).toBeVisible();
});

test('GET /privacy returns 200 and contains privacy text', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.locator('h1:has-text("Privacy")')).toBeVisible();
});

test('GET /terms returns 200 and contains terms text', async ({ page }) => {
  await page.goto('/terms');
  await expect(page.locator('h1:has-text("Terms")')).toBeVisible();
});
