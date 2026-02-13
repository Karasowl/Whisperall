import { create } from 'zustand';
import { electron } from '../lib/electron';
import { normalizeLanguageCode, type TTSSupportedLanguage } from '../lib/lang-detect';

export type Theme = 'light' | 'dark' | 'system';
export type UiLocale = 'en' | 'es';
export type TtsLanguage = 'auto' | TTSSupportedLanguage;

export type SettingsState = {
  theme: Theme;
  uiLanguage: UiLocale;
  ttsLanguage: TtsLanguage;
  hotkeyMode: 'toggle' | 'hold';
  overlayEnabled: boolean;
  minimizeToTray: boolean;
  showNotifications: boolean;
  hotkeys: Record<string, string>;
  translateEnabled: boolean;
  translateTo: string;
  audioDevice: string | null;

  setTheme: (theme: Theme) => void;
  setUiLanguage: (lang: UiLocale) => void;
  setTtsLanguage: (lang: string) => void;
  setHotkeyMode: (mode: 'toggle' | 'hold') => void;
  setOverlayEnabled: (enabled: boolean) => void;
  resetOverlayPosition: () => void;
  setMinimizeToTray: (enabled: boolean) => void;
  setShowNotifications: (enabled: boolean) => void;
  setHotkey: (action: string, accelerator: string) => void;
  setTranslateEnabled: (enabled: boolean) => void;
  setTranslateTo: (lang: string) => void;
  setAudioDevice: (deviceId: string | null) => void;
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

function normalizeTtsLanguage(input: string | undefined): TtsLanguage {
  const raw = (input ?? '').trim().toLowerCase();
  if (!raw || raw === 'auto') return 'auto';
  return normalizeLanguageCode(raw) ?? 'auto';
}

export function applyTheme(theme: Theme): void {
  const resolved = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(resolved);

  // Keep native Windows title bar overlay in sync with the active theme.
  // Important: settings.ts is shared between main window + overlay renderer.
  // Avoid updating the main window title bar from the overlay renderer.
  try {
    const isOverlay = String(window.location?.href ?? '').includes('overlay.html');
    if (!isOverlay && electron?.platform === 'win32' && electron?.updateTitleBar) {
      const styles = getComputedStyle(document.documentElement);
      const color = styles.getPropertyValue('--theme-base').trim() || (resolved === 'dark' ? '#101922' : '#F6F8FB');
      const symbolColor = styles.getPropertyValue('--theme-muted').trim() || (resolved === 'dark' ? '#9dabb9' : '#475569');
      electron.updateTitleBar({ color, symbolColor });
    }
  } catch { /* ignore */ }
}

let systemThemeListener: (() => void) | null = null;

function setupSystemListener(theme: Theme): void {
  if (systemThemeListener) {
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', systemThemeListener);
    systemThemeListener = null;
  }
  if (theme === 'system') {
    systemThemeListener = () => applyTheme('system');
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', systemThemeListener);
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: 'dark',
  uiLanguage: 'en',
  ttsLanguage: 'auto',
  hotkeyMode: 'toggle',
  overlayEnabled: true,
  minimizeToTray: true,
  showNotifications: true,
  hotkeys: {
    dictate: 'Alt+X',
    read_clipboard: 'Ctrl+Shift+R',
    stt_paste: 'Alt+Shift+S',
    translate: 'Alt+T',
    overlay_toggle: 'Alt+W',
  },
  translateEnabled: false,
  translateTo: 'es',
  audioDevice: null,

  setTheme: (theme) => {
    set({ theme });
    persist({ theme });
    applyTheme(theme);
    setupSystemListener(theme);
  },

  setUiLanguage: (uiLanguage) => {
    set({ uiLanguage });
    persist({ uiLanguage });
  },

  setTtsLanguage: (ttsLanguage) => {
    const next = normalizeTtsLanguage(ttsLanguage);
    set({ ttsLanguage: next });
    persist({ ttsLanguage: next });
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
    if (overlayEnabled) electron?.showOverlay?.();
    else electron?.hideOverlay?.();
  },

  resetOverlayPosition: () => {
    electron?.resetOverlayPosition?.();
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

  setTranslateEnabled: (translateEnabled) => {
    set({ translateEnabled });
    persist({ translateEnabled });
  },

  setTranslateTo: (translateTo) => {
    set({ translateTo });
    persist({ translateTo });
  },

  setAudioDevice: (audioDevice) => {
    set({ audioDevice });
    persist({ audioDevice });
  },

  setHotkey: (action, accelerator) => {
    const hotkeys = { ...get().hotkeys, [action]: accelerator };
    set({ hotkeys });
    persist({ hotkeys });
    electron?.updateHotkeys(hotkeys);
  },

  load: () => {
    const saved = loadFromStorage();
    const ttsLanguage = normalizeTtsLanguage((saved as { ttsLanguage?: string })?.ttsLanguage);
    set({ ...saved, ttsLanguage });
    // Apply theme
    const theme = (saved.theme as Theme) || 'dark';
    applyTheme(theme);
    setupSystemListener(theme);
    // Sync to Electron main process
    if (saved.hotkeys) electron?.updateHotkeys(saved.hotkeys as Record<string, string>);
    if (saved.minimizeToTray !== undefined) electron?.updateTraySettings({ minimizeToTray: saved.minimizeToTray as boolean });
    if (saved.hotkeyMode) electron?.updateSttSettings({ hotkey_mode: saved.hotkeyMode as string });
    if (saved.overlayEnabled !== undefined) {
      const enabled = saved.overlayEnabled as boolean;
      electron?.updateSttSettings({ overlay_enabled: enabled });
      if (enabled) electron?.showOverlay?.();
      else electron?.hideOverlay?.();
    }
  },
}));
