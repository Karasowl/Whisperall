import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/electron', () => ({
  electron: {
    updateHotkeys: vi.fn(),
    updateSttSettings: vi.fn(),
    updateTraySettings: vi.fn(),
  },
}));

// Mock localStorage
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
});

import { useSettingsStore } from '../../src/stores/settings';
import { electron } from '../../src/lib/electron';

describe('Settings store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage mock
    Object.keys(store).forEach((k) => delete store[k]);
    // Reset store
    useSettingsStore.setState({
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
    });
  });

  it('has correct defaults', () => {
    const s = useSettingsStore.getState();
    expect(s.language).toBe('en');
    expect(s.hotkeyMode).toBe('toggle');
    expect(s.overlayEnabled).toBe(true);
    expect(s.hotkeys.dictate).toBe('Alt+X');
  });

  it('setLanguage updates language and persists', () => {
    useSettingsStore.getState().setLanguage('es');
    expect(useSettingsStore.getState().language).toBe('es');
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
      language: 'fr',
      hotkeyMode: 'hold',
      hotkeys: { dictate: 'Ctrl+F' },
    });

    useSettingsStore.getState().load();

    expect(useSettingsStore.getState().language).toBe('fr');
    expect(useSettingsStore.getState().hotkeyMode).toBe('hold');
    expect(electron?.updateHotkeys).toHaveBeenCalled();
  });

  it('load handles missing localStorage gracefully', () => {
    // No data in store
    useSettingsStore.getState().load();
    // Should not throw, defaults remain
    expect(useSettingsStore.getState().language).toBe('en');
  });
});
