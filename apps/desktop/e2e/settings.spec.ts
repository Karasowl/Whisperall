import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.sidebar-link', { hasText: 'Settings' }).click();
    await expect(page.locator('h2')).toHaveText('Settings');
  });

  test('shows auth form when not signed in', async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('.btn-primary', { hasText: 'Sign In' })).toBeVisible();
    await expect(page.locator('.btn-ghost', { hasText: 'Sign Up' })).toBeVisible();
  });

  test('has language settings section', async ({ page }) => {
    await expect(page.locator('h3', { hasText: 'Language' })).toBeVisible();
    const langSelect = page.locator('section', { hasText: 'Language' }).locator('select');
    await expect(langSelect).toHaveValue('en');
  });

  test('has dictation settings with hotkey mode', async ({ page }) => {
    await expect(page.locator('h3', { hasText: 'Dictation' })).toBeVisible();
    const hotkeySelect = page.locator('section', { hasText: 'Dictation' }).locator('select');
    await expect(hotkeySelect).toHaveValue('toggle');
  });

  test('has overlay widget checkbox', async ({ page }) => {
    const overlayRow = page.locator('.settings-row', { hasText: 'Show overlay widget' });
    const checkbox = overlayRow.locator('input[type="checkbox"]');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeChecked();
  });

  test('has system settings section', async ({ page }) => {
    await expect(page.locator('h3', { hasText: 'System' })).toBeVisible();
    const trayRow = page.locator('.settings-row', { hasText: 'Minimize to tray' });
    await expect(trayRow.locator('input[type="checkbox"]')).toBeChecked();
  });

  test('shows Google sign-in button', async ({ page }) => {
    await expect(page.locator('.btn-google')).toBeVisible();
    await expect(page.locator('.btn-google')).toHaveText(/Continue with Google/);
  });

  test('shows auth divider between email and Google', async ({ page }) => {
    await expect(page.locator('.auth-divider')).toBeVisible();
  });

  test('can toggle minimize to tray', async ({ page }) => {
    const checkbox = page.locator('.settings-row', { hasText: 'Minimize to tray' }).locator('input[type="checkbox"]');
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
  });
});
