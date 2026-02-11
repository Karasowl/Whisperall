import { useState, useCallback } from 'react';
import { startReading, pauseTTS, resumeTTS, stopTTS, downloadTTSAudio } from '../lib/tts';
import type { TTSProgress } from '../lib/tts';
import { PlanGate } from '../components/PlanGate';
import { useT } from '../lib/i18n';
import { useSettingsStore } from '../stores/settings';

export function ReaderPage() {
  const t = useT();
  const uiLanguage = useSettingsStore((s) => s.uiLanguage);
  const [text, setText] = useState('');
  const [progress, setProgress] = useState<TTSProgress>({ status: 'idle', current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const handlePlay = useCallback(async () => {
    if (!text.trim()) return;
    setError(null);
    try { await startReading(text, undefined, uiLanguage, setProgress); }
    catch (err) { setError((err as Error).message); }
  }, [text, uiLanguage]);

  const handleToggle = useCallback(() => {
    if (progress.status === 'playing') pauseTTS();
    else if (progress.status === 'paused') resumeTTS();
    else handlePlay();
  }, [progress.status, handlePlay]);

  const handleStop = useCallback(() => {
    stopTTS();
    setProgress({ status: 'idle', current: 0, total: 0 });
  }, []);

  const handleDownload = useCallback(() => {
    const blob = downloadTTSAudio();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'reading.mp3'; a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleClipboard = useCallback(async () => {
    try { const clip = await navigator.clipboard.readText(); if (clip) setText(clip); }
    catch { setError(t('reader.clipboardError')); }
  }, [t]);

  const active = progress.status !== 'idle';
  const pct = progress.total > 0 ? Math.round(((progress.current + 1) / progress.total) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8" data-testid="reader-page">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold text-text mb-2">{t('reader.title')}</h1>
          <p className="text-muted text-sm">{t('reader.desc')}</p>
        </div>

        <textarea
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder={t('reader.placeholder')}
          className="w-full min-h-[200px] bg-surface border border-edge rounded-xl p-5 text-text-secondary text-base outline-none resize-y focus:border-primary transition-colors"
          data-testid="reader-textarea"
        />

        {active && progress.total > 1 && (
          <div className="flex flex-col gap-2" data-testid="reader-progress">
            <div className="flex justify-between text-xs text-muted">
              <span>{t('reader.section')} {progress.current + 1} / {progress.total}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 bg-surface-alt rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <PlanGate resource="tts_chars">
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={handleToggle} disabled={!text.trim()}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-sm transition-all disabled:opacity-40 ${
                progress.status === 'playing' ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-primary hover:bg-blue-600 text-white'
              }`} data-testid="reader-play-btn">
              <span className="material-symbols-outlined text-[20px] fill-1">
                {progress.status === 'playing' ? 'pause' : 'play_arrow'}
              </span>
              {progress.status === 'playing' ? t('reader.pause') : progress.status === 'paused' ? t('reader.resume') : t('reader.readAloud')}
            </button>

            {active && (
              <button type="button" onClick={handleStop}
                className="flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm text-white bg-red-500 hover:bg-red-600 transition-colors"
                data-testid="reader-stop-btn">
                <span className="material-symbols-outlined text-[20px] fill-1">stop</span>
                {t('reader.stop')}
              </button>
            )}

            {active && progress.current > 0 && (
              <button type="button" onClick={handleDownload}
                className="flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm text-text-secondary bg-surface border border-edge hover:bg-surface-alt transition-colors"
                data-testid="reader-download-btn">
                <span className="material-symbols-outlined text-[20px]">download</span>
                {t('reader.download')}
              </button>
            )}

            {!active && (
              <button type="button" onClick={handleClipboard}
                className="flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm text-text-secondary bg-surface border border-edge hover:bg-surface-alt transition-colors"
                data-testid="reader-clipboard-btn">
                <span className="material-symbols-outlined text-[20px]">content_paste</span>
                {t('reader.fromClipboard')}
              </button>
            )}
          </div>
        </PlanGate>
      </div>
    </div>
  );
}
