import { ipcMain, Notification, shell } from 'electron';
import { showMainWindow, getMainWindow } from './windows.js';
import { showOverlay, hideOverlay, toggleOverlay, resizeOverlay, setOverlayIgnoreMouse } from './overlay.js';
import { updateHotkeys, updateSttSettings, setLastDictationText } from './hotkeys.js';
import { updateTraySettings, getTraySettings } from './tray.js';
import { pasteText, undoPaste, readClipboard } from './clipboard.js';

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

  // --- Window controls ---
  ipcMain.on('update-title-bar', (_e, { color, symbolColor }: { color: string; symbolColor: string }) => {
    const win = getMainWindow();
    if (!win) return;
    win.setTitleBarOverlay({ color, symbolColor, height: 40 });
  });
}
