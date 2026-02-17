import { useEffect, useState } from 'react';
import type { TTSProgress } from '../../lib/tts';
import { useT } from '../../lib/i18n';
import { ReaderVoicePicker } from './ReaderVoicePicker';

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

type Props = {
  progress: TTSProgress;
  hasText: boolean;
  ttsLanguage: string;
  onTtsLanguageChange: (lang: string) => void;
  ttsVoice: string;
  onTtsVoiceChange: (voice: string) => void;
  onToggle: () => void;
  onStop: () => void;
  onReadSelection: () => void;
  onJump: (deltaSeconds: number) => void;
  onSeek: (seconds: number) => void;
  onCycleSpeed: () => void;
  onPrevSection: () => void;
  onNextSection: () => void;
  onDownload: () => void;
  canDownload: boolean;
};

export function ReaderPlayerBar(props: Props) {
  const t = useT();
  const { progress } = props;
  const active = progress.status !== 'idle';
  const canSeek = active && progress.overallDuration > 0;
  const [pendingSeek, setPendingSeek] = useState<number | null>(null);

  useEffect(() => { if (!canSeek) setPendingSeek(null); }, [canSeek]);

  const shownTime = pendingSeek ?? progress.overallTime;
  const max = Math.max(0, progress.overallDuration);
  const playLabel = progress.status === 'playing' ? t('reader.pause') : progress.status === 'paused' ? t('reader.resume') : t('reader.readAloud');
  const playIcon = progress.status === 'playing' ? 'pause' : 'play_arrow';

  const iconBtn = (icon: string, onClick: () => void, disabled: boolean, testId: string, title: string, extra = '') =>
    <button type="button" onClick={onClick} disabled={disabled} className={`p-2 rounded-lg bg-surface-alt border border-edge text-text-secondary hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40 ${extra}`} title={title} data-testid={testId}>
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
    </button>;

  return (
    <div className="shrink-0 px-8 py-4 border-t border-edge bg-surface" data-testid="reader-player-bar">
      {/* Row 1: Transport + Seek */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 shrink-0">
          {iconBtn('replay_10', () => props.onJump(-10), !active, 'reader-jump-back', t('reader.jumpBack'))}
          <button type="button" onClick={props.onToggle} disabled={!props.hasText} data-testid="reader-play-btn"
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-40 ${
              progress.status === 'playing' ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-primary hover:bg-primary/90 text-white'}`}>
            <span className="material-symbols-outlined text-[22px] fill-1">{playIcon}</span>
            {playLabel}
          </button>
          {iconBtn('forward_10', () => props.onJump(10), !active, 'reader-jump-forward', t('reader.jumpForward'))}
          {iconBtn('stop', props.onStop, !active, 'reader-stop-btn', t('reader.stop'), 'hover:border-red-500/40 hover:text-red-500')}
        </div>

        <div className="flex-1 flex flex-col gap-0.5 min-w-0">
          <div className="flex justify-between text-[11px] text-muted font-mono px-0.5">
            <span className="text-text-secondary">{fmtTime(shownTime)}</span>
            <span>{fmtTime(progress.overallDuration)}</span>
          </div>
          <input type="range" min={0} max={max} step={0.25} value={Math.min(shownTime, max || 0)}
            onChange={(e) => setPendingSeek(Number(e.target.value))}
            onMouseUp={(e) => { props.onSeek(Number((e.target as HTMLInputElement).value)); setPendingSeek(null); }}
            onTouchEnd={(e) => { props.onSeek(Number((e.target as HTMLInputElement).value)); setPendingSeek(null); }}
            onKeyUp={(e) => { props.onSeek(Number((e.target as HTMLInputElement).value)); setPendingSeek(null); }}
            disabled={!canSeek} className="seek-range" data-testid="reader-seek" aria-label={t('reader.seek')} />
        </div>
      </div>

      {/* Row 2: Voice + extras */}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <ReaderVoicePicker rate={progress.rate} ttsVoice={props.ttsVoice} onTtsVoiceChange={props.onTtsVoiceChange}
          ttsLanguage={props.ttsLanguage} onTtsLanguageChange={props.onTtsLanguageChange} onCycleSpeed={props.onCycleSpeed} />

        {active && progress.total > 1 && (
          <div className="flex items-center gap-1.5 ml-auto" data-testid="reader-section-nav">
            {iconBtn('skip_previous', props.onPrevSection, progress.current === 0, 'reader-prev-section', t('reader.prevSection'))}
            <span className="text-xs text-muted font-mono">{progress.current + 1}/{progress.total}</span>
            {iconBtn('skip_next', props.onNextSection, progress.current >= progress.total - 1, 'reader-next-section', t('reader.nextSection'))}
          </div>
        )}

        <div className={`flex items-center gap-2 ${active && progress.total > 1 ? '' : 'ml-auto'}`}>
          <button type="button" onClick={props.onReadSelection} disabled={!props.hasText} data-testid="reader-selection-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt border border-edge text-xs text-text-secondary hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40">
            <span className="material-symbols-outlined text-[16px]">format_color_text</span>{t('reader.readSelection')}
          </button>
          <button type="button" onClick={props.onDownload} disabled={!props.canDownload} data-testid="reader-download-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt border border-edge text-xs text-text-secondary hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40">
            <span className="material-symbols-outlined text-[16px]">download</span>{t('reader.download')}
          </button>
        </div>
      </div>

      {progress.error && (
        <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400" data-testid="reader-error">{progress.error}</div>
      )}
    </div>
  );
}
