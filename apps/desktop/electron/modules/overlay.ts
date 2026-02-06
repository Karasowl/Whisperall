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
  width: 72,
  height: 12,
  lastModule: 'dictate',
};

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : null;
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

function clampToWorkArea(bounds: { x?: number | null; y?: number | null; width: number; height: number }) {
  try {
    const areas = screen.getAllDisplays().map((d) => d.workArea);
    const minX = Math.min(...areas.map((a) => a.x));
    const minY = Math.min(...areas.map((a) => a.y));
    const maxX = Math.max(...areas.map((a) => a.x + a.width));
    const maxY = Math.max(...areas.map((a) => a.y + a.height));
    const pad = 10;
    const w = Math.round(bounds.width);
    const h = Math.round(bounds.height);
    const rawX = Number.isFinite(bounds.x as number) ? (bounds.x as number) : minX + pad;
    const rawY = Number.isFinite(bounds.y as number) ? (bounds.y as number) : minY + pad;
    return {
      x: Math.max(minX + pad, Math.min(Math.round(rawX), maxX - w - pad)),
      y: Math.max(minY + pad, Math.min(Math.round(rawY), maxY - h - pad)),
      width: w,
      height: h,
    };
  } catch {
    return { x: bounds.x ?? 0, y: bounds.y ?? 0, width: bounds.width, height: bounds.height };
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
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Load Vite dev server or built overlay
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    overlayWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}/overlay.html`);
  } else {
    overlayWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'overlay.html'));
  }

  overlayWindow.on('move', scheduleSave);
  overlayWindow.on('resize', scheduleSave);
  overlayWindow.on('closed', () => { overlayWindow = null; });

  return overlayWindow;
}

export function showOverlay(module?: string): void {
  const win = ensureWindow();
  win.setBounds(clampToWorkArea(win.getBounds()));

  if (!win.isVisible()) {
    if (!Number.isFinite(state.x) || !Number.isFinite(state.y)) {
      win.center();
    }
    win.show();
  }
  win.setIgnoreMouseEvents(true, { forward: true });

  if (module) {
    win.webContents.send('overlay:switch-module', module);
    state.lastModule = module;
  }
  win.webContents.send('overlay:visible', true);
}

export function hideOverlay(): void {
  getOverlayWindow()?.hide();
}

export function toggleOverlay(module?: string): void {
  const win = getOverlayWindow();
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
  win.setBounds(clampToWorkArea({ x: bounds.x, y: bounds.y, width, height }));
}

export function setOverlayIgnoreMouse(ignore: boolean): void {
  const win = getOverlayWindow();
  if (!win) return;
  win.setIgnoreMouseEvents(ignore, { forward: true });
}

export function preCreateOverlay(): void {
  ensureWindow();
}
