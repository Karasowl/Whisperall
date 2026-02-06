import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockClipboard } from './electron-mocks';

import './electron-mocks';

describe('Clipboard module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('readClipboard returns clipboard text', async () => {
    const { readClipboard } = await import('../electron/modules/clipboard.js');
    mockClipboard.readText.mockReturnValue('test text');
    expect(readClipboard()).toBe('test text');
  });

  it('pasteText writes to clipboard', async () => {
    const { pasteText } = await import('../electron/modules/clipboard.js');
    await pasteText('hello');
    expect(mockClipboard.writeText).toHaveBeenCalledWith('hello');
  });

  it('pasteText debounces rapid calls', async () => {
    const { pasteText } = await import('../electron/modules/clipboard.js');
    await pasteText('first');
    expect(mockClipboard.writeText).toHaveBeenCalledTimes(1);
    await pasteText('second'); // within 700ms, should be ignored
    expect(mockClipboard.writeText).toHaveBeenCalledTimes(1);
  });

  it('pasteText skips empty text', async () => {
    const { pasteText } = await import('../electron/modules/clipboard.js');
    await pasteText('');
    expect(mockClipboard.writeText).not.toHaveBeenCalled();
  });
});
