const electron = require('electron');
const app = electron.app;
if (!app) {
  console.error('Electron main process not available. Run via "npm start" in the electron folder or ChatterboxUI.bat.');
  process.exit(1);
}
const { BrowserWindow, dialog, Tray, Menu, globalShortcut, ipcMain, clipboard, Notification, shell, session } = electron;
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
const DEFAULT_BACKEND_PORT = 8080;
const envPort = parseInt(process.env.WHISPERALL_BACKEND_PORT || process.env.BACKEND_PORT || '', 10);
const BACKEND_PORT = Number.isFinite(envPort) ? envPort : DEFAULT_BACKEND_PORT;
process.env.WHISPERALL_BACKEND_PORT = String(BACKEND_PORT);
let traySettings = {
  minimizeToTray: true,
  showNotifications: true,
};
let lastSttTranscript = '';

// Subtitle overlay for loopback transcription
let subtitleOverlayWindow;
let subtitleOverlaySaveTimer;
const subtitleOverlayStatePath = path.join(app.getPath('userData'), 'subtitle-overlay.json');
let subtitleOverlayState = {
  width: 500,
  height: 300,
  x: null,
  y: null,
};

// Widget overlay for multi-module quick access
let widgetOverlayWindow;
let widgetOverlaySaveTimer;
const widgetOverlayStatePath = path.join(app.getPath('userData'), 'widget-overlay.json');
let widgetOverlayState = {
  width: 500,
  height: 350,
  x: null,
  y: null,
  lastModule: 'reader',
};

// STT settings for hotkey mode
let sttSettings = {
  hotkey_mode: 'toggle', // 'toggle' | 'hold'
  overlay_enabled: true,
  overlay_always_on: false,
};
let dictateHoldActive = false; // Track if dictation is active in hold mode

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

const configureMediaPermissions = () => {
  try {
    const defaultSession = session.defaultSession;
    if (!defaultSession) return;

    defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      if (permission === 'media') {
        const mediaTypes = details?.mediaTypes || [];
        if (mediaTypes.includes('audio')) {
          callback(true);
          return;
        }
      }
      callback(false);
    });

    defaultSession.setPermissionCheckHandler((webContents, permission, origin, details) => {
      if (permission === 'media') {
        const mediaTypes = details?.mediaTypes || [];
        return mediaTypes.includes('audio');
      }
      return false;
    });
  } catch (err) {
    console.warn('[Permissions] Failed to configure media permissions:', err.message);
  }
};

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
  // Also send to widget overlay if visible
  if (widgetOverlayWindow && !widgetOverlayWindow.isDestroyed() && widgetOverlayWindow.isVisible()) {
    widgetOverlayWindow.webContents.send('global-hotkey', action);
  }
};

// Subtitle Overlay Window Management
const loadSubtitleOverlayState = () => {
  try {
    if (fs.existsSync(subtitleOverlayStatePath)) {
      const raw = fs.readFileSync(subtitleOverlayStatePath, 'utf8');
      const saved = JSON.parse(raw);
      subtitleOverlayState = {
        ...subtitleOverlayState,
        ...saved,
      };
    }
  } catch (err) {
    console.warn('[SubtitleOverlay] Failed to load state:', err.message);
  }
};

const saveSubtitleOverlayState = (bounds) => {
  subtitleOverlayState = {
    ...subtitleOverlayState,
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
  };
  try {
    fs.writeFileSync(subtitleOverlayStatePath, JSON.stringify(subtitleOverlayState, null, 2));
  } catch (err) {
    console.warn('[SubtitleOverlay] Failed to save state:', err.message);
  }
};

const scheduleSubtitleOverlaySave = () => {
  if (subtitleOverlaySaveTimer) {
    clearTimeout(subtitleOverlaySaveTimer);
  }
  subtitleOverlaySaveTimer = setTimeout(() => {
    if (subtitleOverlayWindow && !subtitleOverlayWindow.isDestroyed()) {
      saveSubtitleOverlayState(subtitleOverlayWindow.getBounds());
    }
  }, 250);
};

const getSubtitleOverlayBounds = () => {
  const bounds = {
    width: subtitleOverlayState.width || 500,
    height: subtitleOverlayState.height || 300,
  };
  if (Number.isFinite(subtitleOverlayState.x) && Number.isFinite(subtitleOverlayState.y)) {
    bounds.x = subtitleOverlayState.x;
    bounds.y = subtitleOverlayState.y;
  }
  return bounds;
};

const ensureSubtitleOverlayWindow = () => {
  if (subtitleOverlayWindow && !subtitleOverlayWindow.isDestroyed()) return subtitleOverlayWindow;
  loadSubtitleOverlayState();
  subtitleOverlayWindow = new BrowserWindow({
    ...getSubtitleOverlayBounds(),
    frame: false,
    transparent: true,
    resizable: true,
    show: false,
    focusable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    minWidth: 300,
    minHeight: 150,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  subtitleOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
  subtitleOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  subtitleOverlayWindow.loadFile(path.join(__dirname, 'subtitle-overlay.html'));

  subtitleOverlayWindow.on('move', scheduleSubtitleOverlaySave);
  subtitleOverlayWindow.on('resize', scheduleSubtitleOverlaySave);
  subtitleOverlayWindow.on('closed', () => {
    subtitleOverlayWindow = null;
  });

  return subtitleOverlayWindow;
};

const showSubtitleOverlay = () => {
  const windowRef = ensureSubtitleOverlayWindow();
  if (!windowRef) return;
  if (!windowRef.isVisible()) {
    windowRef.showInactive();
  }
};

const hideSubtitleOverlay = () => {
  if (subtitleOverlayWindow && !subtitleOverlayWindow.isDestroyed()) {
    subtitleOverlayWindow.hide();
  }
};

const sendSubtitleMessage = (message) => {
  if (subtitleOverlayWindow && !subtitleOverlayWindow.isDestroyed()) {
    subtitleOverlayWindow.webContents.send('subtitle-message', message);
  }
};

// =====================================================
// WIDGET OVERLAY FUNCTIONS
// =====================================================

const loadWidgetOverlayState = () => {
  try {
    if (fs.existsSync(widgetOverlayStatePath)) {
      const raw = fs.readFileSync(widgetOverlayStatePath, 'utf8');
      const saved = JSON.parse(raw);
      widgetOverlayState = { ...widgetOverlayState, ...saved };
    }
  } catch (err) {
    console.warn('[WidgetOverlay] Failed to load state:', err.message);
  }
};

const saveWidgetOverlayState = (bounds, module) => {
  widgetOverlayState = {
    ...widgetOverlayState,
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    lastModule: module || widgetOverlayState.lastModule,
  };
  try {
    fs.writeFileSync(widgetOverlayStatePath, JSON.stringify(widgetOverlayState, null, 2));
  } catch (err) {
    console.warn('[WidgetOverlay] Failed to save state:', err.message);
  }
};

const scheduleWidgetOverlaySave = () => {
  if (widgetOverlaySaveTimer) {
    clearTimeout(widgetOverlaySaveTimer);
  }
  widgetOverlaySaveTimer = setTimeout(() => {
    if (widgetOverlayWindow && !widgetOverlayWindow.isDestroyed()) {
      saveWidgetOverlayState(widgetOverlayWindow.getBounds());
    }
  }, 250);
};

const getWidgetOverlayBounds = () => {
  // Always start at idle size (80x12 visible + 80px padding)
  const bounds = {
    width: 160,  // 80 + 80
    height: 92,  // 12 + 80
  };
  // Restore saved position if available
  if (Number.isFinite(widgetOverlayState.x) && Number.isFinite(widgetOverlayState.y)) {
    bounds.x = widgetOverlayState.x;
    bounds.y = widgetOverlayState.y;
  }
  return bounds;
};

const ensureWidgetOverlayWindow = () => {
  if (widgetOverlayWindow && !widgetOverlayWindow.isDestroyed()) {
    return widgetOverlayWindow;
  }

  loadWidgetOverlayState();

  widgetOverlayWindow = new BrowserWindow({
    ...getWidgetOverlayBounds(),
    frame: false,
    transparent: true,
    resizable: true,  // REQUIRED: Must be true for -webkit-app-region: drag to work on Windows
    show: false,
    focusable: false,  // Don't steal focus from other apps
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,  // We use CSS shadows
    thickFrame: false, // Windows: remove resize border
    backgroundColor: '#00000000', // Essential for Windows transparency
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,  // Keep events running when unfocused
    },
  });

  widgetOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
  widgetOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  widgetOverlayWindow.loadFile(path.join(__dirname, 'widget-overlay.html'));

  // DEBUG: Open DevTools to see console logs - uncomment for debugging
  // widgetOverlayWindow.webContents.openDevTools({ mode: 'detach' });

  widgetOverlayWindow.on('move', scheduleWidgetOverlaySave);
  widgetOverlayWindow.on('resize', scheduleWidgetOverlaySave);
  widgetOverlayWindow.on('closed', () => {
    widgetOverlayWindow = null;
  });

  return widgetOverlayWindow;
};

const showWidgetOverlay = (module = null) => {
  const windowRef = ensureWidgetOverlayWindow();
  if (!windowRef) return;

  if (!windowRef.isVisible()) {
    // Only center if we don't have a valid saved position (e.g. first run)
    // or if the window is off-screen (safety check could be added here)
    if (!Number.isFinite(widgetOverlayState.x) || !Number.isFinite(widgetOverlayState.y)) {
      try {
        windowRef.center();
      } catch (e) { }
    }
    windowRef.show();
  }
  windowRef.focus();

  // If specific module requested, notify the widget
  if (module) {
    windowRef.webContents.send('widget-switch-module', module);
  }
};

const hideWidgetOverlay = () => {
  if (widgetOverlayWindow && !widgetOverlayWindow.isDestroyed()) {
    widgetOverlayWindow.hide();
  }
};

const toggleWidgetOverlay = (module = null) => {
  if (widgetOverlayWindow && !widgetOverlayWindow.isDestroyed() && widgetOverlayWindow.isVisible()) {
    hideWidgetOverlay();
  } else {
    showWidgetOverlay(module);
  }
};

const sendWidgetHotkeyAction = (action) => {
  if (widgetOverlayWindow && !widgetOverlayWindow.isDestroyed()) {
    // Wait for page to be ready before sending
    if (widgetOverlayWindow.webContents.isLoading()) {
      widgetOverlayWindow.webContents.once('did-finish-load', () => {
        widgetOverlayWindow.webContents.send('global-hotkey', action);
      });
    } else {
      widgetOverlayWindow.webContents.send('global-hotkey', action);
    }
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
  // User requested text to remain in clipboard, so we do NOT restore previous clipboard
  // setTimeout(() => restoreClipboard(snapshot), 150);
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

    // Load STT settings for hotkey mode
    await loadSttSettings();

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
app.whenReady().then(() => {
  configureMediaPermissions();
});

app.whenReady().then(async () => {
  await createWindow();
  // Pre-create widget overlay for instant hotkey response
  setTimeout(() => {
    console.log('[Widget] Pre-creating widget overlay for instant response...');
    ensureWidgetOverlayWindow();
  }, 1000);
});

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
    { label: 'Open Widget', click: () => showWidgetOverlay('reader') },
    { type: 'separator' },
    { label: 'Text to Speech', click: () => sendHotkeyAction('open-tts') },
    { label: 'Dictate (STT)', click: () => sendHotkeyAction('dictate-toggle') },
    { label: 'Reader (Clipboard)', click: () => { showWidgetOverlay('reader'); sendWidgetHotkeyAction('read-clipboard'); } },
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

// Load STT settings from backend
const loadSttSettings = async () => {
  try {
    const response = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${BACKEND_PORT}/api/settings`, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
    if (response?.stt) {
      sttSettings = {
        hotkey_mode: response.stt.hotkey_mode || 'toggle',
        overlay_enabled: response.stt.overlay_enabled !== false,
        // Default to FALSE for always_on to prioritize the new widget unless explicitly enabled
        overlay_always_on: response.stt.overlay_always_on || false,
      };
      console.log('[STT] Loaded settings:', sttSettings);

      // If always on, show widget immediately
      if (sttSettings.overlay_always_on && sttSettings.overlay_enabled) {
        setTimeout(() => {
          showWidgetOverlay();
        }, 1000);
      }
    }
  } catch (err) {
    console.warn('[STT] Failed to load settings:', err.message);
  }
};

// Register all global shortcuts
const registerHotkeys = () => {
  // Unregister all first
  globalShortcut.unregisterAll();

  // Add 'read-clipboard' to background actions so sendHotkeyAction doesn't focus main window
  // if it accidentally falls through (though we handle it explicitly below)
  const backgroundActions = new Set(['dictate-toggle', 'dictate-start', 'dictate-stop', 'stt-paste', 'read-clipboard']);

  for (const [action, accelerator] of Object.entries(currentHotkeys)) {
    if (!accelerator) continue;

    try {
      const success = globalShortcut.register(accelerator, () => {
        let mappedAction = hotkeyActions[action] || action;

        // Handle dictate hotkey based on mode
        if (action === 'dictate') {
          if (sttSettings.hotkey_mode === 'hold') {
            // Hold mode: toggle between start/stop on each press
            if (dictateHoldActive) {
              mappedAction = 'dictate-stop';
              dictateHoldActive = false;
            } else {
              mappedAction = 'dictate-start';
              dictateHoldActive = true;
            }
          } else {
            // Toggle mode: use dictate-toggle
            mappedAction = 'dictate-toggle';
          }
        }

        console.log(`[Hotkey] ${accelerator} -> ${mappedAction}`);

        // Show widget immediately for dictation actions
        if ((mappedAction === 'dictate-toggle' || mappedAction === 'dictate-start') && sttSettings.overlay_enabled) {
          showWidgetOverlay();
          sendWidgetHotkeyAction(mappedAction);
          return;
        }

        if (mappedAction === 'stt-paste') {
          pasteLastTranscript();
          return;
        }

        // Show widget overlay instead of main window for read-clipboard
        // Check both mapped action and raw action key to be safe
        if (mappedAction === 'read-clipboard' || action === 'read_clipboard') {
          console.log('[Hotkey] Opening Widget Overlay for Reader');
          showWidgetOverlay('reader');
          sendWidgetHotkeyAction('read-clipboard');
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

// STT overlay handlers - forward to widget overlay
ipcMain.on('stt-overlay-show', () => {
  showWidgetOverlay();
});

ipcMain.on('stt-overlay-hide', (event, forceHide = false) => {
  if (forceHide || !sttSettings.overlay_always_on) {
    hideWidgetOverlay();
  }
});

ipcMain.on('stt-overlay-resize', (event, { width, height }) => {
  // Widget handles its own resize, ignore old overlay resize requests
});

ipcMain.on('stt-overlay-level', (event, level) => {
  // Forward audio level to widget
  if (widgetOverlayWindow && !widgetOverlayWindow.isDestroyed()) {
    widgetOverlayWindow.webContents.send('widget-audio-level', level);
  }
});

ipcMain.on('stt-overlay-state', (event, state) => {
  // Widget handles its own state, but forward for compatibility
  if (widgetOverlayWindow && !widgetOverlayWindow.isDestroyed()) {
    // Forward the explicit state to the widget so it can show 'transcribing', 'done', etc.
    widgetOverlayWindow.webContents.send('widget-state-update', state);

    // Legacy mapping (keep for now to be safe, but the widget should use widget-state-update primarily)
    if (state === 'listening' || state === 'recording') {
      widgetOverlayWindow.webContents.send('global-hotkey', 'dictate-start');
    }
  }
});

ipcMain.on('stt-last-transcript', (event, text) => {
  lastSttTranscript = typeof text === 'string' ? text : '';
});

ipcMain.on('stt-paste', (event, text) => {
  // Use provided text or fall back to stored transcript
  const textToPaste = typeof text === 'string' && text ? text : lastSttTranscript;
  if (textToPaste) {
    // Update stored transcript if text was provided
    if (text) lastSttTranscript = text;
    pasteLastTranscript();
  }
});

ipcMain.on('stt-settings-update', (event, settings) => {
  if (settings) {
    sttSettings = {
      hotkey_mode: settings.hotkey_mode || sttSettings.hotkey_mode,
      overlay_enabled: settings.overlay_enabled !== undefined ? settings.overlay_enabled : sttSettings.overlay_enabled,
      overlay_always_on: settings.overlay_always_on !== undefined ? settings.overlay_always_on : sttSettings.overlay_always_on,
    };

    // Show widget if always_on was just enabled
    if (sttSettings.overlay_always_on && sttSettings.overlay_enabled) {
      showWidgetOverlay();
    }
    // Reset hold state when mode changes
    dictateHoldActive = false;
    console.log('[STT] Settings updated:', sttSettings);
  }
});

ipcMain.on('stt-reload-settings', () => {
  loadSttSettings().then(() => {
    // Reset hold state when settings are reloaded
    dictateHoldActive = false;
  });
});

// Subtitle overlay IPC handlers
ipcMain.on('subtitle-overlay-show', () => {
  showSubtitleOverlay();
});

ipcMain.on('subtitle-overlay-hide', () => {
  hideSubtitleOverlay();
});

ipcMain.on('subtitle-overlay-message', (event, message) => {
  sendSubtitleMessage(message);
});

ipcMain.on('subtitle-overlay-clear', () => {
  sendSubtitleMessage({ type: 'clear' });
});

// Widget overlay IPC handlers
ipcMain.on('widget-resize', (event, { width, height }) => {
  if (!widgetOverlayWindow || widgetOverlayWindow.isDestroyed()) return;

  // Get current bounds to calculate centered position
  const currentBounds = widgetOverlayWindow.getBounds();
  const deltaW = width - currentBounds.width;
  const deltaH = height - currentBounds.height;

  // Calculate new position to keep widget centered during resize
  const newX = Math.round(currentBounds.x - deltaW / 2);
  const newY = Math.round(currentBounds.y - deltaH / 2);

  widgetOverlayWindow.setBounds({
    x: newX,
    y: newY,
    width: Math.round(width),
    height: Math.round(height)
  });
});

ipcMain.on('widget-overlay-show', (event, module) => {
  showWidgetOverlay(module);
});

ipcMain.on('widget-overlay-hide', () => {
  hideWidgetOverlay();
});

ipcMain.on('widget-overlay-toggle', (event, module) => {
  toggleWidgetOverlay(module);
});

ipcMain.on('widget-move', (event, { x, y }) => {
  if (!widgetOverlayWindow || widgetOverlayWindow.isDestroyed()) return;
  const bounds = widgetOverlayWindow.getBounds();
  widgetOverlayWindow.setBounds({
    x: bounds.x + x,
    y: bounds.y + y,
    width: bounds.width,
    height: bounds.height
  });
});

ipcMain.on('widget-save-module', (event, moduleName) => {
  if (widgetOverlayWindow && !widgetOverlayWindow.isDestroyed()) {
    saveWidgetOverlayState(widgetOverlayWindow.getBounds(), moduleName);
  }
});

ipcMain.handle('widget-get-state', () => {
  loadWidgetOverlayState();
  return widgetOverlayState;
});

// Widget paste text (for dictation auto-paste)
ipcMain.on('widget-paste-text', async (event, text) => {
  if (!text) return;
  lastSttTranscript = text;
  await pasteLastTranscript();
});

// Widget undo paste (sends Ctrl+Z to active window)
ipcMain.on('widget-undo-paste', async () => {
  if (process.platform === 'win32') {
    const proc = spawn(
      'powershell',
      ['-NoProfile', '-Command', "$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys('^z')"],
      { windowsHide: true }
    );
    proc.on('error', (err) => console.warn('[Widget] Undo failed:', err.message));
  } else if (process.platform === 'darwin') {
    const proc = spawn(
      'osascript',
      ['-e', 'tell application "System Events" to keystroke "z" using command down'],
      { stdio: 'ignore' }
    );
    proc.on('error', (err) => console.warn('[Widget] Undo failed:', err.message));
  }
});

// Widget action trigger (widget buttons send actions to main process)
ipcMain.on('widget-trigger-action', (event, action) => {
  console.log('[Widget] Action triggered:', action);
  // Forward to main window for processing
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('global-hotkey', action);
  }
});

ipcMain.on('show-main-window', () => {
  showMainWindow();
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
