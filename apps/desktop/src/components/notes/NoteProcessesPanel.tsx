import { useMemo } from 'react';
import { useT } from '../../lib/i18n';
import { mapLocalProcessToProcess, mapTranscriptionJobToProcess, type ProcessType } from '../../lib/processes';
import { useProcessesStore } from '../../stores/processes';
import { useTranscriptionStore } from '../../stores/transcription';

type Props = {
  documentId: string;
  onOpenProcesses: () => void;
  onOpenProcess: (id: string, type: ProcessType) => void;
};

export function NoteProcessesPanel({ documentId, onOpenProcesses, onOpenProcess }: Props) {
  const t = useT();
  const jobs = useTranscriptionStore((s) => s.jobs);
  const pauseJob = useTranscriptionStore((s) => s.pauseJob);
  const cancelJob = useTranscriptionStore((s) => s.cancelJob);
  const resumeJob = useTranscriptionStore((s) => s.resumeJob);
  const local = useProcessesStore((s) => s.localProcesses);
  const linked = useMemo(
    () => [
      ...jobs.filter((job) => job.documentId === documentId).map(mapTranscriptionJobToProcess),
      ...local.filter((process) => process.documentId === documentId).map(mapLocalProcessToProcess),
    ],
    [documentId, jobs, local],
  );

  return (
    <section className="mt-2 rounded-xl border border-edge bg-surface/50 px-3 py-2" data-testid="note-processes-panel">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-text">{t('processes.noteTitle')}</h4>
        <button type="button" onClick={onOpenProcesses}
          className="rounded-lg border border-edge px-2 py-1 text-[11px] text-muted hover:text-text">
          {t('processes.openHub')}
        </button>
      </div>
      {linked.length === 0 ? (
        <p className="text-xs text-muted">{t('processes.noteEmpty')}</p>
      ) : (
        <div className="space-y-1.5">
          {linked.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <button type="button" onClick={() => onOpenProcess(item.id, item.type)}
                className="flex w-full min-w-0 items-center justify-between rounded-lg border border-edge px-2.5 py-1.5 text-left hover:border-primary/35">
                <span className="min-w-0 truncate text-xs text-text/85">{item.title}</span>
                <span className="ml-2 shrink-0 text-[11px] text-muted">{t(item.stageLabelKey)} · {item.pct}%</span>
              </button>
              {item.type === 'transcribe_file' && (item.status === 'running' || item.status === 'queued') && (
                <button
                  type="button"
                  onClick={() => pauseJob(item.id)}
                  className="shrink-0 rounded-lg border border-edge px-2 py-1 text-[11px] text-muted hover:text-text"
                  data-testid={`note-process-pause-${item.id}`}
                >
                  {t('processes.pause')}
                </button>
              )}
              {item.type === 'transcribe_file' && (item.status === 'paused' || item.status === 'failed' || item.status === 'canceled') && (
                <button
                  type="button"
                  onClick={() => void resumeJob(item.id)}
                  className="shrink-0 rounded-lg border border-edge px-2 py-1 text-[11px] text-muted hover:text-text"
                  data-testid={`note-process-retry-${item.id}`}
                >
                  {t('processes.retry')}
                </button>
              )}
              {item.type === 'transcribe_file' && (item.status === 'running' || item.status === 'queued' || item.status === 'paused') && (
                <button
                  type="button"
                  onClick={() => cancelJob(item.id)}
                  className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/15"
                  data-testid={`note-process-cancel-${item.id}`}
                >
                  {t('processes.cancel')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
