import { test, expect } from '@playwright/test';

test.describe('Settings Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('settings-modal')).toBeVisible();
  });

  test('shows auth form when not signed in', async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();
  });

  test('shows Google sign-in button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible();
  });

  test('has language settings section', async ({ page }) => {
    const modal = page.getByTestId('settings-modal');
    await expect(modal.locator('h3', { hasText: 'Language' })).toBeVisible();
    const langSelect = modal.locator('section', { hasText: 'Language' }).locator('select');
    await expect(langSelect).toHaveValue('en');
  });

  test('has dictation settings with hotkey mode', async ({ page }) => {
    const modal = page.getByTestId('settings-modal');
    await expect(modal.locator('h3', { hasText: 'Dictation' })).toBeVisible();
    const hotkeySelect = modal.locator('section', { hasText: 'Dictation' }).locator('select');
    await expect(hotkeySelect).toHaveValue('toggle');
  });

  test('has overlay widget toggle', async ({ page }) => {
    await expect(page.getByText('Overlay widget')).toBeVisible();
  });

  test('has minimize to tray toggle', async ({ page }) => {
    await expect(page.getByText('Minimize to tray')).toBeVisible();
  });

  test('closes when clicking backdrop', async ({ page }) => {
    await page.getByTestId('settings-modal').click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId('settings-modal')).not.toBeVisible();
  });
});
