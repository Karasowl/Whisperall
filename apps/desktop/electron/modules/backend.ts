import { app } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const HEALTH_URL = 'http://127.0.0.1:8080/health';
const START_TIMEOUT_MS = 30_000;

let backendProc: ChildProcess | null = null;
let startError = '';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(msg: string): void {
  console.log(`[backend] ${msg}`);
}

function getBackendPaths() {
  const root = path.join(process.resourcesPath, 'backend');
  return {
    root,
    pythonExe: path.join(root, 'python-runtime', 'python.exe'),
    sitePackages: path.join(root, 'site-packages'),
    apiDir: path.join(root, 'api'),
    logPath: path.join(app.getPath('userData'), 'backend.log'),
  };
}

async function isHealthy(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL);
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureBundledBackend(): Promise<void> {
  if (!app.isPackaged) {
    log('Dev mode — skipping bundled backend');
    return;
  }

  if (await isHealthy()) {
    log('Backend already healthy');
    return;
  }

  const paths = getBackendPaths();

  // Check if bundle exists
  if (!fs.existsSync(paths.root)) {
    throw new Error(
      `Backend bundle not found at ${paths.root}. The installer may be incomplete — reinstall the app.`
    );
  }

  // Check required files
  const checks = [
    { path: paths.pythonExe, label: 'python.exe' },
    { path: paths.sitePackages, label: 'site-packages' },
    { path: path.join(paths.apiDir, 'app', 'main.py'), label: 'app/main.py' },
    { path: path.join(paths.apiDir, '.env'), label: '.env' },
  ];
  for (const c of checks) {
    if (!fs.existsSync(c.path)) {
      throw new Error(`Missing bundled file: ${c.label} (expected at ${c.path})`);
    }
  }

  startError = '';
  log(`Starting backend from ${paths.root}`);
  log(`Python: ${paths.pythonExe}`);
  log(`Log: ${paths.logPath}`);

  const out = fs.openSync(paths.logPath, 'w');

  // PYTHONPATH: site-packages + api dir so "from app.xxx import" works
  const pythonPath = [paths.sitePackages, paths.apiDir].join(';');

  backendProc = spawn(
    paths.pythonExe,
    ['-m', 'uvicorn', 'app.main:asgi_app', '--host', '127.0.0.1', '--port', '8080'],
    {
      cwd: paths.apiDir,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONPATH: pythonPath,
        PYTHONUNBUFFERED: '1',
        PYTHONUTF8: '1',
        // Do NOT set PYTHONHOME — embeddable Python uses ._pth instead
      },
      stdio: ['ignore', out, out],
    },
  );

  backendProc.on('error', (err) => {
    startError = err.message;
    log(`Backend process error: ${err.message}`);
  });

  backendProc.on('exit', (code) => {
    log(`Backend process exited with code ${code}`);
  });

  // Poll for health
  for (let waited = 0; waited < START_TIMEOUT_MS; waited += 500) {
    if (await isHealthy()) {
      log(`Backend healthy after ${waited}ms`);
      return;
    }
    if (startError) break;
    if (backendProc.exitCode !== null) {
      startError = `Process exited with code ${backendProc.exitCode}`;
      break;
    }
    await delay(500);
  }

  // Read last lines of log for diagnostics
  let logTail = '';
  try {
    fs.closeSync(out);
    const logContent = fs.readFileSync(paths.logPath, 'utf8');
    const lines = logContent.trim().split('\n');
    logTail = lines.slice(-10).join('\n');
  } catch { /* ignore */ }

  const suffix = startError ? `\n\nError: ${startError}` : '';
  const logInfo = logTail ? `\n\nLog output:\n${logTail}` : '';
  throw new Error(
    `Backend did not start within ${START_TIMEOUT_MS / 1000}s.` +
    `\nLog file: ${paths.logPath}${suffix}${logInfo}`
  );
}

export function stopBundledBackend(): void {
  if (backendProc && backendProc.exitCode === null && !backendProc.killed) {
    log('Stopping backend');
    backendProc.kill();
  }
  backendProc = null;
}
