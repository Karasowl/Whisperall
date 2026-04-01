export type CueSound = 'ready' | 'stop' | 'done' | 'error';

type Tone = {
  frequency: number;
  durationMs: number;
  delayMs?: number;
  gain?: number;
};

const CUES: Record<CueSound, Tone[]> = {
  ready: [
    { frequency: 740, durationMs: 70, gain: 0.035 },
    { frequency: 988, durationMs: 90, delayMs: 80, gain: 0.04 },
  ],
  stop: [
    { frequency: 620, durationMs: 90, gain: 0.035 },
  ],
  done: [
    { frequency: 880, durationMs: 85, gain: 0.035 },
    { frequency: 1174, durationMs: 120, delayMs: 95, gain: 0.04 },
  ],
  error: [
    { frequency: 420, durationMs: 110, gain: 0.04 },
    { frequency: 320, durationMs: 130, delayMs: 110, gain: 0.045 },
  ],
};

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioContext) audioContext = new AudioContextCtor();
  if (audioContext.state === 'suspended') {
    void audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playTone(ctx: AudioContext, tone: Tone): void {
  const startAt = ctx.currentTime + ((tone.delayMs ?? 0) / 1000);
  const duration = tone.durationMs / 1000;
  const endAt = startAt + duration;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(tone.frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(tone.gain ?? 0.035, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(endAt + 0.02);
}

export function playCueSound(cue: CueSound): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    for (const tone of CUES[cue]) {
      playTone(ctx, tone);
    }
  } catch {
    // best-effort
  }
}
