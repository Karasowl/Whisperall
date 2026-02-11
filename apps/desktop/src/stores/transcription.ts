import { create } from 'zustand';
import { api } from '../lib/api';
import { getSupabase } from '../lib/supabase';
import { splitFileIntoChunks } from '../lib/audio';
import { ApiError, type TranscribeJobResponse, type TranscriptSegment } from '@whisperall/api-client';
import { useDocumentsStore } from './documents';
import { requestPlanRefresh } from './plan';
import { safeHtmlParagraphs } from '../lib/editor-utils';

export type TranscriptionJob = TranscribeJobResponse & {
  filename?: string;
};

type TranscriptionErrorKind = 'plan_limit' | 'storage' | 'diarization_config' | 'generic';

type NormalizedTranscriptionError = {
  kind: TranscriptionErrorKind;
  message: string;
};

const TRANSCRIBE_BATCH_SIZE = 5;
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
      message: 'You reached your monthly transcription limit. Upgrade your plan to continue or wait for monthly reset.',
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

  setDiarization: (v: boolean) => void;
  setAiSummary: (v: boolean) => void;
  setPunctuation: (v: boolean) => void;
  setLanguage: (lang: string) => void;
  stageFile: (file: File) => void;
  stageUrl: (url: string) => void;
  clearStaged: () => void;
  startTranscription: () => Promise<void>;
  createJob: (file: File, language?: string) => Promise<void>;
  pollJob: (jobId: string) => Promise<void>;
  loadResult: (jobId: string) => Promise<void>;
  setActiveJob: (jobId: string | null) => void;
  subscribeToRealtime: () => () => void;
  reset: () => void;
};

async function saveAsNote(title: string, text: string): Promise<string | null> {
  try {
    const html = safeHtmlParagraphs(text);
    const doc = await useDocumentsStore.getState().createDocument({
      title, content: html, source: 'transcription',
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

  setDiarization: (v) => set({ diarization: v }),
  setAiSummary: (v) => set({ aiSummary: v }),
  setPunctuation: (v) => set({ punctuation: v }),
  setLanguage: (lang) => set({ language: lang }),

  stageFile: (file) => set({ stagedFile: file, stagedUrl: '', error: null, savedDocumentId: null, fullText: '' }),
  stageUrl: (url) => set({ stagedUrl: url, stagedFile: null, error: null, savedDocumentId: null, fullText: '' }),
  clearStaged: () => set({ stagedFile: null, stagedUrl: '' }),

  startTranscription: async () => {
    const { stagedFile, stagedUrl, language, diarization } = get();
    if (stagedFile) {
      await get().createJob(stagedFile, language === 'auto' ? undefined : language);
      set({ stagedFile: null });
    } else if (stagedUrl.trim()) {
      set({ loading: true, error: null, savedDocumentId: null });
      try {
        const lang = language === 'auto' ? undefined : language;
        const result = await api.transcribe.fromUrl({
          url: stagedUrl,
          language: lang,
          enable_diarization: diarization,
        });
        set({ fullText: result.text, segments: result.segments ?? [], loading: false, stagedUrl: '' });
        requestPlanRefresh();
        if (result.text.trim()) {
          const docId = await saveAsNote(new URL(stagedUrl).hostname, result.text);
          set({ savedDocumentId: docId });
        }
      } catch (err) {
        const normalized = normalizeTranscriptionError(err);
        if (normalized.kind === 'plan_limit') requestPlanRefresh(0);
        set({ loading: false, error: normalized.message });
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

      set({ loading: true, error: null, savedDocumentId: null });
      try {
        let jobStatus = 'processing';
        while (jobStatus === 'processing') {
          const result = await api.transcribe.run(resumableJob.id, { max_chunks: TRANSCRIBE_BATCH_SIZE });
          set((s) => ({ jobs: s.jobs.map((j) => (j.id === resumableJob.id ? { ...j, ...result } : j)) }));
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
              ? { ...j, status: normalized.kind === 'plan_limit' ? 'paused' : 'failed' }
              : j
          )),
        }));
      }
    }
  },

  createJob: async (file, language) => {
    set({ loading: true, error: null, savedDocumentId: null });
    let currentJobId: string | null = null;
    try {
      const chunks = await splitFileIntoChunks(file);
      const lang = language ?? undefined;
      const job = await api.transcribe.createJob({
        total_chunks: chunks.length,
        language: lang,
        enable_diarization: get().diarization,
      });
      currentJobId = job.id;
      set((s) => ({
        jobs: [...s.jobs, { ...job, filename: file.name }],
        activeJobId: job.id,
      }));

      const sb = getSupabase();
      if (!sb) throw new Error('Storage not configured — sign in first');

      for (let i = 0; i < chunks.length; i++) {
        const meta = chunkUploadMeta(chunks[i], file.name);
        const path = `chunks/${job.id}/${i}.${meta.ext}`;
        const buf = await chunks[i].arrayBuffer();
        const { error: upErr } = await sb.storage.from('audio').upload(path, buf, { contentType: meta.contentType });
        if (upErr) throw upErr;
        await api.transcribe.registerChunk(job.id, { index: i, storage_path: path });
      }

      // Process in batches — supports long files without HTTP timeout.
      let jobStatus = 'processing';
      while (jobStatus === 'processing') {
        const result = await api.transcribe.run(job.id, { max_chunks: TRANSCRIBE_BATCH_SIZE });
        set((s) => ({ jobs: s.jobs.map((j) => (j.id === job.id ? { ...j, ...result } : j)) }));
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
              ? { ...j, status: normalized.kind === 'plan_limit' ? 'paused' : 'failed' }
              : j
          ))
          : s.jobs,
      }));
    }
  },

  pollJob: async (jobId) => {
    try {
      const job = await api.transcribe.getJob(jobId);
      set((s) => ({
        jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, ...job } : j)),
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
      const result = await api.transcribe.getResult(jobId);
      set({ fullText: result.text, segments: result.segments ?? [] });
      if (result.text.trim()) {
        const job = get().jobs.find((j) => j.id === jobId);
        const docId = await saveAsNote(job?.filename ?? 'Transcription', result.text);
        set({ savedDocumentId: docId });
      }
    } catch (err) {
      const normalized = normalizeTranscriptionError(err);
      set({ error: normalized.message });
    }
  },

  setActiveJob: (jobId) => set({ activeJobId: jobId }),

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
            jobs: s.jobs.map((j) => (j.id === updated.id ? { ...j, ...updated } : j)),
          }));
        },
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  },

  reset: () => set({
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
  }),
}));
