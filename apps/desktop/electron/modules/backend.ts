import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type BackendEvent = { kind: 'error' | 'exit' | 'start'; message: string; code?: number | null };

function broadcast(evt: BackendEvent): void {
  try {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('backend:event', evt);
    }
  } catch { /* ignore */ }
}

function readLogTail(logPath: string, lines: number): string {
  try {
    if (!fs.existsSync(logPath)) return '';
    const content = fs.readFileSync(logPath, 'utf8');
    const parts = content.trim().split(/\r?\n/);
    return parts.slice(-lines).join('\n');
  } catch (e) {
    return `(failed to read log: ${(e as Error).message})`;
  }
}

let ipcRegistered = false;
/**
 * Per-renderer log-stream state. Multiple windows (main + overlay) can
 * subscribe; we track each one's polling timer so a single stop stops just
 * that subscription. The watcher reads incremental bytes from `lastSize` to
 * the current file size on each tick, which is robust against the buffered
 * write patterns of uvicorn / FastAPI logging (fs.watch on Windows misses
 * events at high write rates).
 */
type LogStreamState = {
  timer: ReturnType<typeof setInterval>;
  lastSize: number;
};
const logStreams = new Map<number, LogStreamState>();

function registerIpcOnce(getLogPath: () => string): void {
  if (ipcRegistered) return;
  ipcRegistered = true;
  ipcMain.handle('backend:log-tail', (_e, lines: number = 500) => readLogTail(getLogPath(), lines));

  ipcMain.handle('backend:log-stream-start', (e) => {
    const sender = e.sender;
    const webId = sender.id;
    // Replace any existing stream for this renderer (idempotent).
    const existing = logStreams.get(webId);
    if (existing) clearInterval(existing.timer);

    const logPath = getLogPath();
    let lastSize = 0;
    try {
      lastSize = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
    } catch { /* ignore — we'll try again on first tick */ }

    const tick = () => {
      // Renderer may be destroyed between ticks (navigate/close). Stop cleanly.
      if (sender.isDestroyed()) {
        const s = logStreams.get(webId);
        if (s) { clearInterval(s.timer); logStreams.delete(webId); }
        return;
      }
      try {
        if (!fs.existsSync(logPath)) return;
        const { size } = fs.statSync(logPath);
        if (size === lastSize) return;
        // File truncated (logrotate etc.) — read from start.
        if (size < lastSize) lastSize = 0;
        const fd = fs.openSync(logPath, 'r');
        try {
          const length = size - lastSize;
          const buf = Buffer.alloc(length);
          fs.readSync(fd, buf, 0, length, lastSize);
          lastSize = size;
          const chunk = buf.toString('utf8');
          // Split into lines but keep the trailing partial (next tick completes it).
          const lines = chunk.split(/\r?\n/).filter((l) => l.length > 0);
          if (lines.length > 0) sender.send('backend:log-line', lines);
        } finally {
          fs.closeSync(fd);
        }
      } catch (err) {
        // Don't kill the stream on transient read errors (Windows file locks
        // during write). Just skip this tick.
        void err;
      }
    };

    // 500 ms is fast enough for live diagnostics without being pathological;
    // logs are burst-written so most ticks are no-ops when the backend is idle.
    const timer = setInterval(tick, 500);
    logStreams.set(webId, { timer, lastSize });

    // Clean up automatically if the renderer goes away.
    sender.once('destroyed', () => {
      const s = logStreams.get(webId);
      if (s) { clearInterval(s.timer); logStreams.delete(webId); }
    });
    return { ok: true };
  });

  ipcMain.handle('backend:log-stream-stop', (e) => {
    const s = logStreams.get(e.sender.id);
    if (s) { clearInterval(s.timer); logStreams.delete(e.sender.id); }
    return { ok: true };
  });
}

const HEALTH_URL = 'http://127.0.0.1:8080/health';
const START_TIMEOUT_MS = 30_000;

let backendProc: ChildProcess | null = null;
let startError = '';
/**
 * Set to true by stopBundledBackend() before we deliberately kill the child.
 * On Windows, TerminateProcess (the OS primitive backing ChildProcess.kill)
 * returns an exit code of 4294967295 / 0xFFFFFFFF / -1 when the process is
 * force-killed — which is non-zero, non-null, and would otherwise look
 * identical to a real crash. Without this flag, every clean app shutdown
 * produced a persistent "Backend exited unexpectedly (code 4294967295)"
 * notification that carried over to the next session via the persisted
 * notifications store.
 */
let intentionalShutdown = false;
/** Exit codes that Windows returns for terminated-not-crashed. */
const WINDOWS_TERMINATION_CODES = new Set<number>([
  -1,
  0xFFFFFFFF, // 4294967295 — TerminateProcess default on Windows
  0xC000013A, // 3221225786 — STATUS_CONTROL_C_EXIT
  1,          // Node's default kill() exit code on some Windows builds
]);

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
  registerIpcOnce(() => getBackendPaths().logPath);

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
  intentionalShutdown = false;
  log(`Starting backend from ${paths.root}`);
  log(`Python: ${paths.pythonExe}`);
  log(`Log: ${paths.logPath}`);

  // Previously we opened the log with 'w' which TRUNCATED the file on every
  // backend start. That meant if the user closed the app right after a
  // failure to check the logs, the whole context was lost on reopen. Now:
  // 1. If the old log is bigger than MAX_LOG_BYTES, rotate it to .prev so
  //    the file doesn't grow unbounded over months.
  // 2. Open the new log in 'a' (append) mode so the current session's lines
  //    are added on top of whatever's already there.
  // 3. Write a session-boundary marker so the user can tell sessions apart
  //    in the tail view.
  const MAX_LOG_BYTES = 4 * 1024 * 1024;  // 4 MB — generous for debug, bounded
  try {
    if (fs.existsSync(paths.logPath)) {
      const { size } = fs.statSync(paths.logPath);
      if (size > MAX_LOG_BYTES) {
        const prev = paths.logPath + '.prev';
        try { if (fs.existsSync(prev)) fs.unlinkSync(prev); } catch { /* ignore */ }
        try { fs.renameSync(paths.logPath, prev); } catch { /* ignore */ }
      }
    }
  } catch { /* swallow — logging should never crash startup */ }
  const out = fs.openSync(paths.logPath, 'a');
  try {
    const marker = `\n===== backend session started at ${new Date().toISOString()} =====\n`;
    fs.writeSync(out, marker);
  } catch { /* ignore */ }

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

  broadcast({ kind: 'start', message: `Backend starting from ${paths.root}` });

  backendProc.on('error', (err) => {
    startError = err.message;
    log(`Backend process error: ${err.message}`);
    broadcast({ kind: 'error', message: err.message });
  });

  backendProc.on('exit', (code, signal) => {
    log(`Backend process exited with code=${code} signal=${signal ?? 'null'} intentional=${intentionalShutdown}`);
    // Suppress the user-facing notification for any kill the app initiated
    // itself (app shutdown, explicit stopBundledBackend). Also suppress when
    // the code matches a known Windows "terminated" value — belt and
    // suspenders against races where kill() fires before the flag is set.
    if (intentionalShutdown) return;
    if (code === 0 || code === null) return;
    if (typeof code === 'number' && WINDOWS_TERMINATION_CODES.has(code)) {
      log(`Suppressed Windows-termination exit code ${code} as clean stop`);
      return;
    }
    const tail = readLogTail(paths.logPath, 20);
    broadcast({ kind: 'exit', message: `Backend exited unexpectedly (code ${code}).\n\n${tail}`, code });
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
  // Set the flag BEFORE calling kill() so the on('exit') handler — which may
  // fire synchronously on some platforms — sees the shutdown as intentional
  // and skips the user-facing notification. Windows TerminateProcess produces
  // exit=4294967295 which otherwise triggers the "unexpected" banner.
  intentionalShutdown = true;
  if (backendProc && backendProc.exitCode === null && !backendProc.killed) {
    log('Stopping backend (intentional)');
    backendProc.kill();
  }
  backendProc = null;
}
