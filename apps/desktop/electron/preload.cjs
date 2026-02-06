const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('whisperall', {
  onOverlayState: (cb) => {
    ipcRenderer.on('overlay-state', (_event, payload) => cb(payload));
  },
  sendDictationFinal: (text) => ipcRenderer.send('dictation-final', text)
});
