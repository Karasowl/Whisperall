/**
 * Claude-driven smoke test — Electron portable launch + screenshots per page.
 *
 * Not a test suite. This is an investigation script Claude runs in the chat
 * to verify the built app boots and the critical surfaces render.
 *
 * Usage: node e2e-ai/claude-smoke.mjs
 * Output: e2e-ai/out/<timestamp>/*.png + report.json
 */
import { _electron as electron } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const APP_EXE = path.join(ROOT, 'release', 'win-unpacked', 'Whisperall.exe');
const ISO = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = path.join(__dirname, 'out', ISO);
fs.mkdirSync(OUT, { recursive: true });

// Isolated user-data dir so we don't touch the real profile.
const USER_DATA = path.join(os.tmpdir(), `whisperall-e2e-${Date.now()}`);

const log = [];
const record = (name, details = {}) => {
  const entry = { t: Date.now(), name, ...details };
  log.push(entry);
  console.log(`[${entry.t}] ${name}`, Object.keys(details).length ? details : '');
};

async function shot(page, label) {
  const file = path.join(OUT, `${String(log.length).padStart(2, '0')}-${label}.png`);
  try {
    await page.screenshot({ path: file, fullPage: false });
    record('screenshot', { label, file: path.relative(ROOT, file) });
  } catch (e) {
    record('screenshot-failed', { label, error: e.message });
  }
}

async function exists(page, testId) {
  try { return (await page.$(`[data-testid="${testId}"]`)) !== null; } catch { return false; }
}

async function text(page, sel) {
  try { const h = await page.$(sel); return h ? (await h.textContent())?.trim() ?? '' : ''; } catch { return ''; }
}

async function run() {
  record('launch-start', { exe: APP_EXE, userData: USER_DATA });
  if (!fs.existsSync(APP_EXE)) {
    record('launch-failed', { reason: 'exe-missing' });
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ log }, null, 2));
    process.exit(1);
  }

  const consoleMsgs = [];
  const app = await electron.launch({
    executablePath: APP_EXE,
    args: [`--user-data-dir=${USER_DATA}`],
    timeout: 30_000,
  });
  record('launch-ok');

  app.on('console', (msg) => consoleMsgs.push({ type: msg.type(), text: msg.text() }));

  const page = await app.firstWindow({ timeout: 20_000 });
  page.on('console', (msg) => consoleMsgs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => consoleMsgs.push({ type: 'pageerror', text: err.message }));

  await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
  record('first-window-ready');

  // Wait for React to hydrate something meaningful.
  await page.waitForTimeout(2500);
  await shot(page, 'initial');

  // Dump a compact outline of what's visible: testids + key labels.
  const testids = await page.$$eval('[data-testid]', (els) =>
    els.slice(0, 80).map((el) => ({
      id: el.getAttribute('data-testid'),
      visible: !!(el.getBoundingClientRect().width && el.getBoundingClientRect().height),
      text: (el.textContent ?? '').slice(0, 60).replace(/\s+/g, ' ').trim(),
    })),
  );
  record('testids-visible', { count: testids.length, items: testids });

  // Detect auth gate.
  const isAuthPage = await exists(page, 'auth-form') || await exists(page, 'auth-email');
  record('auth-gate', { onAuthPage: isAuthPage });

  if (isAuthPage) {
    record('skip-app-navigation', { reason: 'auth-required — using isolated profile, not signed in' });
  } else {
    // Navigate through every sidebar page and screenshot.
    const navs = ['nav-dictate', 'nav-processes', 'nav-history', 'nav-logs'];
    for (const nav of navs) {
      if (await exists(page, nav)) {
        try {
          await page.click(`[data-testid="${nav}"]`, { timeout: 3_000 });
          await page.waitForTimeout(800);
          await shot(page, nav);
          record('nav-ok', { nav });
        } catch (e) {
          record('nav-failed', { nav, error: e.message });
        }
      } else {
        record('nav-missing', { nav });
      }
    }

    // Version badge → opens changelog modal
    if (await exists(page, 'version-badge')) {
      try {
        await page.click('[data-testid="version-badge"]', { timeout: 3_000 });
        await page.waitForTimeout(700);
        await shot(page, 'changelog-modal');
        const changelogOpen = await exists(page, 'changelog-modal');
        record('changelog', { opened: changelogOpen });
        if (changelogOpen) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(400);
        }
      } catch (e) { record('changelog-failed', { error: e.message }); }
    } else {
      record('version-badge-missing');
    }

    // Settings modal
    if (await exists(page, 'nav-settings')) {
      try {
        await page.click('[data-testid="nav-settings"]');
        await page.waitForTimeout(600);
        await shot(page, 'settings-modal');
        const modal = await exists(page, 'settings-modal');
        record('settings', { opened: modal });
        if (modal) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(400);
        }
      } catch (e) { record('settings-failed', { error: e.message }); }
    }

    // Widget dock empty slot
    const dockEmpty = await exists(page, 'widget-dock-empty');
    const dockFilled = await exists(page, 'widget-dock-filled');
    record('widget-dock', { empty: dockEmpty, filled: dockFilled });

    // Theme toggle
    if (await exists(page, 'theme-toggle')) {
      try {
        await page.click('[data-testid="theme-toggle"]');
        await page.waitForTimeout(400);
        await shot(page, 'theme-toggled');
        const htmlClass = await page.evaluate(() => document.documentElement.className);
        record('theme-after-toggle', { htmlClass });
      } catch (e) { record('theme-toggle-failed', { error: e.message }); }
    }
  }

  record('console-summary', {
    total: consoleMsgs.length,
    errors: consoleMsgs.filter((m) => m.type === 'error' || m.type === 'pageerror').length,
    sample: consoleMsgs.slice(0, 30),
  });

  await app.close();
  record('closed');

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ log, consoleMsgs }, null, 2));
  console.log(`\n✓ Report written to ${OUT}`);
}

run().catch((e) => {
  record('fatal', { error: e.message, stack: e.stack?.slice(0, 500) });
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ log }, null, 2));
  console.error(e);
  process.exit(1);
});
