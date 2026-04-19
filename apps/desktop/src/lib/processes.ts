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
  /** Client-only URL job (no chunks, no DB row). UI hides the chunk counter. */
  synthetic?: boolean;
  /** Epoch ms when the job kicked off — used to render an elapsed counter
   *  and the "Iniciada" timestamp on the card / detail modal. */
  startedAt?: number;
  /** Epoch ms when the job reached a terminal state (failed/completed/canceled).
   *  Paired with `startedAt` to show duration + absolute timestamps. */
  endedAt?: number;
  /** Backend pipeline stage that raised the failure (e.g. `resolve`, `transcribe`). */
  failedStage?: string;
};

function processDedupeKey(item: Pick<ProcessItem, 'type' | 'title' | 'documentId'>): string {
  return `${item.type}::${item.documentId ?? ''}::${item.title.trim().toLowerCase()}`;
}

export function processStatusFromTranscriptionJob(job: TranscriptionJob): ProcessStatus {
  const stage = resolveTranscriptionJobStage(job);
  // Explicit terminal/queued stages win outright.
  if (stage === 'paused') return 'paused';
  if (stage === 'canceled') return 'canceled';
  if (stage === 'failed') return 'failed';
  if (stage === 'completed') return 'completed';
  if (stage === 'queued') return 'queued';
  // An error attached to a job that is otherwise "processing" means the job
  // effectively failed even if the server status string wasn't updated.
  if (job.error) return 'failed';
  // Auto-promote to completed when all chunks are done — protects against a
  // boot-loaded job whose server status never flipped to 'completed' because
  // the final poll didn't land before the previous session closed.
  const total = Math.max(job.total_chunks, 0);
  if (total > 0 && job.processed_chunks >= total) return 'completed';
  return 'running';
}

export function mapTranscriptionJobToProcess(job: TranscriptionJob): ProcessItem {
  const progress = resolveTranscriptionJobProgress(job);
  const stage = resolveTranscriptionJobStage(job);
  const status = processStatusFromTranscriptionJob(job);
  // When we auto-promote to `completed` but the stage label is still a
  // mid-pipeline one (e.g. 'processing'), the card would show "TRANSCRIBING"
  // next to a 100% bar. Re-resolve the displayed stage so it agrees with the
  // effective status and the user sees a single, consistent signal.
  const displayStageKey = status === 'completed'
    ? transcriptionStageLabelKey('completed')
    : status === 'failed'
      ? transcriptionStageLabelKey('failed')
      : transcriptionStageLabelKey(stage);
  return {
    id: job.id,
    type: 'transcribe_file',
    title: job.filename ?? job.id,
    status,
    stageLabelKey: displayStageKey,
    done: progress.done,
    total: progress.total,
    pct: progress.pct,
    documentId: job.documentId ?? null,
    error: job.error ?? null,
    synthetic: job.synthetic === true,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    failedStage: job.failedStage,
  };
}

export function mapLocalProcessToProcess(process: LocalProcess): ProcessItem {
  // LocalProcess carries ISO strings; the UI wants epoch ms. Convert here so
  // ProcessCard / JobDetailModal can treat both origins (live transcription
  // jobs AND persisted local processes) uniformly.
  const startedAt = process.createdAt ? Date.parse(process.createdAt) : undefined;
  const endedAt = (process.status === 'completed' || process.status === 'failed' || process.status === 'canceled') && process.updatedAt
    ? Date.parse(process.updatedAt)
    : undefined;
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
    startedAt: Number.isFinite(startedAt) ? startedAt : undefined,
    endedAt: Number.isFinite(endedAt) ? endedAt : undefined,
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
  const merged = [...transcriptionItems, ...localItems];
  // Sort chronologically, MOST RECENT FIRST. The old ordering was "live
  // transcription jobs first (insertion order), then local processes". That
  // pushed just-kicked-off URL jobs BELOW older completed ones whenever a
  // LocalProcess row already existed. History-first order matches how people
  // actually scan a "recent activity" list: the newest thing is the one
  // most likely to be interesting.
  merged.sort((a, b) => {
    const aTs = a.startedAt ?? 0;
    const bTs = b.startedAt ?? 0;
    if (aTs !== bTs) return bTs - aTs;
    // Stable tiebreaker on id so renders don't flicker when two items share
    // a timestamp (common during tests / rapid kickoffs).
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
  return merged;
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
