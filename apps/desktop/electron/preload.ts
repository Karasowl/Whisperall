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

  // ── Auth ───────────────────────────────────────────────────
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
