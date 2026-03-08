export {};

type Unsubscribe = () => void;

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
      pasteText: (text: string) => void;
      undoPaste: () => void;

      // Shell
      showMainWindow: () => void;
      notify: (payload: { title?: string; body?: string }) => void;
      openExternal: (url: string) => Promise<void>;
      updateTitleBar: (colors: { color: string; symbolColor: string }) => void;

      // Desktop Capturer
      getDesktopSources: () => Promise<Array<{ id: string; name: string }>>;
    };
  }
}
