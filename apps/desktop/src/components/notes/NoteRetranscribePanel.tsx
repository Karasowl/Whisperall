import { useT } from '../../lib/i18n';

type Props = {
  language: string;
  diarization: boolean;
  aiSummary: boolean;
  punctuation: boolean;
  loading: boolean;
  error: string;
  onChangeLanguage: (language: string) => void;
  onChangeDiarization: (enabled: boolean) => void;
  onChangeAiSummary: (enabled: boolean) => void;
  onChangePunctuation: (enabled: boolean) => void;
  onRun: () => void;
  onCancel?: () => void;
};

const LANG_OPTIONS = [
  { value: 'auto', labelKey: 'transcribe.autoDetect' },
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
] as const;

export function NoteRetranscribePanel({
  language,
  diarization,
  aiSummary,
  punctuation,
  loading,
  error,
  onChangeLanguage,
  onChangeDiarization,
  onChangeAiSummary,
  onChangePunctuation,
  onRun,
  onCancel,
}: Props) {
  const t = useT();

  return (
    <section className="rounded-2xl border border-edge bg-surface/50 p-4" data-testid="note-retranscribe-panel">
      <div className="flex flex-col gap-1 mb-4">
        <p className="text-sm font-semibold text-text">{t('notes.retranscribe')}</p>
        <p className="text-xs text-muted">{t('notes.retranscribeCreatesVersion')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={language}
          onChange={(event) => onChangeLanguage(event.target.value)}
          className="styled-select text-sm bg-surface border border-edge rounded-lg px-3 py-2 text-text cursor-pointer outline-none"
          data-testid="note-retranscribe-language"
        >
          {LANG_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {'labelKey' in option ? t(option.labelKey) : option.label}
            </option>
          ))}
        </select>

        <label className="inline-flex items-center gap-2 text-sm text-muted select-none">
          <input
            type="checkbox"
            checked={diarization}
            onChange={(event) => onChangeDiarization(event.target.checked)}
            className="accent-primary"
            data-testid="note-retranscribe-diarization"
          />
          {t('transcribe.diarization')}
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-muted select-none">
          <input
            type="checkbox"
            checked={punctuation}
            onChange={(event) => onChangePunctuation(event.target.checked)}
            className="accent-primary"
            data-testid="note-retranscribe-punctuation"
          />
          {t('transcribe.punctuation')}
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-muted select-none">
          <input
            type="checkbox"
            checked={aiSummary}
            onChange={(event) => onChangeAiSummary(event.target.checked)}
            className="accent-primary"
            data-testid="note-retranscribe-ai-summary"
          />
          {t('transcribe.aiSummary')}
        </label>

        {loading && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm hover:bg-red-500/15 transition-colors"
            data-testid="note-retranscribe-cancel-btn"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
            {t('reader.stop')}
          </button>
        ) : (
          <button
            type="button"
            onClick={onRun}
            disabled={loading}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            data-testid="note-retranscribe-btn"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            {loading ? t('transcribe.processing') : t('notes.retranscribeNow')}
          </button>
        )}
      </div>

      {!!error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </section>
  );
}
