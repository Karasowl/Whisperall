import { ipcMain, desktopCapturer, Notification, shell, app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { showMainWindow, getMainWindow } from './windows.js';
import {
  showOverlay, hideOverlay, toggleOverlay, resizeOverlay, setOverlayIgnoreMouse, sendSubtitleText,
  startOverlayDrag, moveOverlayDrag, endOverlayDrag, resetOverlayPosition,
} from './overlay.js';
import { updateHotkeys, updateSttSettings, setLastDictationText } from './hotkeys.js';
import { updateTraySettings, getTraySettings } from './tray.js';
import { pasteText, undoPaste, readClipboard } from './clipboard.js';

function getAuthStoragePath(): string {
  return path.join(app.getPath('userData'), 'auth-storage.json');
}

function isValidAuthStorageKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && key.length <= 200;
}

async function readAuthStorage(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(getAuthStoragePath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const entries = Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => (
      typeof entry[0] === 'string' && typeof entry[1] === 'string'
    ));
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

async function writeAuthStorage(storage: Record<string, string>): Promise<void> {
  const storagePath = getAuthStoragePath();
  await fs.mkdir(path.dirname(storagePath), { recursive: true });
  await fs.writeFile(storagePath, JSON.stringify(storage), 'utf8');
}

export function registerIpcHandlers(): void {
  // --- Hotkeys ---
  ipcMain.on('update-hotkeys', (_e, hotkeys) => {
    updateHotkeys(hotkeys);
  });

  ipcMain.on('update-stt-settings', (_e, settings) => {
    updateSttSettings(settings);
  });

  ipcMain.on('set-dictation-text', (_e, text: string) => {
    setLastDictationText(text);
  });

  // --- Overlay ---
  ipcMain.on('overlay:show', (_e, module?: string) => {
    showOverlay(module);
  });

  ipcMain.on('overlay:hide', () => {
    hideOverlay();
  });

  ipcMain.on('overlay:toggle', (_e, module?: string) => {
    toggleOverlay(module);
  });

  ipcMain.on('overlay:resize', (_e, { width, height }: { width: number; height: number }) => {
    resizeOverlay(width, height);
  });

  ipcMain.on('overlay:ignore-mouse', (_e, ignore: boolean) => {
    setOverlayIgnoreMouse(ignore);
  });

  ipcMain.on('overlay:subtitle', (_e, text: string) => {
    sendSubtitleText(text);
  });

  ipcMain.on('overlay:drag-start', (_e, payload: { screenX: number; screenY: number }) => {
    startOverlayDrag(payload.screenX, payload.screenY);
  });

  ipcMain.on('overlay:drag-move', (_e, payload: { screenX: number; screenY: number }) => {
    moveOverlayDrag(payload.screenX, payload.screenY);
  });

  ipcMain.on('overlay:drag-end', () => {
    endOverlayDrag();
  });

  ipcMain.on('overlay:reset-position', () => {
    resetOverlayPosition();
  });

  // --- Tray ---
  ipcMain.on('update-tray-settings', (_e, settings) => {
    updateTraySettings(settings);
  });

  // --- Clipboard ---
  ipcMain.handle('clipboard:read', () => readClipboard());

  ipcMain.on('clipboard:paste', async (_e, text: string) => {
    await pasteText(text);
  });

  ipcMain.on('clipboard:undo', async () => {
    await undoPaste();
  });

  // --- Shell ---
  ipcMain.on('show-main-window', () => {
    showMainWindow();
  });

  ipcMain.on('notify', (_e, payload: { title?: string; body?: string }) => {
    const { showNotifications } = getTraySettings();
    if (!showNotifications) return;
    new Notification({
      title: payload?.title ?? 'Whisperall',
      body: payload?.body ?? '',
    }).show();
  });

  ipcMain.handle('open-external', async (_e, url: string) => {
    await shell.openExternal(url);
  });

  // --- Auth persistent storage (shared across dev ports) ---
  ipcMain.handle('auth-storage:get', async (_e, key: string) => {
    if (!isValidAuthStorageKey(key)) return null;
    const storage = await readAuthStorage();
    const value = storage[key];
    return typeof value === 'string' ? value : null;
  });

  ipcMain.handle('auth-storage:set', async (_e, key: string, value: string) => {
    if (!isValidAuthStorageKey(key) || typeof value !== 'string') return;
    const storage = await readAuthStorage();
    storage[key] = value;
    await writeAuthStorage(storage);
  });

  ipcMain.handle('auth-storage:remove', async (_e, key: string) => {
    if (!isValidAuthStorageKey(key)) return;
    const storage = await readAuthStorage();
    if (!(key in storage)) return;
    delete storage[key];
    await writeAuthStorage(storage);
  });

  // --- Desktop Capturer ---
  ipcMain.handle('desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    return sources.map((s) => ({ id: s.id, name: s.name }));
  });

  // --- Window controls ---
  ipcMain.on('update-title-bar', (_e, { color, symbolColor }: { color: string; symbolColor: string }) => {
    const win = getMainWindow();
    if (!win) return;
    win.setTitleBarOverlay({ color, symbolColor, height: 40 });
  });
}
