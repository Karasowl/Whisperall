const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Backend URL - centralized configuration
const backendPort = process.env.WHISPERALL_BACKEND_PORT || process.env.BACKEND_PORT || '8080';
const BACKEND_URL = `http://127.0.0.1:${backendPort}`;

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  backendUrl: BACKEND_URL,
  onHotkey: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('global-hotkey', handler);
    return () => ipcRenderer.removeListener('global-hotkey', handler);
  },
  updateHotkeys: (hotkeys) => {
    ipcRenderer.send('update-hotkeys', hotkeys);
  },
  updateTraySettings: (settings) => {
    ipcRenderer.send('update-tray-settings', settings);
  },
  updateWindowControls: (colors) => {
    ipcRenderer.send('update-window-controls', colors);
  },
  showSttOverlay: () => {
    ipcRenderer.send('stt-overlay-show');
  },
  hideSttOverlay: (forceHide = false) => {
    ipcRenderer.send('stt-overlay-hide', forceHide);
  },
  resizeSttOverlay: ({ width, height }) => {
    ipcRenderer.send('stt-overlay-resize', { width, height });
  },
  updateSttOverlayLevel: (level) => {
    ipcRenderer.send('stt-overlay-level', level);
  },
  updateSttOverlayState: (state) => {
    ipcRenderer.send('stt-overlay-state', state);
  },
  setLastSttTranscript: (text) => {
    ipcRenderer.send('stt-last-transcript', text);
  },
  pasteLastTranscript: (text) => {
    ipcRenderer.send('stt-paste', text);
  },
  updateSttSettings: (settings) => {
    ipcRenderer.send('stt-settings-update', settings);
  },
  reloadSttSettings: () => {
    ipcRenderer.send('stt-reload-settings');
  },
  onSttOverlayLevel: (callback) => {
    const handler = (_event, level) => callback(level);
    ipcRenderer.on('stt-overlay-level', handler);
    return () => ipcRenderer.removeListener('stt-overlay-level', handler);
  },
  onSttOverlayState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('stt-overlay-state', handler);
    return () => ipcRenderer.removeListener('stt-overlay-state', handler);
  },
  onSttTranscript: (callback) => {
    const handler = (_event, transcript) => callback(transcript);
    ipcRenderer.on('stt-transcript', handler);
    return () => ipcRenderer.removeListener('stt-transcript', handler);
  },
  // Subtitle overlay APIs
  showSubtitleOverlay: () => {
    ipcRenderer.send('subtitle-overlay-show');
  },
  hideSubtitleOverlay: () => {
    ipcRenderer.send('subtitle-overlay-hide');
  },
  sendSubtitleMessage: (message) => {
    ipcRenderer.send('subtitle-overlay-message', message);
  },
  clearSubtitles: () => {
    ipcRenderer.send('subtitle-overlay-clear');
  },
  onSubtitleMessage: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('subtitle-message', handler);
    return () => ipcRenderer.removeListener('subtitle-message', handler);
  },
  // Widget overlay APIs
  showWidgetOverlay: (module) => {
    ipcRenderer.send('widget-overlay-show', module);
  },
  hideWidgetOverlay: () => {
    ipcRenderer.send('widget-overlay-hide');
  },
  toggleWidgetOverlay: (module) => {
    ipcRenderer.send('widget-overlay-toggle', module);
  },
  saveWidgetModule: (moduleName) => {
    ipcRenderer.send('widget-save-module', moduleName);
  },
  getWidgetState: () => ipcRenderer.invoke('widget-get-state'),
  resizeWidget: (dims) => ipcRenderer.send('widget-resize', dims),
  onWidgetSwitchModule: (callback) => {
    const handler = (_event, module) => callback(module);
    ipcRenderer.on('widget-switch-module', handler);
    return () => ipcRenderer.removeListener('widget-switch-module', handler);
  },
  onWidgetStateUpdate: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('widget-state-update', handler);
    return () => ipcRenderer.removeListener('widget-state-update', handler);
  },
  moveWidget: (delta) => ipcRenderer.send('widget-move', delta),
  // Widget dictation helpers
  pasteText: (text) => ipcRenderer.send('widget-paste-text', text),
  undoPaste: () => ipcRenderer.send('widget-undo-paste'),
  onAudioLevel: (callback) => {
    const handler = (_event, level) => callback(level);
    ipcRenderer.on('widget-audio-level', handler);
    return () => ipcRenderer.removeListener('widget-audio-level', handler);
  },
  onGlobalHotkey: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('global-hotkey', handler);
    return () => ipcRenderer.removeListener('global-hotkey', handler);
  },
  // Allow widget to trigger actions (send to main process for handling)
  triggerWidgetAction: (action) => ipcRenderer.send('widget-trigger-action', action),
  showMainWindow: () => {
    ipcRenderer.send('show-main-window');
  },
  notify: (payload) => {
    ipcRenderer.send('show-notification', payload);
  },
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),
  getFilePath: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (err) {
      return null;
    }
  },
  // Use main process networking for reliable fetch (bypasses renderer issues)
  netFetch: (url, options) => ipcRenderer.invoke('net-fetch', url, options),
  // Simple ping for testing IPC
  ping: () => ipcRenderer.invoke('ping'),
  // Open URL in default system browser (not in Electron)
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
