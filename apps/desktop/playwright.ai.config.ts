import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// ESM-safe __dirname replacement.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load GLM/Minimax creds for Midscene from apps/desktop/.env.local (gitignored).
dotenv.config({ path: path.join(__dirname, '.env.local') });

/**
 * AI-driven E2E test suite (Midscene + GLM / Minimax vision).
 *
 * Separate from `playwright.config.ts` because:
 *  - These tests launch the packaged Electron binary at
 *    `release/win-unpacked/Whisperall.exe`, not the Vite dev server.
 *  - They require `OPENAI_API_KEY` / `MIDSCENE_MODEL_NAME` loaded from .env.local.
 *  - They produce the Midscene HTML report in `midscene_run/report/` — run and
 *    share the generated `.html` to get AI reasoning + screenshots + errors.
 *
 * Run with: `pnpm test:ai`
 */
export default defineConfig({
  testDir: './e2e-ai',
  timeout: 120_000, // AI calls are slow; give each test 2 minutes.
  retries: 0,
  workers: 1, // Electron is a single process; don't parallelize.
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-ai', open: 'never' }],
    // Midscene's own reporter produces midscene_run/report/<timestamp>.html.
    ['@midscene/web/playwright-reporter', { type: 'merged' }],
  ],
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
});
