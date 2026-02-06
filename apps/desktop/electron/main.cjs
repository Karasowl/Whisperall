const { app, BrowserWindow, globalShortcut, ipcMain, clipboard } = require('electron');
const path = require('path');

let mainWindow = null;
let overlayWindow = null;
let lastDictationText = '';

const isDev = !app.isPackaged;

const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }
};

const createOverlayWindow = () => {
  overlayWindow = new BrowserWindow({
    width: 360,
    height: 120,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  const overlayPath = path.join(__dirname, 'overlay.html');
  overlayWindow.loadFile(overlayPath);
  overlayWindow.hide();
};

const registerHotkeys = () => {
  globalShortcut.unregisterAll();

  globalShortcut.register('Ctrl+Shift+D', () => {
    if (!overlayWindow) return;
    overlayWindow.show();
    overlayWindow.webContents.send('overlay-state', { state: 'listening' });
  });

  globalShortcut.register('Ctrl+Shift+S', () => {
    if (!overlayWindow) return;
    overlayWindow.hide();
    if (lastDictationText) {
      clipboard.writeText(lastDictationText);
    }
  });
};

app.whenReady().then(() => {
  createMainWindow();
  createOverlayWindow();
  registerHotkeys();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('dictation-final', (_event, text) => {
  lastDictationText = text;
  if (overlayWindow) {
    overlayWindow.webContents.send('overlay-state', { state: 'ready' });
  }
});
