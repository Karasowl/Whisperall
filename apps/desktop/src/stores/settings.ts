import { create } from 'zustand';
import { electron } from '../lib/electron';

export type SettingsState = {
  language: string;
  hotkeyMode: 'toggle' | 'hold';
  overlayEnabled: boolean;
  minimizeToTray: boolean;
  showNotifications: boolean;
  hotkeys: Record<string, string>;

  setLanguage: (lang: string) => void;
  setHotkeyMode: (mode: 'toggle' | 'hold') => void;
  setOverlayEnabled: (enabled: boolean) => void;
  setMinimizeToTray: (enabled: boolean) => void;
  setShowNotifications: (enabled: boolean) => void;
  setHotkey: (action: string, accelerator: string) => void;
  load: () => void;
};

const STORAGE_KEY = 'whisperall-settings';

function persist(state: Partial<SettingsState>): void {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...state }));
  } catch { /* ignore */ }
}

function loadFromStorage(): Partial<SettingsState> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  language: 'en',
  hotkeyMode: 'toggle',
  overlayEnabled: true,
  minimizeToTray: true,
  showNotifications: true,
  hotkeys: {
    dictate: 'Alt+X',
    read_clipboard: 'Ctrl+Shift+R',
    stt_paste: 'Alt+Shift+S',
  },

  setLanguage: (language) => {
    set({ language });
    persist({ language });
  },

  setHotkeyMode: (hotkeyMode) => {
    set({ hotkeyMode });
    persist({ hotkeyMode });
    electron?.updateSttSettings({ hotkey_mode: hotkeyMode });
  },

  setOverlayEnabled: (overlayEnabled) => {
    set({ overlayEnabled });
    persist({ overlayEnabled });
    electron?.updateSttSettings({ overlay_enabled: overlayEnabled });
  },

  setMinimizeToTray: (minimizeToTray) => {
    set({ minimizeToTray });
    persist({ minimizeToTray });
    electron?.updateTraySettings({ minimizeToTray });
  },

  setShowNotifications: (showNotifications) => {
    set({ showNotifications });
    persist({ showNotifications });
    electron?.updateTraySettings({ showNotifications });
  },

  setHotkey: (action, accelerator) => {
    const hotkeys = { ...get().hotkeys, [action]: accelerator };
    set({ hotkeys });
    persist({ hotkeys });
    electron?.updateHotkeys(hotkeys);
  },

  load: () => {
    const saved = loadFromStorage();
    set(saved);
    // Sync to Electron main process
    if (saved.hotkeys) electron?.updateHotkeys(saved.hotkeys as Record<string, string>);
    if (saved.minimizeToTray !== undefined) electron?.updateTraySettings({ minimizeToTray: saved.minimizeToTray as boolean });
    if (saved.hotkeyMode) electron?.updateSttSettings({ hotkey_mode: saved.hotkeyMode as string });
  },
}));
