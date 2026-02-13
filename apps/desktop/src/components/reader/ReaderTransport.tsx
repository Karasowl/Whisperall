import type { TTSProgress } from '../../lib/tts';
import { useT } from '../../lib/i18n';

type Props = {
  progress: TTSProgress;
  hasText: boolean;
  onToggle: () => void;
  onStop: () => void;
  onJump: (deltaSeconds: number) => void;
};

export function ReaderTransport({ progress, hasText, onToggle, onStop, onJump }: Props) {
  const t = useT();
  const active = progress.status !== 'idle';
  const label = progress.status === 'playing'
    ? t('reader.pause')
    : progress.status === 'paused'
      ? t('reader.resume')
      : t('reader.readAloud');

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => onJump(-10)}
        disabled={!active}
        className="p-2 rounded-xl bg-base border border-edge text-text-secondary hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40"
        title={t('reader.jumpBack')}
        data-testid="reader-jump-back"
      >
        <span className="material-symbols-outlined text-[20px]">replay_10</span>
      </button>

      <button
        type="button"
        onClick={onToggle}
        disabled={!hasText}
        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-40 ${
          progress.status === 'playing' ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-primary hover:bg-primary/90 text-white'
        }`}
        data-testid="reader-play-btn"
      >
        <span className="material-symbols-outlined text-[22px] fill-1">
          {progress.status === 'playing' ? 'pause' : 'play_arrow'}
        </span>
        {label}
      </button>

      <button
        type="button"
        onClick={onStop}
        disabled={!active}
        className="p-2 rounded-xl bg-base border border-edge text-text-secondary hover:border-red-500/40 hover:text-red-500 transition-colors disabled:opacity-40"
        title={t('reader.stop')}
        data-testid="reader-stop-btn"
      >
        <span className="material-symbols-outlined text-[20px] fill-1">stop</span>
      </button>

      <button
        type="button"
        onClick={() => onJump(10)}
        disabled={!active}
        className="p-2 rounded-xl bg-base border border-edge text-text-secondary hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40"
        title={t('reader.jumpForward')}
        data-testid="reader-jump-forward"
      >
        <span className="material-symbols-outlined text-[20px]">forward_10</span>
      </button>
    </div>
  );
}

