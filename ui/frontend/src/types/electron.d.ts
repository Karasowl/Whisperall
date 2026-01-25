export { };

declare global {
  interface File {
    path?: string;
  }

  interface Window {
    electronAPI?: {
      isElectron: boolean;
      platform: string;
      onHotkey: (callback: (action: string) => void) => () => void;
      updateHotkeys: (hotkeys: Record<string, string>) => void;
      updateTraySettings: (settings: { minimizeToTray?: boolean; showNotifications?: boolean }) => void;
      updateWindowControls: (colors: { color: string; symbolColor: string }) => void;
      readClipboard: () => Promise<string>;
      getFilePath?: (file: File) => string | null;
      netFetch: (url: string, options: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      }) => Promise<{
        ok: boolean;
        status: number;
        headers: Record<string, string>;
        body: string;
      }>;
      notify: (payload: { title?: string; body: string }) => void;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      // STT Overlay functions
      showSttOverlay: () => void;
      hideSttOverlay: () => void;
      updateSttOverlayLevel: (level: number) => void;
      updateSttOverlayState: (state: 'listening' | 'recording' | 'transcribing' | 'done' | 'idle' | 'complete') => void;
      setLastSttTranscript: (text: string) => void;
      pasteLastTranscript: (text?: string) => void;
      updateSttSettings: (settings: { hotkey_mode?: string; overlay_enabled?: boolean }) => void;
      reloadSttSettings: () => void;
      onSttOverlayLevel: (callback: (level: number) => void) => () => void;
      onSttOverlayState: (callback: (state: string) => void) => () => void;
      // Subtitle Overlay functions
      showSubtitleOverlay: () => void;
      hideSubtitleOverlay: () => void;
      sendSubtitleMessage: (message: { type: string; text?: string;[key: string]: any }) => void;
      clearSubtitles: () => void;
      onSubtitleMessage: (callback: (message: any) => void) => () => void;
    };
    __lastHotkey?: string;
  }
}
