import { create } from 'zustand';

export type WidgetMode = 'bar' | 'dictating' | 'panel' | 'subtitles';
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

  expand: () => void;
  collapse: () => void;
  toggle: () => void;
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

/** bar/panel/dictating share one size to avoid jumpy resize transitions. */
export const OVERLAY_BASE_SIZE = { width: 360, height: 120 };
export const SUBTITLE_SIZE = { width: 760, height: 84 };

export const useWidgetStore = create<WidgetState>((set, get) => ({
  mode: 'bar',
  activeModule: 'dictate',
  dictateStatus: 'idle',
  text: '',
  translatedText: '',
  error: null,
  dragging: false,

  expand: () => set({ mode: 'panel' }),
  collapse: () => set({ mode: 'bar', dictateStatus: 'idle' }),
  switchModule: (module) => {
    const mode = module === 'subtitles' ? 'subtitles' : 'panel';
    set({ activeModule: module, mode });
  },
  setTranslatedText: (translatedText) => set({ translatedText }),
  toggle: () => {
    const { mode } = get();
    set({ mode: mode === 'bar' ? 'panel' : 'bar' });
  },

  startDictation: () => {
    set({ mode: 'dictating', activeModule: 'dictate', dictateStatus: 'recording', error: null });
  },

  stopDictation: () => {
    if (get().dictateStatus === 'recording') {
      set({ dictateStatus: 'processing' });
    }
  },

  setProcessing: () => set({ dictateStatus: 'processing' }),

  setDone: (text) => set({ mode: 'panel', dictateStatus: 'done', text }),

  setError: (error) => set({ mode: 'panel', dictateStatus: 'error', error }),

  resetDictation: () => set({ dictateStatus: 'idle', text: '', error: null }),

  setDragging: (dragging) => set({ dragging }),
}));
