import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../../src/lib/audio', () => ({
  getMicStream: vi.fn(),
  stopMicStream: vi.fn(),
  createRecorder: vi.fn(),
}));

vi.mock('../../src/lib/api', () => ({
  api: {
    dictate: {
      send: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/electron', () => ({
  electron: {
    setDictationText: vi.fn(),
  },
}));

import { useDictationStore } from '../../src/stores/dictation';
import { getMicStream, createRecorder, stopMicStream } from '../../src/lib/audio';
import { api } from '../../src/lib/api';

const mockGetMicStream = vi.mocked(getMicStream);
const mockCreateRecorder = vi.mocked(createRecorder);
const mockStopMicStream = vi.mocked(stopMicStream);
const mockDictateSend = vi.mocked(api.dictate.send);

describe('Dictation store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDictationStore.setState({
      status: 'idle',
      text: '',
      error: null,
      language: 'en',
    });
  });

  it('starts in idle state', () => {
    const state = useDictationStore.getState();
    expect(state.status).toBe('idle');
    expect(state.text).toBe('');
    expect(state.error).toBeNull();
  });

  it('start transitions to recording', async () => {
    const mockStream = { active: true } as MediaStream;
    mockGetMicStream.mockResolvedValue(mockStream);
    mockCreateRecorder.mockReturnValue({ state: 'recording', stop: vi.fn(), onstop: null } as any);

    await useDictationStore.getState().start();

    expect(useDictationStore.getState().status).toBe('recording');
    expect(mockGetMicStream).toHaveBeenCalled();
    expect(mockCreateRecorder).toHaveBeenCalled();
  });

  it('start sets error on mic failure', async () => {
    mockGetMicStream.mockRejectedValue(new Error('Permission denied'));

    await useDictationStore.getState().start();

    expect(useDictationStore.getState().status).toBe('error');
    expect(useDictationStore.getState().error).toBe('Permission denied');
  });

  it('start is idempotent when already recording', async () => {
    useDictationStore.setState({ status: 'recording' });

    await useDictationStore.getState().start();

    // Should not call getMicStream again
    expect(mockGetMicStream).not.toHaveBeenCalled();
  });

  it('reset returns to idle', () => {
    useDictationStore.setState({
      status: 'done',
      text: 'some text',
      error: 'some error',
    });

    useDictationStore.getState().reset();

    expect(useDictationStore.getState().status).toBe('idle');
    expect(useDictationStore.getState().text).toBe('');
    expect(useDictationStore.getState().error).toBeNull();
    expect(mockStopMicStream).toHaveBeenCalled();
  });

  it('setLanguage updates language', () => {
    useDictationStore.getState().setLanguage('es');
    expect(useDictationStore.getState().language).toBe('es');
  });

  it('stop calls recorder.stop and processes result via onstop', async () => {
    const mockStream = { active: true } as MediaStream;
    mockGetMicStream.mockResolvedValue(mockStream);

    let capturedOnstop: (() => void) | null = null;
    const fakeRecorder = {
      state: 'recording',
      stop: vi.fn(),
      onstop: null as (() => void) | null,
    };

    mockCreateRecorder.mockReturnValue(fakeRecorder as any);
    await useDictationStore.getState().start();

    // Override stop to capture onstop and trigger it
    fakeRecorder.stop.mockImplementation(() => {
      if (fakeRecorder.onstop) fakeRecorder.onstop();
    });

    mockDictateSend.mockResolvedValue({ text: 'Hello world' });

    useDictationStore.getState().stop();

    // Wait for async onstop to complete
    await vi.waitFor(() => {
      expect(useDictationStore.getState().status).toBe('done');
    });

    expect(useDictationStore.getState().text).toBe('Hello world');
    expect(mockDictateSend).toHaveBeenCalled();
    expect(mockStopMicStream).toHaveBeenCalled();
  });

  it('stop handles API error gracefully', async () => {
    const mockStream = { active: true } as MediaStream;
    mockGetMicStream.mockResolvedValue(mockStream);

    const fakeRecorder = {
      state: 'recording',
      stop: vi.fn(),
      onstop: null as (() => void) | null,
    };

    mockCreateRecorder.mockReturnValue(fakeRecorder as any);
    await useDictationStore.getState().start();

    fakeRecorder.stop.mockImplementation(() => {
      if (fakeRecorder.onstop) fakeRecorder.onstop();
    });

    mockDictateSend.mockRejectedValue(new Error('Network error'));

    useDictationStore.getState().stop();

    await vi.waitFor(() => {
      expect(useDictationStore.getState().status).toBe('error');
    });

    expect(useDictationStore.getState().error).toBe('Network error');
  });

  it('stop is no-op when no recorder exists', () => {
    useDictationStore.getState().stop();
    // Should not throw, status stays idle
    expect(useDictationStore.getState().status).toBe('idle');
  });
});
