import { create } from 'zustand';
import { api } from '../lib/api';
import { getSupabase } from '../lib/supabase';
import { splitFileIntoChunkParts } from '../lib/audio';
import { ApiError, type TranscribeJobResponse, type TranscriptSegment } from '@whisperall/api-client';
import { useDocumentsStore } from './documents';
import { requestPlanRefresh } from './plan';
import { useAuthStore } from './auth';
import { safeHtmlParagraphs } from '../lib/editor-utils';
import { reportError, useNotificationsStore } from './notifications';
import { useProcessesStore } from './processes';
import { useActionsStore, endAction } from './actions';
import { t as tStatic } from '../lib/i18n';
import { useSettingsStore } from './settings';

function tLocale(key: string, vars?: Record<string, string | number>): string {
  const locale = useSettingsStore.getState().uiLanguage;
  let out = tStatic(key, locale);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
  }
  return out;
}

export type TranscriptionJobStage =
  | 'preparing'
  | 'openingLink'
  | 'downloading'
  | 'extracting'
  | 'sending'
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'finalizing'
  | 'saving'
  | 'completed'
  | 'canceled'
  | 'paused'
  | 'failed';

export type TranscriptionJob = TranscribeJobResponse & {
  filename?: string;
  audioUrl?: string;
  stage?: TranscriptionJobStage;
  /** Epoch ms at which this URL job was kicked off. Used for per-job elapsed display. */
  startedAt?: number;
  /** Epoch ms at which the job reached a terminal state (completed/failed/canceled).
   *  Pair with `startedAt` to show the user "started at X, failed at Y" in the UI. */
  endedAt?: number;
  /** Marks a synthetic, client-only URL job (no DB row). See urlRuntimes. */
  synthetic?: boolean;
  /**
   * Real backend uuid once `fromUrlAsJob()` returned. We don't swap the row's
   * id to this value — swapping broke the JobDetailModal whenever the user
   * had it open on the synthetic id (the card would vanish from jobs[] mid-
   * session). Instead, the synthetic id remains the stable UI identity and
   * this field is what we pass to `/run/{id}` and `/result/{id}`.
   */
  backendJobId?: string;
  /** Target document id for the eventual auto-save (URL jobs). */
  targetDocumentId?: string | null;
  /**
   * Backend pipeline stage that raised the failure — `resolve`, `size_check`,
   * `diarize`, `transcribe`, `fallback_stt`, `save`. Populated from
   * `ApiError.stage` via `normalizeTranscriptionError`. Lets the UI render
   * "Falló en: Descarga — …" instead of a bare error line.
   */
  failedStage?: string;
  uploadedChunks?: number;
  uploadTotalChunks?: number;
  documentId?: string | null;
  error?: string | null;
};

type TranscriptionErrorKind = 'plan_limit' | 'storage' | 'diarization_config' | 'generic';

type NormalizedTranscriptionError = {
  kind: TranscriptionErrorKind;
  message: string;
  /** Backend pipeline stage that raised the error (e.g. `resolve`, `transcribe`). */
  stage?: string;
};

// How many chunks per server-side `run` call. Bumped from 5 → 10 because the
// server now processes chunks concurrently (STT_CONCURRENCY=5 on backend).
// Larger batches mean fewer client round-trips without starving the backend.
const TRANSCRIBE_BATCH_SIZE = 10;
const DEFAULT_CHUNK_MS = 300_000;
const DIARIZATION_CHUNK_MS = 120_000;
const MIME_TO_EXT: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/flac': 'flac',
};

function normalizeMimeType(mime: string | undefined): string {
  return (mime ?? '').split(';')[0].trim().toLowerCase();
}

function extensionFromFilename(filename: string): string | null {
  const parts = filename.toLowerCase().split('.');
  if (parts.length < 2) return null;
  return parts[parts.length - 1] || null;
}

function chunkUploadMeta(chunk: Blob, originalFilename: string): { ext: string; contentType: string } {
  const mime = normalizeMimeType(chunk.type);
  if (mime && MIME_TO_EXT[mime]) {
    return { ext: MIME_TO_EXT[mime], contentType: mime };
  }
  const extFromName = extensionFromFilename(originalFilename);
  return {
    ext: extFromName ?? 'bin',
    contentType: mime || 'application/octet-stream',
  };
}

function normalizeTranscriptionError(err: unknown): NormalizedTranscriptionError {
  const apiErr = err instanceof ApiError ? err : null;
  const apiStatus = apiErr?.status;
  const apiCode = (apiErr?.code ?? '').toUpperCase();
  const apiResource = (apiErr?.resource ?? '').toLowerCase();
  const apiStage = apiErr?.stage;
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const msg = raw.trim();
  const lower = msg.toLowerCase();

  if (
    lower.includes('insufficient_storage') ||
    lower.includes('no space') ||
    lower.includes('disk full') ||
    lower.includes('quota')
  ) {
    return {
      kind: 'storage',
      message: 'No storage space available. Free up space (or storage quota) and try again.',
      stage: apiStage,
    };
  }

  if (lower.includes('deepgram_api_key') || lower.includes('diarization is enabled but deepgram')) {
    return {
      kind: 'diarization_config',
      message: 'Speaker diarization needs Deepgram configured. Add DEEPGRAM_API_KEY and retry.',
      stage: apiStage,
    };
  }

  if (
    apiCode === 'PLAN_LIMIT_EXCEEDED' ||
    lower.includes('plan limit exceeded') ||
    (apiStatus === 429 && apiResource === 'transcribe_seconds')
  ) {
    return {
      kind: 'plan_limit',
      message: msg.includes('plan:')
        ? msg.replace(/^api error \d+:\s*/i, '')
        : 'You reached your monthly transcription limit. Upgrade your plan to continue or wait for monthly reset.',
      stage: apiStage,
    };
  }

  if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return {
      kind: 'generic',
      message: 'Cannot reach the transcription API. Check backend URL/CORS (localhost vs 127.0.0.1) and retry.',
      stage: apiStage,
    };
  }

  if (lower.includes('api error')) {
    return {
      kind: 'generic',
      message: msg.replace(/^api error\s*\d+:\s*/i, '') || msg,
      stage: apiStage,
    };
  }

  return {
    kind: 'generic',
    message: msg || 'Transcription failed',
    stage: apiStage,
  };
}

export type TranscriptionState = {
  jobs: TranscriptionJob[];
  activeJobId: string | null;
  segments: TranscriptSegment[];
  fullText: string;
  loading: boolean;
  error: string | null;
  diarization: boolean;
  aiSummary: boolean;
  punctuation: boolean;
  language: string;
  stagedFile: File | null;
  stagedUrl: string;
  savedDocumentId: string | null;
  sourceAudioUrl: string | null;
  urlStartedAt: number | null;
  targetDocumentId: string | null;

  setDiarization: (v: boolean) => void;
  setAiSummary: (v: boolean) => void;
  setPunctuation: (v: boolean) => void;
  setLanguage: (lang: string) => void;
  setTargetDocumentId: (documentId: string | null) => void;
  stageFile: (file: File) => void;
  stageUrl: (url: string) => void;
  clearStaged: () => void;
  startTranscription: () => Promise<void>;
  cancelUrlTranscription: (jobId?: string) => void;
  createJob: (file: File, language?: string) => Promise<void>;
  pollJob: (jobId: string) => Promise<void>;
  loadResult: (jobId: string) => Promise<void>;
  setActiveJob: (jobId: string | null) => void;
  pauseJob: (jobId: string) => void;
  cancelJob: (jobId: string) => void;
  resumeJob: (jobId: string) => Promise<void>;
  /**
   * Remove a transcription job from the local list. Used by the Processes
   * hub / JobDetailModal "Dismiss" action. Aborts and disposes the runtime
   * if the job happens to still be active.
   */
  dismissJob: (jobId: string) => void;
  subscribeToRealtime: () => () => void;
  reset: () => void;
};

// 30 minutes — the URL prep call (yt-dlp download + ffmpeg transcode + split +
// parallel upload) for a 4 h YouTube video runs ~6-10 min on good network,
// ~12-15 min on slow. Keep headroom for worst-case residential broadband.
const URL_TIMEOUT_MS = 30 * 60_000;
const FILE_TIMEOUT_MS = 10 * 60_000; // 10 minutes

/**
 * Per-URL-job runtime kept outside Zustand state so we can run multiple URL
 * transcriptions in parallel without the singletons (abort controller, ticker)
 * clobbering each other. Keyed by synthetic job id (`url-{startedAt}`).
 */
type UrlJobRuntime = {
  controller: AbortController;
  timeoutId: ReturnType<typeof setTimeout>;
  ticker: ReturnType<typeof setInterval>;
  abortedByUser: boolean;
  startedAt: number;
};
const urlRuntimes = new Map<string, UrlJobRuntime>();

function disposeUrlRuntime(jobId: string): void {
  const rt = urlRuntimes.get(jobId);
  if (!rt) return;
  clearTimeout(rt.timeoutId);
  clearInterval(rt.ticker);
  urlRuntimes.delete(jobId);
}

let fileAbortController: AbortController | null = null;
let stagedFileObjectUrl: string | null = null;

function revokeOwnedObjectUrl(url: string | null | undefined): void {
  if (!url || url !== stagedFileObjectUrl) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore cleanup failures
  }
  stagedFileObjectUrl = null;
}

function replaceStagedFileObjectUrl(file: File): string {
  revokeOwnedObjectUrl(stagedFileObjectUrl);
  stagedFileObjectUrl = URL.createObjectURL(file);
  return stagedFileObjectUrl;
}

function persistableAudioUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

function stageFromServerStatus(status: string): TranscriptionJobStage {
  if (status === 'completed') return 'completed';
  if (status === 'canceled') return 'canceled';
  if (status === 'paused') return 'paused';
  if (status === 'failed') return 'failed';
  if (status === 'pending') return 'queued';
  return 'processing';
}

export function resolveTranscriptionJobStage(job: TranscriptionJob): TranscriptionJobStage {
  return job.stage ?? stageFromServerStatus(job.status);
}

export function resolveTranscriptionJobProgress(job: TranscriptionJob): { done: number; total: number; pct: number } {
  const stage = resolveTranscriptionJobStage(job);
  if (stage === 'uploading') {
    const total = Math.max(job.uploadTotalChunks ?? job.total_chunks, 0);
    const done = Math.max(0, Math.min(job.uploadedChunks ?? 0, total));
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { done, total, pct };
  }
  const total = Math.max(job.total_chunks, 0);
  const done = Math.max(0, Math.min(job.processed_chunks, total));
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, pct };
}

export function transcriptionStageLabelKey(stage: TranscriptionJobStage): string {
  if (stage === 'preparing') return 'transcribe.stagePreparing';
  if (stage === 'openingLink') return 'transcribe.stageOpeningLink';
  if (stage === 'downloading') return 'transcribe.stageDownloading';
  if (stage === 'extracting') return 'transcribe.stageExtracting';
  if (stage === 'sending') return 'transcribe.stageSending';
  if (stage === 'uploading') return 'transcribe.stageUploading';
  if (stage === 'queued') return 'transcribe.stageQueued';
  if (stage === 'processing') return 'transcribe.stageProcessing';
  if (stage === 'finalizing') return 'transcribe.stageFinalizing';
  if (stage === 'saving') return 'transcribe.stageSaving';
  if (stage === 'canceled') return 'processes.filter.canceled';
  if (stage === 'paused') return 'transcribe.paused';
  if (stage === 'failed') return 'transcribe.failed';
  return 'transcribe.completed';
}

export function transcriptionStageDetailKey(stage: TranscriptionJobStage): string | null {
  if (stage === 'openingLink') return 'transcribe.detailOpeningLink';
  if (stage === 'downloading') return 'transcribe.detailDownloading';
  if (stage === 'extracting') return 'transcribe.detailExtracting';
  if (stage === 'sending') return 'transcribe.detailSending';
  if (stage === 'uploading') return 'transcribe.detailUploading';
  if (stage === 'queued') return 'transcribe.detailQueued';
  if (stage === 'processing') return 'transcribe.detailProcessing';
  if (stage === 'finalizing') return 'transcribe.detailFinalizing';
  if (stage === 'saving') return 'transcribe.detailSaving';
  return null;
}

/**
 * URL transcription stage progression (time-based heuristic).
 * The backend `/v1/transcribe/from_url` is a blocking call that does
 * download + extract + transcribe server-side with no streaming. Until we
 * migrate to SSE/job-polling, we simulate the phases on the client so the
 * user sees something more informative than "Processing... 0%".
 *
 * Thresholds are chosen to degrade gracefully: a short clip may race past
 * the early stages and sit in `processing` for most of its life; a long
 * clip walks through each stage roughly when it's plausible.
 */
export function urlStageForElapsed(elapsedMs: number): TranscriptionJobStage {
  if (elapsedMs < 3_000) return 'openingLink';
  if (elapsedMs < 20_000) return 'downloading';
  if (elapsedMs < 40_000) return 'extracting';
  if (elapsedMs < 55_000) return 'sending';
  return 'processing';
}

type SaveTranscriptionNoteOptions = {
  sourceId?: string;
  audioUrl?: string;
};

async function saveAsNote(title: string, text: string, options?: SaveTranscriptionNoteOptions): Promise<string | null> {
  try {
    const html = safeHtmlParagraphs(text);
    const doc = await useDocumentsStore.getState().createDocument({
      title,
      content: html,
      source: 'transcription',
      source_id: options?.sourceId,
      audio_url: options?.audioUrl,
    });
    return doc.id;
  } catch (e) {
    console.error('[transcription] auto-save failed:', e);
    reportError('transcription.autoSave', e);
    return null;
  }
}

/**
 * Background runner for URL transcription jobs. Lives outside the Zustand
 * `set`/`get` API so it can be fired-and-forgotten by `startTranscription`
 * without keeping the caller's promise alive. Must handle its own cleanup:
 * dispose the runtime entry, remove the synthetic job, and push a completion
 * notification (success or error) so the NotificationBell/NotificationToast
 * surface the result regardless of which page the user is on.
 */
type RunUrlOpts = {
  jobId: string;
  url: string;
  urlHost: string;
  language: string | undefined;
  enableDiarization: boolean;
  signal: AbortSignal;
  targetDocumentId: string | null;
};

/**
 * Write a failure snapshot into `useProcessesStore` (which IS persisted to
 * localStorage). That way if the user closes the app before copying the
 * error, the failed URL transcription can still be recovered from the
 * Processes hub on next launch. `transcription.jobs[]` is session-only by
 * design (it holds live AbortControllers and tickers); persisting THAT would
 * require serialising non-serialisable state.
 */
function mirrorUrlJobFailureToProcessesStore(args: {
  url: string;
  urlHost: string;
  errorMessage: string;
  failedStage?: string;
  targetDocumentId: string | null;
}): void {
  try {
    // Persist the FULL URL as the title so users can tell jobs apart when
    // multiple transcriptions of the same host failed. Host-only was the
    // old behaviour and made a list of 5 youtube failures look like one.
    const title = args.url || args.urlHost;
    const pid = useProcessesStore.getState().start({
      type: 'transcribe_file',
      title,
      stageLabelKey: 'transcribe.failed',
      documentId: args.targetDocumentId ?? null,
      total: 1,
    });
    const detail = args.failedStage
      ? `[${args.failedStage}] ${args.errorMessage} — ${args.url}`
      : `${args.errorMessage} — ${args.url}`;
    useProcessesStore.getState().fail(pid, detail, 'transcribe.failed');
  } catch (e) {
    console.warn('[transcription] could not mirror failure to processes store', e);
  }
}

async function runUrlTranscription(opts: RunUrlOpts): Promise<void> {
  const { jobId, url, urlHost, language, enableDiarization, signal, targetDocumentId } = opts;
  const setState = useTranscriptionStore.setState;
  const getState = useTranscriptionStore.getState;
  const notify = useNotificationsStore.getState();

  /**
   * The id we should target in setState updates. Starts as the synthetic id
   * but gets reassigned to the real backend id after the job swap. All
   * downstream catch/update paths read from this variable so errors during
   * Phase B / C correctly target the row that's actually in `jobs[]` —
   * previously the catch kept using the stale synthetic id from the closure
   * and became a silent no-op, leaving the UI to show a stuck "processing"
   * job that never flipped to failed.
   */
  let currentJobId = jobId;

  /**
   * Kept for reference — the catch paths now inline their own setState calls
   * that target `currentJobId` (the up-to-date id after the synthetic→real
   * swap) rather than the stale closure `jobId`, which earlier produced
   * silent no-ops and the "job disappeared" bug the user reported.
   */

  try {
    // ── Phase A: server-side prep (download + transcode + split + upload) ──
    // This is one blocking HTTP call that can legitimately take a few
    // minutes for a long YouTube video. The synthetic ticker already runs
    // the `openingLink → downloading → extracting → sending` simulation in
    // the UI for this window. When the call returns we hand off to the
    // chunked `run` loop below.
    const backendJob = await api.transcribe.fromUrlAsJob({
      url,
      language,
      enable_diarization: enableDiarization,
    }, { signal });

    // ── Job binding: attach real backend id without swapping the row ──
    // Earlier versions swapped the synthetic id for the real backend uuid
    // in `jobs[]`. That broke the JobDetailModal: whenever the user had it
    // open on the synthetic id (the normal case — they opened it during
    // prep), the row disappeared from jobs[] during the swap and the modal
    // unmounted with no way to get back to the logs. Now we KEEP the
    // synthetic id as the stable UI key and just stash the real id in
    // `backendJobId`. The run loop + result fetch use `backendJobId`
    // internally; the user never sees it.
    disposeUrlRuntime(jobId);
    // currentJobId stays as synthetic `jobId` — setState updates target the
    // same row the modal is watching.
    // Prefer the extractor-resolved video title (YouTube, etc.) when yt-dlp
    // gave us one. It's MUCH more useful than the raw URL as a label — a
    // user testing 3 YouTube videos sees actual titles instead of 3 near-
    // identical links.
    const displayTitle = backendJob.title?.trim() || url;
    // Prefer the playable Supabase URL the backend uploaded alongside the
    // chunks (a proper mp3) over the original URL. YouTube/Vimeo/etc. URLs
    // are webpages the browser's <audio> element can't load — without this,
    // the note's audio player would just show "Could not load audio".
    const playableAudioUrl = backendJob.audio_url || url;
    setState((s) => ({
      jobs: s.jobs.map((j) => (
        j.id === jobId
          ? {
              ...j,
              status: backendJob.status,
              total_chunks: backendJob.total_chunks,
              processed_chunks: backendJob.processed_chunks,
              stage: 'processing',
              backendJobId: backendJob.id,
              filename: displayTitle,
              audioUrl: playableAudioUrl,
            }
          : j
      )),
      urlStartedAt: urlRuntimes.size > 0
        ? Math.min(...Array.from(urlRuntimes.values()).map((r) => r.startedAt))
        : null,
    }));

    // ── Phase B: chunked `run` loop ────────────────────────────────────
    // Uses backendJob.id against the server; stores results against the
    // synthetic `jobId` (== currentJobId) so the UI row/modal keep working.
    const backendId = backendJob.id;
    let jobStatus = backendJob.status;
    let lastResponse: TranscribeJobResponse | null = backendJob;
    while (jobStatus === 'processing' || jobStatus === 'pending') {
      const result = await api.transcribe.run(backendId, { max_chunks: TRANSCRIBE_BATCH_SIZE });
      lastResponse = result;
      setState((s) => ({
        jobs: s.jobs.map((j) => (
          j.id === currentJobId
            ? {
                ...j,
                status: result.status,
                processed_chunks: result.processed_chunks,
                total_chunks: result.total_chunks,
                stage: result.status === 'completed' ? 'finalizing' : stageFromServerStatus(result.status),
              }
            : j
        )),
      }));
      requestPlanRefresh();
      jobStatus = result.status;
      if (jobStatus !== 'processing' && jobStatus !== 'pending') break;
    }

    if (jobStatus !== 'completed') {
      const errText = (lastResponse && (lastResponse as TranscriptionJob).error) || `Job ended with status '${jobStatus}'`;
      const endedAt = Date.now();
      setState((s) => ({
        jobs: s.jobs.map((j) => (j.id === currentJobId ? { ...j, status: jobStatus, stage: 'failed', error: errText, endedAt } : j)),
      }));
      notify.push(
        { message: tLocale('transcribe.notifyFailed', { source: urlHost }), detail: errText, context: 'transcription.url' },
        'error',
      );
      mirrorUrlJobFailureToProcessesStore({
        url,
        urlHost,
        errorMessage: errText,
        targetDocumentId,
      });
      return;
    }

    // ── Phase C: fetch full text + persist ─────────────────────────────
    const endedAt = Date.now();
    setState((s) => ({
      jobs: s.jobs.map((j) => (j.id === currentJobId ? { ...j, stage: 'saving' } : j)),
    }));
    const { text, segments } = await api.transcribe.getResult(backendId);
    let savedDocId: string | null = null;
    if (text.trim()) {
      // Prefer the extractor-resolved title (from backendJob.title) for
      // both note-title fallback and the new-note case. This gives YouTube
      // transcriptions meaningful names like "How to Build a Rocket" instead
      // of raw URLs or hostnames.
      const noteTitle = backendJob.title?.trim() || urlHost;
      if (targetDocumentId) {
        const transcriptHtml = safeHtmlParagraphs(text);
        const existingDoc = useDocumentsStore.getState().documents.find((doc) => doc.id === targetDocumentId) ?? null;
        const hasExistingContent = !!existingDoc?.content.replace(/<[^>]*>/g, ' ').trim();
        const mergedContent = hasExistingContent ? `${existingDoc?.content}<p></p>${transcriptHtml}` : transcriptHtml;
        const update: { content: string; audio_url: string; title?: string } = {
          content: mergedContent,
          audio_url: playableAudioUrl,
        };
        // Apply the extracted title ONLY when the existing doc had no real
        // title (the synthesised "{host} — {date}" smart title counts as
        // empty for this purpose). Never clobber a user-picked title.
        const existingTitle = existingDoc?.title?.trim() ?? '';
        const looksAutoGenerated = !existingTitle || /^(Nota|Note)\s+—|^Untitled$/i.test(existingTitle);
        if (backendJob.title && looksAutoGenerated) {
          update.title = noteTitle;
        }
        await useDocumentsStore.getState().updateDocument(targetDocumentId, update);
        savedDocId = targetDocumentId;
      } else {
        savedDocId = await saveAsNote(noteTitle, text, { audioUrl: playableAudioUrl });
      }

      // Persist diarized segments to `document_transcriptions` so the note's
      // EditorPage can render the speaker-annotated segment panel. Without
      // this call the note would show only the flat text + "Audio is linked
      // to this note, but there are no diarized segments yet." because
      // EditorPage reads segments from this table (`noteSegments`), not from
      // the session-only `transcription.segments` state. Best-effort — if the
      // call fails, the note+audio still landed, so we swallow the error.
      if (savedDocId) {
        try {
          await api.documents.createTranscription(savedDocId, {
            source: 'audio',
            language: language || 'auto',
            diarization: enableDiarization,
            text,
            segments: segments ?? [],
            audio_url: persistableAudioUrl(playableAudioUrl),
          });
        } catch (e) {
          console.warn('[transcription.url] segments persistence failed (non-fatal)', e);
        }
      }
    }
    if (getState().activeJobId === currentJobId) {
      setState({
        fullText: text,
        segments: segments ?? [],
        savedDocumentId: savedDocId,
        sourceAudioUrl: playableAudioUrl,
      });
    }
    notify.push(
      { message: tLocale('transcribe.notifyCompleted', { source: urlHost }), context: 'transcription.url' },
      'success',
    );
    // Mark the job as completed in-place instead of removing it. The user
    // may still have the modal open to review logs / copy the URL. They
    // can dismiss manually via the "Dismiss" button or "Limpiar finalizados"
    // when they're done.
    setState((s) => ({
      jobs: s.jobs.map((j) => (
        j.id === currentJobId
          ? { ...j, status: 'completed', stage: 'completed', documentId: savedDocId, endedAt }
          : j
      )),
      activeJobId: s.activeJobId === currentJobId ? null : s.activeJobId,
    }));
  } catch (err) {
    // Runtime is only registered under the synthetic id; after the swap the
    // entry is disposed. Peek at the original synthetic id to tell user-cancel
    // from genuine errors (runtime carries the abortedByUser flag).
    const rt = urlRuntimes.get(jobId);
    const wasUserCancel = rt?.abortedByUser === true;

    if ((err as Error)?.name === 'AbortError') {
      if (wasUserCancel) {
        notify.push(
          { message: tLocale('transcribe.notifyCancelled', { source: urlHost }), context: 'transcription.url' },
          'info',
        );
        // User cancel: explicit choice to abandon, remove from both stores.
        setState((s) => ({
          jobs: s.jobs.filter((j) => j.id !== currentJobId),
          activeJobId: s.activeJobId === currentJobId ? null : s.activeJobId,
          urlStartedAt: urlRuntimes.size > 0
            ? Math.min(...Array.from(urlRuntimes.values()).map((r) => r.startedAt))
            : null,
        }));
        disposeUrlRuntime(jobId);
      } else {
        const message = tLocale('transcribe.timedOut', { minutes: Math.round(URL_TIMEOUT_MS / 60_000) });
        const endedAt = Date.now();
        setState((s) => ({
          jobs: s.jobs.map((j) => (j.id === currentJobId ? { ...j, status: 'failed', stage: 'failed', error: message, endedAt } : j)),
          error: s.activeJobId === currentJobId ? message : s.error,
          activeJobId: s.activeJobId === currentJobId ? null : s.activeJobId,
          urlStartedAt: urlRuntimes.size > 0
            ? Math.min(...Array.from(urlRuntimes.values()).map((r) => r.startedAt))
            : null,
        }));
        notify.push(
          { message: tLocale('transcribe.notifyFailed', { source: urlHost }), detail: message, context: 'transcription.url' },
          'error',
        );
        mirrorUrlJobFailureToProcessesStore({ url, urlHost, errorMessage: message, targetDocumentId });
        disposeUrlRuntime(jobId);
      }
      return;
    }

    const normalized = normalizeTranscriptionError(err);
    if (normalized.kind === 'plan_limit') requestPlanRefresh(0);
    // Ensure the row currently visible (synthetic pre-swap OR real post-swap)
    // gets marked failed. Earlier versions hardcoded the synthetic id here
    // which silently no-op'd when the swap had already happened, leaving a
    // stuck-processing row — or, combined with other paths, appeared to the
    // user as if the job had "disappeared".
    const endedAt = Date.now();
    setState((s) => {
      const updated = s.jobs.map((j) => (
        j.id === currentJobId
          ? { ...j, status: 'failed' as const, stage: 'failed' as const, error: normalized.message, failedStage: normalized.stage, endedAt }
          : j
      ));
      // If currentJobId isn't in the list (shouldn't happen but defend anyway),
      // synthesize a minimal failed row so the user still has *something* to see.
      const hasRow = updated.some((j) => j.id === currentJobId);
      const jobsNext = hasRow
        ? updated
        : [
            ...updated,
            {
              id: currentJobId,
              status: 'failed' as const,
              stage: 'failed' as const,
              total_chunks: 0,
              processed_chunks: 0,
              filename: url,  // Full URL, not host — see note at line ~489.
              audioUrl: url,
              error: normalized.message,
              failedStage: normalized.stage,
              synthetic: currentJobId.startsWith('url-'),
              startedAt: urlRuntimes.get(jobId)?.startedAt,
              endedAt,
            } as TranscriptionJob,
          ];
      return {
        jobs: jobsNext,
        error: s.activeJobId === currentJobId ? normalized.message : s.error,
        urlStartedAt: urlRuntimes.size > 0
          ? Math.min(...Array.from(urlRuntimes.values()).map((r) => r.startedAt))
          : null,
      };
    });
    const stagePrefix = normalized.stage ? `[${normalized.stage}] ` : '';
    notify.pushError(
      { message: tLocale('transcribe.notifyFailed', { source: urlHost }), detail: `${stagePrefix}${normalized.message}`, context: 'transcription.url' },
      err,
    );
    reportError('transcription.url', err, { message: `${stagePrefix}${normalized.message}` });
    // Persist a LocalProcess snapshot so the failure survives app restarts.
    // The session-only jobs[] gets wiped on reload; this row doesn't.
    mirrorUrlJobFailureToProcessesStore({
      url,
      urlHost,
      errorMessage: normalized.message,
      failedStage: normalized.stage,
      targetDocumentId,
    });
    disposeUrlRuntime(jobId);
  }
}

export const useTranscriptionStore = create<TranscriptionState>((set, get) => ({
  jobs: [],
  activeJobId: null,
  segments: [],
  fullText: '',
  loading: false,
  error: null,
  diarization: true,
  aiSummary: false,
  punctuation: true,
  language: 'auto',
  stagedFile: null,
  stagedUrl: '',
  savedDocumentId: null,
  sourceAudioUrl: null,
  urlStartedAt: null,
  targetDocumentId: null,

  setDiarization: (v) => set({ diarization: v }),
  setAiSummary: (v) => set({ aiSummary: v }),
  setPunctuation: (v) => set({ punctuation: v }),
  setLanguage: (lang) => set({ language: lang }),
  setTargetDocumentId: (documentId) => set({ targetDocumentId: documentId }),

  stageFile: (file) => {
    const nextObjectUrl = replaceStagedFileObjectUrl(file);
    set({
      stagedFile: file,
      stagedUrl: '',
      error: null,
      savedDocumentId: null,
      sourceAudioUrl: nextObjectUrl,
      fullText: '',
    });
  },
  stageUrl: (url) => {
    revokeOwnedObjectUrl(get().sourceAudioUrl);
    set({
      stagedUrl: url,
      stagedFile: null,
      error: null,
      savedDocumentId: null,
      sourceAudioUrl: url.trim() || null,
      fullText: '',
    });
  },
  clearStaged: () => {
    revokeOwnedObjectUrl(get().sourceAudioUrl);
    set({ stagedFile: null, stagedUrl: '', sourceAudioUrl: null });
  },

  /**
   * Cancel a URL transcription. If jobId is omitted, cancels ALL active URL jobs
   * (legacy "single-job" callers). If provided, cancels just that one.
   */
  cancelUrlTranscription: (jobId?: string) => {
    const ids = jobId ? [jobId] : Array.from(urlRuntimes.keys());
    for (const id of ids) {
      const rt = urlRuntimes.get(id);
      if (!rt) continue;
      rt.abortedByUser = true;
      rt.controller.abort();
      disposeUrlRuntime(id);
    }
    const remainingUrl = urlRuntimes.size > 0;
    set((s) => {
      const nextJobs = s.jobs.filter((j) => !ids.includes(j.id));
      const nextActive = ids.includes(s.activeJobId ?? '') ? null : s.activeJobId;
      return {
        jobs: nextJobs,
        activeJobId: nextActive,
        // `urlStartedAt` kept in sync with the earliest remaining URL job, if any.
        urlStartedAt: remainingUrl
          ? Math.min(...Array.from(urlRuntimes.values()).map((r) => r.startedAt))
          : null,
        // `loading` was only set for URL in the old single-job model — clear it.
        loading: s.stagedFile ? s.loading : false,
        error: null,
      };
    });
  },

  startTranscription: async () => {
    const { stagedFile, stagedUrl, language, diarization } = get();
    if (stagedFile) {
      await get().createJob(stagedFile, language === 'auto' ? undefined : language);
      if (!get().error) set({ stagedFile: null });
    } else if (stagedUrl.trim()) {
      // Multi-process URL transcription: fire the job, keep it in `jobs[]` as a
      // synthetic entry with its own runtime in urlRuntimes, and RETURN from
      // startTranscription immediately so the dialog can close and the user
      // can kick off another job. The actual HTTP call continues in background
      // via runUrlTranscription().
      const submittedUrl = stagedUrl.trim();
      const targetDocumentId = get().targetDocumentId;
      const lang = language === 'auto' ? undefined : language;
      const enableDiarization = diarization;
      const startedAt = Date.now();
      const syntheticJobId = `url-${startedAt}-${Math.random().toString(36).slice(2, 6)}`;
      let urlHost = submittedUrl;
      try { urlHost = new URL(submittedUrl).hostname; } catch { /* keep raw */ }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), URL_TIMEOUT_MS);
      const ticker = setInterval(() => {
        const nextStage = urlStageForElapsed(Date.now() - startedAt);
        set((s) => ({
          jobs: s.jobs.map((j) => (j.id === syntheticJobId ? { ...j, stage: nextStage } : j)),
        }));
      }, 1_000);
      urlRuntimes.set(syntheticJobId, {
        controller,
        timeoutId,
        ticker,
        abortedByUser: false,
        startedAt,
      });

      const syntheticJob: TranscriptionJob = {
        id: syntheticJobId,
        status: 'processing',
        total_chunks: 0,
        processed_chunks: 0,
        stage: 'openingLink',
        // Full URL — keeps each submission identifiable in the Processes
        // hub. `urlHost` is still used for compact toast copy where fitting
        // a long URL would push the toast off-screen.
        filename: submittedUrl,
        audioUrl: submittedUrl,
        startedAt,
        synthetic: true,
        targetDocumentId,
      } as TranscriptionJob;

      set((s) => ({
        // Clear staged URL and target doc so the user can queue the next one.
        stagedUrl: '',
        targetDocumentId: null,
        error: null,
        savedDocumentId: null,
        activeJobId: syntheticJobId,
        // urlStartedAt tracks the earliest running URL job (legacy callers).
        urlStartedAt: s.urlStartedAt ?? startedAt,
        jobs: [...s.jobs, syntheticJob],
        // NOTE: `loading` is intentionally NOT set — URL jobs are fire-and-forget.
      }));

      // Immediate acknowledgement toast so the user sees something happened
      // when the dialog closes. Without this, the dialog dismiss felt like
      // "nothing happened". The toast fires via NotificationToast and the
      // persisted item shows up in the NotificationBell panel with progress.
      useNotificationsStore.getState().push(
        { message: tLocale('transcribe.notifyStarted', { source: urlHost }), context: 'transcription.url' },
        'info',
      );

      // Fire-and-forget. Awaiting would re-serialize the caller on the HTTP RTT.
      void runUrlTranscription({
        jobId: syntheticJobId,
        url: submittedUrl,
        urlHost,
        language: lang,
        enableDiarization,
        signal: controller.signal,
        targetDocumentId,
      });
      return;
    } else {
      const activeJobId = get().activeJobId;
      const resumableJob = activeJobId ? get().jobs.find((j) => j.id === activeJobId) : null;
      const canResume = !!resumableJob && (
        resumableJob.status === 'paused' ||
        resumableJob.status === 'processing' ||
        resumableJob.status === 'pending'
      );

      if (!canResume || !resumableJob) {
        set({ error: 'No file or URL selected' });
        return;
      }

      // Synthetic URL jobs are not resumable server-side. This also covers
      // stale callsites (e.g. the legacy TranscribePage's Start button) that
      // reach this branch with a synthetic activeJobId after the dialog
      // closed without clearing active state.
      if (resumableJob.synthetic || urlRuntimes.has(resumableJob.id)) {
        useNotificationsStore.getState().push(
          { message: tLocale('transcribe.cannotResumeUrl'), context: 'transcription.resume' },
          'warning',
        );
        return;
      }

      set({ loading: true, error: null, savedDocumentId: null, fullText: '', segments: [], activeJobId: null });
      try {
        set((s) => ({
          jobs: s.jobs.map((j) => (j.id === resumableJob.id ? { ...j, stage: 'processing', error: null } : j)),
        }));
        let jobStatus = 'processing';
        while (jobStatus === 'processing') {
          const result = await api.transcribe.run(resumableJob.id, { max_chunks: TRANSCRIBE_BATCH_SIZE });
          set((s) => ({
            jobs: s.jobs.map((j) => (
              j.id === resumableJob.id
                ? { ...j, ...result, stage: result.status === 'completed' ? 'finalizing' : stageFromServerStatus(result.status), error: null }
                : j
            )),
          }));
          requestPlanRefresh();
          jobStatus = result.status;
        }
        if (jobStatus === 'completed') await get().loadResult(resumableJob.id);
        requestPlanRefresh();
        set({ loading: false });
      } catch (err) {
        const normalized = normalizeTranscriptionError(err);
        if (normalized.kind === 'plan_limit') requestPlanRefresh(0);
        set((s) => ({
          loading: false,
          error: normalized.message,
          jobs: s.jobs.map((j) => (
            j.id === resumableJob.id
              ? { ...j, status: normalized.kind === 'plan_limit' ? 'paused' : 'failed', stage: normalized.kind === 'plan_limit' ? 'paused' : 'failed', error: normalized.message }
              : j
          )),
        }));
        reportError('transcription.resume', err, { message: normalized.message });
      }
    }
  },

  createJob: async (file, language) => {
    fileAbortController?.abort();
    const fileController = new AbortController();
    fileAbortController = fileController;
    const fileTimeoutId = setTimeout(() => fileController.abort(), FILE_TIMEOUT_MS);
    set({ loading: true, error: null, savedDocumentId: null, fullText: '', segments: [], activeJobId: null });
    let currentJobId: string | null = null;
    try {
      const diarization = get().diarization;
      const chunkParts = await splitFileIntoChunkParts(file, diarization
        ? { chunkDurationMs: DIARIZATION_CHUNK_MS, channels: 2 }
        : { chunkDurationMs: DEFAULT_CHUNK_MS, channels: 1 });
      const lang = language ?? undefined;
      const job = await api.transcribe.createJob({
        total_chunks: chunkParts.length,
        language: lang,
        enable_diarization: diarization,
      });
      currentJobId = job.id;
      set((s) => ({
        jobs: [...s.jobs, {
          ...job,
          filename: file.name,
          stage: 'uploading',
          uploadedChunks: 0,
          uploadTotalChunks: chunkParts.length,
          audioUrl: get().sourceAudioUrl ?? undefined,
          documentId: get().targetDocumentId,
          error: null,
          startedAt: Date.now(),
        }],
        activeJobId: job.id,
      }));

      // Surface as a globally-visible Action with cancel handle.
      const actionId = `transcribe.${job.id}`;
      useActionsStore.getState().register({
        id: actionId,
        kind: 'transcribe',
        status: 'running',
        label: `Transcribing ${file.name}`,
        sublabel: `${chunkParts.length} chunk${chunkParts.length === 1 ? '' : 's'}`,
        canPause: false, canResume: false, canStop: false, canCancel: true,
        cancel: () => { fileController.abort(); useActionsStore.getState().update(actionId, { status: 'canceled' }); },
      });

      const sb = getSupabase();
      if (!sb) throw new Error('Storage not configured — sign in first');
      const userId = useAuthStore.getState().user?.id;
      if (!userId) throw new Error('Sign in required to upload audio');
      let originalAudioUrl: string | undefined;
      try {
        const originalMeta = chunkUploadMeta(file, file.name);
        const originalPath = `${userId}/uploads/${job.id}/original.${originalMeta.ext}`;
        const originalBuffer = await file.arrayBuffer();
        const uploadedOriginal = await sb.storage.from('audio').upload(originalPath, originalBuffer, {
          contentType: originalMeta.contentType,
        });
        if (!uploadedOriginal.error) {
          const { data } = sb.storage.from('audio').getPublicUrl(originalPath);
          originalAudioUrl = data.publicUrl;
          revokeOwnedObjectUrl(get().sourceAudioUrl);
          set((s) => ({
            sourceAudioUrl: originalAudioUrl ?? null,
            jobs: s.jobs.map((j) => (j.id === job.id ? { ...j, audioUrl: originalAudioUrl } : j)),
          }));
        }
      } catch {
        // Best-effort only: transcript pipeline should continue even if original upload fails.
      }

      for (let i = 0; i < chunkParts.length; i++) {
        const part = chunkParts[i];
        const meta = chunkUploadMeta(part.blob, file.name);
        const path = `${userId}/chunks/${job.id}/${i}.${meta.ext}`;
        const buf = await part.blob.arrayBuffer();
        const { error: upErr } = await sb.storage.from('audio').upload(path, buf, { contentType: meta.contentType });
        if (upErr) throw upErr;
        await api.transcribe.registerChunk(job.id, {
          index: i,
          storage_path: path,
          chunk_bytes: buf.byteLength,
          duration_seconds: part.durationSeconds > 0 ? Number(part.durationSeconds.toFixed(3)) : undefined,
          rms_level: part.rmsLevel == null ? undefined : Number(part.rmsLevel.toFixed(6)),
        });
        set((s) => ({
          jobs: s.jobs.map((j) => (
            j.id === job.id
              ? { ...j, stage: 'uploading', uploadedChunks: i + 1, uploadTotalChunks: chunkParts.length }
              : j
          )),
        }));
      }
      set((s) => ({
        jobs: s.jobs.map((j) => (
          j.id === job.id
            ? { ...j, stage: 'queued', uploadedChunks: chunkParts.length, uploadTotalChunks: chunkParts.length }
            : j
        )),
      }));

      // Process in batches — supports long files without HTTP timeout.
      let jobStatus = 'processing';
      while (jobStatus === 'processing') {
        if (fileController.signal.aborted) {
          const endedAt = Date.now();
          set((s) => ({
            loading: false,
            jobs: currentJobId
              ? s.jobs.map((j) => j.id === currentJobId ? { ...j, status: 'canceled', stage: 'canceled', endedAt } : j)
              : s.jobs,
            activeJobId: s.activeJobId === currentJobId ? null : s.activeJobId,
          }));
          return;
        }
        const result = await api.transcribe.run(job.id, { max_chunks: TRANSCRIBE_BATCH_SIZE });
        set((s) => ({
          jobs: s.jobs.map((j) => (
            j.id === job.id
              ? { ...j, ...result, stage: result.status === 'completed' ? 'finalizing' : stageFromServerStatus(result.status), error: null }
              : j
          )),
        }));
        requestPlanRefresh();
        jobStatus = result.status;
      }
      if (jobStatus === 'completed') await get().loadResult(job.id);
      requestPlanRefresh();
      set({ loading: false });
    } catch (err) {
      const normalized = normalizeTranscriptionError(err);
      if (normalized.kind === 'plan_limit') requestPlanRefresh(0);
      set((s) => ({
        loading: false,
        error: normalized.message,
          jobs: currentJobId
            ? s.jobs.map((j) => (
              j.id === currentJobId
                ? { ...j, status: normalized.kind === 'plan_limit' ? 'paused' : 'failed', stage: normalized.kind === 'plan_limit' ? 'paused' : 'failed', error: normalized.message }
                : j
            ))
            : s.jobs,
      }));
      reportError('transcription.createJob', err, { message: normalized.message });
      if (currentJobId) endAction(`transcribe.${currentJobId}`, 'failed', normalized.message);
    } finally {
      clearTimeout(fileTimeoutId);
      if (fileAbortController === fileController) fileAbortController = null;
      if (currentJobId && get().jobs.find((j) => j.id === currentJobId)?.status === 'completed') {
        endAction(`transcribe.${currentJobId}`, 'completed');
      }
    }
  },

  pollJob: async (jobId) => {
    try {
      const job = await api.transcribe.getJob(jobId);
      set((s) => ({
        jobs: s.jobs.map((j) => (
          j.id === jobId
            ? { ...j, ...job, error: job.status === 'failed' ? j.error : null, stage: (j.stage === 'uploading' || j.stage === 'finalizing' || j.stage === 'saving') ? j.stage : stageFromServerStatus(job.status) }
            : j
        )),
      }));
      if (job.status === 'completed') {
        await get().loadResult(jobId);
      }
    } catch (err) {
      const normalized = normalizeTranscriptionError(err);
      set({ error: normalized.message });
      reportError('transcription.pollJob', err, { message: normalized.message });
    }
  },

  loadResult: async (jobId) => {
    try {
      set((s) => ({
        jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, stage: 'finalizing' } : j)),
      }));
      const result = await api.transcribe.getResult(jobId);
      set({ fullText: result.text, segments: result.segments ?? [] });
      if (result.text.trim()) {
        set((s) => ({
          jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, stage: 'saving' } : j)),
        }));
        const job = get().jobs.find((j) => j.id === jobId);
        const targetDocumentId = job?.documentId ?? get().targetDocumentId;
        const transcriptHtml = safeHtmlParagraphs(result.text);
        const audioUrl = job?.audioUrl ?? get().sourceAudioUrl ?? null;
        const storedAudioUrl = persistableAudioUrl(audioUrl);
        let persistedDocId: string | null = null;
        if (targetDocumentId) {
          const existingDoc = useDocumentsStore.getState().documents.find((doc) => doc.id === targetDocumentId) ?? null;
          const hasExistingContent = !!existingDoc?.content.replace(/<[^>]*>/g, ' ').trim();
          const mergedContent = hasExistingContent ? `${existingDoc?.content}<p></p>${transcriptHtml}` : transcriptHtml;
          await useDocumentsStore.getState().updateDocument(targetDocumentId, {
            content: mergedContent,
            source_id: jobId,
            audio_url: storedAudioUrl,
          });
          persistedDocId = targetDocumentId;
          set((s) => ({
            savedDocumentId: targetDocumentId,
            targetDocumentId: null,
            jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, stage: 'completed', status: 'completed', documentId: targetDocumentId, error: null, audioUrl: audioUrl ?? j.audioUrl } : j)),
          }));
        } else {
          const docId = await saveAsNote(job?.filename ?? 'Transcription', result.text, {
            sourceId: jobId,
            audioUrl: storedAudioUrl ?? undefined,
          });
          persistedDocId = docId;
          set((s) => ({
            savedDocumentId: docId,
            targetDocumentId: null,
            jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, stage: 'completed', status: 'completed', documentId: docId, error: null, audioUrl: audioUrl ?? j.audioUrl } : j)),
          }));
        }

        // Persist diarized segments to `document_transcriptions` so the note's
        // EditorPage shows the speaker-annotated segment panel. Without this,
        // the file-upload transcription note — just like the URL flow prior
        // to the same fix — would only show the flat text. Best-effort; the
        // note content + audio link are already saved above, so we swallow
        // errors rather than rolling back.
        if (persistedDocId) {
          try {
            const language = get().language;
            const diarization = get().diarization;
            await api.documents.createTranscription(persistedDocId, {
              source: 'audio',
              language: language || 'auto',
              diarization,
              text: result.text,
              segments: result.segments ?? [],
              audio_url: storedAudioUrl,
            });
          } catch (e) {
            console.warn('[transcription.file] segments persistence failed (non-fatal)', e);
          }
        }
      } else {
        set((s) => ({
          targetDocumentId: null,
          jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, stage: 'completed', status: 'completed', error: null } : j)),
        }));
      }
    } catch (err) {
      const normalized = normalizeTranscriptionError(err);
      set((s) => ({
        error: normalized.message,
        jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, stage: 'failed', status: 'failed', error: normalized.message } : j)),
      }));
      reportError('transcription.loadResult', err, { message: normalized.message });
    }
  },
  setActiveJob: (jobId) => set({ activeJobId: jobId }),

  pauseJob: (jobId) => {
    fileAbortController?.abort();
    fileAbortController = null;
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: 'paused', stage: 'paused' } : j)),
      activeJobId: jobId,
    }));
  },

  cancelJob: (jobId) => {
    // Route synthetic URL jobs through the URL-specific cancel path so we
    // abort the controller + dispose the runtime properly.
    if (urlRuntimes.has(jobId)) {
      get().cancelUrlTranscription(jobId);
      return;
    }
    fileAbortController?.abort();
    fileAbortController = null;
    const endedAt = Date.now();
    set((s) => ({
      loading: s.activeJobId === jobId ? false : s.loading,
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: 'canceled', stage: 'canceled', endedAt } : j)),
      activeJobId: s.activeJobId === jobId ? null : s.activeJobId,
    }));
  },

  dismissJob: (jobId) => {
    // If the job is still running, abort it cleanly before removing.
    const rt = urlRuntimes.get(jobId);
    if (rt) {
      rt.abortedByUser = true;
      rt.controller.abort();
      disposeUrlRuntime(jobId);
    }
    set((s) => ({
      jobs: s.jobs.filter((j) => j.id !== jobId),
      activeJobId: s.activeJobId === jobId ? null : s.activeJobId,
      urlStartedAt: urlRuntimes.size > 0
        ? Math.min(...Array.from(urlRuntimes.values()).map((r) => r.startedAt))
        : null,
    }));
  },

  resumeJob: async (jobId) => {
    // Synthetic URL jobs have no backend row — resuming would hit
    // `POST /v1/transcribe/run/{id}` with an id the server has never seen
    // and return 404 "Transcription job not found". The actual HTTP call
    // lives inside runUrlTranscription's promise anyway; if it's already
    // in flight the user should wait, and if it already terminated the
    // right action is to start a new URL transcription (not resume).
    if (urlRuntimes.has(jobId)) {
      useNotificationsStore.getState().push(
        { message: tLocale('transcribe.cannotResumeUrl'), context: 'transcription.resume' },
        'warning',
      );
      return;
    }
    set((s) => ({
      activeJobId: jobId,
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: 'processing', stage: 'processing', error: null } : j)),
    }));
    await get().startTranscription();
  },

  subscribeToRealtime: () => {
    const sb = getSupabase();
    if (!sb) return () => {};

    const channel = sb
      .channel('transcribe-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'transcribe_jobs' },
        (payload) => {
          const updated = payload.new as TranscribeJobResponse;
          set((s) => ({
            jobs: s.jobs.map((j) => {
              if (j.id !== updated.id) return j;
              if (j.stage === 'uploading' || j.stage === 'finalizing' || j.stage === 'saving') {
                return { ...j, ...updated };
              }
              return { ...j, ...updated, stage: stageFromServerStatus(updated.status) };
            }),
          }));
        },
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  },

  reset: () => {
    // Cancel all running URL jobs + dispose their runtimes.
    for (const [jobId, rt] of urlRuntimes) {
      rt.controller.abort();
      disposeUrlRuntime(jobId);
    }
    fileAbortController?.abort();
    fileAbortController = null;
    revokeOwnedObjectUrl(get().sourceAudioUrl);
    set({
      jobs: [],
      activeJobId: null,
      segments: [],
      fullText: '',
      loading: false,
      error: null,
      diarization: true,
      aiSummary: false,
      punctuation: true,
      language: 'auto',
      stagedFile: null,
      stagedUrl: '',
      savedDocumentId: null,
      sourceAudioUrl: null,
      urlStartedAt: null,
      targetDocumentId: null,
    });
  },
}));
