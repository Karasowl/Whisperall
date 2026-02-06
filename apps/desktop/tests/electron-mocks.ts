import { vi } from 'vitest';

// Mock electron module for testing
export const mockIpcMain = {
  on: vi.fn(),
  handle: vi.fn(),
};

export const mockGlobalShortcut = {
  register: vi.fn().mockReturnValue(true),
  unregisterAll: vi.fn(),
};

export const mockBrowserWindow = vi.fn();
export const mockApp = {
  isPackaged: false,
  getPath: vi.fn().mockReturnValue('/tmp/test'),
  requestSingleInstanceLock: vi.fn().mockReturnValue(true),
  whenReady: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  quit: vi.fn(),
  commandLine: { appendSwitch: vi.fn() },
};

export const mockClipboard = {
  readText: vi.fn().mockReturnValue('clipboard text'),
  writeText: vi.fn(),
};

export const mockShell = {
  openExternal: vi.fn().mockResolvedValue(undefined),
};

export const mockNotification = vi.fn().mockImplementation(() => ({
  show: vi.fn(),
}));

export const mockTray = vi.fn();
export const mockMenu = { buildFromTemplate: vi.fn().mockReturnValue({}) };
export const mockNativeImage = { createFromPath: vi.fn().mockReturnValue({}) };
export const mockSession = {
  defaultSession: {
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
  },
};
export const mockScreen = {
  getAllDisplays: vi.fn().mockReturnValue([
    { workArea: { x: 0, y: 0, width: 1920, height: 1080 }, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
  ]),
};

vi.mock('electron', () => ({
  app: mockApp,
  BrowserWindow: mockBrowserWindow,
  globalShortcut: mockGlobalShortcut,
  ipcMain: mockIpcMain,
  clipboard: mockClipboard,
  shell: mockShell,
  Notification: mockNotification,
  Tray: mockTray,
  Menu: mockMenu,
  nativeImage: mockNativeImage,
  session: mockSession,
  screen: mockScreen,
}));
