export {};

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
    };
    __lastHotkey?: string;
  }
}
