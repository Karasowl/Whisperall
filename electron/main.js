const electron = require('electron');
const app = electron.app;
if (!app) {
  console.error('Electron main process not available. Run via "npm start" in the electron folder or ChatterboxUI.bat.');
  process.exit(1);
}
const { BrowserWindow, dialog, Tray, Menu, globalShortcut, ipcMain, clipboard, Notification, shell } = electron;
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const http = require('http');

// Handle uncaught exceptions to prevent crash dialogs
process.on('uncaughtException', (error) => {
  if (error.code === 'EPIPE') {
    // Ignore broken pipe errors (backend died)
    return;
  }
  console.error('Uncaught exception:', error);
});

let mainWindow;
let backendProcess;
let tray;
let isQuitting = false;
const BACKEND_PORT = 8000;
let traySettings = {
  minimizeToTray: true,
  showNotifications: true,
};
let overlayWindow;
let overlaySaveTimer;
let lastSttTranscript = '';
const overlayStatePath = path.join(app.getPath('userData'), 'stt-overlay.json');
let overlayState = {
  width: 220,
  height: 56,
  x: null,
  y: null,
};

// Kill any process using our port
const killPortProcess = () => {
  console.log(`[Startup] Checking for processes on port ${BACKEND_PORT}...`);
  try {
    // Find process using the port
    const result = execSync(`netstat -ano | findstr :${BACKEND_PORT}`, { encoding: 'utf8' });
    const lines = result.trim().split('\n');
    const killedPids = new Set();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && !killedPids.has(pid)) {
        console.log(`[Startup] Killing process ${pid} on port ${BACKEND_PORT}`);
        killedPids.add(pid);
        try {
          execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf8', stdio: 'pipe' });
          console.log(`[Startup] Killed process ${pid}`);
        } catch (e) {
          console.log(`[Startup] Process ${pid} already dead or access denied`);
        }
      }
    }
    if (killedPids.size > 0) {
      // Wait a moment for processes to fully terminate
      console.log(`[Startup] Waiting for ${killedPids.size} process(es) to terminate...`);
      execSync('timeout /t 2 /nobreak >nul', { encoding: 'utf8', stdio: 'pipe' });
    }
  } catch (e) {
    console.log('[Startup] No existing processes found on port');
  }
};
const isDev = !app.isPackaged;

app.commandLine.appendSwitch('disable-http-cache');

// Paths
const getBackendPath = () => {
  if (isDev) {
    return path.join(__dirname, '..', 'ui', 'backend');
  }
  return path.join(process.resourcesPath, 'backend');
};

const getPythonPath = () => {
  if (isDev) {
    // Use venv Python in development
    return path.join(__dirname, '..', 'venv', 'Scripts', 'python.exe');
  }
  // In production, Python is bundled
  return path.join(process.resourcesPath, 'backend', 'python', 'python.exe');
};

const getFrontendURL = () => {
  return `http://localhost:${BACKEND_PORT}`;
};

const getTrayIconPath = () => {
  const candidates = [];
  if (isDev) {
    candidates.push(path.join(__dirname, 'icon.png'));
    candidates.push(path.join(__dirname, '..', 'Chatterbox-Multilingual.png'));
  } else {
    candidates.push(path.join(process.resourcesPath, 'icon.png'));
    candidates.push(path.join(process.resourcesPath, 'Chatterbox-Multilingual.png'));
  }
  return candidates.find((p) => fs.existsSync(p)) || null;
};

const showMainWindow = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.focus();
};

const sendHotkeyAction = (action, options = {}) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (options.focus !== false) {
      showMainWindow();
    }
    mainWindow.webContents.send('global-hotkey', action);
  }
};

const loadOverlayState = () => {
  try {
    if (fs.existsSync(overlayStatePath)) {
      const raw = fs.readFileSync(overlayStatePath, 'utf8');
      const saved = JSON.parse(raw);
      overlayState = {
        ...overlayState,
        ...saved,
      };
    }
  } catch (err) {
    console.warn('[Overlay] Failed to load state:', err.message);
  }
};

const saveOverlayState = (bounds) => {
  overlayState = {
    ...overlayState,
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
  };
  try {
    fs.writeFileSync(overlayStatePath, JSON.stringify(overlayState, null, 2));
  } catch (err) {
    console.warn('[Overlay] Failed to save state:', err.message);
  }
};

const scheduleOverlaySave = () => {
  if (overlaySaveTimer) {
    clearTimeout(overlaySaveTimer);
  }
  overlaySaveTimer = setTimeout(() => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      saveOverlayState(overlayWindow.getBounds());
    }
  }, 250);
};

const getOverlayBounds = () => {
  const bounds = {
    width: overlayState.width || 220,
    height: overlayState.height || 56,
  };
  if (Number.isFinite(overlayState.x) && Number.isFinite(overlayState.y)) {
    bounds.x = overlayState.x;
    bounds.y = overlayState.y;
  }
  return bounds;
};

const ensureOverlayWindow = () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;
  loadOverlayState();
  overlayWindow = new BrowserWindow({
    ...getOverlayBounds(),
    frame: false,
    transparent: true,
    resizable: false,
    show: false,
    focusable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

  overlayWindow.on('move', scheduleOverlaySave);
  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
};

const showOverlay = () => {
  const windowRef = ensureOverlayWindow();
  if (!windowRef) return;
  if (!windowRef.isVisible()) {
    windowRef.showInactive();
  }
};

const hideOverlay = () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
};

const snapshotClipboard = () => {
  const formats = clipboard.availableFormats();
  const data = new Map();
  formats.forEach((format) => {
    try {
      data.set(format, clipboard.readBuffer(format));
    } catch (err) {
      console.warn('[Clipboard] Failed to read format:', format, err.message);
    }
  });
  return { formats, data };
};

const restoreClipboard = (snapshot) => {
  if (!snapshot) return;
  try {
    clipboard.clear();
    snapshot.formats.forEach((format) => {
      const buffer = snapshot.data.get(format);
      if (!buffer) return;
      try {
        clipboard.writeBuffer(format, buffer);
      } catch (err) {
        console.warn('[Clipboard] Failed to restore format:', format, err.message);
      }
    });
  } catch (err) {
    console.warn('[Clipboard] Failed to restore clipboard:', err.message);
  }
};

const sendPasteKeystroke = () => {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const proc = spawn(
        'powershell',
        ['-NoProfile', '-Command', "$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys('^v')"],
        { windowsHide: true }
      );
      proc.on('exit', () => resolve());
      proc.on('error', () => resolve());
      return;
    }
    if (process.platform === 'darwin') {
      const proc = spawn(
        'osascript',
        ['-e', 'tell application "System Events" to keystroke "v" using command down'],
        { stdio: 'ignore' }
      );
      proc.on('exit', () => resolve());
      proc.on('error', () => resolve());
      return;
    }
    resolve();
  });
};

const pasteLastTranscript = async () => {
  if (!lastSttTranscript) return;
  const snapshot = snapshotClipboard();
  clipboard.writeText(lastSttTranscript);
  await sendPasteKeystroke();
  setTimeout(() => restoreClipboard(snapshot), 150);
};

// Check if backend is ready
const waitForBackend = (retries = 180) => {
  return new Promise((resolve, reject) => {
    console.log('[Startup] Waiting for backend to be ready...');
    let resolved = false;  // Flag to stop the loop once resolved

    const check = (attempt) => {
      if (resolved) return;  // Stop if already resolved

      if (attempt % 5 === 0) {
        console.log(`[Startup] Checking backend health... (attempt ${attempt + 1}/${retries})`);
      }
      const req = http.request({
        hostname: 'localhost',
        port: BACKEND_PORT,
        path: '/api/health',
        method: 'GET',
        timeout: 2000
      }, (res) => {
        // Consume response data to free up memory
        res.resume();

        if (resolved) return;  // Already resolved, ignore

        if (res.statusCode === 200) {
          resolved = true;
          console.log('[Startup] Backend is ready!');
          resolve();
        } else {
          console.log(`[Startup] Backend returned status ${res.statusCode}, retrying...`);
          retry(attempt);
        }
      });

      req.on('error', (err) => {
        if (resolved) return;
        if (attempt % 10 === 0) {
          console.log(`[Startup] Backend not ready yet: ${err.message}`);
        }
        retry(attempt);
      });
      req.on('timeout', () => {
        if (resolved) return;
        req.destroy();
        retry(attempt);
      });
      req.end();
    };

    const retry = (attempt) => {
      if (resolved) return;  // Stop if already resolved

      if (attempt >= retries) {
        console.error('[Startup] Backend failed to start after', retries, 'attempts');
        reject(new Error('Backend failed to start after ' + retries + ' seconds (first-time model downloads can take longer)'));
      } else {
        setTimeout(() => check(attempt + 1), 1000);
      }
    };

    check(0);
  });
};

// Start backend process
const startBackend = () => {
  return new Promise((resolve, reject) => {
    // Kill any existing process on our port first
    killPortProcess();

    const pythonPath = getPythonPath();
    const backendPath = getBackendPath();
    const mainScript = path.join(backendPath, 'main.py');

    console.log('[Startup] Starting backend...');
    console.log('[Startup] Python path:', pythonPath);
    console.log('[Startup] Backend path:', backendPath);
    console.log('[Startup] Main script:', mainScript);

    // Verify paths exist
    if (!fs.existsSync(pythonPath)) {
      const err = new Error(`Python not found at: ${pythonPath}`);
      console.error('[Startup]', err.message);
      reject(err);
      return;
    }
    if (!fs.existsSync(mainScript)) {
      const err = new Error(`Backend script not found at: ${mainScript}`);
      console.error('[Startup]', err.message);
      reject(err);
      return;
    }

    backendProcess = spawn(pythonPath, [mainScript], {
      cwd: backendPath,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    console.log('[Startup] Backend process spawned with PID:', backendProcess.pid);

    backendProcess.stdout.on('data', (data) => {
      try {
        console.log(`[Backend] ${data}`);
      } catch (e) {
        // Ignore pipe errors
      }
    });

    backendProcess.stderr.on('data', (data) => {
      try {
        console.error(`[Backend Error] ${data}`);
      } catch (e) {
        // Ignore pipe errors
      }
    });

    backendProcess.on('error', (err) => {
      console.error('[Startup] Failed to start backend:', err);
      reject(err);
    });

    backendProcess.on('close', (code) => {
      console.log(`[Startup] Backend exited with code ${code}`);
      if (code !== 0 && mainWindow && !mainWindow.isDestroyed()) {
        dialog.showErrorBox('Backend Error', `The backend process stopped unexpectedly (code ${code}).`);
      }
    });

    // Give it a moment to start
    console.log('[Startup] Waiting 2 seconds for backend to initialize...');
    setTimeout(resolve, 2000);
  });
};

// Create main window
const createWindow = async () => {
  // Show loading window
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,  // Prevent network suspension when app is in background
    },
    show: false,
    backgroundColor: '#030711',
    title: 'Whisperall',
    autoHideMenuBar: true,  // Hide menu bar (press Alt to show)
    titleBarStyle: 'hidden',  // Hide default title bar
    titleBarOverlay: {
      color: '#030711',
      symbolColor: '#94a3b8',
      height: 40
    }
  });

  // Show loading state
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));
  mainWindow.show();

  try {
    // Start backend
    await startBackend();

    // Wait for backend to be ready
    await waitForBackend();

    await mainWindow.webContents.session.clearCache();
    await mainWindow.webContents.session.clearStorageData();
    const frontendUrl = `${getFrontendURL()}?v=${Date.now()}`;
    mainWindow.loadURL(frontendUrl);

    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  } catch (err) {
    console.error('Failed to start:', err);
    dialog.showErrorBox(
      'Startup Error',
      `Failed to start Whisperall:\n\n${err.message}\n\nMake sure Python and all dependencies are installed.`
    );
    app.quit();
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting && traySettings.minimizeToTray && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (traySettings.minimizeToTray && tray && process.platform !== 'darwin') {
    return;
  }
  // Kill backend
  if (backendProcess) {
    backendProcess.kill();
  }
  app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  if (backendProcess) {
    backendProcess.kill();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

const createTray = () => {
  if (tray) return;
  const iconPath = getTrayIconPath();
  if (!iconPath) {
    console.warn('[Tray] No icon found, skipping tray creation.');
    return;
  }

  tray = new Tray(iconPath);
  tray.setToolTip('Whisperall');
  tray.on('click', () => {
    showMainWindow();
  });

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Whisperall', click: () => showMainWindow() },
    { type: 'separator' },
    { label: 'Text to Speech', click: () => sendHotkeyAction('open-tts') },
    { label: 'Dictate (STT)', click: () => sendHotkeyAction('dictate-toggle') },
    { label: 'Reader (Clipboard)', click: () => sendHotkeyAction('read-clipboard') },
    { label: 'AI Edit', click: () => sendHotkeyAction('ai-edit') },
    { label: 'Translate', click: () => sendHotkeyAction('translate') },
    { type: 'separator' },
    { label: 'Settings', click: () => sendHotkeyAction('open-settings') },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
};

const syncTray = () => {
  if (traySettings.minimizeToTray) {
    createTray();
    return;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
};

app.whenReady().then(() => {
  syncTray();
});

// =====================================================
// GLOBAL HOTKEYS
// =====================================================

// Default hotkey configuration
let currentHotkeys = {
  dictate: 'Alt+X',
  read_clipboard: 'Ctrl+Shift+R',
  stt_paste: 'Alt+Shift+S',
  pause: 'Ctrl+Shift+P',
  stop: 'Ctrl+Shift+S',
  ai_edit: 'Ctrl+Shift+E',
  translate: 'Ctrl+Shift+T',
  speed_up: 'Ctrl+Shift+Up',
  speed_down: 'Ctrl+Shift+Down',
};

// Map actions to navigation routes
const hotkeyActions = {
  dictate: 'dictate-toggle',
  read_clipboard: 'read-clipboard',
  stt_paste: 'stt-paste',
  ai_edit: 'ai-edit',
  translate: 'translate',
  pause: 'pause',
  stop: 'stop',
  speed_up: 'speed-up',
  speed_down: 'speed-down',
};

// Register all global shortcuts
const registerHotkeys = () => {
  // Unregister all first
  globalShortcut.unregisterAll();

  const backgroundActions = new Set(['dictate-toggle', 'stt-paste']);

  for (const [action, accelerator] of Object.entries(currentHotkeys)) {
    if (!accelerator) continue;

    try {
      const success = globalShortcut.register(accelerator, () => {
        const mappedAction = hotkeyActions[action] || action;
        console.log(`[Hotkey] ${accelerator} -> ${mappedAction}`);
        if (mappedAction === 'stt-paste') {
          pasteLastTranscript();
          return;
        }
        const shouldFocus = !backgroundActions.has(mappedAction);
        sendHotkeyAction(mappedAction, { focus: shouldFocus });
      });

      if (!success) {
        console.warn(`[Hotkey] Failed to register: ${accelerator} for ${action}`);
      }
    } catch (err) {
      console.error(`[Hotkey] Error registering ${accelerator}:`, err.message);
    }
  }
};

// Register hotkeys after app is ready
app.whenReady().then(() => {
  registerHotkeys();
});

// Listen for hotkey updates from renderer
ipcMain.on('update-hotkeys', (event, newHotkeys) => {
  console.log('[Hotkey] Updating hotkeys:', newHotkeys);
  currentHotkeys = { ...currentHotkeys, ...newHotkeys };
  registerHotkeys();
});

ipcMain.on('update-tray-settings', (event, settings) => {
  traySettings = {
    minimizeToTray: typeof settings?.minimizeToTray === 'boolean' ? settings.minimizeToTray : traySettings.minimizeToTray,
    showNotifications: typeof settings?.showNotifications === 'boolean' ? settings.showNotifications : traySettings.showNotifications,
  };
  syncTray();
});

ipcMain.on('update-window-controls', (event, { color, symbolColor }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.setTitleBarOverlay({
        color: color || '#030711',
        symbolColor: symbolColor || '#94a3b8',
        height: 40
      });
    } catch (e) {
      console.error('[Window Controls] Failed to update overlay:', e.message);
    }
  }
});

ipcMain.on('stt-overlay-show', () => {
  showOverlay();
});

ipcMain.on('stt-overlay-hide', () => {
  hideOverlay();
});

ipcMain.on('stt-overlay-level', (event, level) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('stt-overlay-level', level);
  }
});

ipcMain.on('stt-overlay-state', (event, state) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('stt-overlay-state', state);
  }
});

ipcMain.on('stt-last-transcript', (event, text) => {
  lastSttTranscript = typeof text === 'string' ? text : '';
});

ipcMain.on('stt-paste', () => {
  pasteLastTranscript();
});

ipcMain.on('show-notification', (event, payload) => {
  if (!traySettings.showNotifications) return;
  try {
    const title = payload?.title || 'Whisperall';
    const body = payload?.body || '';
    const notification = new Notification({ title, body });
    notification.show();
  } catch (err) {
    console.warn('[Notification] Failed to show notification:', err.message);
  }
});

ipcMain.handle('read-clipboard', () => {
  try {
    return clipboard.readText();
  } catch (err) {
    console.error('[Clipboard] Read failed:', err.message);
    return '';
  }
});

// Test IPC - simple ping to verify IPC works
ipcMain.handle('ping', () => {
  console.log('[IPC] ping received, sending pong');
  return { pong: true, timestamp: Date.now() };
});

// Open external URL in default browser
ipcMain.handle('open-external', async (event, url) => {
  console.log('[IPC] Opening external URL:', url);
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('[IPC] Failed to open external URL:', error);
    return { success: false, error: error.message };
  }
});

// Unregister all on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// =====================================================
// IPC NET FETCH - Uses Node.js native http (electron-fetch hangs on GET after POST)
// =====================================================
console.log('[Main] net-fetch IPC handler registered');

ipcMain.handle('net-fetch', async (event, url, options = {}) => {
  const method = options.method || 'GET';
  console.log('[IPC net-fetch] Request:', method, url);

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: options.headers || {},
      timeout: 30000,  // 30 seconds for longer operations like resume
    };

    const req = http.request(requestOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        console.log('[IPC net-fetch] Status:', res.statusCode);
        console.log('[IPC net-fetch] Body:', body.substring(0, 200));
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          headers: res.headers,
          body: body,
        });
      });
    });

    req.on('error', (error) => {
      console.error('[IPC net-fetch] Error:', error.message);
      reject(error);
    });

    req.on('timeout', () => {
      console.error('[IPC net-fetch] Timeout');
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
});
