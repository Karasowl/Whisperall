import { create } from 'zustand';

export type WidgetMode = 'pill' | 'expanded';
export type DictateStatus = 'idle' | 'recording' | 'processing' | 'done' | 'error';

export type WidgetState = {
  mode: WidgetMode;
  dictateStatus: DictateStatus;
  text: string;
  error: string | null;
  dragging: boolean;

  expand: () => void;
  collapse: () => void;
  toggle: () => void;
  startDictation: () => void;
  stopDictation: () => void;
  setProcessing: () => void;
  setDone: (text: string) => void;
  setError: (error: string) => void;
  resetDictation: () => void;
  setDragging: (dragging: boolean) => void;
};

export const PILL_SIZE = { width: 72, height: 12 };
export const EXPANDED_SIZE = { width: 320, height: 200 };

export const useWidgetStore = create<WidgetState>((set, get) => ({
  mode: 'pill',
  dictateStatus: 'idle',
  text: '',
  error: null,
  dragging: false,

  expand: () => set({ mode: 'expanded' }),
  collapse: () => set({ mode: 'pill', dictateStatus: 'idle' }),
  toggle: () => {
    const { mode } = get();
    set({ mode: mode === 'pill' ? 'expanded' : 'pill' });
  },

  startDictation: () => {
    set({ mode: 'expanded', dictateStatus: 'recording', error: null });
  },

  stopDictation: () => {
    if (get().dictateStatus === 'recording') {
      set({ dictateStatus: 'processing' });
    }
  },

  setProcessing: () => set({ dictateStatus: 'processing' }),

  setDone: (text) => set({ dictateStatus: 'done', text }),

  setError: (error) => set({ dictateStatus: 'error', error }),

  resetDictation: () => set({ dictateStatus: 'idle', text: '', error: null }),

  setDragging: (dragging) => set({ dragging }),
}));
