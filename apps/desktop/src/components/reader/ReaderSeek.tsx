import { useEffect, useState } from 'react';
import type { TTSProgress } from '../../lib/tts';
import { useT } from '../../lib/i18n';

type Props = {
  progress: TTSProgress;
  hasText: boolean;
  onSeek: (seconds: number) => void;
  onReadSelection: () => void;
  onDownload: () => void;
  canDownload: boolean;
};

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function ReaderSeek({ progress, hasText, onSeek, onReadSelection, onDownload, canDownload }: Props) {
  const t = useT();
  const active = progress.status !== 'idle';
  const canSeek = active && progress.overallDuration > 0;
  const [pendingSeek, setPendingSeek] = useState<number | null>(null);

  useEffect(() => {
    if (!canSeek) setPendingSeek(null);
  }, [canSeek]);

  const shownTime = pendingSeek ?? progress.overallTime;
  const max = Math.max(0, progress.overallDuration);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-xs text-muted font-mono">
        <span className="text-text">{fmtTime(shownTime)}</span>
        <span>{fmtTime(progress.overallDuration)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={0.25}
        value={Math.min(shownTime, max || 0)}
        onChange={(e) => setPendingSeek(Number(e.target.value))}
        onMouseUp={(e) => { onSeek(Number((e.target as HTMLInputElement).value)); setPendingSeek(null); }}
        onTouchEnd={(e) => { onSeek(Number((e.target as HTMLInputElement).value)); setPendingSeek(null); }}
        onKeyUp={(e) => { onSeek(Number((e.target as HTMLInputElement).value)); setPendingSeek(null); }}
        disabled={!canSeek}
        className="w-full accent-[var(--color-primary)] disabled:opacity-40"
        data-testid="reader-seek"
        aria-label={t('reader.seek')}
      />
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onReadSelection}
          disabled={!hasText}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-base border border-edge text-sm text-text-secondary hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40"
          data-testid="reader-selection-btn"
        >
          <span className="material-symbols-outlined text-[18px]">format_color_text</span>
          {t('reader.readSelection')}
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={!canDownload}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-base border border-edge text-sm text-text-secondary hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40"
          data-testid="reader-download-btn"
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          {t('reader.download')}
        </button>
      </div>
    </div>
  );
}
