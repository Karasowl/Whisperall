import type { LocalProcess } from '../stores/processes';
import type { TranscriptionJob } from '../stores/transcription';
import { resolveTranscriptionJobProgress, resolveTranscriptionJobStage, transcriptionStageLabelKey } from '../stores/transcription';

export type ProcessStatus = 'queued' | 'running' | 'paused' | 'failed' | 'completed' | 'canceled';
export type ProcessFilter = 'all' | ProcessStatus;
export type ProcessType = 'transcribe_file' | 'note_import' | 'ai_edit' | 'tts_read' | 'note_retranscribe';
export type ProcessItem = {
  id: string;
  type: ProcessType;
  title: string;
  status: ProcessStatus;
  stageLabelKey: string;
  done: number;
  total: number;
  pct: number;
  documentId: string | null;
  error: string | null;
};

function processDedupeKey(item: Pick<ProcessItem, 'type' | 'title' | 'documentId'>): string {
  return `${item.type}::${item.documentId ?? ''}::${item.title.trim().toLowerCase()}`;
}

export function processStatusFromTranscriptionJob(job: TranscriptionJob): ProcessStatus {
  const stage = resolveTranscriptionJobStage(job);
  if (stage === 'paused') return 'paused';
  if (stage === 'canceled') return 'canceled';
  if (stage === 'failed') return 'failed';
  if (stage === 'completed') return 'completed';
  if (stage === 'queued') return 'queued';
  return 'running';
}

export function mapTranscriptionJobToProcess(job: TranscriptionJob): ProcessItem {
  const progress = resolveTranscriptionJobProgress(job);
  const stage = resolveTranscriptionJobStage(job);
  return {
    id: job.id,
    type: 'transcribe_file',
    title: job.filename ?? job.id,
    status: processStatusFromTranscriptionJob(job),
    stageLabelKey: transcriptionStageLabelKey(stage),
    done: progress.done,
    total: progress.total,
    pct: progress.pct,
    documentId: job.documentId ?? null,
    error: job.error ?? null,
  };
}

export function mapLocalProcessToProcess(process: LocalProcess): ProcessItem {
  return {
    id: process.id,
    type: process.type,
    title: process.title,
    status: process.status,
    stageLabelKey: process.stageLabelKey,
    done: process.done,
    total: process.total,
    pct: process.pct,
    documentId: process.documentId,
    error: process.error,
  };
}

export function combineProcessItems(jobs: TranscriptionJob[], localProcesses: LocalProcess[]): ProcessItem[] {
  const transcriptionItems = jobs.map(mapTranscriptionJobToProcess);
  const activeTranscriptionKeys = new Set(
    transcriptionItems
      .filter((item) => item.type === 'transcribe_file' && item.status !== 'completed' && item.status !== 'failed' && item.status !== 'canceled')
      .map(processDedupeKey),
  );
  const localItems = localProcesses
    .map(mapLocalProcessToProcess)
    .filter((item) => !(item.type === 'transcribe_file' && activeTranscriptionKeys.has(processDedupeKey(item))));
  return [...transcriptionItems, ...localItems];
}

export function combineProcessesForDocument(
  documentId: string,
  jobs: TranscriptionJob[],
  localProcesses: LocalProcess[],
): ProcessItem[] {
  return combineProcessItems(jobs, localProcesses).filter((item) => item.documentId === documentId);
}

export function processMatchesFilter(item: ProcessItem, filter: ProcessFilter): boolean {
  return filter === 'all' || item.status === filter;
}
