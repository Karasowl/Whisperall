import { create } from 'zustand';
import { api } from '../lib/api';
import { getSupabase } from '../lib/supabase';
import type { TranscribeJobResponse, TranscriptSegment } from '@whisperall/api-client';

export type TranscriptionJob = TranscribeJobResponse & {
  filename?: string;
};

export type TranscriptionState = {
  jobs: TranscriptionJob[];
  activeJobId: string | null;
  segments: TranscriptSegment[];
  fullText: string;
  loading: boolean;
  error: string | null;

  createJob: (file: File, language?: string) => Promise<void>;
  pollJob: (jobId: string) => Promise<void>;
  loadResult: (jobId: string) => Promise<void>;
  setActiveJob: (jobId: string | null) => void;
  subscribeToRealtime: () => () => void;
  reset: () => void;
};

export const useTranscriptionStore = create<TranscriptionState>((set, get) => ({
  jobs: [],
  activeJobId: null,
  segments: [],
  fullText: '',
  loading: false,
  error: null,

  createJob: async (file, language) => {
    set({ loading: true, error: null });
    try {
      const job = await api.transcribe.createJob({
        total_chunks: 1,
        language: language ?? 'en',
      });
      set((s) => ({
        jobs: [...s.jobs, { ...job, filename: file.name }],
        activeJobId: job.id,
        loading: false,
      }));
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
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
      set({ error: (err as Error).message });
    }
  },

  loadResult: async (jobId) => {
    try {
      const result = await api.transcribe.getResult(jobId);
      set({
        fullText: result.text,
        segments: result.segments ?? [],
      });
    } catch (err) {
      set({ error: (err as Error).message });
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
  }),
}));
