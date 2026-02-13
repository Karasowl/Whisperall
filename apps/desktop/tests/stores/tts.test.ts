import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/api', () => ({
  api: { tts: { synthesize: vi.fn() } },
}));

import { playTTS, stopTTS, isTTSPlaying, isTTSActive, startReading, downloadTTSAudio } from '../../src/lib/tts';
import { api } from '../../src/lib/api';

const mockSynthesize = vi.mocked(api.tts.synthesize);

let audioInstance: any = null;
(globalThis as any).URL = (globalThis as any).URL ?? {};
(globalThis as any).URL.createObjectURL = vi.fn(() => 'blob:mock');
(globalThis as any).URL.revokeObjectURL = vi.fn();
(globalThis as any).Audio = vi.fn(() => {
  audioInstance = {
    play: vi.fn().mockImplementation(() => {
      setTimeout(() => audioInstance?.onended?.(), 0);
      return Promise.resolve();
    }),
    pause: vi.fn(),
    onended: null as any,
    onerror: null as any,
    ontimeupdate: null as any,
    onloadedmetadata: null as any,
    paused: false,
    ended: false,
    currentTime: 0,
    duration: 1,
    playbackRate: 1,
  };
  return audioInstance;
});

(globalThis as any).fetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  headers: { get: () => 'audio/mpeg' },
  blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
});

describe('TTS lib', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    audioInstance = null;
    stopTTS();
  });

  it('playTTS calls api and plays audio', async () => {
    mockSynthesize.mockResolvedValue({ audio_url: 'https://example.com/a.mp3' });
    await playTTS('Hello');
    expect(mockSynthesize).toHaveBeenCalledWith({ text: 'Hello', voice: undefined, language: 'en' });
    expect(audioInstance.play).toHaveBeenCalled();
  });

  it('auto-detects Spanish for Spanish text', async () => {
    mockSynthesize.mockResolvedValue({ audio_url: 'https://example.com/a.mp3' });
    const text = '¿Cómo estás? Gracias por llamar.';
    await playTTS(text);
    expect(mockSynthesize).toHaveBeenCalledWith({ text, voice: undefined, language: 'es' });
  });

  it('playTTS passes voice and language', async () => {
    mockSynthesize.mockResolvedValue({ audio_url: 'https://example.com/a.mp3' });
    await playTTS('Hi', 'en-US-Wavenet-D', 'en');
    expect(mockSynthesize).toHaveBeenCalledWith({ text: 'Hi', voice: 'en-US-Wavenet-D', language: 'en' });
  });

  it('stopTTS pauses audio', async () => {
    mockSynthesize.mockResolvedValue({ audio_url: 'https://example.com/a.mp3' });
    await playTTS('Hello');
    const instance = audioInstance;
    stopTTS();
    expect(instance.pause).toHaveBeenCalled();
    expect(isTTSPlaying()).toBe(false);
    expect(isTTSActive()).toBe(false);
  });

  it('isTTSPlaying returns false when idle', () => {
    expect(isTTSPlaying()).toBe(false);
  });

  it('downloadTTSAudio returns null when no audio', () => {
    expect(downloadTTSAudio()).toBeNull();
  });

  it('splits long text into chunks', async () => {
    const longText = 'A'.repeat(5000) + '. ' + 'B'.repeat(3000);
    mockSynthesize.mockResolvedValue({ audio_url: 'https://example.com/a.mp3' });
    await startReading(longText);
    // Should have called synthesize at least twice (two chunks)
    expect(mockSynthesize.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
