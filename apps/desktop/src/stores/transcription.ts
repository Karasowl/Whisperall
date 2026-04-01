import { create } from 'zustand';
import { api } from '../lib/api';
import { getSupabase } from '../lib/supabase';
import { splitFileIntoChunkParts } from '../lib/audio';
import { ApiError, type TranscribeJobResponse, type TranscriptSegment } from '@whisperall/api-client';
import { useDocumentsStore } from './documents';
import { requestPlanRefresh } from './plan';
import { useAuthStore } from './auth';
import { safeHtmlParagraphs } from '../lib/editor-utils';

export type TranscriptionJobStage =
  | 'preparing'
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
  uploadedChunks?: number;
  uploadTotalChunks?: number;
  documentId?: string | null;
  error?: string | null;
};

type TranscriptionErrorKind = 'plan_limit' | 'storage' | 'diarization_config' | 'generic';

type NormalizedTranscriptionError = {
  kind: TranscriptionErrorKind;
  message: string;
};

const TRANSCRIBE_BATCH_SIZE = 5;
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
    };
  }

  if (lower.includes('deepgram_api_key') || lower.includes('diarization is enabled but deepgram')) {
    return {
      kind: 'diarization_config',
      message: 'Speaker diarization needs Deepgram configured. Add DEEPGRAM_API_KEY and retry.',
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
    };
  }

  if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return {
      kind: 'generic',
      message: 'Cannot reach the transcription API. Check backend URL/CORS (localhost vs 127.0.0.1) and retry.',
    };
  }

  if (lower.includes('api error')) {
    return {
      kind: 'generic',
      message: msg.replace(/^api error\s*\d+:\s*/i, '') || msg,
    };
  }

  return {
    kind: 'generic',
    message: msg || 'Transcription failed',
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
  cancelUrlTranscription: () => void;
  createJob: (file: File, language?: string) => Promise<void>;
  pollJob: (jobId: string) => Promise<void>;
  loadResult: (jobId: string) => Promise<void>;
  setActiveJob: (jobId: string | null) => void;
  pauseJob: (jobId: string) => void;
  cancelJob: (jobId: string) => void;
  resumeJob: (jobId: string) => Promise<void>;
  subscribeToRealtime: () => () => void;
  reset: () => void;
};

const URL_TIMEOUT_MS = 180_000; // 3 minutes
const FILE_TIMEOUT_MS = 10 * 60_000; // 10 minutes
let urlAbortController: AbortController | null = null;
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
  if (stage === 'uploading') return 'transcribe.detailUploading';
  if (stage === 'queued') return 'transcribe.detailQueued';
  if (stage === 'processing') return 'transcribe.detailProcessing';
  if (stage === 'finalizing') return 'transcribe.detailFinalizing';
  if (stage === 'saving') return 'transcribe.detailSaving';
  return null;
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
    return null;
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

  cancelUrlTranscription: () => {
    urlAbortController?.abort();
    urlAbortController = null;
    set({ loading: false, urlStartedAt: null, error: null });
  },

  startTranscription: async () => {
    const { stagedFile, stagedUrl, language, diarization } = get();
    if (stagedFile) {
      await get().createJob(stagedFile, language === 'auto' ? undefined : language);
      if (!get().error) set({ stagedFile: null });
    } else if (stagedUrl.trim()) {
      urlAbortController?.abort();
      const controller = new AbortController();
      urlAbortController = controller;
      const timeoutId = setTimeout(() => controller.abort(), URL_TIMEOUT_MS);
      set({ loading: true, error: null, savedDocumentId: null, fullText: '', segments: [], activeJobId: null, urlStartedAt: Date.now() });
      try {
        const lang = language === 'auto' ? undefined : language;
        const result = await api.transcribe.fromUrl({
          url: stagedUrl,
          language: lang,
          enable_diarization: diarization,
        }, { signal: controller.signal });
        clearTimeout(timeoutId);
        urlAbortController = null;
        const directAudioUrl = stagedUrl.trim() || null;
        const targetDocumentId = get().targetDocumentId;
        set({
          fullText: result.text,
          segments: result.segments ?? [],
          loading: false,
          stagedUrl: '',
          sourceAudioUrl: directAudioUrl,
          urlStartedAt: null,
        });
        requestPlanRefresh();
        if (result.text.trim()) {
          if (targetDocumentId) {
            const transcriptHtml = safeHtmlParagraphs(result.text);
            const existingDoc = useDocumentsStore.getState().documents.find((doc) => doc.id === targetDocumentId) ?? null;
            const hasExistingContent = !!existingDoc?.content.replace(/<[^>]*>/g, ' ').trim();
            const mergedContent = hasExistingContent ? `${existingDoc?.content}<p></p>${transcriptHtml}` : transcriptHtml;
            await useDocumentsStore.getState().updateDocument(targetDocumentId, {
              content: mergedContent,
              audio_url: directAudioUrl,
            });
            set({ savedDocumentId: targetDocumentId, targetDocumentId: null });
          } else {
            const sourceHost = new URL(stagedUrl).hostname;
            const docId = await saveAsNote(sourceHost, result.text, {
              audioUrl: directAudioUrl ?? undefined,
            });
            set({ savedDocumentId: docId, targetDocumentId: null });
          }
        } else {
          set({ targetDocumentId: null });
        }
      } catch (err) {
        clearTimeout(timeoutId);
        urlAbortController = null;
        if ((err as Error)?.name === 'AbortError') {
          set({ loading: false, urlStartedAt: null, error: 'Transcription cancelled or timed out.' });
          return;
        }
        const normalized = normalizeTranscriptionError(err);
        if (normalized.kind === 'plan_limit') requestPlanRefresh(0);
        set({ loading: false, urlStartedAt: null, error: normalized.message });
      }
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
          audioUrl: get().sourceAudioUrl ?? null,
          documentId: get().targetDocumentId,
          error: null,
        }],
        activeJobId: job.id,
      }));

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
          set((s) => ({
            loading: false,
            jobs: currentJobId
              ? s.jobs.map((j) => j.id === currentJobId ? { ...j, status: 'canceled', stage: 'canceled' } : j)
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
    } finally {
      clearTimeout(fileTimeoutId);
      if (fileAbortController === fileController) fileAbortController = null;
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
        if (targetDocumentId) {
          const existingDoc = useDocumentsStore.getState().documents.find((doc) => doc.id === targetDocumentId) ?? null;
          const hasExistingContent = !!existingDoc?.content.replace(/<[^>]*>/g, ' ').trim();
          const mergedContent = hasExistingContent ? `${existingDoc?.content}<p></p>${transcriptHtml}` : transcriptHtml;
          await useDocumentsStore.getState().updateDocument(targetDocumentId, {
            content: mergedContent,
            source_id: jobId,
            audio_url: storedAudioUrl,
          });
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
          set((s) => ({
            savedDocumentId: docId,
            targetDocumentId: null,
            jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, stage: 'completed', status: 'completed', documentId: docId, error: null, audioUrl: audioUrl ?? j.audioUrl } : j)),
          }));
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
    fileAbortController?.abort();
    fileAbortController = null;
    set((s) => ({
      loading: s.activeJobId === jobId ? false : s.loading,
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: 'canceled', stage: 'canceled' } : j)),
      activeJobId: s.activeJobId === jobId ? null : s.activeJobId,
    }));
  },

  resumeJob: async (jobId) => {
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
    urlAbortController?.abort();
    urlAbortController = null;
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
