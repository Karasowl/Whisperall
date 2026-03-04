import { create } from 'zustand';

/** Lightweight signal store for sidebar → DictatePage communication. */
type NotesActionsState = {
  /** Incremented to signal "create new note" */
  newNoteSignal: number;
  /** Incremented to signal "create new voice note" */
  voiceNoteSignal: number;
  /** Folder pending deletion (set by sidebar, consumed by DictatePage) */
  pendingDeleteFolderId: string | null;
  triggerNewNote: () => void;
  triggerVoiceNote: () => void;
  requestDeleteFolder: (id: string) => void;
  clearDeleteFolder: () => void;
};

export const useNotesActionsStore = create<NotesActionsState>((set) => ({
  newNoteSignal: 0,
  voiceNoteSignal: 0,
  pendingDeleteFolderId: null,
  triggerNewNote: () => set((s) => ({ newNoteSignal: s.newNoteSignal + 1 })),
  triggerVoiceNote: () => set((s) => ({ voiceNoteSignal: s.voiceNoteSignal + 1 })),
  requestDeleteFolder: (id) => set({ pendingDeleteFolderId: id }),
  clearDeleteFolder: () => set({ pendingDeleteFolderId: null }),
}));
