import { create } from 'zustand';
import { electron } from '../lib/electron';
import { normalizeLanguageCode, type TTSSupportedLanguage } from '../lib/lang-detect';

export type Theme = 'light' | 'dark' | 'system';
export type UiLocale = 'en' | 'es';
export type TtsLanguage = 'auto' | TTSSupportedLanguage;
export type ReaderTheme = 'paper' | 'dark' | 'high_contrast';
export type ReaderHighlightMode = 'word' | 'sentence' | 'paragraph' | 'none';

export type ReaderDisplaySettings = {
  font_size: number;
  line_height: number;
  letter_spacing: number;
  theme: ReaderTheme;
  highlight_mode: ReaderHighlightMode;
  captions_on: boolean;
};

export type SettingsState = {
  theme: Theme;
  uiLanguage: UiLocale;
  codexApiKey: string;
  claudeApiKey: string;
  ttsLanguage: TtsLanguage;
  ttsVoice: string;
  hotkeyMode: 'toggle' | 'hold';
  overlayEnabled: boolean;
  minimizeToTray: boolean;
  showNotifications: boolean;
  hotkeys: Record<string, string>;
  translateEnabled: boolean;
  translateTo: string;
  audioDevice: string | null;
  systemIncludeMic: boolean;
  readerDisplay: ReaderDisplaySettings;

  setTheme: (theme: Theme) => void;
  setUiLanguage: (lang: UiLocale) => void;
  setCodexApiKey: (value: string) => void;
  setClaudeApiKey: (value: string) => void;
  setTtsLanguage: (lang: string) => void;
  setTtsVoice: (voice: string) => void;
  setHotkeyMode: (mode: 'toggle' | 'hold') => void;
  setOverlayEnabled: (enabled: boolean) => void;
  resetOverlayPosition: () => void;
  setMinimizeToTray: (enabled: boolean) => void;
  setShowNotifications: (enabled: boolean) => void;
  setHotkey: (action: string, accelerator: string) => void;
  setTranslateEnabled: (enabled: boolean) => void;
  setTranslateTo: (lang: string) => void;
  setAudioDevice: (deviceId: string | null) => void;
  setSystemIncludeMic: (enabled: boolean) => void;
  setReaderDisplay: (patch: Partial<ReaderDisplaySettings>) => void;
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

function normalizeTtsVoice(input: string | undefined): string {
  const raw = (input ?? '').trim();
  if (!raw || raw.toLowerCase() === 'auto') return 'auto';
  return raw;
}

function normalizeReaderDisplay(input: unknown): ReaderDisplaySettings {
  const base: ReaderDisplaySettings = {
    font_size: 22,
    line_height: 1.65,
    letter_spacing: 0,
    theme: 'paper',
    highlight_mode: 'sentence',
    captions_on: true,
  };
  if (!input || typeof input !== 'object') return base;
  const raw = input as Partial<ReaderDisplaySettings>;
  const theme = raw.theme === 'dark' || raw.theme === 'high_contrast' || raw.theme === 'paper' ? raw.theme : base.theme;
  const highlight =
    raw.highlight_mode === 'word' ||
    raw.highlight_mode === 'sentence' ||
    raw.highlight_mode === 'paragraph' ||
    raw.highlight_mode === 'none'
      ? raw.highlight_mode
      : base.highlight_mode;
  return {
    font_size: Number.isFinite(raw.font_size) ? Math.min(42, Math.max(12, Number(raw.font_size))) : base.font_size,
    line_height: Number.isFinite(raw.line_height) ? Math.min(2.6, Math.max(1.2, Number(raw.line_height))) : base.line_height,
    letter_spacing: Number.isFinite(raw.letter_spacing) ? Math.min(6, Math.max(-1, Number(raw.letter_spacing))) : base.letter_spacing,
    theme,
    highlight_mode: highlight,
    captions_on: typeof raw.captions_on === 'boolean' ? raw.captions_on : base.captions_on,
  };
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
  codexApiKey: '',
  claudeApiKey: '',
  ttsLanguage: 'auto',
  ttsVoice: 'auto',
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
  systemIncludeMic: false,
  readerDisplay: {
    font_size: 22,
    line_height: 1.65,
    letter_spacing: 0,
    theme: 'paper',
    highlight_mode: 'sentence',
    captions_on: true,
  },

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

  setCodexApiKey: (codexApiKey) => {
    const next = codexApiKey.trim();
    set({ codexApiKey: next });
    persist({ codexApiKey: next });
  },

  setClaudeApiKey: (claudeApiKey) => {
    const next = claudeApiKey.trim();
    set({ claudeApiKey: next });
    persist({ claudeApiKey: next });
  },

  setTtsLanguage: (ttsLanguage) => {
    const next = normalizeTtsLanguage(ttsLanguage);
    set({ ttsLanguage: next });
    persist({ ttsLanguage: next });
  },

  setTtsVoice: (ttsVoice) => {
    const next = normalizeTtsVoice(ttsVoice);
    set({ ttsVoice: next });
    persist({ ttsVoice: next });
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

  setSystemIncludeMic: (systemIncludeMic) => {
    set({ systemIncludeMic });
    persist({ systemIncludeMic });
  },

  setReaderDisplay: (patch) => {
    const next = { ...get().readerDisplay, ...patch };
    set({ readerDisplay: next });
    persist({ readerDisplay: next });
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
    const ttsVoice = normalizeTtsVoice((saved as { ttsVoice?: string })?.ttsVoice);
    const readerDisplay = normalizeReaderDisplay((saved as { readerDisplay?: unknown })?.readerDisplay);
    set({ ...saved, ttsLanguage, ttsVoice, readerDisplay });
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
