import { app, BrowserWindow, screen } from 'electron';
import path from 'path';
import fs from 'fs';

const isDev = !app.isPackaged;
const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 120;
const TOP_MARGIN = 20;

let overlayWindow: BrowserWindow | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let dragState: { offsetX: number; offsetY: number } | null = null;

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
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
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

function defaultPosition(w: number, h: number) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const a = display.workArea;
  return {
    x: Math.round(a.x + (a.width - w) / 2),
    y: a.y + TOP_MARGIN,
    width: w,
    height: h,
  };
}

function resolveSafeBounds(bounds: { x?: number | null; y?: number | null; width: number; height: number }) {
  const w = Math.round(bounds.width);
  const h = Math.round(bounds.height);

  try {
    const hasPos = Number.isFinite(bounds.x as number) && Number.isFinite(bounds.y as number);

    // No saved position -> use default on cursor display.
    if (!hasPos) return defaultPosition(w, h);

    const x = Math.round(bounds.x as number);
    const y = Math.round(bounds.y as number);

    // Keep freeform position as long as any part intersects a real display.
    if (intersectsAnyDisplay({ x, y, width: w, height: h })) {
      return { x, y, width: w, height: h };
    }

    // Saved position is fully off-screen (e.g. monitor unplugged) -> fallback.
    return defaultPosition(w, h);
  } catch {
    return defaultPosition(w, h);
  }
}

function ensureWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

  loadState();
  const bounds = resolveSafeBounds({ x: state.x, y: state.y, width: state.width, height: state.height });

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

  overlayWindow.setIgnoreMouseEvents(false);
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
  const safeBounds = resolveSafeBounds(win.getBounds());
  win.setBounds(safeBounds);

  if (!win.isVisible()) {
    win.showInactive();
    console.log(`[Overlay] Window shown at ${JSON.stringify(win.getBounds())}`);
  }

  if (module) {
    safeSend(win, 'overlay:switch-module', module);
    state.lastModule = module;
  }
  safeSend(win, 'overlay:visible', true);
}

export function hideOverlay(): void {
  const win = getOverlayWindow();
  if (!win) return;
  win.hide();
  safeSend(win, 'overlay:visible', false);
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
  const newBounds = resolveSafeBounds({ x: bounds.x, y: bounds.y, width, height });
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

export function startOverlayDrag(screenX: number, screenY: number): void {
  const win = getOverlayWindow();
  if (!win) return;
  const bounds = win.getBounds();
  dragState = {
    offsetX: Math.round(screenX) - bounds.x,
    offsetY: Math.round(screenY) - bounds.y,
  };
}

// Dock zone bounds (set by the renderer via IPC when the slot mounts).
let dockZone: { x: number; y: number; width: number; height: number } | null = null;
const SNAP_DISTANCE = 60; // px — how close the overlay center must be to snap.

export function setDockZone(bounds: { x: number; y: number; width: number; height: number } | null): void {
  dockZone = bounds;
}

function overlayCenter(bounds: Electron.Rectangle): { cx: number; cy: number } {
  return { cx: bounds.x + bounds.width / 2, cy: bounds.y + bounds.height / 2 };
}

function dockZoneCenter(): { cx: number; cy: number } | null {
  if (!dockZone) return null;
  return { cx: dockZone.x + dockZone.width / 2, cy: dockZone.y + dockZone.height / 2 };
}

export function moveOverlayDrag(screenX: number, screenY: number): void {
  const win = getOverlayWindow();
  if (!win || !dragState) return;
  const bounds = win.getBounds();
  const next = {
    x: Math.round(screenX) - dragState.offsetX,
    y: Math.round(screenY) - dragState.offsetY,
    width: bounds.width,
    height: bounds.height,
  };
  win.setBounds(next);

  // Magnetic snap: if the overlay center is near the dock zone, signal the renderer.
  const dzc = dockZoneCenter();
  if (dzc) {
    const oc = overlayCenter(next);
    const dist = Math.hypot(oc.cx - dzc.cx, oc.cy - dzc.cy);
    if (dist < SNAP_DISTANCE) {
      // Tell the main window to dock the widget.
      const { getMainWindow } = require('./windows.js');
      const main = getMainWindow();
      if (main && !main.isDestroyed()) {
        main.webContents.send('widget:snap-dock');
      }
      // Hide the overlay immediately.
      hideOverlay();
      dragState = null;
      return;
    }
  }
}

export function endOverlayDrag(): void {
  dragState = null;
  scheduleSave();
}

/**
 * Undock-to-position: show the overlay centered on (screenX, screenY) and
 * immediately begin an OS-level drag so the user can keep moving it without
 * releasing the mouse. Called by the renderer when the user drags the docked
 * widget out of the dock slot.
 */
export function undockToPosition(screenX: number, screenY: number): void {
  const win = ensureWindow();
  const bounds = win.getBounds();
  const x = Math.round(screenX - bounds.width / 2);
  const y = Math.round(screenY - bounds.height / 2);
  win.setBounds({ x, y, width: bounds.width, height: bounds.height });
  if (!win.isVisible()) win.show();
  // Start drag immediately so the cursor "owns" the overlay.
  dragState = {
    offsetX: Math.round(bounds.width / 2),
    offsetY: Math.round(bounds.height / 2),
  };
  scheduleSave();
}

export function resetOverlayPosition(): void {
  const win = ensureWindow();
  const current = win.getBounds();
  const reset = defaultPosition(current.width, current.height);
  state = { ...state, ...reset };
  saveState();
  win.setBounds(reset);
  showOverlay(state.lastModule);
}
