import { api } from './api';
import { requestPlanRefresh } from '../stores/plan';
import { inferTTSLanguage } from './lang-detect';

const CHUNK_CHARS = 4000; // Google TTS limit ~5000, use 4000 for safety

export type TTSProgress = {
  status: 'idle' | 'loading' | 'playing' | 'paused';
  current: number;
  total: number;
  currentTime: number;
  duration: number;
  overallTime: number;
  overallDuration: number;
  rate: number;
  error: string | null;
};

export type ProgressCallback = (p: TTSProgress) => void;

let audioEl: HTMLAudioElement | null = null;
let audioObjectUrl: string | null = null;
let chunks: string[] = [];
let currentIdx = 0;
let status: TTSProgress['status'] = 'idle';
let audioBlobs: (Blob | null)[] = [];
let onProgress: ProgressCallback | null = null;
let voice_: string | undefined;
let language_: string | undefined;
let playbackRate_ = 1;
let currentTime_ = 0;
let duration_ = 0;
let lastError_: string | null = null;
let runId_ = 0;
let wantsPlay_ = true;
let chunkDurations_: number[] = [];
let chunkDurationEst_: number[] = [];
let pendingSeek_: { idx: number; seconds: number } | null = null;

const EST_CHARS_PER_SEC = 14;
const FETCH_RETRIES = 3;

function getChunkDuration(idx: number): number {
  return chunkDurations_[idx] || chunkDurationEst_[idx] || 0;
}

function calcOverallDuration(): number {
  let sum = 0;
  for (let i = 0; i < chunks.length; i++) sum += getChunkDuration(i);
  return sum;
}

function calcOverallTime(): number {
  let sum = 0;
  for (let i = 0; i < currentIdx; i++) sum += getChunkDuration(i);
  return sum + currentTime_;
}

function notify() {
  const overallDuration = calcOverallDuration();
  const overallTime = Math.max(0, Math.min(overallDuration || 0, calcOverallTime()));
  onProgress?.({
    status,
    current: currentIdx,
    total: chunks.length,
    currentTime: currentTime_,
    duration: duration_,
    overallTime,
    overallDuration,
    rate: playbackRate_,
    error: lastError_,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FetchAudioResult =
  | { ok: true; blob: Blob }
  | { ok: false; kind: 'network' | 'http' | 'content'; message: string };

function looksLikeMp3Header(bytes: Uint8Array): boolean {
  if (bytes.length < 2) return false;
  const isId3 = bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33; // "ID3"
  const isFrame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0; // MPEG frame sync
  return isId3 || isFrame;
}

async function fetchPlayableAudio(url: string, rid: number): Promise<FetchAudioResult> {
  let lastStatus: number | null = null;
  let lastBody: string | null = null;

  for (let attempt = 0; attempt < FETCH_RETRIES; attempt++) {
    if (rid !== runId_) return { ok: false, kind: 'network', message: 'Cancelled' };

    try {
      const resp = await fetch(url, { cache: 'no-store' });
      lastStatus = resp.status;

      if (!resp.ok) {
        // Try to capture a tiny snippet for debugging (avoid large binary reads).
        try {
          const ct = (resp.headers.get('content-type') ?? '').toLowerCase();
          if (ct.includes('text') || ct.includes('json')) lastBody = (await resp.text()).slice(0, 200);
        } catch { /* ignore */ }

        if (attempt < FETCH_RETRIES - 1) { await sleep(150 * Math.pow(2, attempt)); continue; }
        const suffix = lastBody ? `: ${lastBody}` : '';
        return { ok: false, kind: 'http', message: `Audio download failed (HTTP ${resp.status})${suffix}` };
      }

      const ct = (resp.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      const blob = await resp.blob();
      if (!blob || blob.size === 0) return { ok: false, kind: 'content', message: 'Audio download returned empty body' };

      if (ct.startsWith('audio/')) return { ok: true, blob };

      // Some hosts serve MP3 as application/octet-stream; sniff the header and coerce the blob type.
      try {
        const ab = await blob.slice(0, 3).arrayBuffer();
        const head = new Uint8Array(ab);
        if (looksLikeMp3Header(head)) return { ok: true, blob: new Blob([blob], { type: 'audio/mpeg' }) };
      } catch { /* ignore */ }

      return { ok: false, kind: 'content', message: `Unsupported audio content-type: ${ct || 'unknown'}` };
    } catch (err) {
      if (attempt < FETCH_RETRIES - 1) { await sleep(150 * Math.pow(2, attempt)); continue; }
      const msg = (err as { message?: string })?.message ?? 'Failed to fetch audio';
      return { ok: false, kind: 'network', message: msg };
    }
  }

  // Unreachable, but TS likes it.
  const sfx = lastStatus ? ` (HTTP ${lastStatus})` : '';
  return { ok: false, kind: 'network', message: `Failed to fetch audio${sfx}` };
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

function stopAudioOnly(): void {
  if (audioEl) {
    try { audioEl.pause(); } catch { /* ignore */ }
    audioEl.onended = null;
    audioEl.onerror = null;
    audioEl.ontimeupdate = null;
    audioEl.onloadedmetadata = null;
    audioEl = null;
  }
  if (audioObjectUrl) {
    try { URL.revokeObjectURL(audioObjectUrl); } catch { /* ignore */ }
    audioObjectUrl = null;
  }
  currentTime_ = 0;
  duration_ = 0;
}

async function playChunk(idx: number, rid: number): Promise<void> {
  if (rid !== runId_) return;
  if (idx >= chunks.length || status === 'idle') {
    status = 'idle';
    stopAudioOnly();
    notify();
    return;
  }
  currentIdx = idx;
  status = 'loading';
  currentTime_ = 0;
  duration_ = 0;
  lastError_ = null;
  notify();
  try {
    const res = await api.tts.synthesize({ text: chunks[idx], voice: voice_, language: language_ });
    if (rid !== runId_) return;
    requestPlanRefresh();

    // Prefer blob: playback for reliability (fixes wrong content-type and transient storage delays).
    let playUrl = res.audio_url;
    stopAudioOnly();
    const fetched = await fetchPlayableAudio(res.audio_url, rid);
    if (rid !== runId_) return;
    if (fetched.ok) {
      audioBlobs[idx] = fetched.blob;
      audioObjectUrl = URL.createObjectURL(fetched.blob);
      playUrl = audioObjectUrl;
    } else if (fetched.kind !== 'network') {
      // Network failures can happen due to CORS; try direct URL playback in that case.
      lastError_ = fetched.message;
      status = 'idle';
      stopAudioOnly();
      notify();
      return;
    }
    if (rid !== runId_) return;

    if ((status as string) === 'idle') return; // stopped while loading
    audioEl = new Audio(playUrl);
    const chunkIndex = idx;
    audioEl.playbackRate = playbackRate_;
    audioEl.onloadedmetadata = () => {
      const d = audioEl?.duration ?? NaN;
      duration_ = Number.isFinite(d) ? d : 0;
      if (chunkIndex < chunkDurations_.length) chunkDurations_[chunkIndex] = duration_;

      if (pendingSeek_ && pendingSeek_.idx === chunkIndex && audioEl) {
        const target = Math.max(0, Math.min(duration_ || 0, pendingSeek_.seconds));
        try { audioEl.currentTime = target; } catch { /* ignore */ }
        currentTime_ = target;
        pendingSeek_ = null;
      }
      notify();
    };
    audioEl.ontimeupdate = () => {
      currentTime_ = audioEl?.currentTime ?? 0;
      const d = audioEl?.duration ?? NaN;
      if (Number.isFinite(d)) duration_ = d;
      notify();
    };

    status = wantsPlay_ ? 'playing' : 'paused';
    notify();
    await new Promise<void>((resolve) => {
      const a = audioEl!;
      const finish = () => {
        if (audioEl === a) {
          a.onended = null;
          a.onerror = null;
          a.ontimeupdate = null;
          a.onloadedmetadata = null;
        }
        resolve();
      };

      a.onended = () => {
        finish();
        if (rid === runId_ && wantsPlay_ && status === 'playing') void playChunk(idx + 1, rid);
      };
      a.onerror = () => {
        lastError_ = 'Audio playback failed';
        status = 'idle';
        stopAudioOnly();
        notify();
        finish();
      };

      if (!wantsPlay_) return finish();
      const p = a.play();
      // play() promise rejection does NOT trigger onerror in Chromium.
      if (p && typeof (p as unknown as { catch?: Function }).catch === 'function') {
        (p as unknown as Promise<void>).catch((err) => {
          lastError_ = (err as { message?: string })?.message ?? 'Audio playback blocked';
          status = 'idle';
          stopAudioOnly();
          notify();
          finish();
        });
      }
    });
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? 'Text-to-speech failed';
    lastError_ = msg;
    status = 'idle';
    stopAudioOnly();
    notify();
  }
}

export async function startReading(
  text: string, voice?: string, language?: string, callback?: ProgressCallback,
): Promise<void> {
  stopTTS();
  chunks = splitText(text);
  audioBlobs = new Array(chunks.length).fill(null);
  chunkDurations_ = new Array(chunks.length).fill(0);
  chunkDurationEst_ = chunks.map((c) => Math.max(1, c.length / EST_CHARS_PER_SEC));
  pendingSeek_ = null;
  currentIdx = 0;
  voice_ = voice;
  const requested = (language ?? '').trim();
  language_ = requested && requested.toLowerCase() !== 'auto'
    ? requested
    : inferTTSLanguage(text, { voice });
  onProgress = callback ?? null;
  runId_ += 1;
  wantsPlay_ = true;
  status = 'loading'; // must set before playChunk (stopTTS leaves it 'idle')
  lastError_ = null;
  await playChunk(0, runId_);
}

export function pauseTTS(): void {
  if (audioEl && status === 'playing') {
    wantsPlay_ = false;
    try { audioEl.pause(); } catch { /* ignore */ }
    status = 'paused';
    notify();
  }
}

export function resumeTTS(): void {
  if (audioEl && status === 'paused') {
    wantsPlay_ = true;
    status = 'playing';
    notify();
    const p = audioEl.play();
    if (p && typeof (p as unknown as { catch?: Function }).catch === 'function') {
      (p as unknown as Promise<void>).catch((err) => {
        lastError_ = (err as { message?: string })?.message ?? 'Audio playback blocked';
        status = 'idle';
        stopAudioOnly();
        notify();
      });
    }
  }
}

export function stopTTS(): void {
  runId_ += 1; // cancel any in-flight chunk load/play
  wantsPlay_ = true;
  stopAudioOnly();
  status = 'idle';
  chunks = [];
  currentIdx = 0;
  audioBlobs = [];
  chunkDurations_ = [];
  chunkDurationEst_ = [];
  pendingSeek_ = null;
  onProgress = null;
  lastError_ = null;
}

/** Backwards-compatible: play short text in one shot (used by Widget + hotkey). */
export async function playTTS(text: string, voice?: string, language?: string): Promise<void> {
  await startReading(text, voice, language);
}

export function isTTSPlaying(): boolean { return status === 'playing'; }
export function isTTSActive(): boolean { return status !== 'idle'; }
export function getTTSProgress(): TTSProgress {
  const overallDuration = calcOverallDuration();
  const overallTime = Math.max(0, Math.min(overallDuration || 0, calcOverallTime()));
  return {
    status,
    current: currentIdx,
    total: chunks.length,
    currentTime: currentTime_,
    duration: duration_,
    overallTime,
    overallDuration,
    rate: playbackRate_,
    error: lastError_,
  };
}

/** Concatenate all fetched audio blobs for download. */
export function downloadTTSAudio(): Blob | null {
  const blobs = audioBlobs.filter((b): b is Blob => b !== null);
  return blobs.length > 0 ? new Blob(blobs, { type: 'audio/mpeg' }) : null;
}

export function hasTTSAudio(): boolean {
  return audioBlobs.some((b) => b !== null);
}

export function setTTSPlaybackRate(rate: number): void {
  const next = Number.isFinite(rate) ? Math.max(0.5, Math.min(4, rate)) : 1;
  playbackRate_ = next;
  if (audioEl) audioEl.playbackRate = next;
  notify();
}

export function seekTTS(seconds: number): void {
  if (!audioEl) return;
  const dur = Number.isFinite(audioEl.duration) ? (audioEl.duration || 0) : 0;
  if (!dur) return;
  const next = Math.max(0, Math.min(dur, seconds));
  audioEl.currentTime = next;
  currentTime_ = next;
  duration_ = dur;
  notify();
}

export function jumpTTS(deltaSeconds: number): void {
  if (!audioEl) return;
  seekTTS((audioEl.currentTime || 0) + deltaSeconds);
}

function goToSection(idx: number): void {
  runId_ += 1;
  currentIdx = idx;
  currentTime_ = 0;
  duration_ = 0;
  lastError_ = null;
  stopAudioOnly();
  status = 'loading';
  notify();
  void playChunk(idx, runId_);
}

export function skipTTSSection(delta: number): void {
  if (status === 'idle' || chunks.length === 0) return;
  const next = Math.max(0, Math.min(chunks.length - 1, currentIdx + delta));
  if (next === currentIdx) return;

  pendingSeek_ = null;
  goToSection(next);
}

export function seekTTSOverall(seconds: number): void {
  if (status === 'idle' || chunks.length === 0) return;

  const total = calcOverallDuration();
  const target = Math.max(0, Math.min(total || 0, seconds));

  let acc = 0;
  let targetIdx = 0;
  for (let i = 0; i < chunks.length; i++) {
    const d = getChunkDuration(i);
    if (target <= acc + d || i === chunks.length - 1) { targetIdx = i; break; }
    acc += d;
  }
  const offset = target - acc;

  if (targetIdx === currentIdx && audioEl) return seekTTS(offset);

  pendingSeek_ = { idx: targetIdx, seconds: offset };
  goToSection(targetIdx);
}

export function jumpTTSOverall(deltaSeconds: number): void {
  seekTTSOverall(calcOverallTime() + deltaSeconds);
}
