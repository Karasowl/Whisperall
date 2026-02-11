import { create } from 'zustand';

export type WidgetMode = 'pill' | 'hover' | 'dictating' | 'expanded' | 'subtitles';
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
  hoverIn: () => void;
  hoverOut: () => void;
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

/** pill, hover, dictating share this size — NO window resize between them */
export const OVERLAY_BASE_SIZE = { width: 280, height: 100 };
export const EXPANDED_SIZE = { width: 260, height: 148 };
export const SUBTITLE_SIZE = { width: 600, height: 56 };

export const useWidgetStore = create<WidgetState>((set, get) => ({
  mode: 'pill',
  activeModule: 'dictate',
  dictateStatus: 'idle',
  text: '',
  translatedText: '',
  error: null,
  dragging: false,

  expand: () => set({ mode: 'expanded' }),
  collapse: () => set({ mode: 'pill', dictateStatus: 'idle' }),
  hoverIn: () => {
    const { mode } = get();
    if (mode === 'pill') set({ mode: 'hover' });
  },
  hoverOut: () => {
    const { mode } = get();
    if (mode === 'hover') set({ mode: 'pill' });
  },
  switchModule: (module) => {
    const mode = module === 'subtitles' ? 'subtitles' : 'expanded';
    set({ activeModule: module, mode });
  },
  setTranslatedText: (translatedText) => set({ translatedText }),
  toggle: () => {
    const { mode } = get();
    set({ mode: mode === 'pill' || mode === 'hover' ? 'expanded' : 'pill' });
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

  setDone: (text) => set({ mode: 'expanded', dictateStatus: 'done', text }),

  setError: (error) => set({ mode: 'expanded', dictateStatus: 'error', error }),

  resetDictation: () => set({ dictateStatus: 'idle', text: '', error: null }),

  setDragging: (dragging) => set({ dragging }),
}));
