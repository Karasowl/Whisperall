import type { TTSProgress } from '../../lib/tts';
import { useT } from '../../lib/i18n';

type Props = {
  progress: TTSProgress;
  onPrevSection: () => void;
  onNextSection: () => void;
};

export function ReaderSectionNav({ progress, onPrevSection, onNextSection }: Props) {
  const t = useT();
  const active = progress.status !== 'idle';
  if (!active || progress.total <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onPrevSection}
        disabled={progress.current === 0}
        className="flex items-center gap-1 px-3 py-2 rounded-xl bg-base border border-edge text-sm text-text-secondary hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40"
        data-testid="reader-prev-section"
        title={t('reader.prevSection')}
      >
        <span className="material-symbols-outlined text-[18px]">skip_previous</span>
        {t('reader.prev')}
      </button>
      <button
        type="button"
        onClick={onNextSection}
        disabled={progress.current >= progress.total - 1}
        className="flex items-center gap-1 px-3 py-2 rounded-xl bg-base border border-edge text-sm text-text-secondary hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40"
        data-testid="reader-next-section"
        title={t('reader.nextSection')}
      >
        {t('reader.next')}
        <span className="material-symbols-outlined text-[18px]">skip_next</span>
      </button>
    </div>
  );
}

