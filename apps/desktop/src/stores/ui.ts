import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type UiState = {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  // True whenever the user is INSIDE a single note (DictatePage edit
  // mode, EditorPage, ReaderPage document view). The AppShell uses this
  // to decide whether to show the widget-dock slot — the dock is only
  // sensible on the notes home list, where there is room for it.
  // DictatePage keeps its own `docId` local state, so this flag gives
  // the shell a cross-page signal without coupling to DictatePage's
  // internals.
  noteOpen: boolean;
  setNoteOpen: (v: boolean) => void;
  /** Width (px) of the right-side Debate Society panel when open.
   *  Clamped to sensible bounds by the resize handle; persisted so the
   *  user's preferred width sticks across sessions. */
  debatePanelWidth: number;
  setDebatePanelWidth: (px: number) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      noteOpen: false,
      setNoteOpen: (v) => set({ noteOpen: v }),
      debatePanelWidth: 360,
      setDebatePanelWidth: (px) => set({ debatePanelWidth: Math.max(280, Math.min(720, Math.round(px))) }),
    }),
    { name: 'whisperall-ui', partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed, debatePanelWidth: state.debatePanelWidth }) }
  )
);
