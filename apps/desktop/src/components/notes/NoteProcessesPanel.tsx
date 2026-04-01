import { useMemo } from 'react';
import { useT } from '../../lib/i18n';
import { combineProcessesForDocument, type ProcessType } from '../../lib/processes';
import { useProcessesStore } from '../../stores/processes';
import { useTranscriptionStore } from '../../stores/transcription';

type Props = {
  documentId: string;
  onOpenProcesses?: () => void;
  onOpenProcess?: (id: string, type: ProcessType) => void;
};

function RowBody({ title, detail, error }: { title: string; detail: string; error: string | null }) {
  return (
    <>
      <div className="min-w-0">
        <div className="truncate text-xs text-text/85">{title}</div>
        {error && <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-red-300">{error}</div>}
      </div>
      <span className="ml-2 shrink-0 text-[11px] text-muted">{detail}</span>
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

  if (linked.length === 0) return null;

  return (
    <section className="mt-2 rounded-xl border border-edge bg-surface/50 px-3 py-2" data-testid="note-processes-panel">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-text">{t('processes.noteTitle')}</h4>
        {onOpenProcesses && (
          <button type="button" onClick={onOpenProcesses} className="rounded-lg border border-edge px-2 py-1 text-[11px] text-muted hover:text-text">
            {t('processes.openHub')}
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {linked.map((item) => {
          const isManagedTranscriptionJob = item.type === 'transcribe_file' && transcriptionJobIds.has(item.id);
          const detail = `${t(item.stageLabelKey)} · ${item.pct}%`;
          return (
            <div key={item.id} className="flex items-start gap-2">
              {onOpenProcess ? (
                <button
                  type="button"
                  onClick={() => onOpenProcess(item.id, item.type)}
                  className="flex w-full min-w-0 items-start justify-between rounded-lg border border-edge px-2.5 py-1.5 text-left hover:border-primary/35"
                >
                  <RowBody title={item.title} detail={detail} error={item.error} />
                </button>
              ) : (
                <div className="flex w-full min-w-0 items-start justify-between rounded-lg border border-edge px-2.5 py-1.5 text-left">
                  <RowBody title={item.title} detail={detail} error={item.error} />
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
    </section>
  );
}
