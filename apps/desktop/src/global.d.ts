export {};

type Unsubscribe = () => void;

// Vite raw imports (e.g. `import md from './foo.md?raw'`).
declare module '*?raw' {
  const content: string;
  export default content;
}
declare module '*.md' {
  const content: string;
  export default content;
}

declare global {
  interface Window {
    whisperall?: {
      platform: string;

      // Hotkeys
      onHotkey: (cb: (action: string) => void) => Unsubscribe;
      updateHotkeys: (hotkeys: Record<string, string>) => void;
      updateSttSettings: (settings: { hotkey_mode?: string; overlay_enabled?: boolean }) => void;
      setDictationText: (text: string) => void;

      // Overlay
      showOverlay: (module?: string) => void;
      hideOverlay: () => void;
      toggleOverlay: (module?: string) => void;
      resizeOverlay: (dims: { width: number; height: number }) => void;
      setOverlayIgnoreMouse: (ignore: boolean) => void;
      overlayDragStart: (payload: { screenX: number; screenY: number }) => void;
      overlayDragMove: (payload: { screenX: number; screenY: number }) => void;
      overlayDragEnd: () => void;
      resetOverlayPosition: () => void;
      onOverlayVisible: (cb: (visible: boolean) => void) => Unsubscribe;
      onOverlaySwitchModule: (cb: (module: string) => void) => Unsubscribe;
      sendSubtitleText: (text: string) => void;
      onSubtitleText: (cb: (text: string) => void) => Unsubscribe;

      // Auth
      getAuthStorageItem: (key: string) => Promise<string | null>;
      setAuthStorageItem: (key: string, value: string) => Promise<void>;
      removeAuthStorageItem: (key: string) => Promise<void>;
      onAuthCallback: (cb: (url: string) => void) => Unsubscribe;
      codexAuth: {
        start: () => Promise<{ ok: true; email: string } | { ok: false; error: string }>;
        cancel: () => void;
        disconnect: () => Promise<void>;
        test: () => Promise<{ ok: true; latency: number } | { ok: false; error: string }>;
        status: () => Promise<{ connected: boolean; email: string }>;
        canInfer: () => Promise<boolean>;
        chat: (payload: { system: string; userPrompt: string; maxTokens?: number }) => Promise<string>;
      };
      claudeAuth: {
        start: () => Promise<{ verifier: string }>;
        exchange: (codeWithState: string) => Promise<{ ok: true; email: string } | { ok: false; error: string }>;
        disconnect: () => Promise<void>;
        test: () => Promise<{ ok: true; latency: number } | { ok: false; error: string }>;
        status: () => Promise<{ connected: boolean; email: string }>;
        canInfer: () => Promise<boolean>;
        chat: (payload: { system: string; userPrompt: string; model?: string; maxTokens?: number; temperature?: number }) => Promise<string>;
      };

      // Tray
      updateTraySettings: (settings: { minimizeToTray?: boolean; showNotifications?: boolean }) => void;

      // Clipboard
      readClipboard: () => Promise<string>;
      writeClipboard: (text: string) => Promise<void>;
      pasteText: (text: string) => void;
      undoPaste: () => void;
      onPasteText: (cb: (text: string) => void) => Unsubscribe;

      // Shell
      showMainWindow: () => void;
      notify: (payload: { title?: string; body?: string }) => void;
      openExternal: (url: string) => Promise<void>;
      updateTitleBar: (colors: { color: string; symbolColor: string }) => void;

      // Widget dock zone (magnetic snap)
      setDockZone: (bounds: { x: number; y: number; width: number; height: number } | null) => void;
      onSnapDock: (cb: () => void) => Unsubscribe;
      undockToPosition: (screenX: number, screenY: number) => void;

      // Desktop Capturer
      getDesktopSources: () => Promise<Array<{ id: string; name: string }>>;

      // Screen Translator (M18)
      translator: {
        show: () => void;
        hide: () => void;
        toggle: () => void;
        getBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
        captureRegion: () => Promise<{ pngBase64: string; width: number; height: number } | null>;
        dragStart: (payload: { screenX: number; screenY: number }) => void;
        dragMove: (payload: { screenX: number; screenY: number }) => void;
        dragEnd: () => void;
        resizeStart: (payload: { screenX: number; screenY: number; anchor: string }) => void;
        resizeMove: (payload: { screenX: number; screenY: number }) => void;
        resizeEnd: () => void;
        onVisible: (cb: (visible: boolean) => void) => Unsubscribe;
        reportError: (payload: { message: string; detail?: string }) => void;
        onError: (cb: (payload: { message: string; detail?: string }) => void) => Unsubscribe;
      };

      // Generic diagnostic bridge: main process → main window notification bell.
      onDiag: (
        cb: (payload: {
          message: string;
          detail?: string;
          context?: string;
          tone?: 'info' | 'warning' | 'error' | 'success';
        }) => void,
      ) => Unsubscribe;

      // Backend diagnostics
      backend: {
        getLogTail: (lines?: number) => Promise<string>;
        onEvent: (cb: (evt: { kind: 'error' | 'exit' | 'start'; message: string; code?: number | null }) => void) => Unsubscribe;
        startLogStream: (cb: (lines: string[]) => void) => Unsubscribe;
      };
    };
  }
}

