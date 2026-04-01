import { type KeyboardEvent } from 'react';
import { useT, type Locale } from '../../lib/i18n';

type HistoryEntry = {
  id: string;
  created_at: string;
  language: string;
  diarization: boolean;
  text: string;
};

type Props = {
  entries: HistoryEntry[];
  activeId: string | null;
  loading: boolean;
  error: string;
  locale: Locale;
  onSelect: (entryId: string) => void;
  onApply: (entryId: string) => void;
  onDelete: (entryId: string) => void;
};

function formatTimestamp(value: string, locale: Locale): string {
  const targetLocale = locale === 'es' ? 'es-ES' : 'en-US';
  return new Date(value).toLocaleString(targetLocale);
}

export function NoteTranscriptHistoryPanel({
  entries,
  activeId,
  loading,
  error,
  locale,
  onSelect,
  onApply,
  onDelete,
}: Props) {
  const t = useT();

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, entryId: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(entryId);
  };

  return (
    <section className="rounded-2xl border border-edge bg-surface/50 p-4" data-testid="note-transcript-history-panel">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text">{t('notes.transcriptionHistory')}</p>
          <p className="text-xs text-muted">{entries.length} {t('notes.historyShort').toLowerCase()}</p>
        </div>
      </div>

      {loading && <p className="text-xs text-muted">{t('history.loading')}</p>}
      {!!error && !loading && <p className="text-xs text-red-400">{error}</p>}
      {!loading && !error && entries.length === 0 && <p className="text-xs text-muted">{t('notes.transcriptionHistoryEmpty')}</p>}

      <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
        {entries.map((entry) => {
          const isActive = activeId === entry.id;
          return (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(entry.id)}
              onKeyDown={(event) => handleKeyDown(event, entry.id)}
              className={`w-full rounded-xl border p-3 text-left transition-colors ${
                isActive ? 'border-primary/50 bg-primary/10' : 'border-edge bg-base/40 hover:bg-surface-alt/60'
              }`}
              data-testid={`history-entry-${entry.id}`}
            >
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <span>{formatTimestamp(entry.created_at, locale)}</span>
                <span>-</span>
                <span>{entry.language}</span>
                <span>-</span>
                <span>{entry.diarization ? t('transcribe.diarization') : t('notes.noDiarization')}</span>
                {isActive && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">{t('notes.activeVersion')}</span>}
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-text">{entry.text || '...'}</p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onApply(entry.id);
                  }}
                  className="rounded-lg bg-primary/15 px-2.5 py-1 text-[11px] text-primary transition-colors hover:bg-primary/25"
                  data-testid={`history-apply-${entry.id}`}
                >
                  {t('notes.applyTranscription')}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(entry.id);
                  }}
                  className="rounded-lg bg-red-500/10 px-2.5 py-1 text-[11px] text-red-300 transition-colors hover:bg-red-500/20"
                  data-testid={`history-delete-${entry.id}`}
                >
                  {t('notes.deleteTranscription')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}