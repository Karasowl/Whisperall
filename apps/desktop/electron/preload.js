import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('whisperall', {
  onOverlayState: (cb: (payload: { state: string }) => void) => {
    ipcRenderer.on('overlay-state', (_event, payload) => cb(payload));
  },
  sendDictationFinal: (text: string) => ipcRenderer.send('dictation-final', text)
});
