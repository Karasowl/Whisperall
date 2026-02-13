import { useCallback, useRef, useState } from 'react';
import type { TTSProgress } from '../../lib/tts';
import { downloadTTSAudio, hasTTSAudio, pauseTTS, resumeTTS, jumpTTSOverall, seekTTSOverall, setTTSPlaybackRate, skipTTSSection, startReading, stopTTS } from '../../lib/tts';
import { electron } from '../../lib/electron';
import { inferTTSLanguage } from '../../lib/lang-detect';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
const IDLE_PROGRESS: TTSProgress = { status: 'idle', current: 0, total: 0, currentTime: 0, duration: 0, overallTime: 0, overallDuration: 0, rate: 1, error: null };
export function useReaderController(uiLanguage: string, t: (key: string) => string, ttsLanguage: string) {
  const [text, setText] = useState('');
  const [progress, setProgress] = useState<TTSProgress>(IDLE_PROGRESS);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const setTextSafe = useCallback((v: string) => {
    setText(v);
    setProgress((p) => ({ ...p, error: null }));
  }, []);
  const start = useCallback((txt: string) => {
    if (!txt.trim()) return;
    setProgress((p) => ({ ...p, error: null }));
    const forced = ttsLanguage && ttsLanguage.toLowerCase() !== 'auto' ? ttsLanguage : undefined;
    const lang = forced ?? inferTTSLanguage(txt, { fallback: uiLanguage });
    void startReading(txt, undefined, lang, setProgress);
  }, [ttsLanguage, uiLanguage]);
  const onToggle = useCallback(() => {
    if (progress.status === 'playing') pauseTTS();
    else if (progress.status === 'paused') resumeTTS();
    else start(text);
  }, [progress.status, start, text]);
  const onStop = useCallback(() => {
    stopTTS();
    setProgress(IDLE_PROGRESS);
  }, []);
  const onFromClipboard = useCallback(async () => {
    setProgress((p) => ({ ...p, error: null }));
    try {
      const clip = electron?.readClipboard ? await electron.readClipboard() : await navigator.clipboard.readText();
      if (clip) setTextSafe(clip);
    } catch {
      setProgress((p) => ({ ...p, error: t('reader.clipboardError') }));
    }
  }, [t, setTextSafe]);
  const onClear = useCallback(() => {
    setText('');
    onStop();
  }, [onStop]);
  const onReadSelection = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return start(text);
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? 0;
    const slice = s !== e ? text.slice(s, e) : text.slice(s);
    start(slice.trim() ? slice : text);
  }, [start, text]);
  const onCycleSpeed = useCallback(() => {
    const cur = progress.rate || 1;
    const idx = SPEEDS.findIndex((s) => Math.abs(s - cur) < 0.01);
    const next = SPEEDS[(idx === -1 ? 1 : idx + 1) % SPEEDS.length];
    setTTSPlaybackRate(next);
    setProgress((p) => ({ ...p, rate: next }));
  }, [progress.rate]);
  const onSeek = useCallback(seekTTSOverall, []);
  const onJump = useCallback(jumpTTSOverall, []);
  const onPrevSection = useCallback(() => skipTTSSection(-1), []);
  const onNextSection = useCallback(() => skipTTSSection(1), []);
  const onDownload = useCallback(() => {
    const blob = downloadTTSAudio();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reading.mp3';
    a.click();
    URL.revokeObjectURL(url);
  }, []);
  return {
    text,
    setText: setTextSafe,
    progress,
    textareaRef,
    hasText: text.trim().length > 0,
    canDownload: hasTTSAudio(),
    onToggle,
    onStop,
    onFromClipboard,
    onClear,
    onReadSelection,
    onCycleSpeed,
    onSeek,
    onJump,
    onPrevSection,
    onNextSection,
    onDownload,
  };
}
