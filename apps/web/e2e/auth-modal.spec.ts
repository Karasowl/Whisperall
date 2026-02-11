import { test, expect } from '@playwright/test';

test('clicking Sign In opens modal', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-signin').click();
  await expect(page.getByTestId('signin-modal')).toBeVisible();
});

test('clicking close button closes modal', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-signin').click();
  await expect(page.getByTestId('signin-modal')).toBeVisible();
  await page.getByTestId('signin-close').click();
  await expect(page.getByTestId('signin-modal')).not.toBeVisible();
});

test('?signin=1 auto-opens sign-in modal', async ({ page }) => {
  await page.goto('/?signin=1');
  await expect(page.getByTestId('signin-modal')).toBeVisible();
});

test('modal has email, password, Google, and submit', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-signin').click();
  await expect(page.getByTestId('signin-email')).toBeVisible();
  await expect(page.getByTestId('signin-password')).toBeVisible();
  await expect(page.getByTestId('signin-google')).toBeVisible();
  await expect(page.getByTestId('signin-submit')).toBeVisible();
});

test('toggle between login and register modes', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-signin').click();
  await expect(page.locator('text=Welcome back')).toBeVisible();
  await page.locator('text=Sign up').click();
  await expect(page.locator('text=Get started')).toBeVisible();
  await page.locator('text=Sign in').click();
  await expect(page.locator('text=Welcome back')).toBeVisible();
});
