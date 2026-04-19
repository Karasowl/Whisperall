import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ProcessItem } from '../../lib/processes';
import { PROCESS_INTERRUPTED_SENTINEL } from '../../stores/processes';
import { useT } from '../../lib/i18n';
import { useSettingsStore } from '../../stores/settings';

type Props = {
  process: ProcessItem;
  stageLabel: string;
  primaryAction: { label: string; onClick: () => void } | null;
  secondaryAction?: { label: string; onClick: () => void } | null;
  dangerAction?: { label: string; onClick: () => void } | null;
  onOpenNote: (() => void) | null;
  onOpenTranscription?: (() => void) | null;
  onRefresh?: (() => void) | null;
  onDismiss?: (() => void) | null;
  notifyMode?: 'inherit' | 'silent' | 'notify' | 'notify_sound';
  onNotifyModeChange?: ((next: 'inherit' | 'silent' | 'notify' | 'notify_sound') => void) | null;
};

const STATUS_PILL_CLASSES: Record<ProcessItem['status'], string> = {
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  canceled: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  failed: 'bg-red-500/15 text-red-300 border-red-500/30',
  paused: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  queued: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  running: 'bg-primary/15 text-primary border-primary/30',
};

const STATUS_PROGRESS_BAR: Record<ProcessItem['status'], string> = {
  completed: 'bg-emerald-400',
  canceled: 'bg-rose-400',
  failed: 'bg-red-400',
  paused: 'bg-amber-400',
  queued: 'bg-sky-400',
  running: 'bg-primary',
};

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r.toString().padStart(2, '0')}s` : `${r}s`;
}

function formatAbsolute(ts: number, locale: string): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
  return sameDay
    ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatAgo(ts: number, t: (key: string) => string): string {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return t('processes.agoSeconds').replace('{n}', String(seconds));
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('processes.agoMinutes').replace('{n}', String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('processes.agoHours').replace('{n}', String(hours));
  const days = Math.floor(hours / 24);
  return t('processes.agoDays').replace('{n}', String(days));
}

/**
 * Resolve `error` for display. The store persists the i18n sentinel for
 * "interrupted on close" (and migrates legacy English strings to it at load
 * time), so the card localizes it here.
 */
function renderErrorText(error: string | null, t: (key: string) => string): string | null {
  if (!error) return null;
  if (error === PROCESS_INTERRUPTED_SENTINEL) return t('processes.interruptedOnClose');
  return error;
}

function useTickWhile(active: boolean, intervalMs: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return tick;
}

export function ProcessCard({
  process,
  stageLabel,
  primaryAction,
  secondaryAction,
  dangerAction,
  onOpenNote,
  onOpenTranscription,
  onRefresh,
  onDismiss,
  notifyMode,
  onNotifyModeChange,
}: Props) {
  const t = useT();
  const uiLanguage = useSettingsStore((s) => s.uiLanguage);
  const uiLocale = uiLanguage === 'es' ? 'es-ES' : 'en-US';
  const isSynthetic = process.synthetic === true;
  const isRunning = process.status === 'running' || process.status === 'queued';
  const showChunks = !isSynthetic && process.total > 0;
  // Elapsed ticker: only running/synthetic URL jobs show a live counter.
  useTickWhile(isRunning && isSynthetic && !!process.startedAt, 1000);
  // Slow ticker: keeps "N ago" labels fresh for every card without
  // spamming re-renders. 30 s is low enough that the user won't see a
  // jarring jump when switching back.
  useTickWhile(true, 30_000);
  const elapsedLabel = isSynthetic && process.startedAt && isRunning
    ? formatElapsed(Date.now() - process.startedAt)
    : '';
  const showProgress = isRunning;
  const errorText = renderErrorText(process.error, t);

  // Overflow menu (⋯) popover
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const notifBtnRef = useRef<HTMLButtonElement>(null);
  const menuPopoverRef = useRef<HTMLDivElement>(null);
  const notifPopoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen && !notifOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuBtnRef.current?.contains(target) || menuPopoverRef.current?.contains(target)) return;
      if (notifBtnRef.current?.contains(target) || notifPopoverRef.current?.contains(target)) return;
      setMenuOpen(false);
      setNotifOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menuOpen, notifOpen]);

  const hasOverflow = !!onOpenTranscription || !!onRefresh || !!onDismiss;

  return (
    <article
      className="rounded-xl border border-edge bg-surface p-4"
      data-testid={`process-${process.id}`}
    >
      {/* Row 1: title + status pill on left, notif bell + overflow on right */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 max-w-full truncate text-sm font-semibold text-text" title={process.title}>
              {process.title}
            </p>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_PILL_CLASSES[process.status]}`}
              data-testid={`process-${process.id}-status`}
            >
              {t(`processes.filter.${process.status}`)}
            </span>
          </div>
          {/* Row 1b: stage label + counter (or elapsed for synthetic URL) */}
          <p className="mt-1 text-xs text-muted" data-testid={`process-${process.id}-meta`}>
            <span>{stageLabel}</span>
            {showChunks && (
              <>
                <span className="mx-1.5 text-muted/40">·</span>
                <span className="select-none tabular-nums">{process.done}/{process.total} {t('transcribe.chunks')}</span>
                <span className="mx-1.5 text-muted/40">·</span>
                <span className="select-none tabular-nums">{process.pct}%</span>
              </>
            )}
            {isSynthetic && elapsedLabel && (
              <>
                <span className="mx-1.5 text-muted/40">·</span>
                <span className="tabular-nums">{t('processes.elapsed')}: {elapsedLabel}</span>
              </>
            )}
          </p>
          {/* Row 1c: timestamps — absolute start/end + relative ago, shown
              for any job that carries the data. Terminal jobs keep both
              markers so the user can tell when they were kicked off and
              when they died without reopening the detail modal. */}
          {(process.startedAt || process.endedAt) && (
            <p className="mt-0.5 text-[11px] text-muted/55 tabular-nums" data-testid={`process-${process.id}-timestamps`}>
              {process.startedAt && (
                <span>
                  <span className="text-muted/50">{t('processes.startedAt')}:</span>{' '}
                  <span className="text-muted/80">{formatAbsolute(process.startedAt, uiLocale)}</span>
                  <span className="text-muted/40"> ({formatAgo(process.startedAt, t)})</span>
                </span>
              )}
              {process.startedAt && process.endedAt && <span className="mx-1.5 text-muted/30">·</span>}
              {process.endedAt && (
                <span>
                  <span className="text-muted/50">{t('processes.endedAt')}:</span>{' '}
                  <span className="text-muted/80">{formatAbsolute(process.endedAt, uiLocale)}</span>
                  <span className="text-muted/40"> ({formatAgo(process.endedAt, t)})</span>
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onNotifyModeChange && notifyMode && (
            <div className="relative">
              <button
                ref={notifBtnRef}
                type="button"
                onClick={() => { setNotifOpen((v) => !v); setMenuOpen(false); }}
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/[0.06] ${notifyMode !== 'inherit' ? 'text-primary' : 'text-muted'}`}
                aria-label={t('processes.perProcessOverride')}
                title={t('processes.perProcessOverride')}
                data-testid={`process-${process.id}-notif-btn`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {notifyMode === 'silent' ? 'notifications_off' : notifyMode === 'notify_sound' ? 'notifications_active' : 'notifications'}
                </span>
              </button>
              {notifOpen && createPortal(
                <div
                  ref={notifPopoverRef}
                  className="fixed z-[320] w-56 rounded-lg border border-edge bg-[#1a2230] p-1 shadow-2xl"
                  style={popoverStyleFor(notifBtnRef.current, 224)}
                  data-testid={`process-${process.id}-notif-menu`}
                >
                  <p className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted/60">
                    {t('processes.notifyPerProcess')}
                  </p>
                  {(['inherit', 'silent', 'notify', 'notify_sound'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { onNotifyModeChange(mode); setNotifOpen(false); }}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-white/[0.06] ${notifyMode === mode ? 'text-primary' : 'text-text/85'}`}
                    >
                      <span className="material-symbols-outlined text-[14px] shrink-0">
                        {mode === 'inherit' ? 'sync_alt' : mode === 'silent' ? 'notifications_off' : mode === 'notify_sound' ? 'notifications_active' : 'notifications'}
                      </span>
                      <span className="flex-1 text-left">
                        {mode === 'inherit' ? t('processes.notifyInherited') : t(`processes.notify${mode === 'silent' ? 'Silent' : mode === 'notify_sound' ? 'Sound' : 'Only'}`)}
                      </span>
                      {notifyMode === mode && <span className="material-symbols-outlined text-[14px]">check</span>}
                    </button>
                  ))}
                </div>,
                document.body,
              )}
            </div>
          )}
          {hasOverflow && (
            <div className="relative">
              <button
                ref={menuBtnRef}
                type="button"
                onClick={() => { setMenuOpen((v) => !v); setNotifOpen(false); }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
                aria-label={t('processes.moreActions')}
                title={t('processes.moreActions')}
                data-testid={`process-${process.id}-menu-btn`}
              >
                <span className="material-symbols-outlined text-[18px]">more_vert</span>
              </button>
              {menuOpen && createPortal(
                <div
                  ref={menuPopoverRef}
                  className="fixed z-[320] w-56 rounded-lg border border-edge bg-[#1a2230] p-1 shadow-2xl"
                  style={popoverStyleFor(menuBtnRef.current, 224)}
                  data-testid={`process-${process.id}-menu`}
                >
                  {onOpenTranscription && (
                    <button type="button" onClick={() => { onOpenTranscription(); setMenuOpen(false); }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-text/85 transition-colors hover:bg-white/[0.06]">
                      <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                      <span className="flex-1 text-left">{t('processes.openTranscribe')}</span>
                    </button>
                  )}
                  {onRefresh && (
                    <button type="button" onClick={() => { onRefresh(); setMenuOpen(false); }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-text/85 transition-colors hover:bg-white/[0.06]">
                      <span className="material-symbols-outlined text-[14px]">refresh</span>
                      <span className="flex-1 text-left">{t('processes.refresh')}</span>
                    </button>
                  )}
                  {onDismiss && (
                    <button type="button" onClick={() => { onDismiss(); setMenuOpen(false); }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/10">
                      <span className="material-symbols-outlined text-[14px]">delete_outline</span>
                      <span className="flex-1 text-left">{t('processes.dismiss')}</span>
                    </button>
                  )}
                </div>,
                document.body,
              )}
            </div>
          )}
        </div>
      </div>

      {/* Progress bar — running/queued only, hidden for terminal states */}
      {showProgress && (
        <div className="mb-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-base">
            {showChunks ? (
              <div
                className={`h-full rounded-full transition-all ${STATUS_PROGRESS_BAR[process.status]}`}
                style={{ width: `${process.pct}%` }}
              />
            ) : (
              <div className={`h-full w-1/3 rounded-full wa-indeterminate ${STATUS_PROGRESS_BAR[process.status]}/70`} />
            )}
          </div>
        </div>
      )}

      {errorText && (
        <div className="mb-3 rounded-lg border border-red-500/25 bg-red-500/8 px-3 py-2 text-xs leading-relaxed text-red-200" data-testid={`process-${process.id}-error`}>
          {errorText}
        </div>
      )}

      {/* Actions row — compact, right-aligned */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {dangerAction && (
          <button type="button" onClick={dangerAction.onClick}
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/15">
            {dangerAction.label}
          </button>
        )}
        {secondaryAction && (
          <button type="button" onClick={secondaryAction.onClick}
            className="rounded-lg border border-edge px-2.5 py-1.5 text-xs text-text/85 transition-colors hover:border-primary/40 hover:text-text">
            {secondaryAction.label}
          </button>
        )}
        {primaryAction && (
          <button type="button" onClick={primaryAction.onClick}
            className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15">
            {primaryAction.label}
          </button>
        )}
        {!primaryAction && !secondaryAction && !dangerAction && onOpenNote && (
          <button type="button" onClick={onOpenNote}
            className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15">
            {t('processes.openNote')}
          </button>
        )}
      </div>
    </article>
  );
}

/**
 * Position a popover below (or above when there isn't room) a trigger button,
 * clamped to the viewport. Matches the pattern used by NotificationBell.
 */
function popoverStyleFor(trigger: HTMLElement | null, width: number): React.CSSProperties {
  if (!trigger) return {};
  const rect = trigger.getBoundingClientRect();
  const MARGIN = 8;
  let left = rect.right - width;
  const maxLeft = window.innerWidth - width - MARGIN;
  if (left > maxLeft) left = maxLeft;
  if (left < MARGIN) left = MARGIN;
  const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
  const top = spaceBelow >= 180 ? rect.bottom + 6 : Math.max(MARGIN, rect.top - 180 - 6);
  return { top, left };
}
