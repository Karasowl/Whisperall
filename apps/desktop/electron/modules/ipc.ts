import { ipcMain, desktopCapturer, Notification, shell } from 'electron';
import { showMainWindow, getMainWindow, setMinimizeToTray } from './windows.js';
import {
  showOverlay, hideOverlay, toggleOverlay, resizeOverlay, setOverlayIgnoreMouse, sendSubtitleText,
  startOverlayDrag, moveOverlayDrag, endOverlayDrag, resetOverlayPosition, setDockZone, undockToPosition,
} from './overlay.js';
import {
  showTranslator, hideTranslator, toggleTranslator, getTranslatorBounds,
  startTranslatorDrag, moveTranslatorDrag, endTranslatorDrag,
  startTranslatorResize, moveTranslatorResize, endTranslatorResize,
} from './translator-window.js';
import { captureTranslatorRegion } from './translator-capture.js';
import { updateHotkeys, updateSttSettings, setLastDictationText } from './hotkeys.js';
import { updateTraySettings, getTraySettings } from './tray.js';
import { pasteText, undoPaste, readClipboard, writeClipboard } from './clipboard.js';
import { isValidAuthStorageKey, readAuthStorage, writeAuthStorage } from './auth-storage.js';
import {
  startCodexAuth, cancelCodexAuth, disconnectCodex, testCodexConnection, getCodexAuthStatus, codexCanInfer, codexChat,
} from './codex-auth.js';
import {
  startClaudeAuth, exchangeClaudeCode, disconnectClaude, testClaudeConnection, getClaudeAuthStatus, claudeCanInfer, claudeChat,
} from './claude-auth.js';

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

  // --- Widget dock zone (magnetic snap + drag-out) ---
  ipcMain.on('widget:set-dock-zone', (_e, bounds: { x: number; y: number; width: number; height: number } | null) => {
    setDockZone(bounds);
  });
  ipcMain.on('widget:undock-to-position', (_e, screenX: number, screenY: number) => {
    undockToPosition(screenX, screenY);
  });

  // --- Tray ---
  ipcMain.on('update-tray-settings', (_e, settings: { minimizeToTray?: boolean; showNotifications?: boolean }) => {
    updateTraySettings(settings);
    if (typeof settings.minimizeToTray === 'boolean') {
      setMinimizeToTray(settings.minimizeToTray);
    }
  });

  // --- Clipboard ---
  ipcMain.handle('clipboard:read', () => readClipboard());
  ipcMain.handle('clipboard:write', (_e, text: string) => { writeClipboard(text); });

  ipcMain.on('clipboard:paste', async (_e, text: string) => {
    const win = getMainWindow();
    if (win && win.isFocused()) {
      win.webContents.send('clipboard:paste-text', text);
      return;
    }
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

  // --- OpenAI / Codex Auth ---
  ipcMain.handle('codex-auth:start', async () => startCodexAuth());
  ipcMain.on('codex-auth:cancel', () => {
    cancelCodexAuth();
  });
  ipcMain.handle('codex-auth:disconnect', async () => {
    await disconnectCodex();
  });
  ipcMain.handle('codex-auth:test', async () => testCodexConnection());
  ipcMain.handle('codex-auth:status', async () => getCodexAuthStatus());
  ipcMain.handle('codex-auth:can-infer', async () => codexCanInfer());
  ipcMain.handle('codex-auth:chat', async (_e, payload: { system: string; userPrompt: string; maxTokens?: number }) => {
    return codexChat(payload.system, payload.userPrompt, payload.maxTokens);
  });

  // --- Claude Auth ---
  ipcMain.handle('claude-auth:start', async () => startClaudeAuth());
  ipcMain.handle('claude-auth:exchange', async (_e, codeWithState: string) => exchangeClaudeCode(codeWithState));
  ipcMain.handle('claude-auth:disconnect', async () => {
    await disconnectClaude();
  });
  ipcMain.handle('claude-auth:test', async () => testClaudeConnection());
  ipcMain.handle('claude-auth:status', async () => getClaudeAuthStatus());
  ipcMain.handle('claude-auth:can-infer', async () => claudeCanInfer());
  ipcMain.handle(
    'claude-auth:chat',
    async (_e, payload: { system: string; userPrompt: string; model?: string; maxTokens?: number; temperature?: number }) => {
      return claudeChat(payload.system, payload.userPrompt, payload.model, payload.maxTokens, payload.temperature);
    },
  );

  // --- Desktop Capturer ---
  ipcMain.handle('desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    return sources.map((s) => ({ id: s.id, name: s.name }));
  });

  // --- Screen Translator (M18) ---
  ipcMain.on('translator:show', () => { showTranslator(); });
  ipcMain.on('translator:hide', () => { hideTranslator(); });
  ipcMain.on('translator:toggle', () => { toggleTranslator(); });
  ipcMain.handle('translator:get-bounds', () => getTranslatorBounds());
  ipcMain.handle('translator:capture-region', async () => captureTranslatorRegion());
  ipcMain.on('translator:drag-start', (_e, payload: { screenX: number; screenY: number }) => {
    startTranslatorDrag(payload.screenX, payload.screenY);
  });
  ipcMain.on('translator:drag-move', (_e, payload: { screenX: number; screenY: number }) => {
    moveTranslatorDrag(payload.screenX, payload.screenY);
  });
  ipcMain.on('translator:drag-end', () => { endTranslatorDrag(); });
  ipcMain.on('translator:resize-start', (_e, payload: { screenX: number; screenY: number; anchor: string }) => {
    startTranslatorResize(payload.screenX, payload.screenY, payload.anchor as 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw');
  });
  ipcMain.on('translator:resize-move', (_e, payload: { screenX: number; screenY: number }) => {
    moveTranslatorResize(payload.screenX, payload.screenY);
  });
  ipcMain.on('translator:resize-end', () => { endTranslatorResize(); });
  // Relay translator errors to the main window so the user sees them in the
  // notifications bell. The translator overlay is a separate renderer with
  // its own zustand stores, so pushing inside it wouldn't reach the main UI.
  ipcMain.on('translator:error', (_e, payload: { message: string; detail?: string }) => {
    const main = getMainWindow();
    if (main && !main.isDestroyed()) {
      main.webContents.send('translator:error', payload);
    }
  });

  // --- Window controls ---
  ipcMain.on('update-title-bar', (_e, { color, symbolColor }: { color: string; symbolColor: string }) => {
    const win = getMainWindow();
    if (!win) return;
    win.setTitleBarOverlay({ color, symbolColor, height: 40 });
  });
}

