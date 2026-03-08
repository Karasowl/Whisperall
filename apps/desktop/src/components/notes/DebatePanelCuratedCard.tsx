import { useT } from '../../lib/i18n';

type ApplyMode = 'insert' | 'replace' | 'append';

type Props = {
  text: string;
  suggestedMode: ApplyMode;
  hasSelection: boolean;
  noSuggestion: boolean;
  onApply: (mode: ApplyMode) => void;
  onUndo: () => void;
};

function ApplyBtn({ icon, label, disabled, onClick }: { icon: string; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-7 px-2 inline-flex items-center gap-1 rounded border border-edge text-[11px] text-muted hover:text-text hover:bg-base/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      title={label}
    >
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      {label}
    </button>
  );
}

export function DebatePanelCuratedCard({ text, suggestedMode, hasSelection, noSuggestion, onApply, onUndo }: Props) {
  const t = useT();
  if (!text.trim()) return null;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2" data-testid="debate-curated-card">
      <p className="text-[11px] font-semibold text-primary/80">{t('notes.debateCurated')}</p>
      <p className="text-[13px] text-text whitespace-pre-wrap leading-relaxed">{text}</p>
      {noSuggestion && (
        <p className="text-[11px] text-muted/70 italic">{t('notes.debateNoSuggestion')}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <ApplyBtn icon="add" label={t('notes.debateInsert')} onClick={() => onApply('insert')} />
        <ApplyBtn icon="find_replace" label={t('notes.debateReplace')} disabled={!hasSelection} onClick={() => onApply('replace')} />
        <ApplyBtn icon="vertical_align_bottom" label={t('notes.debateAppend')} onClick={() => onApply('append')} />
        <ApplyBtn icon="undo" label={t('notes.debateUndoAction')} onClick={onUndo} />
      </div>
    </div>
  );
}
