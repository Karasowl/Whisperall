import { create } from 'zustand';
import {
  getMicStream, stopMicStream,
  getSystemAudioStream, stopSystemStream,
} from '../lib/audio';
import { useSettingsStore } from './settings';
import type { AudioSourceType } from '../lib/audio';
import type { LiveSegment } from '@whisperall/api-client';
import { DeepgramStream } from '../lib/deepgram-stream';
import { electron } from '../lib/electron';
import { useDocumentsStore } from './documents';
import { formatDocDate } from '../lib/format-date';
import { requestPlanRefresh } from './plan';
import { useAuthStore } from './auth';

export type LiveStatus = 'idle' | 'recording' | 'error';

export type LiveState = {
  status: LiveStatus;
  source: AudioSourceType;
  segments: LiveSegment[];
  interimText: string;
  error: string | null;
  autoSaveError: string | null;

  setSource: (source: AudioSourceType) => void;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
};

let dgStream: DeepgramStream | null = null;
let autoSaveTimer: ReturnType<typeof setInterval> | null = null;
let usageRefreshTimer: ReturnType<typeof setInterval> | null = null;
const AUTO_SAVE_INTERVAL = 5 * 60 * 1000; // 5 minutes
const USAGE_REFRESH_INTERVAL = 60 * 1000; // 1 minute

const API_URL = import.meta.env.VITE_API_URL as string || 'http://localhost:8000';
const WS_URL = API_URL.replace(/^http/, 'ws') + '/v1/live/stream';

export const useLiveStore = create<LiveState>((set, get) => ({
  status: 'idle',
  source: 'mic',
  segments: [],
  interimText: '',
  error: null,
  autoSaveError: null,

  setSource: (source) => set({ source }),

  start: async () => {
    if (get().status === 'recording') return;
    try {
      set({ status: 'recording', error: null, autoSaveError: null, segments: [], interimText: '' });
      console.log('[live] starting, source =', get().source);
      const stream = get().source === 'system'
        ? await getSystemAudioStream()
        : await getMicStream(useSettingsStore.getState().audioDevice);
      console.log('[live] got stream, audio tracks =', stream.getAudioTracks().length,
        'active =', stream.active,
        stream.getAudioTracks().map(t => `${t.label} enabled=${t.enabled} muted=${t.muted}`));

      dgStream = new DeepgramStream({
        url: () => {
          const token = useAuthStore.getState().session?.access_token;
          return token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;
        },
        onEvent: (event) => {
          if (event.type === 'transcript') {
            if (event.isFinal && event.text) {
              // Immediately commit finalized text as a segment → appears in editor now
              set((s) => ({
                segments: [...s.segments, {
                  id: crypto.randomUUID(),
                  text: event.text,
                  created_at: new Date().toISOString(),
                }],
                interimText: '',
              }));
              electron?.sendSubtitleText(event.text);
            } else if (!event.isFinal) {
              // Show interim preview (not yet confirmed by Deepgram)
              set({ interimText: event.text });
            }
          } else if (event.type === 'utterance_end') {
            // Speaker paused — just clear interim, text already committed
            set({ interimText: '' });
          } else if (event.type === 'error') {
            console.error('[live] stream error:', event.message);
            set({ error: event.message });
            if (event.message.toLowerCase().includes('plan limit exceeded')) {
              // Stop recording to release audio streams and avoid infinite WS reconnect loops.
              get().stop();
            }
          }
        },
      });
      dgStream.start(stream);

      // Periodic auto-save every 5 min (prevents data loss on crash for 10h+ sessions)
      if (autoSaveTimer) clearInterval(autoSaveTimer);
      autoSaveTimer = setInterval(() => {
        const segs = get().segments;
        if (segs.length === 0) return;
        const content = segs.map((s) => s.text).join('\n');
        useDocumentsStore.getState().createDocument({
          title: `Meeting (auto-save) — ${formatDocDate(new Date().toISOString(), 'en')}`,
          content,
          source: 'live',
        }).catch((e) => { console.error('[live] periodic auto-save failed:', e); set({ autoSaveError: (e as Error).message }); });
      }, AUTO_SAVE_INTERVAL);

      if (usageRefreshTimer) clearInterval(usageRefreshTimer);
      usageRefreshTimer = setInterval(() => { requestPlanRefresh(); }, USAGE_REFRESH_INTERVAL);
    } catch (err) {
      if (usageRefreshTimer) { clearInterval(usageRefreshTimer); usageRefreshTimer = null; }
      console.error('[live] start failed:', err);
      set({ status: 'error', error: (err as Error).message });
    }
  },

  stop: () => {
    // Commit any remaining interim text as final segment
    const { interimText } = get();
    if (interimText.trim()) {
      set((s) => ({
        segments: [...s.segments, {
          id: crypto.randomUUID(),
          text: interimText.trim(),
          created_at: new Date().toISOString(),
        }],
        interimText: '',
      }));
    }
    dgStream?.stop();
    dgStream = null;
    if (autoSaveTimer) { clearInterval(autoSaveTimer); autoSaveTimer = null; }
    if (usageRefreshTimer) { clearInterval(usageRefreshTimer); usageRefreshTimer = null; }
    if (get().source === 'system') stopSystemStream();
    else stopMicStream();
    set({ status: 'idle' });
    requestPlanRefresh();
    // Auto-save as document (non-blocking)
    const allSegments = get().segments;
    if (allSegments.length > 0) {
      const content = allSegments.map((s) => s.text).join('\n');
      useDocumentsStore.getState().createDocument({
        title: `Meeting — ${formatDocDate(new Date().toISOString(), 'en')}`,
        content,
        source: 'live',
      }).catch((e) => { console.error('[live] auto-save failed:', e); set({ autoSaveError: (e as Error).message }); });
    }
  },

  reset: () => {
    get().stop();
    set({ segments: [], interimText: '', error: null, autoSaveError: null });
  },
}));
