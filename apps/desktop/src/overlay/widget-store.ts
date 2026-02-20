import { create } from 'zustand';

export type WidgetMode = 'bar' | 'dictating' | 'subtitles';
export type DictateStatus = 'idle' | 'recording' | 'processing' | 'done' | 'error';
export type WidgetModule = 'dictate' | 'reader' | 'translator' | 'subtitles';

export type WidgetState = {
  mode: WidgetMode;
  activeModule: WidgetModule;
  dictateStatus: DictateStatus;
  text: string;
  translatedText: string;
  error: string | null;
  dragging: boolean;

  collapse: () => void;
  switchModule: (module: WidgetModule) => void;
  setTranslatedText: (text: string) => void;
  startDictation: () => void;
  stopDictation: () => void;
  setProcessing: () => void;
  setDone: (text: string) => void;
  setError: (error: string) => void;
  resetDictation: () => void;
  setDragging: (dragging: boolean) => void;
};

export const OVERLAY_BAR_SIZE = { width: 360, height: 64 };
export const OVERLAY_DICTATING_SIZE = { width: 360, height: 120 };
export const SUBTITLE_SIZE = { width: 760, height: 84 };

export const useWidgetStore = create<WidgetState>((set, get) => ({
  mode: 'bar',
  activeModule: 'dictate',
  dictateStatus: 'idle',
  text: '',
  translatedText: '',
  error: null,
  dragging: false,

  collapse: () => set({ mode: 'bar', dictateStatus: 'idle' }),
  switchModule: (module) => {
    const mode = module === 'subtitles' ? 'subtitles' : 'bar';
    set({ activeModule: module, mode });
  },
  setTranslatedText: (translatedText) => set({ translatedText }),

  startDictation: () => {
    set({ mode: 'dictating', activeModule: 'dictate', dictateStatus: 'recording', error: null });
  },

  stopDictation: () => {
    if (get().dictateStatus === 'recording') {
      set({ dictateStatus: 'processing' });
    }
  },

  setProcessing: () => set({ dictateStatus: 'processing' }),

  setDone: (text) => set({ mode: 'bar', dictateStatus: 'done', text }),

  setError: (error) => set({ mode: 'bar', dictateStatus: 'error', error }),

  resetDictation: () => set({ dictateStatus: 'idle', text: '', error: null }),

  setDragging: (dragging) => set({ dragging }),
}));
