import { create } from 'zustand';
import { api } from '../lib/api';
import { getMicStream, stopMicStream, createRecorder } from '../lib/audio';
import { electron } from '../lib/electron';

export type DictationStatus = 'idle' | 'recording' | 'processing' | 'done' | 'error';

export type DictationState = {
  status: DictationStatus;
  text: string;
  error: string | null;
  language: string;

  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  setLanguage: (lang: string) => void;
};

let recorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

export const useDictationStore = create<DictationState>((set, get) => ({
  status: 'idle',
  text: '',
  error: null,
  language: 'en',

  start: async () => {
    if (get().status === 'recording') return;
    try {
      set({ status: 'recording', error: null });
      audioChunks = [];
      const stream = await getMicStream();
      recorder = createRecorder(
        stream,
        (chunk) => audioChunks.push(chunk),
        30_000, // 30s chunks for dictation (send full on stop)
      );
    } catch (err) {
      set({ status: 'error', error: (err as Error).message });
    }
  },

  stop: () => {
    if (!recorder || recorder.state === 'inactive') return;
    recorder.onstop = async () => {
      set({ status: 'processing' });
      stopMicStream();

      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      try {
        const prompt = get().text.slice(-200);
        const res = await api.dictate.send({
          audio: blob,
          language: get().language,
          prompt: prompt || undefined,
        });
        const newText = get().text + (get().text ? ' ' : '') + res.text;
        set({ status: 'done', text: newText });
        electron?.setDictationText(newText);
      } catch (err) {
        set({ status: 'error', error: (err as Error).message });
      }
    };
    recorder.stop();
    recorder = null;
  },

  reset: () => {
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    recorder = null;
    audioChunks = [];
    stopMicStream();
    set({ status: 'idle', text: '', error: null });
  },

  setLanguage: (lang) => set({ language: lang }),
}));
