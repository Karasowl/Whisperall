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
  writeClipboard: (text: string) => ipcRenderer.invoke('clipboard:write', text) as Promise<void>,
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

  // ── Widget dock zone (magnetic snap) ─────────────────────────
  setDockZone: (bounds: { x: number; y: number; width: number; height: number } | null) => {
    ipcRenderer.send('widget:set-dock-zone', bounds);
  },
  /** Show the overlay centered at (screenX, screenY) and begin drag. */
  undockToPosition: (screenX: number, screenY: number) => {
    ipcRenderer.send('widget:undock-to-position', screenX, screenY);
  },
  onSnapDock: (cb: () => void): Unsubscribe => {
    const handler = () => cb();
    ipcRenderer.on('widget:snap-dock', handler);
    return () => ipcRenderer.removeListener('widget:snap-dock', handler);
  },

  // ── Desktop Capturer ───────────────────────────────────────
  getDesktopSources: () => ipcRenderer.invoke('desktop-sources') as Promise<Array<{ id: string; name: string }>>,

  // ── Screen Translator (M18) ────────────────────────────────
  translator: {
    show: () => ipcRenderer.send('translator:show'),
    hide: () => ipcRenderer.send('translator:hide'),
    toggle: () => ipcRenderer.send('translator:toggle'),
    getBounds: () => ipcRenderer.invoke('translator:get-bounds') as Promise<{ x: number; y: number; width: number; height: number } | null>,
    captureRegion: () => ipcRenderer.invoke('translator:capture-region') as Promise<{ pngBase64: string; width: number; height: number } | null>,
    dragStart: (payload: { screenX: number; screenY: number }) => ipcRenderer.send('translator:drag-start', payload),
    dragMove: (payload: { screenX: number; screenY: number }) => ipcRenderer.send('translator:drag-move', payload),
    dragEnd: () => ipcRenderer.send('translator:drag-end'),
    resizeStart: (payload: { screenX: number; screenY: number; anchor: string }) => ipcRenderer.send('translator:resize-start', payload),
    resizeMove: (payload: { screenX: number; screenY: number }) => ipcRenderer.send('translator:resize-move', payload),
    resizeEnd: () => ipcRenderer.send('translator:resize-end'),
    onVisible: (cb: (visible: boolean) => void): Unsubscribe => {
      const handler = (_e: Electron.IpcRendererEvent, visible: boolean) => cb(visible);
      ipcRenderer.on('translator:visible', handler);
      return () => ipcRenderer.removeListener('translator:visible', handler);
    },
    /** Called from the translator overlay renderer — forwarded to the main window. */
    reportError: (payload: { message: string; detail?: string }) => ipcRenderer.send('translator:error', payload),
    /** Subscribed by the main window renderer to receive relayed errors. */
    onError: (cb: (payload: { message: string; detail?: string }) => void): Unsubscribe => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { message: string; detail?: string }) => cb(payload);
      ipcRenderer.on('translator:error', handler);
      return () => ipcRenderer.removeListener('translator:error', handler);
    },
  },

  // ── Diagnostic log (main → main-window renderer) ───────────
  // Main process pushes diagnostic entries (hotkey fired, translator shown,
  // hotkey registration report, etc.) into the main window's notification
  // bell. Preferred over native toasts since those depend on Windows
  // Action Center settings we can't control.
  onDiag: (cb: (payload: { message: string; detail?: string; context?: string; tone?: 'info' | 'warning' | 'error' | 'success' }) => void): Unsubscribe => {
    const handler = (
      _e: Electron.IpcRendererEvent,
      payload: { message: string; detail?: string; context?: string; tone?: 'info' | 'warning' | 'error' | 'success' },
    ) => cb(payload);
    ipcRenderer.on('diag:push', handler);
    return () => ipcRenderer.removeListener('diag:push', handler);
  },

  // ── Backend diagnostics ─────────────────────────────────────
  backend: {
    getLogTail: (lines: number = 500) => ipcRenderer.invoke('backend:log-tail', lines) as Promise<string>,
    onEvent: (cb: (evt: { kind: 'error' | 'exit' | 'start'; message: string; code?: number | null }) => void): Unsubscribe => {
      const handler = (_e: Electron.IpcRendererEvent, evt: { kind: 'error' | 'exit' | 'start'; message: string; code?: number | null }) => cb(evt);
      ipcRenderer.on('backend:event', handler);
      return () => ipcRenderer.removeListener('backend:event', handler);
    },
    /**
     * Live-tail the backend log. `cb` fires with arrays of new lines
     * (batched per ~500 ms tick in main). Returns an unsubscribe that
     * detaches the listener AND tells main to stop the watcher for this
     * renderer — avoids leaking timers when the modal closes.
     */
    startLogStream: (cb: (lines: string[]) => void): Unsubscribe => {
      const handler = (_e: Electron.IpcRendererEvent, lines: string[]) => cb(lines);
      ipcRenderer.on('backend:log-line', handler);
      void ipcRenderer.invoke('backend:log-stream-start');
      return () => {
        ipcRenderer.removeListener('backend:log-line', handler);
        void ipcRenderer.invoke('backend:log-stream-stop');
      };
    },
  },
});

