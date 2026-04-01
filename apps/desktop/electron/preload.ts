import { contextBridge, ipcRenderer } from 'electron';

type Unsubscribe = () => void;

contextBridge.exposeInMainWorld('whisperall', {
  platform: process.platform,

  // ── Hotkeys ────────────────────────────────────────────────
  onHotkey: (cb: (action: string) => void): Unsubscribe => {
    const handler = (_e: Electron.IpcRendererEvent, action: string) => cb(action);
    ipcRenderer.on('hotkey', handler);
    return () => ipcRenderer.removeListener('hotkey', handler);
  },
  updateHotkeys: (hotkeys: Record<string, string>) => {
    ipcRenderer.send('update-hotkeys', hotkeys);
  },
  updateSttSettings: (settings: { hotkey_mode?: string; overlay_enabled?: boolean }) => {
    ipcRenderer.send('update-stt-settings', settings);
  },
  setDictationText: (text: string) => {
    ipcRenderer.send('set-dictation-text', text);
  },

  // ── Overlay ────────────────────────────────────────────────
  showOverlay: (module?: string) => ipcRenderer.send('overlay:show', module),
  hideOverlay: () => ipcRenderer.send('overlay:hide'),
  toggleOverlay: (module?: string) => ipcRenderer.send('overlay:toggle', module),
  resizeOverlay: (dims: { width: number; height: number }) => ipcRenderer.send('overlay:resize', dims),
  setOverlayIgnoreMouse: (ignore: boolean) => ipcRenderer.send('overlay:ignore-mouse', ignore),
  overlayDragStart: (payload: { screenX: number; screenY: number }) => ipcRenderer.send('overlay:drag-start', payload),
  overlayDragMove: (payload: { screenX: number; screenY: number }) => ipcRenderer.send('overlay:drag-move', payload),
  overlayDragEnd: () => ipcRenderer.send('overlay:drag-end'),
  resetOverlayPosition: () => ipcRenderer.send('overlay:reset-position'),
  onOverlayVisible: (cb: (visible: boolean) => void): Unsubscribe => {
    const handler = (_e: Electron.IpcRendererEvent, visible: boolean) => cb(visible);
    ipcRenderer.on('overlay:visible', handler);
    return () => ipcRenderer.removeListener('overlay:visible', handler);
  },
  onOverlaySwitchModule: (cb: (module: string) => void): Unsubscribe => {
    const handler = (_e: Electron.IpcRendererEvent, module: string) => cb(module);
    ipcRenderer.on('overlay:switch-module', handler);
    return () => ipcRenderer.removeListener('overlay:switch-module', handler);
  },
  sendSubtitleText: (text: string) => ipcRenderer.send('overlay:subtitle', text),
  onSubtitleText: (cb: (text: string) => void): Unsubscribe => {
    const handler = (_e: Electron.IpcRendererEvent, text: string) => cb(text);
    ipcRenderer.on('overlay:subtitle', handler);
    return () => ipcRenderer.removeListener('overlay:subtitle', handler);
  },

  // ── Tray ───────────────────────────────────────────────────
  updateTraySettings: (settings: { minimizeToTray?: boolean; showNotifications?: boolean }) => {
    ipcRenderer.send('update-tray-settings', settings);
  },

  // ── Clipboard ──────────────────────────────────────────────
  readClipboard: () => ipcRenderer.invoke('clipboard:read') as Promise<string>,
  pasteText: (text: string) => ipcRenderer.send('clipboard:paste', text),
  undoPaste: () => ipcRenderer.send('clipboard:undo'),
  onPasteText: (cb: (text: string) => void): Unsubscribe => {
    const handler = (_e: Electron.IpcRendererEvent, text: string) => cb(text);
    ipcRenderer.on('clipboard:paste-text', handler);
    return () => ipcRenderer.removeListener('clipboard:paste-text', handler);
  },

  // ── Auth ───────────────────────────────────────────────────
  getAuthStorageItem: (key: string) => ipcRenderer.invoke('auth-storage:get', key) as Promise<string | null>,
  setAuthStorageItem: (key: string, value: string) => ipcRenderer.invoke('auth-storage:set', key, value) as Promise<void>,
  removeAuthStorageItem: (key: string) => ipcRenderer.invoke('auth-storage:remove', key) as Promise<void>,
  codexAuth: {
    start: () => ipcRenderer.invoke('codex-auth:start'),
    cancel: () => { ipcRenderer.send('codex-auth:cancel'); },
    disconnect: () => ipcRenderer.invoke('codex-auth:disconnect') as Promise<void>,
    test: () => ipcRenderer.invoke('codex-auth:test'),
    status: () => ipcRenderer.invoke('codex-auth:status'),
    canInfer: () => ipcRenderer.invoke('codex-auth:can-infer') as Promise<boolean>,
    chat: (payload: { system: string; userPrompt: string; maxTokens?: number }) => ipcRenderer.invoke('codex-auth:chat', payload) as Promise<string>,
  },
  claudeAuth: {
    start: () => ipcRenderer.invoke('claude-auth:start'),
    exchange: (codeWithState: string) => ipcRenderer.invoke('claude-auth:exchange', codeWithState),
    disconnect: () => ipcRenderer.invoke('claude-auth:disconnect') as Promise<void>,
    test: () => ipcRenderer.invoke('claude-auth:test'),
    status: () => ipcRenderer.invoke('claude-auth:status'),
    canInfer: () => ipcRenderer.invoke('claude-auth:can-infer') as Promise<boolean>,
    chat: (payload: { system: string; userPrompt: string; model?: string; maxTokens?: number; temperature?: number }) =>
      ipcRenderer.invoke('claude-auth:chat', payload) as Promise<string>,
  },
  onAuthCallback: (cb: (url: string) => void): Unsubscribe => {
    const handler = (_e: Electron.IpcRendererEvent, url: string) => cb(url);
    ipcRenderer.on('auth:callback', handler);
    return () => ipcRenderer.removeListener('auth:callback', handler);
  },

  // ── Shell ──────────────────────────────────────────────────
  showMainWindow: () => ipcRenderer.send('show-main-window'),
  notify: (payload: { title?: string; body?: string }) => ipcRenderer.send('notify', payload),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url) as Promise<void>,
  updateTitleBar: (colors: { color: string; symbolColor: string }) => {
    ipcRenderer.send('update-title-bar', colors);
  },

  // ── Desktop Capturer ───────────────────────────────────────
  getDesktopSources: () => ipcRenderer.invoke('desktop-sources') as Promise<Array<{ id: string; name: string }>>,
});

