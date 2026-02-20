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
      'overlay:subtitle',
      'overlay:drag-start',
      'overlay:drag-move',
      'overlay:drag-end',
      'overlay:reset-position',
      'update-tray-settings',
      'clipboard:read',
      'clipboard:paste',
      'clipboard:undo',
      'show-main-window',
      'notify',
      'open-external',
      'auth-storage:get',
      'auth-storage:set',
      'auth-storage:remove',
      'desktop-sources',
      'update-title-bar',
    ];

    for (const channel of expectedChannels) {
      expect(allChannels).toContain(channel);
    }
  }, 15000);

  it('uses ipcMain.handle for async channels', async () => {
    const { registerIpcHandlers } = await import('../electron/modules/ipc.js');
    registerIpcHandlers();

    const handleChannels = mockIpcMain.handle.mock.calls.map((c: unknown[]) => c[0]);
    expect(handleChannels).toContain('clipboard:read');
    expect(handleChannels).toContain('open-external');
    expect(handleChannels).toContain('auth-storage:get');
    expect(handleChannels).toContain('auth-storage:set');
    expect(handleChannels).toContain('auth-storage:remove');
    expect(handleChannels).toContain('desktop-sources');
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
