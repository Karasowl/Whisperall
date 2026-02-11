import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../../src/lib/audio', () => ({
  getMicStream: vi.fn(),
  stopMicStream: vi.fn(),
  createLiveRecorder: vi.fn(),
}));

vi.mock('../../src/lib/api', () => ({
  api: {
    dictate: { send: vi.fn() },
    translate: { translate: vi.fn() },
  },
}));

vi.mock('../../src/stores/settings', () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({ translateEnabled: false, translateTo: 'es' })),
  },
}));

vi.mock('../../src/lib/electron', () => ({
  electron: {
    setDictationText: vi.fn(),
  },
}));

vi.mock('../../src/stores/documents', () => ({
  useDocumentsStore: {
    getState: vi.fn(() => ({ createDocument: vi.fn().mockResolvedValue({}) })),
  },
}));

import { useDictationStore } from '../../src/stores/dictation';
import { getMicStream, createLiveRecorder, stopMicStream } from '../../src/lib/audio';
import { api } from '../../src/lib/api';
import { useSettingsStore } from '../../src/stores/settings';

const mockGetMicStream = vi.mocked(getMicStream);
const mockCreateLiveRecorder = vi.mocked(createLiveRecorder);
const mockStopMicStream = vi.mocked(stopMicStream);
const mockDictateSend = vi.mocked(api.dictate.send);
const mockTranslate = vi.mocked(api.translate.translate);
const mockSettingsGetState = vi.mocked(useSettingsStore.getState);

let capturedOnChunk: ((blob: Blob) => Promise<void>) | null = null;
let mockLiveRecStop: ReturnType<typeof vi.fn>;

describe('Dictation store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnChunk = null;
    mockLiveRecStop = vi.fn();
    useDictationStore.setState({
      status: 'idle',
      text: '',
      translatedText: '',
      error: null,
    });

    mockCreateLiveRecorder.mockImplementation((_stream, onChunk, _interval) => {
      capturedOnChunk = onChunk as any;
      return { stop: mockLiveRecStop, state: 'recording' };
    });
  });

  it('starts in idle state', () => {
    const state = useDictationStore.getState();
    expect(state.status).toBe('idle');
    expect(state.text).toBe('');
    expect(state.error).toBeNull();
  });

  it('start transitions to recording with 30s flush interval', async () => {
    const mockStream = { active: true } as MediaStream;
    mockGetMicStream.mockResolvedValue(mockStream);

    await useDictationStore.getState().start();

    expect(useDictationStore.getState().status).toBe('recording');
    expect(mockGetMicStream).toHaveBeenCalled();
    expect(mockCreateLiveRecorder).toHaveBeenCalledWith(mockStream, expect.any(Function), 30_000);
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

    expect(mockGetMicStream).not.toHaveBeenCalled();
  });

  it('auto-flush sends chunk and accumulates text while recording', async () => {
    mockGetMicStream.mockResolvedValue({ active: true } as MediaStream);
    mockDictateSend.mockResolvedValue({ text: 'Hello' });

    await useDictationStore.getState().start();
    expect(capturedOnChunk).toBeTruthy();

    // Simulate 30s auto-flush
    await capturedOnChunk!(new Blob(['audio']));

    expect(mockDictateSend).toHaveBeenCalled();
    expect(useDictationStore.getState().text).toBe('Hello');
    expect(useDictationStore.getState().status).toBe('recording'); // stays recording
  });

  it('auto-flush accumulates text across multiple chunks', async () => {
    mockGetMicStream.mockResolvedValue({ active: true } as MediaStream);
    mockDictateSend
      .mockResolvedValueOnce({ text: 'Hello' })
      .mockResolvedValueOnce({ text: 'world' });

    await useDictationStore.getState().start();
    await capturedOnChunk!(new Blob(['a1']));
    await capturedOnChunk!(new Blob(['a2']));

    expect(useDictationStore.getState().text).toBe('Hello world');
  });

  it('auto-flush translates when enabled', async () => {
    mockGetMicStream.mockResolvedValue({ active: true } as MediaStream);
    mockDictateSend.mockResolvedValue({ text: 'Hello' });
    mockTranslate.mockResolvedValue({ text: 'Hola' } as any);
    mockSettingsGetState.mockReturnValue({ translateEnabled: true, translateTo: 'es' } as any);

    await useDictationStore.getState().start();
    await capturedOnChunk!(new Blob(['audio']));

    expect(mockTranslate).toHaveBeenCalledWith({ text: 'Hello', target_language: 'es' });
    expect(useDictationStore.getState().translatedText).toBe('Hola');
  });

  it('auto-flush continues on chunk error', async () => {
    mockGetMicStream.mockResolvedValue({ active: true } as MediaStream);
    mockDictateSend
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ text: 'retry ok' });

    await useDictationStore.getState().start();
    await capturedOnChunk!(new Blob(['bad']));
    expect(useDictationStore.getState().status).toBe('recording'); // still recording

    await capturedOnChunk!(new Blob(['good']));
    expect(useDictationStore.getState().text).toBe('retry ok');
  });

  it('stop transitions through processing to done', async () => {
    vi.useFakeTimers();
    mockGetMicStream.mockResolvedValue({ active: true } as MediaStream);
    await useDictationStore.getState().start();

    useDictationStore.getState().stop();

    expect(useDictationStore.getState().status).toBe('processing');
    expect(mockLiveRecStop).toHaveBeenCalled();
    expect(mockStopMicStream).toHaveBeenCalled();

    // Safety timeout sets done
    vi.advanceTimersByTime(3000);
    expect(useDictationStore.getState().status).toBe('done');

    vi.useRealTimers();
  });

  it('stop is no-op when no recorder exists', () => {
    useDictationStore.getState().stop();
    expect(useDictationStore.getState().status).toBe('idle');
  });

  it('reset returns to idle', () => {
    useDictationStore.setState({
      status: 'done',
      text: 'some text',
      translatedText: 'trad',
      error: 'some error',
    });

    useDictationStore.getState().reset();

    expect(useDictationStore.getState().status).toBe('idle');
    expect(useDictationStore.getState().text).toBe('');
    expect(useDictationStore.getState().translatedText).toBe('');
    expect(useDictationStore.getState().error).toBeNull();
    expect(mockStopMicStream).toHaveBeenCalled();
  });

  it('reset clears translatedText', () => {
    useDictationStore.setState({ translatedText: 'Hola', status: 'done', text: 'Hello' });
    useDictationStore.getState().reset();
    expect(useDictationStore.getState().translatedText).toBe('');
  });
});
