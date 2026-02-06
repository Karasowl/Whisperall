import { app, BrowserWindow, globalShortcut } from 'electron';
import { createMainWindow, showMainWindow, setQuitting, configureMediaPermissions } from './modules/windows.js';
import { registerHotkeys } from './modules/hotkeys.js';
import { syncTray } from './modules/tray.js';
import { preCreateOverlay } from './modules/overlay.js';
import { registerIpcHandlers } from './modules/ipc.js';
import { initAutoUpdater } from './modules/updater.js';

// ── Single-instance guard ──────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
}

// ── Uncaught exception safety ──────────────────────────────────
process.on('uncaughtException', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'EPIPE') return;
  console.error('Uncaught exception:', err);
});

// ── App lifecycle ──────────────────────────────────────────────
app.commandLine.appendSwitch('disable-http-cache');

app.whenReady().then(() => {
  configureMediaPermissions();
  registerIpcHandlers();

  createMainWindow();
  registerHotkeys();
  syncTray();

  // Pre-create overlay for instant hotkey response
  setTimeout(() => preCreateOverlay(), 1000);

  // Auto-updater (no-op in dev)
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
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
