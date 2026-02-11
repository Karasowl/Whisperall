import { create } from 'zustand';
import { api } from '../lib/api';
import { getMicStream, stopMicStream, createLiveRecorder, type LiveRecorder } from '../lib/audio';
import { electron } from '../lib/electron';
import { useSettingsStore } from './settings';
import { requestPlanRefresh } from './plan';

export type DictationStatus = 'idle' | 'recording' | 'processing' | 'done' | 'error';

export type DictationState = {
  status: DictationStatus;
  text: string;
  translatedText: string;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  setText: (text: string) => void;
};

const FLUSH_MS = 30_000;
let liveRec: LiveRecorder | null = null;
let pendingFlushes = 0;

export const useDictationStore = create<DictationState>((set, get) => ({
  status: 'idle',
  text: '',
  translatedText: '',
  error: null,

  start: async () => {
    if (get().status === 'recording') return;
    try {
      set({ status: 'recording', error: null });
      pendingFlushes = 0;
      const deviceId = useSettingsStore.getState().audioDevice;
      const stream = await getMicStream(deviceId);

      liveRec = createLiveRecorder(stream, async (blob) => {
        // Auto-flush: send each 30s chunk to API while recording continues
        pendingFlushes++;
        try {
          const prompt = get().text.slice(-200);
          const res = await api.dictate.send({ audio: blob, prompt: prompt || undefined });
          const newText = get().text + (get().text ? ' ' : '') + res.text;
          requestPlanRefresh();

          let translated = '';
          const { translateEnabled, translateTo } = useSettingsStore.getState();
          if (translateEnabled && translateTo) {
            try {
              const tr = await api.translate.translate({ text: res.text, target_language: translateTo });
              translated = get().translatedText + (get().translatedText ? ' ' : '') + tr.text;
              requestPlanRefresh();
            } catch { /* best-effort */ }
          }

          set({ text: newText, translatedText: translated || get().translatedText });
          electron?.setDictationText(newText);
        } catch (err) {
          console.warn('[dictation] flush error:', (err as Error).message);
          set({ error: (err as Error).message });
        } finally {
          pendingFlushes--;
          if (get().status === 'processing' && pendingFlushes <= 0) {
            set({ status: 'done' });
          }
        }
      }, FLUSH_MS);
    } catch (err) {
      set({ status: 'error', error: (err as Error).message });
    }
  },

  stop: () => {
    if (!liveRec) return;
    liveRec.stop(); // triggers final chunk via onstop
    liveRec = null;
    stopMicStream();
    set({ status: 'processing' });
    // Safety: if no final chunk arrives (empty recording), force done
    setTimeout(() => {
      if (get().status === 'processing') set({ status: 'done' });
    }, 3000);
  },

  reset: () => {
    if (liveRec) { liveRec.stop(); liveRec = null; }
    pendingFlushes = 0;
    stopMicStream();
    set({ status: 'idle', text: '', translatedText: '', error: null });
  },

  setText: (text) => set({ text }),
}));
