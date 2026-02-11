import { app } from 'electron';
import path from 'node:path';
import { getMainWindow, showMainWindow } from './windows.js';

const PROTOCOL = 'whisperall';

function getProtocolLaunchPath(): string | null {
  const arg = process.argv[1];
  if (!arg) return null;
  return path.isAbsolute(arg) ? arg : path.resolve(arg);
}

export function registerProtocol(): void {
  if (process.defaultApp) {
    // Dev mode: pass absolute app path, never "." (Windows may resolve it to System32)
    const launchPath = getProtocolLaunchPath();
    if (launchPath) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [launchPath]);
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

export function handleAuthUrl(url: string): void {
  if (!url.startsWith(`${PROTOCOL}://auth/`)) return;
  const win = getMainWindow();
  if (win) {
    win.webContents.send('auth:callback', url);
    showMainWindow();
  }
}
