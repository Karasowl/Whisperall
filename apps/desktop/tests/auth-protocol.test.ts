import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApp } from './electron-mocks';

import './electron-mocks';

const originalArgv1 = process.argv[1];
const originalDefaultApp = (process as NodeJS.Process & { defaultApp?: boolean }).defaultApp;

function setDefaultApp(value: boolean): void {
  Object.defineProperty(process, 'defaultApp', {
    configurable: true,
    writable: true,
    value,
  });
}

describe('Auth protocol registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    process.argv[1] = originalArgv1;
    Object.defineProperty(process, 'defaultApp', {
      configurable: true,
      writable: true,
      value: originalDefaultApp,
    });
  });

  it('registers protocol with absolute app path in dev mode', async () => {
    setDefaultApp(true);
    process.argv[1] = '.';

    const { registerProtocol } = await import('../electron/modules/auth.js');
    registerProtocol();

    expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledWith(
      'whisperall',
      process.execPath,
      [path.resolve('.')],
    );
  });

  it('registers protocol without args in packaged mode', async () => {
    setDefaultApp(false);

    const { registerProtocol } = await import('../electron/modules/auth.js');
    registerProtocol();

    expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledWith('whisperall');
  });
});

