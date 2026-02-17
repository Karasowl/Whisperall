import { useT } from '../../lib/i18n';
import type { HistoryEntry } from '../../pages/HistoryPage';

const MOD_LABELS: Record<string, string> = {
  dictate: 'Dictation', transcribe: 'Transcription', live: 'Meeting',
  tts: 'Read Aloud', translate: 'Translation', ai_edit: 'AI Edit',
};

function previewTitle(e: HistoryEntry): string {
  const src = e.module === 'tts' ? e.input_text : e.output_text;
  const first = (src ?? '').split('\n').find(l => l.trim());
  if (first && first.trim().length > 0) {
    const t = first.trim();
    return t.length > 80 ? t.slice(0, 80) + '\u2026' : t;
  }
  return MOD_LABELS[e.module] ?? e.module;
}

type Props = { entry: HistoryEntry | null; onClose: () => void };

export function PreviewPanel({ entry, onClose }: Props) {
  const t = useT();
  if (!entry) return null;

  return (
    <aside className="w-[400px] border-l border-edge bg-surface flex flex-col shadow-2xl hidden xl:flex" data-testid="preview-panel">
      <div className="px-6 py-5 border-b border-edge flex justify-between items-start bg-surface-alt/50 backdrop-blur-sm">
        <div className="flex-1 pr-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
              {MOD_LABELS[entry.module] ?? entry.module}
            </span>
            <span className="text-xs text-muted">{new Date(entry.created_at).toLocaleString()}</span>
          </div>
          <h2 className="text-xl font-bold text-text leading-tight">{previewTitle(entry)}</h2>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-primary transition-colors" title={t('history.closePreview')}>
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="bg-surface-alt p-4 rounded-xl border border-edge">
          <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]">auto_awesome</span> {t('history.detail')}
          </h3>
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{entry.output_text ?? ''}</p>
        </div>
      </div>

      <div className="p-4 border-t border-edge bg-surface-alt">
        <button className="w-full py-2.5 rounded-lg bg-surface text-text text-sm font-medium hover:bg-surface/80 transition-colors flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-[18px]">edit_document</span>
          {t('history.openEditor')}
        </button>
      </div>
    </aside>
  );
}
