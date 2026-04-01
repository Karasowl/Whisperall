import { useT } from '../../lib/i18n';

type ApplyMode = 'insert' | 'replace' | 'append';
type SuggestedTargetPosition = 'start' | 'end' | 'before_match' | 'after_match';
type SuggestedTarget = { position: SuggestedTargetPosition; match?: string };

type Props = {
  text: string;
  suggestedMode: ApplyMode;
  suggestedTarget?: SuggestedTarget | null;
  hasSelection: boolean;
  noSuggestion: boolean;
  onApply: (mode: ApplyMode) => void;
  onUndo: () => void;
};

function ApplyBtn({
  icon,
  label,
  disabled,
  primary,
  onClick,
}: {
  icon: string;
  label: string;
  disabled?: boolean;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-7 px-2 inline-flex items-center gap-1 rounded border text-[11px] disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${
        primary
          ? 'border-primary/60 bg-primary/15 text-primary hover:bg-primary/20'
          : 'border-edge text-muted hover:text-text hover:bg-base/60'
      }`}
      title={label}
    >
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      {label}
    </button>
  );
}

function shortenAnchor(match?: string): string {
  const text = (match || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > 28 ? `${text.slice(0, 27).trim()}...` : text;
}

function suggestedLabel(t: (key: string) => string, mode: ApplyMode, target?: SuggestedTarget | null): string {
  if (mode === 'replace') return t('notes.debateReplace');
  const base = mode === 'append' ? t('notes.debateAppend') : t('notes.debateInsert');
  if (!target) return base;
  if (target.position === 'start') return `${base} ${t('notes.debateAtStart')}`;
  if (target.position === 'end') return `${base} ${t('notes.debateAtEnd')}`;
  const anchor = shortenAnchor(target.match);
  if (!anchor) return base;
  const relation = target.position === 'before_match' ? t('notes.debateBefore') : t('notes.debateAfter');
  return `${base} ${relation} "${anchor}"`;
}

function iconForMode(mode: ApplyMode): string {
  if (mode === 'replace') return 'find_replace';
  if (mode === 'append') return 'vertical_align_bottom';
  return 'add';
}

export function DebatePanelCuratedCard({
  text,
  suggestedMode,
  suggestedTarget,
  hasSelection,
  noSuggestion,
  onApply,
  onUndo,
}: Props) {
  const t = useT();
  if (!text.trim()) return null;
  const primaryLabel = suggestedLabel(t, suggestedMode, suggestedTarget);
  const primaryDisabled = suggestedMode === 'replace' && !hasSelection;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2" data-testid="debate-curated-card">
      <p className="text-[11px] font-semibold text-primary/80">{t('notes.debateCurated')}</p>
      <p className="text-[13px] text-text whitespace-pre-wrap leading-relaxed">{text}</p>
      {noSuggestion && (
        <p className="text-[11px] text-muted/70 italic">{t('notes.debateNoSuggestion')}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <ApplyBtn
          icon={iconForMode(suggestedMode)}
          label={primaryLabel}
          primary
          disabled={primaryDisabled}
          onClick={() => onApply(suggestedMode)}
        />
        {suggestedMode !== 'insert' && (
          <ApplyBtn icon="add" label={t('notes.debateInsert')} onClick={() => onApply('insert')} />
        )}
        {suggestedMode !== 'replace' && (
          <ApplyBtn icon="find_replace" label={t('notes.debateReplace')} disabled={!hasSelection} onClick={() => onApply('replace')} />
        )}
        {suggestedMode !== 'append' && (
          <ApplyBtn icon="vertical_align_bottom" label={t('notes.debateAppend')} onClick={() => onApply('append')} />
        )}
        <ApplyBtn icon="undo" label={t('notes.debateUndoAction')} onClick={onUndo} />
      </div>
    </div>
  );
}
