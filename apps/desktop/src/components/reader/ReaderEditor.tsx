import type { RefObject } from 'react';
import { useT } from '../../lib/i18n';

type Props = {
  text: string;
  onChange: (text: string) => void;
  onFromClipboard: () => void;
  onClear: () => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
};

export function ReaderEditor({ text, onChange, onFromClipboard, onClear, textareaRef }: Props) {
  const t = useT();
  const chars = text.length;

  return (
    <section className="flex-1 min-w-0 bg-surface border border-edge rounded-2xl overflow-hidden shadow-soft flex flex-col">
      <header className="shrink-0 px-5 py-4 border-b border-edge flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">{t('reader.text')}</p>
          <p className="text-xs text-muted truncate">{t('reader.textHint').replace('{count}', chars.toLocaleString())}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onFromClipboard}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-base border border-edge text-sm text-text-secondary hover:border-primary/40 hover:text-primary transition-colors"
            data-testid="reader-clipboard-btn"
            title={t('reader.fromClipboard')}
          >
            <span className="material-symbols-outlined text-[18px]">content_paste</span>
            {t('reader.fromClipboard')}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!text.trim()}
            className="px-3 py-2 rounded-lg bg-base border border-edge text-sm text-text-secondary hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40"
            data-testid="reader-clear-btn"
          >
            {t('reader.clear')}
          </button>
        </div>
      </header>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('reader.placeholder')}
        className="flex-1 w-full p-5 bg-transparent text-text-secondary text-base outline-none resize-none"
        data-testid="reader-textarea"
      />
    </section>
  );
}

