import { useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import { combineProcessesForDocument, type ProcessType } from '../../lib/processes';
import { useProcessesStore } from '../../stores/processes';
import { useTranscriptionStore } from '../../stores/transcription';

type Props = {
  documentId: string;
  onOpenProcesses?: () => void;
  onOpenProcess?: (id: string, type: ProcessType) => void;
};

function RowBody({ title, detail, error, isTerminal }: { title: string; detail: string; error: string | null; isTerminal: boolean }) {
  return (
    <>
      <div className="min-w-0">
        <div className="truncate text-xs text-text/85">{title}</div>
        {error && <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-red-300">{error}</div>}
      </div>
      {/* When the process is in a terminal-with-error state we suppress
       * the "Processing… · 0%" misleading label and print the real
       * status instead. Prevents the contradiction of "Processing" +
       * "Process interrupted" side-by-side on the same row. */}
      <span className={`ml-2 shrink-0 text-[11px] ${isTerminal ? 'text-red-300 font-medium' : 'text-muted'}`}>{detail}</span>
    </>
  );
}

export function NoteProcessesPanel({ documentId, onOpenProcesses, onOpenProcess }: Props) {
  const t = useT();
  const jobs = useTranscriptionStore((s) => s.jobs);
  const pauseJob = useTranscriptionStore((s) => s.pauseJob);
  const cancelJob = useTranscriptionStore((s) => s.cancelJob);
  const resumeJob = useTranscriptionStore((s) => s.resumeJob);
  const local = useProcessesStore((s) => s.localProcesses);
  const transcriptionJobIds = useMemo(() => new Set(jobs.map((job) => job.id)), [jobs]);
  const linked = useMemo(
    () => combineProcessesForDocument(documentId, jobs, local),
    [documentId, jobs, local],
  );
  // Collapsed by default when all linked processes are in a terminal
  // state (completed / failed / canceled / interrupted) — running
  // processes open the panel automatically so the user notices them.
  const hasActive = linked.some((item) => item.status === 'running' || item.status === 'queued' || item.status === 'paused');
  const [collapsed, setCollapsed] = useState(() => !hasActive);

  if (linked.length === 0) return null;

  const activeCount = linked.filter((item) => item.status === 'running' || item.status === 'queued' || item.status === 'paused').length;
  const failedCount = linked.filter((item) => item.status === 'failed' || item.status === 'canceled' || !!item.error).length;

  return (
    <section className="mt-2 rounded-xl border border-edge bg-surface/50 px-3 py-2" data-testid="note-processes-panel">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-text hover:text-primary transition-colors"
          aria-expanded={!collapsed}
          data-testid="note-processes-toggle"
        >
          <span className={`material-symbols-outlined text-[16px] transition-transform ${collapsed ? '' : 'rotate-90'}`}>chevron_right</span>
          <span>{t('processes.noteTitle')}</span>
          <span className="text-[11px] font-normal text-muted">
            ({linked.length}{activeCount > 0 ? ` · ${activeCount} ${t('processes.activeShort') || 'active'}` : ''}{failedCount > 0 ? ` · ${failedCount} ${t('processes.failedShort') || 'failed'}` : ''})
          </span>
        </button>
        {onOpenProcesses && (
          <button type="button" onClick={onOpenProcesses} className="rounded-lg border border-edge px-2 py-1 text-[11px] text-muted hover:text-text flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px]">arrow_outward</span>
            {t('processes.openProcesses') || t('nav.processes')}
          </button>
        )}
      </div>
      {!collapsed && (
      <div className="space-y-1.5 mt-2">
        {linked.map((item) => {
          const isManagedTranscriptionJob = item.type === 'transcribe_file' && transcriptionJobIds.has(item.id);
          // Detail label: when a process failed/was canceled/has an error,
          // the "stageLabel · pct%" read as success ("Processing… · 0%").
          // Show the real status instead.
          const isTerminal = item.status === 'failed' || item.status === 'canceled' || !!item.error;
          const statusKey = `processes.filter.${item.status}`;
          const detail = isTerminal
            ? t(statusKey)
            : `${t(item.stageLabelKey)} · ${item.pct}%`;
          return (
            <div key={item.id} className="flex items-start gap-2">
              {onOpenProcess ? (
                <button
                  type="button"
                  onClick={() => onOpenProcess(item.id, item.type)}
                  className="flex w-full min-w-0 items-start justify-between rounded-lg border border-edge px-2.5 py-1.5 text-left hover:border-primary/35"
                >
                  <RowBody title={item.title} detail={detail} error={item.error} isTerminal={isTerminal} />
                </button>
              ) : (
                <div className="flex w-full min-w-0 items-start justify-between rounded-lg border border-edge px-2.5 py-1.5 text-left">
                  <RowBody title={item.title} detail={detail} error={item.error} isTerminal={isTerminal} />
                </div>
              )}
              {isManagedTranscriptionJob && (item.status === 'running' || item.status === 'queued') && (
                <button type="button" onClick={() => pauseJob(item.id)} className="shrink-0 rounded-lg border border-edge px-2 py-1 text-[11px] text-muted hover:text-text" data-testid={`note-process-pause-${item.id}`}>
                  {t('processes.pause')}
                </button>
              )}
              {isManagedTranscriptionJob && (item.status === 'paused' || item.status === 'failed' || item.status === 'canceled') && (
                <button type="button" onClick={() => void resumeJob(item.id)} className="shrink-0 rounded-lg border border-edge px-2 py-1 text-[11px] text-muted hover:text-text" data-testid={`note-process-retry-${item.id}`}>
                  {t('processes.retry')}
                </button>
              )}
              {isManagedTranscriptionJob && (item.status === 'running' || item.status === 'queued' || item.status === 'paused') && (
                <button type="button" onClick={() => cancelJob(item.id)} className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/15" data-testid={`note-process-cancel-${item.id}`}>
                  {t('processes.cancel')}
                </button>
              )}
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}
