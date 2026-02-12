import { app, BrowserWindow, globalShortcut } from 'electron';
import { createMainWindow, showMainWindow, setQuitting, configureMediaPermissions } from './modules/windows.js';
import { registerHotkeys } from './modules/hotkeys.js';
import { syncTray } from './modules/tray.js';
import { preCreateOverlay, showOverlay } from './modules/overlay.js';
import { registerIpcHandlers } from './modules/ipc.js';
import { initAutoUpdater } from './modules/updater.js';
import { registerProtocol, handleAuthUrl } from './modules/auth.js';

// ── Custom protocol (must register before ready) ───────────────
registerProtocol();

// ── Single-instance guard ──────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // Windows/Linux: deep link URL arrives in argv
    const url = argv.find((a) => a.startsWith('whisperall://'));
    if (url) handleAuthUrl(url);
    showMainWindow();
  });
}

// ── macOS deep link ────────────────────────────────────────────
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleAuthUrl(url);
});

// ── Uncaught exception safety ──────────────────────────────────
process.on('uncaughtException', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'EPIPE') return;
  console.error('Uncaught exception:', err);
});

// ── App lifecycle ──────────────────────────────────────────────
app.commandLine.appendSwitch('disable-http-cache');
// Prevent GPU compositing crashes on laptops with marginal PCIe links (RTX 4060 etc.)
// Transparent overlay re-renders cause rapid GPU power state transitions → PCIe recovery errors
app.commandLine.appendSwitch('disable-gpu-compositing');

app.whenReady().then(() => {
  console.log('[WhisperAll] App ready, VITE_DEV_SERVER_URL =', process.env.VITE_DEV_SERVER_URL ?? '(not set)');
  configureMediaPermissions();
  registerIpcHandlers();

  createMainWindow();
  registerHotkeys();
  syncTray();

  // Keep widget integrated and available immediately when the app starts.
  preCreateOverlay();
  showOverlay();

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
