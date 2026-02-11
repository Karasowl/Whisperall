import { useEffect } from 'react';
import { useDocumentsStore } from '../stores/documents';
import { useAuthStore } from '../stores/auth';
import { useSettingsStore } from '../stores/settings';
import { useT } from '../lib/i18n';
import { relativeDate } from '../lib/format-date';
import type { DocumentSource } from '@whisperall/api-client';

const SOURCE_ICONS: Record<string, string> = {
  dictation: 'mic', live: 'groups', transcription: 'description', manual: 'edit_note',
};
const SOURCE_COLORS: Record<string, string> = {
  dictation: 'bg-primary/20 text-primary', live: 'bg-pink-500/20 text-pink-400',
  transcription: 'bg-purple-500/20 text-purple-400', manual: 'bg-emerald-500/20 text-emerald-400',
};

type Props = { onOpenDocument: (id: string) => void };

export function NotesPage({ onOpenDocument }: Props) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const uiLanguage = useSettingsStore((s) => s.uiLanguage);
  const { documents, loading, error, fetchDocuments, deleteDocument } = useDocumentsStore();

  useEffect(() => { if (user) fetchDocuments(); }, [user, fetchDocuments]);

  if (!user) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted" data-testid="notes-page">
        <span className="material-symbols-outlined text-[48px] mb-4">login</span>
        <p>{t('notes.signIn')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" data-testid="notes-page">
      <div className="px-8 pt-12 pb-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-black tracking-tight mb-2">{t('notes.title')}</h2>
            <p className="text-muted">{t('notes.desc')}</p>
          </div>
          <button
            onClick={() => onOpenDocument('new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
            data-testid="new-note-btn"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            {t('notes.new')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 pb-8">
        {loading && <p className="text-primary text-sm mb-4">{t('notes.loading')}</p>}
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
        {!loading && documents.length === 0 && (
          <div className="text-center py-16 text-muted">
            <span className="material-symbols-outlined text-[48px] mb-4 block">note_stack</span>
            <p>{t('notes.empty')}</p>
          </div>
        )}
        <div className="grid gap-3">
          {documents.map((doc) => {
            const src = doc.source as DocumentSource | null;
            return (
              <button
                key={doc.id}
                onClick={() => onOpenDocument(doc.id)}
                className="flex items-center gap-4 p-4 rounded-xl border border-edge bg-surface hover:bg-surface-alt transition-colors text-left group"
                data-testid={`note-${doc.id}`}
              >
                <div className={`${SOURCE_COLORS[src ?? 'manual']} p-2.5 rounded-lg shrink-0`}>
                  <span className="material-symbols-outlined text-[20px]">{SOURCE_ICONS[src ?? 'manual']}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text truncate">{doc.title}</p>
                  <p className="text-xs text-muted truncate mt-0.5">{doc.content.slice(0, 100)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted" title={new Date(doc.updated_at).toLocaleString()}>{relativeDate(doc.updated_at, uiLanguage)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (window.confirm(t('notes.confirmDelete'))) deleteDocument(doc.id); }}
                    className="p-1.5 rounded-lg text-muted opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition-all"
                    title={t('notes.delete')}
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
