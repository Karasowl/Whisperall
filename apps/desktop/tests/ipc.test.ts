import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockIpcMain } from './electron-mocks';

import './electron-mocks';

describe('IPC channel registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('registers all expected IPC channels', async () => {
    const { registerIpcHandlers } = await import('../electron/modules/ipc.js');
    registerIpcHandlers();

    const onChannels = mockIpcMain.on.mock.calls.map((c: unknown[]) => c[0]);
    const handleChannels = mockIpcMain.handle.mock.calls.map((c: unknown[]) => c[0]);
    const allChannels = [...onChannels, ...handleChannels];

    const expectedChannels = [
      'update-hotkeys',
      'update-stt-settings',
      'set-dictation-text',
      'overlay:show',
      'overlay:hide',
      'overlay:toggle',
      'overlay:resize',
      'overlay:ignore-mouse',
      'update-tray-settings',
      'clipboard:read',
      'clipboard:paste',
      'clipboard:undo',
      'show-main-window',
      'notify',
      'open-external',
      'update-title-bar',
    ];

    for (const channel of expectedChannels) {
      expect(allChannels).toContain(channel);
    }
  });

  it('uses ipcMain.handle for async channels', async () => {
    const { registerIpcHandlers } = await import('../electron/modules/ipc.js');
    registerIpcHandlers();

    const handleChannels = mockIpcMain.handle.mock.calls.map((c: unknown[]) => c[0]);
    expect(handleChannels).toContain('clipboard:read');
    expect(handleChannels).toContain('open-external');
  });

  it('uses ipcMain.on for fire-and-forget channels', async () => {
    const { registerIpcHandlers } = await import('../electron/modules/ipc.js');
    registerIpcHandlers();

    const onChannels = mockIpcMain.on.mock.calls.map((c: unknown[]) => c[0]);
    expect(onChannels).toContain('overlay:show');
    expect(onChannels).toContain('overlay:hide');
    expect(onChannels).toContain('clipboard:paste');
    expect(onChannels).toContain('notify');
  });
});
