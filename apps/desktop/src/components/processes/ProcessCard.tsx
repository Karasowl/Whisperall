import type { ProcessItem } from '../../lib/processes';
import { useT } from '../../lib/i18n';

type Props = {
  process: ProcessItem;
  stageLabel: string;
  primaryAction: { label: string; onClick: () => void } | null;
  secondaryAction?: { label: string; onClick: () => void } | null;
  dangerAction?: { label: string; onClick: () => void } | null;
  onOpenNote: (() => void) | null;
  onRefresh?: (() => void) | null;
  notifyMode?: 'inherit' | 'silent' | 'notify' | 'notify_sound';
  onNotifyModeChange?: ((next: 'inherit' | 'silent' | 'notify' | 'notify_sound') => void) | null;
};

function statusClasses(status: ProcessItem['status']): string {
  if (status === 'completed') return 'text-emerald-400';
  if (status === 'canceled') return 'text-rose-300';
  if (status === 'failed') return 'text-red-400';
  if (status === 'paused') return 'text-amber-400';
  if (status === 'queued') return 'text-sky-300';
  return 'text-primary';
}

export function ProcessCard({
  process,
  stageLabel,
  primaryAction,
  secondaryAction,
  dangerAction,
  onOpenNote,
  onRefresh,
  notifyMode,
  onNotifyModeChange,
}: Props) {
  const t = useT();
  const counter = `${process.done}/${process.total} ${t('transcribe.chunks')}`;
  const showProgress = process.status !== 'completed' && process.status !== 'failed' && process.status !== 'canceled';
  return (
    <article className="rounded-xl border border-edge bg-surface p-4" data-testid={`process-${process.id}`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{process.title}</p>
          <p className={`text-xs uppercase tracking-wide ${statusClasses(process.status)}`}>{stageLabel}</p>
        </div>
        <span className="text-xs text-muted">{counter}</span>
      </div>
      {showProgress && (
        <div className="mb-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-base">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${process.pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">{process.pct}%</p>
        </div>
      )}
      {process.error && (
        <div className="mb-3 rounded-lg border border-red-500/25 bg-red-500/8 px-3 py-2 text-xs leading-relaxed text-red-200">
          {process.error}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {onNotifyModeChange && notifyMode && (
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-base px-2 py-1 text-[11px] text-muted">
            <span>{t('processes.notifyPerProcess')}</span>
            <select value={notifyMode} onChange={(e) => onNotifyModeChange(e.target.value as 'inherit' | 'silent' | 'notify' | 'notify_sound')}
              className="rounded bg-surface px-1 py-0.5 text-[11px] text-text/80">
              <option value="inherit">{t('processes.notifyInherited')}</option>
              <option value="silent">{t('processes.notifySilent')}</option>
              <option value="notify">{t('processes.notifyOnly')}</option>
              <option value="notify_sound">{t('processes.notifySound')}</option>
            </select>
          </label>
        )}
        {primaryAction && (
          <button type="button" onClick={primaryAction.onClick}
            className="rounded-lg border border-edge px-2.5 py-1.5 text-xs text-text/80 hover:text-text">
            {primaryAction.label}
          </button>
        )}
        {secondaryAction && (
          <button type="button" onClick={secondaryAction.onClick}
            className="rounded-lg border border-edge px-2.5 py-1.5 text-xs text-text/80 hover:text-text">
            {secondaryAction.label}
          </button>
        )}
        {dangerAction && (
          <button type="button" onClick={dangerAction.onClick}
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/15">
            {dangerAction.label}
          </button>
        )}
        {onRefresh && (
          <button type="button" onClick={onRefresh}
            className="rounded-lg border border-edge px-2.5 py-1.5 text-xs text-text/80 hover:text-text">
            {t('processes.refresh')}
          </button>
        )}
        {onOpenNote && (
          <button type="button" onClick={onOpenNote}
            className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/15">
            {t('processes.openNote')}
          </button>
        )}
      </div>
    </article>
  );
}
