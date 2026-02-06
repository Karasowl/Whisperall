# Desktop Architecture

- Electron main: ventanas, hotkeys, overlays.
- Renderer React/Vite: UI principal.
- Overlay: ventana transparente always-on-top.
- Audio capture: mic + system (WASAPI).

IPC:
- `dictation-final` para pegar texto final.
- `overlay-state` para UI del overlay.
