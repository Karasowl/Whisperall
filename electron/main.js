const { app, BrowserWindow, dialog, Tray, Menu, globalShortcut, ipcMain, clipboard } = require('electron');
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

// Kill any process using our port
const killPortProcess = () => {
  try {
    // Find process using the port
    const result = execSync(`netstat -ano | findstr :${BACKEND_PORT} | findstr LISTENING`, { encoding: 'utf8' });
    const lines = result.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') {
        console.log(`Killing process ${pid} on port ${BACKEND_PORT}`);
        try {
          execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf8' });
        } catch (e) {
          // Process might already be dead
        }
      }
    }
  } catch (e) {
    // No process on port, that's fine
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
  // Always use backend to serve frontend (it serves static files)
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

const sendHotkeyAction = (action) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    mainWindow.webContents.send('global-hotkey', action);
  }
};

// Check if backend is ready
const waitForBackend = (retries = 30) => {
  return new Promise((resolve, reject) => {
    const check = (attempt) => {
      const req = http.request({
        hostname: 'localhost',
        port: BACKEND_PORT,
        path: '/api/health',
        method: 'GET',
        timeout: 1000
      }, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry(attempt);
        }
      });

      req.on('error', () => retry(attempt));
      req.on('timeout', () => {
        req.destroy();
        retry(attempt);
      });
      req.end();
    };

    const retry = (attempt) => {
      if (attempt >= retries) {
        reject(new Error('Backend failed to start'));
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

    console.log('Starting backend...');
    console.log('Python:', pythonPath);
    console.log('Script:', mainScript);

    backendProcess = spawn(pythonPath, [mainScript], {
      cwd: backendPath,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

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
      console.error('Failed to start backend:', err);
      reject(err);
    });

    backendProcess.on('close', (code) => {
      console.log(`Backend exited with code ${code}`);
      if (code !== 0 && mainWindow) {
        dialog.showErrorBox('Backend Error', 'The backend process has stopped unexpectedly.');
      }
    });

    // Give it a moment to start
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
    backgroundColor: '#0b0f14',
    title: 'Whisperall'
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
    if (!isQuitting && tray) {
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
  if (tray && process.platform !== 'darwin') {
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

app.whenReady().then(() => {
  createTray();
});

// =====================================================
// GLOBAL HOTKEYS
// =====================================================

// Default hotkey configuration
let currentHotkeys = {
  dictate: 'Alt+X',
  read_clipboard: 'Ctrl+Shift+R',
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

  for (const [action, accelerator] of Object.entries(currentHotkeys)) {
    if (!accelerator) continue;

    try {
      const success = globalShortcut.register(accelerator, () => {
        const mappedAction = hotkeyActions[action] || action;
        console.log(`[Hotkey] ${accelerator} -> ${mappedAction}`);
        sendHotkeyAction(mappedAction);
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
