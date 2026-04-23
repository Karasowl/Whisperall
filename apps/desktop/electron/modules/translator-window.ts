import { app, BrowserWindow, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import { pushDiag } from './diag.js';

const isDev = !app.isPackaged;
const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 180;
const MIN_WIDTH = 240;
const MIN_HEIGHT = 120;
const MAX_WIDTH = 900;
const MAX_HEIGHT = 360;

let translatorWindow: BrowserWindow | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let dragState: { offsetX: number; offsetY: number } | null = null;
let resizeState: { startScreenX: number; startScreenY: number; startBounds: Electron.Rectangle; anchor: ResizeAnchor } | null = null;

type ResizeAnchor = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const statePath = path.join(app.getPath('userData'), 'translator-state.json');

interface TranslatorWindowState {
  x: number | null;
  y: number | null;
  width: number;
  height: number;
}

let state: TranslatorWindowState = {
  x: null,
  y: null,
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
};

export function getTranslatorWindow(): BrowserWindow | null {
  return translatorWindow && !translatorWindow.isDestroyed() ? translatorWindow : null;
}

function safeSend(win: BrowserWindow, channel: string, ...args: unknown[]): void {
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => win.webContents.send(channel, ...args), 150);
    });
  } else {
    win.webContents.send(channel, ...args);
  }
}

function loadState(): void {
  try {
    if (fs.existsSync(statePath)) {
      state = { ...state, ...JSON.parse(fs.readFileSync(statePath, 'utf8')) };
    }
  } catch {
    /* ignore */
  }
}

function saveState(): void {
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch {
    /* ignore */
  }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const win = getTranslatorWindow();
    if (!win) return;
    state = { ...state, ...win.getBounds() };
    saveState();
  }, 250);
}

function intersectsAnyDisplay(bounds: { x: number; y: number; width: number; height: number }): boolean {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    const aRight = a.x + a.width;
    const aBottom = a.y + a.height;
    return right > a.x && bounds.x < aRight && bottom > a.y && bounds.y < aBottom;
  });
}

function sizeLimits(display: Electron.Display): { maxWidth: number; maxHeight: number } {
  return {
    maxWidth: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, display.workArea.width - 80)),
    maxHeight: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, display.workArea.height - 80)),
  };
}

function sanitizeSize(width: number, height: number, display: Electron.Display): { width: number; height: number } {
  const { maxWidth, maxHeight } = sizeLimits(display);
  const rawW = Number.isFinite(width) ? Math.round(width) : DEFAULT_WIDTH;
  const rawH = Number.isFinite(height) ? Math.round(height) : DEFAULT_HEIGHT;

  // A previous resize bug could persist a monitor-sized window. Treat
  // out-of-contract sizes as corrupt state and recover to the compact widget.
  if (rawW > maxWidth || rawH > maxHeight) {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }

  return {
    width: Math.max(MIN_WIDTH, rawW),
    height: Math.max(MIN_HEIGHT, rawH),
  };
}

function centerOnDisplay(display: Electron.Display, width: number, height: number): Electron.Rectangle {
  const a = display.workArea;
  return {
    x: Math.round(a.x + (a.width - width) / 2),
    y: Math.round(a.y + (a.height - height) / 2),
    width,
    height,
  };
}

function resolveSafeBounds(bounds: { x?: number | null; y?: number | null; width: number; height: number }): Electron.Rectangle {
  const hasPos = Number.isFinite(bounds.x as number) && Number.isFinite(bounds.y as number);
  const display = hasPos
    ? screen.getDisplayMatching({
        x: Math.round(bounds.x as number),
        y: Math.round(bounds.y as number),
        width: Math.max(MIN_WIDTH, Math.round(bounds.width || DEFAULT_WIDTH)),
        height: Math.max(MIN_HEIGHT, Math.round(bounds.height || DEFAULT_HEIGHT)),
      })
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width: w, height: h } = sanitizeSize(bounds.width, bounds.height, display);
  if (!hasPos) return centerOnDisplay(display, w, h);
  const x = Math.round(bounds.x as number);
  const y = Math.round(bounds.y as number);
  if (intersectsAnyDisplay({ x, y, width: w, height: h })) return { x, y, width: w, height: h };
  return centerOnDisplay(display, w, h);
}

function ensureWindow(): BrowserWindow {
  if (translatorWindow && !translatorWindow.isDestroyed()) return translatorWindow;

  loadState();
  const bounds = resolveSafeBounds({ x: state.x, y: state.y, width: state.width, height: state.height });

  // Keep this window opaque. On the user's Win11 compositor, transparent
  // frameless windows reported visible but never painted. Acrylic also
  // rendered as a giant gray plate before React/CSS loaded, so the stable
  // fallback is a normal dark BrowserWindow with a glass-styled surface.
  translatorWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: false,
    resizable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    thickFrame: false,
    backgroundColor: '#101922',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload.js'),
      backgroundThrottling: false,
    },
  });

  // Exclude the translator from desktopCapturer without flickering the
  // visible window. This was unsafe only with transparent:true; the current
  // opaque window remains visible while WDA_EXCLUDEFROMCAPTURE hides it from
  // screenshots on supported Windows builds.
  translatorWindow.setContentProtection(true);

  translatorWindow.setAlwaysOnTop(true, 'floating');
  translatorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  let retries = 0;
  const maxRetries = 5;
  const url = isDev && process.env.VITE_DEV_SERVER_URL
    ? `${process.env.VITE_DEV_SERVER_URL}/translator-overlay.html`
    : null;
  const file = path.join(__dirname, '..', '..', 'dist', 'translator-overlay.html');

  const load = () => {
    if (!translatorWindow || translatorWindow.isDestroyed()) return;
    if (url) translatorWindow.loadURL(url);
    else translatorWindow.loadFile(file);
  };

  translatorWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error(`[Translator] Failed to load: ${desc} (${code}), retry ${retries}/${maxRetries}`);
    if (retries < maxRetries && translatorWindow && !translatorWindow.isDestroyed()) {
      retries++;
      setTimeout(load, retries * 2000);
    } else {
      pushDiag({
        message: 'Translator failed to load content',
        detail: `code=${code} desc=${desc} after ${retries} retries. url=${url ?? file}`,
        context: 'screen-translator',
        tone: 'error',
      });
    }
  });
  translatorWindow.webContents.once('did-finish-load', () => {
    console.log('[Translator] Content loaded' + (retries > 0 ? ` (after ${retries} retries)` : ''));
  });
  translatorWindow.webContents.on('render-process-gone', (_e, details) => {
    pushDiag({
      message: 'Translator renderer crashed',
      detail: `reason=${details.reason} exitCode=${details.exitCode}`,
      context: 'screen-translator',
      tone: 'error',
    });
  });

  translatorWindow.webContents.on('console-message', (_e, level, message) => {
    const tag = ['[Translator:V]', '[Translator:I]', '[Translator:W]', '[Translator:E]'][level] ?? '[Translator:?]';
    console.log(`${tag} ${message}`);
  });

  load();

  translatorWindow.on('move', scheduleSave);
  translatorWindow.on('resize', scheduleSave);
  translatorWindow.on('closed', () => { translatorWindow = null; });

  console.log('[Translator] Window created');
  return translatorWindow;
}

export function preCreateTranslator(): void {
  ensureWindow();
}

export function showTranslator(): void {
  try {
    const win = ensureWindow();

    // Position the widget on the display under the user's cursor so it
    // always opens where the user is looking, not on a stale monitor from
    // a previous session. Saved position still applies to drags within
    // the current session.
    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);
    const current = win.getBounds();
    const { width: w, height: h } = sanitizeSize(current.width, current.height, display);
    win.setBounds(centerOnDisplay(display, w, h));
    state = { ...state, ...win.getBounds() };
    saveState();

    if (!win.isVisible()) win.show();
    win.moveTop();
    win.setAlwaysOnTop(true, 'floating');
    // Recover from any hung capture tick that may have left opacity at 0.
    win.setOpacity(1);
    safeSend(win, 'translator:visible', true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error && err.stack ? err.stack : undefined;
    pushDiag({
      message: 'Screen Translator failed to show',
      detail: `${msg}${stack ? '\n' + stack : ''}`,
      context: 'screen-translator',
      tone: 'error',
    });
  }
}

export function hideTranslator(): void {
  const win = getTranslatorWindow();
  if (!win) return;
  win.hide();
  safeSend(win, 'translator:visible', false);
}

export function toggleTranslator(): void {
  const win = getTranslatorWindow();
  if (win?.isVisible()) hideTranslator();
  else showTranslator();
}

export function getTranslatorBounds(): Electron.Rectangle | null {
  const win = getTranslatorWindow();
  if (!win) return null;
  return win.getBounds();
}

export function startTranslatorDrag(screenX: number, screenY: number): void {
  const win = getTranslatorWindow();
  if (!win) return;
  const bounds = win.getBounds();
  dragState = {
    offsetX: Math.round(screenX) - bounds.x,
    offsetY: Math.round(screenY) - bounds.y,
  };
}

export function moveTranslatorDrag(screenX: number, screenY: number): void {
  const win = getTranslatorWindow();
  if (!win || !dragState) return;
  const bounds = win.getBounds();
  win.setBounds({
    x: Math.round(screenX) - dragState.offsetX,
    y: Math.round(screenY) - dragState.offsetY,
    width: bounds.width,
    height: bounds.height,
  });
}

export function endTranslatorDrag(): void {
  dragState = null;
  scheduleSave();
}

export function startTranslatorResize(screenX: number, screenY: number, anchor: ResizeAnchor): void {
  const win = getTranslatorWindow();
  if (!win) return;
  resizeState = {
    startScreenX: Math.round(screenX),
    startScreenY: Math.round(screenY),
    startBounds: win.getBounds(),
    anchor,
  };
}

export function moveTranslatorResize(screenX: number, screenY: number): void {
  const win = getTranslatorWindow();
  if (!win || !resizeState) return;
  const dx = Math.round(screenX) - resizeState.startScreenX;
  const dy = Math.round(screenY) - resizeState.startScreenY;
  const { startBounds: s, anchor } = resizeState;
  const display = screen.getDisplayMatching(s);
  const { maxWidth, maxHeight } = sizeLimits(display);

  let x = s.x;
  let y = s.y;
  let w = s.width;
  let h = s.height;

  if (anchor.includes('e')) w = Math.min(maxWidth, Math.max(MIN_WIDTH, s.width + dx));
  if (anchor.includes('s')) h = Math.min(maxHeight, Math.max(MIN_HEIGHT, s.height + dy));
  if (anchor.includes('w')) {
    const nextW = Math.min(maxWidth, Math.max(MIN_WIDTH, s.width - dx));
    x = s.x + (s.width - nextW);
    w = nextW;
  }
  if (anchor.includes('n')) {
    const nextH = Math.min(maxHeight, Math.max(MIN_HEIGHT, s.height - dy));
    y = s.y + (s.height - nextH);
    h = nextH;
  }

  win.setBounds({ x, y, width: w, height: h });
}

export function endTranslatorResize(): void {
  resizeState = null;
  scheduleSave();
}
