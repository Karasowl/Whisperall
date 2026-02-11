export type AudioSourceType = 'mic' | 'system';

let micStream: MediaStream | null = null;

export async function getMicStream(deviceId?: string | null): Promise<MediaStream> {
  if (micStream && micStream.active) return micStream;
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      echoCancellation: true, noiseSuppression: true,
    },
  });
  return micStream;
}

export function stopMicStream(): void {
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
}

export function createRecorder(
  stream: MediaStream,
  onChunk: (blob: Blob) => void,
  timeslice = 1500,
): MediaRecorder {
  const recorder = new MediaRecorder(stream, {
    mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm',
  });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) onChunk(e.data);
  };
  recorder.start(timeslice);
  return recorder;
}

/** Stop-restart recorder: each onChunk blob is a complete, valid audio file. */
export type LiveRecorder = { stop: () => void; readonly state: string };

export function createLiveRecorder(
  stream: MediaStream,
  onChunk: (blob: Blob) => void,
  intervalMs = 3000,
): LiveRecorder {
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';
  let active = true;
  let current: MediaRecorder | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function startSegment() {
    if (!active || !stream.active) return;
    const rec = new MediaRecorder(stream, { mimeType });
    const parts: Blob[] = [];
    current = rec;
    rec.ondataavailable = (e) => { if (e.data.size > 0) parts.push(e.data); };
    rec.onstop = () => {
      if (parts.length > 0) onChunk(new Blob(parts, { type: mimeType }));
      if (active) startSegment();
    };
    rec.start();
    timer = setTimeout(() => {
      if (rec.state === 'recording') rec.stop();
    }, intervalMs);
  }

  startSegment();
  return {
    stop() {
      active = false;
      if (timer) clearTimeout(timer);
      if (current?.state === 'recording') current.stop();
    },
    get state() { return active ? 'recording' : 'inactive'; },
  };
}

let systemStream: MediaStream | null = null;

export async function getSystemAudioStream(): Promise<MediaStream> {
  if (systemStream && systemStream.active) return systemStream;

  // Use getDisplayMedia (Electron 33+) — the main process auto-grants via
  // setDisplayMediaRequestHandler with audio: 'loopback' for system audio.
  const fullStream = await navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: true, // required by spec, we discard it immediately
  });

  // Keep only audio tracks; stop video to save resources
  const audioTracks = fullStream.getAudioTracks();
  fullStream.getVideoTracks().forEach((t) => t.stop());

  if (audioTracks.length === 0) {
    throw new Error('No audio track from system capture — check system audio settings');
  }

  systemStream = new MediaStream(audioTracks);
  return systemStream;
}

export function stopSystemStream(): void {
  if (systemStream) {
    systemStream.getTracks().forEach((t) => t.stop());
    systemStream = null;
  }
}

/** Target 16 kHz mono — Whisper's native format, keeps chunks under 10 MB. */
const TARGET_SR = 16000;

export function splitFileIntoChunks(file: File, chunkDurationMs = 300_000): Promise<Blob[]> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const chunks: Blob[] = [];
      const ctx = new OfflineAudioContext(1, 1, 44100);
      try {
        const buffer = await ctx.decodeAudioData(reader.result as ArrayBuffer);
        const totalMs = buffer.duration * 1000;
        const numChunks = Math.ceil(totalMs / chunkDurationMs);

        for (let i = 0; i < numChunks; i++) {
          const startSec = (i * chunkDurationMs) / 1000;
          const endSec = Math.min(((i + 1) * chunkDurationMs) / 1000, buffer.duration);
          const durSec = endSec - startSec;
          const outLen = Math.ceil(durSec * TARGET_SR);

          // OfflineAudioContext at 16 kHz mono handles resampling + downmix
          const offCtx = new OfflineAudioContext(1, outLen, TARGET_SR);
          const source = offCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(offCtx.destination);
          source.start(0, startSec, durSec);

          const rendered = await offCtx.startRendering();
          chunks.push(audioBufferToWav(rendered));
        }
      } catch {
        // If decode fails, send the whole file as one chunk
        chunks.push(file);
      }
      resolve(chunks);
    };
    reader.readAsArrayBuffer(file);
  });
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = buffer.length * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
