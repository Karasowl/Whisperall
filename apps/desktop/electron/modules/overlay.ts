import { app, BrowserWindow, screen } from 'electron';
import path from 'path';
import fs from 'fs';

const isDev = !app.isPackaged;

let overlayWindow: BrowserWindow | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const statePath = path.join(app.getPath('userData'), 'overlay-state.json');

interface OverlayState {
  x: number | null;
  y: number | null;
  width: number;
  height: number;
  lastModule: string;
}

let state: OverlayState = {
  x: null,
  y: null,
  width: 280,
  height: 100,
  lastModule: 'dictate',
};

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : null;
}

/** Send IPC to overlay, queuing if content is still loading. */
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
  } catch { /* ignore */ }
}

function saveState(): void {
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch { /* ignore */ }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const win = getOverlayWindow();
    if (!win) return;
    const bounds = win.getBounds();
    state = { ...state, ...bounds };
    saveState();
  }, 250);
}

/** Check if a point is actually inside some real display (not just the combined bounding box). */
function isOnAnyDisplay(x: number, y: number): boolean {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height;
  });
}

/** Get centered position on the display nearest to the mouse cursor. */
function centerOnCursorDisplay(w: number, h: number) {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const a = display.workArea;
  return {
    x: Math.round(a.x + (a.width - w) / 2),
    y: Math.round(a.y + (a.height - h) / 2),
    width: w,
    height: h,
  };
}

function clampToWorkArea(bounds: { x?: number | null; y?: number | null; width: number; height: number }) {
  const w = Math.round(bounds.width);
  const h = Math.round(bounds.height);

  try {
    const hasPos = Number.isFinite(bounds.x as number) && Number.isFinite(bounds.y as number);

    // No saved position → center on display where cursor is
    if (!hasPos) return centerOnCursorDisplay(w, h);

    const x = Math.round(bounds.x as number);
    const y = Math.round(bounds.y as number);

    // Saved position is NOT on any real display → recenter
    if (!isOnAnyDisplay(x, y)) return centerOnCursorDisplay(w, h);

    // Valid saved position — keep it
    return { x, y, width: w, height: h };
  } catch {
    return centerOnCursorDisplay(w, h);
  }
}

function ensureWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

  loadState();
  const bounds = clampToWorkArea({ x: state.x, y: state.y, width: state.width, height: state.height });

  overlayWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: false,
    show: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    thickFrame: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload.js'),
      backgroundThrottling: false,
    },
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, 'floating');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Load overlay with retry logic (Vite may not be ready yet)
  let retries = 0;
  const maxRetries = 5;
  const overlayUrl = isDev && process.env.VITE_DEV_SERVER_URL
    ? `${process.env.VITE_DEV_SERVER_URL}/overlay.html`
    : null;
  const overlayFile = path.join(__dirname, '..', '..', 'dist', 'overlay.html');

  const loadOverlay = () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    if (overlayUrl) {
      overlayWindow.loadURL(overlayUrl);
    } else {
      overlayWindow.loadFile(overlayFile);
    }
  };

  overlayWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error(`[Overlay] Failed to load: ${desc} (${code}), retry ${retries}/${maxRetries}`);
    if (retries < maxRetries && overlayWindow && !overlayWindow.isDestroyed()) {
      retries++;
      const delay = retries * 2000; // 2s, 4s, 6s, 8s, 10s
      console.log(`[Overlay] Retrying in ${delay}ms...`);
      setTimeout(loadOverlay, delay);
    }
  });
  overlayWindow.webContents.once('did-finish-load', () => {
    console.log('[Overlay] Content loaded' + (retries > 0 ? ` (after ${retries} retries)` : ''));
  });

  loadOverlay();

  // Forward overlay console messages to main process for debugging
  overlayWindow.webContents.on('console-message', (_e, level, message) => {
    const tag = ['[Overlay:V]', '[Overlay:I]', '[Overlay:W]', '[Overlay:E]'][level] ?? '[Overlay:?]';
    console.log(`${tag} ${message}`);
  });

  overlayWindow.on('move', scheduleSave);
  overlayWindow.on('resize', scheduleSave);
  overlayWindow.on('closed', () => { overlayWindow = null; });

  console.log('[Overlay] Window created');
  return overlayWindow;
}

export function showOverlay(module?: string): void {
  const win = ensureWindow();
  // Always validate position — clampToWorkArea recenters if off-display
  const clamped = clampToWorkArea(win.getBounds());
  win.setBounds(clamped);

  if (!win.isVisible()) {
    win.show();
    console.log(`[Overlay] Window shown at ${JSON.stringify(win.getBounds())}`);
  }
  // Don't set ignoreMouseEvents here — Widget controls it based on mode

  if (module) {
    safeSend(win, 'overlay:switch-module', module);
    state.lastModule = module;
  }
  safeSend(win, 'overlay:visible', true);
}

export function hideOverlay(): void {
  getOverlayWindow()?.hide();
}

export function toggleOverlay(module?: string): void {
  const win = getOverlayWindow();
  console.log(`[Overlay] toggleOverlay(${module ?? 'none'}) hasWin=${!!win} visible=${win?.isVisible()}`);
  if (win?.isVisible()) {
    hideOverlay();
  } else {
    showOverlay(module);
  }
}

export function resizeOverlay(width: number, height: number): void {
  const win = getOverlayWindow();
  if (!win) return;
  const bounds = win.getBounds();
  const newBounds = clampToWorkArea({ x: bounds.x, y: bounds.y, width, height });
  console.log(`[Overlay] resizeOverlay ${bounds.width}x${bounds.height} -> ${width}x${height} at (${newBounds.x},${newBounds.y})`);
  win.setBounds(newBounds);
}

export function setOverlayIgnoreMouse(ignore: boolean): void {
  const win = getOverlayWindow();
  if (!win) return;
  win.setIgnoreMouseEvents(ignore, { forward: true });
}

export function sendSubtitleText(text: string): void {
  const win = getOverlayWindow();
  if (!win) return;
  safeSend(win, 'overlay:subtitle', text);
}

export function preCreateOverlay(): void {
  ensureWindow();
}
