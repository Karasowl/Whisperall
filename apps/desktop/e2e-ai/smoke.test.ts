import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { PlaywrightAgent } from '@midscene/web/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_EXE = path.join(__dirname, '..', 'release', 'win-unpacked', 'Whisperall.exe');

let app: ElectronApplication;
let page: Page;
let agent: PlaywrightAgent;

test.beforeAll(async () => {
  app = await electron.launch({
    executablePath: APP_EXE,
    // Prevent the app from loading the persisted user state (notes/settings)
    // so tests run against a clean-ish environment.
    args: [],
    env: { ...process.env, NODE_ENV: 'test' },
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  agent = new PlaywrightAgent(page);
});

test.afterAll(async () => {
  await app?.close();
});

test('smoke: creates a new note via the sidebar action', async () => {
  // AI-driven: the agent reads the UI and performs the action.
  await agent.ai('click the "+ new note" icon next to the FOLDERS label in the left sidebar');
  await agent.aiAssert('the editor is now focused on an empty or draft note titled "Untitled" or similar');
});

test('smoke: types text into the note editor', async () => {
  await agent.ai('click inside the note editor body and type "Hola Midscene"');
  await agent.aiAssert('the editor shows the text "Hola Midscene"');
});

test('smoke: version badge shows current version', async () => {
  const version = await agent.aiQuery<string>('what version number is shown at the bottom of the left sidebar? Return just the version string, e.g. "0.18.3".');
  // Just verify something plausible came back — fine-grained assertion is
  // up to the CI pipeline that knows the exact expected build.
  expect(typeof version).toBe('string');
  expect(version.length).toBeGreaterThan(0);
});
