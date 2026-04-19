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
  /** When true, Widget renders inline inside the Notes page instead of the overlay window. */
  docked: boolean;
  toggleDock: () => void;
  setDocked: (v: boolean) => void;
};

// E5b — window sizes include a transparent padding ring around the widget
// body so the ElevenLabs multi-layered shadow can blur out into the alpha
// zone instead of being clipped at the (rectangular) Electron window
// bounds. The widget body keeps the original inner size via CSS.
export const OVERLAY_PAD = 14;
export const OVERLAY_BAR_SIZE = { width: 360 + OVERLAY_PAD * 2, height: 64 + OVERLAY_PAD * 2 };
export const OVERLAY_DICTATING_SIZE = { width: 360 + OVERLAY_PAD * 2, height: 120 + OVERLAY_PAD * 2 };
export const SUBTITLE_SIZE = { width: 760 + OVERLAY_PAD * 2, height: 84 + OVERLAY_PAD * 2 };

export const useWidgetStore = create<WidgetState>((set, get) => ({
  mode: 'bar',
  activeModule: 'dictate',
  dictateStatus: 'idle',
  text: '',
  translatedText: '',
  error: null,
  dragging: false,
  docked: false,
  toggleDock: () => set((s) => ({ docked: !s.docked })),
  setDocked: (v) => set({ docked: v }),

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
