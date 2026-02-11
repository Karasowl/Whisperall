import { test, expect } from '@playwright/test';

test('robots.txt disallows /dashboard and has sitemap', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain('Disallow: /dashboard');
  expect(body).toContain('sitemap.xml');
});

test('sitemap.xml contains all public URLs', async ({ request }) => {
  const res = await request.get('/sitemap.xml');
  expect(res.status()).toBe(200);
  const body = await res.text();
  for (const path of ['whisperall.com', '/pricing', '/download', '/privacy', '/terms']) {
    expect(body).toContain(path);
  }
});

test('landing page has SoftwareApplication JSON-LD', async ({ page }) => {
  await page.goto('/');
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(ld).toContain('SoftwareApplication');
  expect(ld).toContain('WhisperAll');
});

test('pricing page has FAQPage JSON-LD', async ({ page }) => {
  await page.goto('/pricing');
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(ld).toContain('FAQPage');
});
