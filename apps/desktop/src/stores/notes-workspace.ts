import { create } from 'zustand';

export type CreateNoteIntent = { autoRecord: boolean; nonce: number } | null;

type RequestCreateNoteInput = { autoRecord: boolean };

type NotesWorkspaceState = {
  createNoteIntent: CreateNoteIntent;
  requestCreateNote: (input: RequestCreateNoteInput) => void;
  consumeCreateNote: (nonce: number) => void;
};

export const useNotesWorkspaceStore = create<NotesWorkspaceState>((set, get) => ({
  createNoteIntent: null,
  requestCreateNote: ({ autoRecord }) => {
    const nextNonce = (get().createNoteIntent?.nonce ?? 0) + 1;
    set({ createNoteIntent: { autoRecord, nonce: nextNonce } });
  },
  consumeCreateNote: (nonce) => {
    const intent = get().createNoteIntent;
    if (!intent || intent.nonce !== nonce) return;
    set({ createNoteIntent: null });
  },
}));

