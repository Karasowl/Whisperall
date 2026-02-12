import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/electron', () => ({
  electron: {
    updateHotkeys: vi.fn(),
    updateSttSettings: vi.fn(),
    updateTraySettings: vi.fn(),
    showOverlay: vi.fn(),
    hideOverlay: vi.fn(),
    resetOverlayPosition: vi.fn(),
  },
}));

// Mock localStorage
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
});

// Mock matchMedia for theme tests
const mockMatchMedia = vi.fn((query: string) => ({
  matches: query === '(prefers-color-scheme: dark)',
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));
vi.stubGlobal('matchMedia', mockMatchMedia);

// Mock window for applyTheme which uses window.matchMedia
vi.stubGlobal('window', { matchMedia: mockMatchMedia });

// Mock document.documentElement.classList for applyTheme
const classList = new Set<string>();
vi.stubGlobal('document', {
  documentElement: {
    classList: {
      add: (...classes: string[]) => classes.forEach((c) => classList.add(c)),
      remove: (...classes: string[]) => classes.forEach((c) => classList.delete(c)),
      contains: (c: string) => classList.has(c),
    },
    className: '',
  },
});

import { useSettingsStore, applyTheme } from '../../src/stores/settings';
import { electron } from '../../src/lib/electron';

describe('Settings store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(store).forEach((k) => delete store[k]);
    classList.clear();
    useSettingsStore.setState({
      theme: 'dark',
      uiLanguage: 'en',
      hotkeyMode: 'toggle',
      overlayEnabled: true,
      minimizeToTray: true,
      showNotifications: true,
      translateEnabled: false,
      translateTo: 'es',
      hotkeys: {
        dictate: 'Alt+X',
        read_clipboard: 'Ctrl+Shift+R',
        stt_paste: 'Alt+Shift+S',
        translate: 'Alt+T',
        overlay_toggle: 'Alt+W',
      },
    });
  });

  it('has correct defaults', () => {
    const s = useSettingsStore.getState();
    expect(s.theme).toBe('dark');
    expect(s.uiLanguage).toBe('en');
    expect(s.hotkeyMode).toBe('toggle');
    expect(s.overlayEnabled).toBe(true);
    expect(s.hotkeys.dictate).toBe('Alt+X');
  });

  it('setTheme updates theme, persists, and applies', () => {
    useSettingsStore.getState().setTheme('light');
    expect(useSettingsStore.getState().theme).toBe('light');
    expect(localStorage.setItem).toHaveBeenCalled();
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('setTheme system resolves via matchMedia', () => {
    useSettingsStore.getState().setTheme('system');
    expect(useSettingsStore.getState().theme).toBe('system');
    // matchMedia returns matches=true for dark, so class should be 'dark'
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('setUiLanguage updates and persists', () => {
    useSettingsStore.getState().setUiLanguage('es');
    expect(useSettingsStore.getState().uiLanguage).toBe('es');
    expect(localStorage.setItem).toHaveBeenCalled();
  });

  it('setHotkeyMode syncs to Electron', () => {
    useSettingsStore.getState().setHotkeyMode('hold');
    expect(useSettingsStore.getState().hotkeyMode).toBe('hold');
    expect(electron?.updateSttSettings).toHaveBeenCalledWith({ hotkey_mode: 'hold' });
  });

  it('setOverlayEnabled syncs to Electron', () => {
    useSettingsStore.getState().setOverlayEnabled(false);
    expect(useSettingsStore.getState().overlayEnabled).toBe(false);
    expect(electron?.updateSttSettings).toHaveBeenCalledWith({ overlay_enabled: false });
    expect(electron?.hideOverlay).toHaveBeenCalled();
  });

  it('resetOverlayPosition syncs to Electron', () => {
    useSettingsStore.getState().resetOverlayPosition();
    expect(electron?.resetOverlayPosition).toHaveBeenCalled();
  });

  it('setMinimizeToTray syncs to Electron', () => {
    useSettingsStore.getState().setMinimizeToTray(false);
    expect(useSettingsStore.getState().minimizeToTray).toBe(false);
    expect(electron?.updateTraySettings).toHaveBeenCalledWith({ minimizeToTray: false });
  });

  it('setHotkey updates specific key and syncs', () => {
    useSettingsStore.getState().setHotkey('dictate', 'Ctrl+D');
    expect(useSettingsStore.getState().hotkeys.dictate).toBe('Ctrl+D');
    expect(electron?.updateHotkeys).toHaveBeenCalledWith(
      expect.objectContaining({ dictate: 'Ctrl+D' }),
    );
  });

  it('load restores from localStorage', () => {
    store['whisperall-settings'] = JSON.stringify({
      theme: 'light',
      uiLanguage: 'es',
      hotkeyMode: 'hold',
      hotkeys: { dictate: 'Ctrl+F' },
    });

    useSettingsStore.getState().load();

    expect(useSettingsStore.getState().theme).toBe('light');
    expect(useSettingsStore.getState().uiLanguage).toBe('es');
    expect(useSettingsStore.getState().hotkeyMode).toBe('hold');
    expect(electron?.updateHotkeys).toHaveBeenCalled();
  });

  it('load handles missing localStorage gracefully', () => {
    useSettingsStore.getState().load();
    expect(useSettingsStore.getState().theme).toBe('dark');
  });

  it('setTranslateEnabled updates and persists', () => {
    useSettingsStore.getState().setTranslateEnabled(true);
    expect(useSettingsStore.getState().translateEnabled).toBe(true);
    expect(localStorage.setItem).toHaveBeenCalled();
  });

  it('setTranslateTo updates and persists', () => {
    useSettingsStore.getState().setTranslateTo('fr');
    expect(useSettingsStore.getState().translateTo).toBe('fr');
    expect(localStorage.setItem).toHaveBeenCalled();
  });

  it('load syncs overlayEnabled to Electron', () => {
    store['whisperall-settings'] = JSON.stringify({ overlayEnabled: false });
    useSettingsStore.getState().load();
    expect(useSettingsStore.getState().overlayEnabled).toBe(false);
    expect(electron?.updateSttSettings).toHaveBeenCalledWith({ overlay_enabled: false });
    expect(electron?.hideOverlay).toHaveBeenCalled();
  });

  it('applyTheme sets correct class for dark', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('applyTheme sets correct class for light', () => {
    applyTheme('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
