import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/audio', () => ({
  getMicStream: vi.fn(),
  stopMicStream: vi.fn(),
  getSystemAudioStream: vi.fn(),
  stopSystemStream: vi.fn(),
  getMeetingAudioStream: vi.fn(),
  stopMeetingStream: vi.fn(),
}));

let mockDgStart = vi.fn();
let mockDgStop = vi.fn();
let lastOnEvent: ((event: any) => void) | null = null;

vi.mock('../../src/lib/deepgram-stream', () => ({
  DeepgramStream: vi.fn().mockImplementation((opts) => {
    lastOnEvent = (opts as any)?.onEvent ?? null;
    return {
      start: mockDgStart,
      stop: mockDgStop,
    };
  }),
}));

vi.mock('../../src/lib/electron', () => ({
  electron: { sendSubtitleText: vi.fn() },
}));

vi.mock('../../src/stores/documents', () => ({
  useDocumentsStore: {
    getState: vi.fn(() => ({ createDocument: vi.fn().mockResolvedValue({}) })),
  },
}));

import { useLiveStore } from '../../src/stores/live';
import { useSettingsStore } from '../../src/stores/settings';
import {
  getMicStream, getSystemAudioStream, getMeetingAudioStream,
  stopSystemStream, stopMeetingStream,
} from '../../src/lib/audio';
import { DeepgramStream } from '../../src/lib/deepgram-stream';

const mockGetMic = vi.mocked(getMicStream);
const mockGetSystem = vi.mocked(getSystemAudioStream);
const mockGetMeeting = vi.mocked(getMeetingAudioStream);
const mockStopSystem = vi.mocked(stopSystemStream);
const mockStopMeeting = vi.mocked(stopMeetingStream);

function makeStream() {
  const track = { label: 'test', enabled: true, muted: false };
  return { active: true, getAudioTracks: () => [track] } as unknown as MediaStream;
}

describe('Live store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDgStart = vi.fn();
    mockDgStop = vi.fn();
    lastOnEvent = null;
    vi.mocked(DeepgramStream).mockImplementation((opts: any) => {
      lastOnEvent = opts?.onEvent ?? null;
      return {
        start: mockDgStart,
        stop: mockDgStop,
      } as any;
    });
    useSettingsStore.setState({ audioDevice: null, systemIncludeMic: false });
    useLiveStore.setState({
      status: 'idle', source: 'mic', segments: [],
      interimText: '', error: null,
    });
  });

  it('starts idle with mic source', () => {
    const s = useLiveStore.getState();
    expect(s.status).toBe('idle');
    expect(s.source).toBe('mic');
    expect(s.segments).toHaveLength(0);
    expect(s.interimText).toBe('');
  });

  it('start with mic calls getMicStream and creates DeepgramStream', async () => {
    const stream = makeStream();
    mockGetMic.mockResolvedValue(stream);

    await useLiveStore.getState().start();
    expect(useLiveStore.getState().status).toBe('recording');
    expect(mockGetMic).toHaveBeenCalled();
    expect(DeepgramStream).toHaveBeenCalled();
    expect(mockDgStart).toHaveBeenCalledWith(stream);
  });

  it('start with system calls getSystemAudioStream when include-mic is disabled', async () => {
    useLiveStore.setState({ source: 'system' });
    const stream = makeStream();
    mockGetSystem.mockResolvedValue(stream);

    await useLiveStore.getState().start();
    expect(mockGetSystem).toHaveBeenCalled();
    expect(mockDgStart).toHaveBeenCalledWith(stream);
  });

  it('start with system calls getMeetingAudioStream when include-mic is enabled', async () => {
    useLiveStore.setState({ source: 'system' });
    useSettingsStore.setState({ systemIncludeMic: true, audioDevice: 'dev1' });
    const stream = makeStream();
    mockGetMeeting.mockResolvedValue(stream);

    await useLiveStore.getState().start();
    expect(mockGetMeeting).toHaveBeenCalledWith('dev1');
    expect(mockDgStart).toHaveBeenCalledWith(stream);
  });

  it('start sets error on stream failure', async () => {
    mockGetMic.mockRejectedValue(new Error('No permission'));
    await useLiveStore.getState().start();
    expect(useLiveStore.getState().status).toBe('error');
    expect(useLiveStore.getState().error).toBe('No permission');
  });

  it('start is idempotent when recording', async () => {
    useLiveStore.setState({ status: 'recording' });
    await useLiveStore.getState().start();
    expect(mockGetMic).not.toHaveBeenCalled();
  });

  it('setSource updates source', () => {
    useLiveStore.getState().setSource('system');
    expect(useLiveStore.getState().source).toBe('system');
  });

  it('stop commits interim text and calls dgStream.stop', async () => {
    const stream = makeStream();
    mockGetMic.mockResolvedValue(stream);
    await useLiveStore.getState().start();

    useLiveStore.setState({ interimText: 'partial text' });
    useLiveStore.getState().stop();

    expect(mockDgStop).toHaveBeenCalled();
    expect(useLiveStore.getState().status).toBe('idle');
    expect(useLiveStore.getState().interimText).toBe('');
    // Interim text committed as segment
    expect(useLiveStore.getState().segments).toHaveLength(1);
    expect(useLiveStore.getState().segments[0].text).toBe('partial text');
  });

  it('stop with system include-mic disabled stops system capture', async () => {
    useLiveStore.setState({ source: 'system' });
    const stream = makeStream();
    mockGetSystem.mockResolvedValue(stream);
    await useLiveStore.getState().start();

    useLiveStore.getState().stop();
    expect(mockStopSystem).toHaveBeenCalled();
    expect(mockStopMeeting).not.toHaveBeenCalled();
  });

  it('stop with system include-mic enabled stops meeting capture', async () => {
    useLiveStore.setState({ source: 'system' });
    useSettingsStore.setState({ systemIncludeMic: true });
    const stream = makeStream();
    mockGetMeeting.mockResolvedValue(stream);
    await useLiveStore.getState().start();

    useLiveStore.getState().stop();
    expect(mockStopMeeting).toHaveBeenCalled();
  });

  it('clears transient error on stream open (reconnect)', async () => {
    const stream = makeStream();
    mockGetMic.mockResolvedValue(stream);

    await useLiveStore.getState().start();
    expect(lastOnEvent).toBeTruthy();

    lastOnEvent!({ type: 'error', message: 'WebSocket connection error' });
    expect(useLiveStore.getState().error).toBe('WebSocket connection error');

    lastOnEvent!({ type: 'open' });
    expect(useLiveStore.getState().error).toBeNull();
  });

  it('surfaces an error when the stream closes unexpectedly', async () => {
    const stream = makeStream();
    mockGetMic.mockResolvedValue(stream);

    await useLiveStore.getState().start();
    expect(useLiveStore.getState().status).toBe('recording');
    expect(lastOnEvent).toBeTruthy();

    lastOnEvent!({ type: 'close' });
    expect(mockDgStop).toHaveBeenCalled();
    expect(useLiveStore.getState().status).toBe('error');
    expect(useLiveStore.getState().error).toBe('WebSocket connection closed');
  });

  it('reset clears segments and returns idle', () => {
    useLiveStore.setState({
      status: 'idle',
      segments: [{ id: '1', text: 'hi', created_at: '' }] as any,
    });
    useLiveStore.getState().reset();
    expect(useLiveStore.getState().status).toBe('idle');
    expect(useLiveStore.getState().segments).toHaveLength(0);
    expect(useLiveStore.getState().interimText).toBe('');
  });
});
