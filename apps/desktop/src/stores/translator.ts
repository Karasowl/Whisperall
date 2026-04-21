import { create } from 'zustand';

export type TranslatorStatus =
  | 'idle'
  | 'capturing'
  | 'reading'
  | 'translating'
  | 'no-text'
  | 'error';

export type TranslatorState = {
  visible: boolean;
  dragging: boolean;
  resizing: boolean;
  status: TranslatorStatus;
  lastOcrText: string;
  lastTranslation: string;
  lastErrorMessage: string;
  consecFailures: number;
  bounds: { x: number; y: number; width: number; height: number } | null;

  setVisible: (visible: boolean) => void;
  setDragging: (dragging: boolean) => void;
  setResizing: (resizing: boolean) => void;
  setStatus: (status: TranslatorStatus) => void;
  setOcrText: (text: string) => void;
  setTranslation: (text: string) => void;
  setErrorMessage: (msg: string) => void;
  incFailures: () => void;
  resetFailures: () => void;
  setBounds: (bounds: { x: number; y: number; width: number; height: number }) => void;
};

export const useTranslatorStore = create<TranslatorState>((set) => ({
  visible: false,
  dragging: false,
  resizing: false,
  status: 'idle',
  lastOcrText: '',
  lastTranslation: '',
  lastErrorMessage: '',
  consecFailures: 0,
  bounds: null,

  setVisible: (visible) => set({ visible }),
  setDragging: (dragging) => set({ dragging }),
  setResizing: (resizing) => set({ resizing }),
  setStatus: (status) => set({ status }),
  setOcrText: (lastOcrText) => set({ lastOcrText }),
  setTranslation: (lastTranslation) => set({ lastTranslation }),
  setErrorMessage: (lastErrorMessage) => set({ lastErrorMessage }),
  incFailures: () => set((s) => ({ consecFailures: s.consecFailures + 1 })),
  resetFailures: () => set({ consecFailures: 0 }),
  setBounds: (bounds) => set({ bounds }),
}));

export const TRANSLATOR_DEFAULT_SIZE = { width: 420, height: 180 };
export const TRANSLATOR_MIN_SIZE = { width: 240, height: 120 };
