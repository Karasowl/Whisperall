import { api } from './api';
import { requestPlanRefresh } from '../stores/plan';

const CHUNK_CHARS = 4000; // Google TTS limit ~5000, use 4000 for safety

export type TTSProgress = {
  status: 'idle' | 'loading' | 'playing' | 'paused';
  current: number;
  total: number;
};

export type ProgressCallback = (p: TTSProgress) => void;

let audioEl: HTMLAudioElement | null = null;
let chunks: string[] = [];
let currentIdx = 0;
let status: TTSProgress['status'] = 'idle';
let audioBlobs: (Blob | null)[] = [];
let onProgress: ProgressCallback | null = null;
let voice_: string | undefined;
let language_: string | undefined;

function notify() {
  onProgress?.({ status, current: currentIdx, total: chunks.length });
}

/** Split text into chunks at sentence boundaries. */
function splitText(text: string): string[] {
  const result: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    if (rest.length <= CHUNK_CHARS) { result.push(rest); break; }
    const region = rest.slice(0, CHUNK_CHARS);
    const boundary = Math.max(
      region.lastIndexOf('. '), region.lastIndexOf('! '),
      region.lastIndexOf('? '), region.lastIndexOf('\n'),
    );
    const splitAt = boundary > CHUNK_CHARS * 0.5 ? boundary + 1 : CHUNK_CHARS;
    result.push(rest.slice(0, splitAt).trim());
    rest = rest.slice(splitAt).trim();
  }
  return result;
}

async function playChunk(idx: number): Promise<void> {
  if (idx >= chunks.length || status === 'idle') {
    status = 'idle';
    notify();
    return;
  }
  currentIdx = idx;
  status = 'loading';
  notify();
  try {
    const res = await api.tts.synthesize({ text: chunks[idx], voice: voice_, language: language_ });
    requestPlanRefresh();
    // Fetch blob for download accumulation (non-critical)
    try {
      const r = await fetch(res.audio_url);
      audioBlobs[idx] = await r.blob();
    } catch { /* skip */ }

    if ((status as string) === 'idle') return; // stopped while loading
    audioEl = new Audio(res.audio_url);
    status = 'playing';
    notify();
    await new Promise<void>((resolve) => {
      audioEl!.onended = () => { resolve(); if (status === 'playing') playChunk(idx + 1); };
      audioEl!.onerror = () => { resolve(); status = 'idle'; notify(); };
      audioEl!.play();
    });
  } catch {
    status = 'idle';
    notify();
  }
}

export async function startReading(
  text: string, voice?: string, language?: string, callback?: ProgressCallback,
): Promise<void> {
  stopTTS();
  chunks = splitText(text);
  audioBlobs = new Array(chunks.length).fill(null);
  currentIdx = 0;
  voice_ = voice;
  language_ = language;
  onProgress = callback ?? null;
  status = 'loading'; // must set before playChunk (stopTTS leaves it 'idle')
  await playChunk(0);
}

export function pauseTTS(): void {
  if (audioEl && status === 'playing') { audioEl.pause(); status = 'paused'; notify(); }
}

export function resumeTTS(): void {
  if (audioEl && status === 'paused') { audioEl.play(); status = 'playing'; notify(); }
}

export function stopTTS(): void {
  if (audioEl) { audioEl.pause(); audioEl.onended = null; audioEl.onerror = null; audioEl = null; }
  status = 'idle';
  chunks = [];
  currentIdx = 0;
  audioBlobs = [];
  onProgress = null;
}

/** Backwards-compatible: play short text in one shot (used by Widget + hotkey). */
export async function playTTS(text: string, voice?: string, language?: string): Promise<void> {
  await startReading(text, voice, language);
}

export function isTTSPlaying(): boolean { return status === 'playing'; }
export function isTTSActive(): boolean { return status !== 'idle'; }
export function getTTSProgress(): TTSProgress {
  return { status, current: currentIdx, total: chunks.length };
}

/** Concatenate all fetched audio blobs for download. */
export function downloadTTSAudio(): Blob | null {
  const blobs = audioBlobs.filter((b): b is Blob => b !== null);
  return blobs.length > 0 ? new Blob(blobs, { type: 'audio/mpeg' }) : null;
}
