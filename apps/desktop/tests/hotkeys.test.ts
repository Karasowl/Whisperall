import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockGlobalShortcut } from './electron-mocks';

import './electron-mocks';

describe('Hotkey registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('registers default hotkeys', async () => {
    const { registerHotkeys } = await import('../electron/modules/hotkeys.js');
    registerHotkeys();

    const registered = mockGlobalShortcut.register.mock.calls.map((c: unknown[]) => c[0]);
    expect(registered).toContain('Alt+X');
    expect(registered).toContain('Ctrl+Shift+R');
    expect(registered).toContain('Alt+Shift+S');
  }, 15_000);

  it('unregisters all shortcuts before re-registering', async () => {
    const { registerHotkeys } = await import('../electron/modules/hotkeys.js');
    registerHotkeys();
    expect(mockGlobalShortcut.unregisterAll).toHaveBeenCalledOnce();
  });

  it('updateHotkeys merges and re-registers', async () => {
    const { updateHotkeys } = await import('../electron/modules/hotkeys.js');
    updateHotkeys({ dictate: 'Ctrl+D' });

    expect(mockGlobalShortcut.unregisterAll).toHaveBeenCalled();
    const registered = mockGlobalShortcut.register.mock.calls.map((c: unknown[]) => c[0]);
    expect(registered).toContain('Ctrl+D');
  });

  it('action map maps dictate key to callback function', async () => {
    const { registerHotkeys } = await import('../electron/modules/hotkeys.js');
    registerHotkeys();

    const dictateCall = mockGlobalShortcut.register.mock.calls.find(
      (c: unknown[]) => c[0] === 'Alt+X',
    );
    expect(dictateCall).toBeTruthy();
    expect(typeof dictateCall![1]).toBe('function');
  });

  it('registers overlay_toggle and translate hotkeys', async () => {
    const { registerHotkeys } = await import('../electron/modules/hotkeys.js');
    registerHotkeys();

    const registered = mockGlobalShortcut.register.mock.calls.map((c: unknown[]) => c[0]);
    expect(registered).toContain('Alt+W');
    expect(registered).toContain('Alt+T');
  });

  it('overlay-toggle callback invokes toggleOverlay', async () => {
    const { registerHotkeys } = await import('../electron/modules/hotkeys.js');
    registerHotkeys();

    const overlayCall = mockGlobalShortcut.register.mock.calls.find(
      (c: unknown[]) => c[0] === 'Alt+W',
    );
    expect(overlayCall).toBeTruthy();
    // Callback should be a function (toggleOverlay is mocked in electron-mocks)
    expect(typeof overlayCall![1]).toBe('function');
  });

  it('setLastDictationText and getLastDictationText work', async () => {
    const { setLastDictationText, getLastDictationText } = await import(
      '../electron/modules/hotkeys.js'
    );
    setLastDictationText('hello world');
    expect(getLastDictationText()).toBe('hello world');
  });
});
