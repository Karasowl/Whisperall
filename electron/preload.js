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
});
