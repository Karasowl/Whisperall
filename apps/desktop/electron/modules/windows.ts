import { app, BrowserWindow, desktopCapturer, nativeImage, session } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let minimizeToTray = true;

const isDev = !app.isPackaged;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

export function setQuitting(value: boolean): void {
  isQuitting = value;
}

export function setMinimizeToTray(value: boolean): void {
  minimizeToTray = value;
}

export function showMainWindow(): void {
  const win = getMainWindow();
  if (!win) return;
  if (!win.isVisible()) win.show();
  if (win.isMinimized()) win.restore();
  win.focus();
}

export function createMainWindow(): BrowserWindow {
  // Resolve the app icon from multiple candidate paths (dev vs packaged).
  const candidates = [
    path.join(__dirname, '..', '..', 'build-resources', 'icon.png'),
    path.join(app.getAppPath(), 'build-resources', 'icon.png'),
    path.join(app.getAppPath(), 'apps', 'desktop', 'build-resources', 'icon.png'),
    path.join(process.cwd(), 'build-resources', 'icon.png'),
    path.join(process.cwd(), 'apps', 'desktop', 'build-resources', 'icon.png'),
  ];
  let appIcon: Electron.NativeImage | undefined;
  for (const candidate of candidates) {
    try {
      const img = nativeImage.createFromPath(candidate);
      if (!img.isEmpty()) {
        appIcon = img;
        console.log('[windows] icon loaded from:', candidate, `(${img.getSize().width}x${img.getSize().height})`);
        break;
      }
    } catch { /* try next */ }
  }
  if (!appIcon) console.warn('[windows] no icon found, tried:', candidates);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon: appIcon,
    backgroundColor: '#101922',
    title: 'Whisperall',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#101922',
      symbolColor: '#94a3b8',
      height: 40,
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload.js'),
      backgroundThrottling: false,
    },
  });

  // Load Vite dev server or built app
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.on('close', (event) => {
    if (!isQuitting && minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function configureMediaPermissions(): void {
  const defaultSession = session.defaultSession;
  if (!defaultSession) return;

  // permissionRequestHandler: grant mic access when getUserMedia is actually called.
  // permissionCheckHandler: do NOT report 'media' as pre-granted — this prevents
  // Chromium from keeping the mic "reserved" at the OS level, which would force
  // Bluetooth headphones into low-quality HFP/SCO mode even when idle.
  const CHECK_ALLOWED = new Set(['display-capture', 'screen']);
  const REQUEST_ALLOWED = new Set(['media', 'display-capture', 'screen']);

  defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(REQUEST_ALLOWED.has(permission as string));
  });

  defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return CHECK_ALLOWED.has(permission as string);
  });

  // Electron 33+: auto-grant getDisplayMedia requests with system audio loopback
  defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    if (sources.length > 0) {
      callback({ video: sources[0], audio: 'loopback' });
    } else {
      callback({});
    }
  });
}
