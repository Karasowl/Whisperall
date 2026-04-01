import { app, BrowserWindow, dialog, globalShortcut } from 'electron';
import { createMainWindow, showMainWindow, setQuitting, configureMediaPermissions } from './modules/windows.js';
import { registerHotkeys } from './modules/hotkeys.js';
import { syncTray } from './modules/tray.js';
import { preCreateOverlay, showOverlay } from './modules/overlay.js';
import { registerIpcHandlers } from './modules/ipc.js';
import { initAutoUpdater } from './modules/updater.js';
import { registerProtocol, handleAuthUrl } from './modules/auth.js';
import { ensureBundledBackend, stopBundledBackend } from './modules/backend.js';

registerProtocol();

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find((a) => a.startsWith('whisperall://'));
    if (url) handleAuthUrl(url);
    showMainWindow();
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleAuthUrl(url);
});

process.on('uncaughtException', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'EPIPE') return;
  console.error('Uncaught exception:', err);
});

app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-gpu-compositing');

app.whenReady().then(async () => {
  console.log('[WhisperAll] App ready, VITE_DEV_SERVER_URL =', process.env.VITE_DEV_SERVER_URL ?? '(not set)');
  configureMediaPermissions();
  registerIpcHandlers();

  try {
    await ensureBundledBackend();
  } catch (err) {
    console.error('Bundled backend failed to start:', err);
    const message = err instanceof Error ? err.message : String(err);
    dialog.showErrorBox('Whisperall backend failed to start', message);
    app.quit();
    return;
  }

  createMainWindow();
  registerHotkeys();
  syncTray();
  preCreateOverlay();
  showOverlay();
  initAutoUpdater();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  setQuitting(true);
  stopBundledBackend();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
