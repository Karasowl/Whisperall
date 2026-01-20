const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
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
  hideSttOverlay: () => {
    ipcRenderer.send('stt-overlay-hide');
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
  pasteLastTranscript: () => {
    ipcRenderer.send('stt-paste');
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
