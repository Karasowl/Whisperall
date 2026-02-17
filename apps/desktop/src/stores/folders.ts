import { create } from 'zustand';
import { api } from '../lib/api';
import type { Folder } from '@whisperall/api-client';

export type FoldersState = {
  folders: Folder[];
  selectedFolderId: string | null;
  loading: boolean;
  error: string | null;
  fetchFolders: () => Promise<void>;
  createFolder: (name: string) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  selectFolder: (id: string | null) => void;
};

export const useFoldersStore = create<FoldersState>((set) => ({
  folders: [],
  selectedFolderId: null,
  loading: false,
  error: null,

  fetchFolders: async () => {
    set({ loading: true, error: null });
    try {
      const folders = await api.folders.list();
      set({ folders, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  createFolder: async (name) => {
    const folder = await api.folders.create({ name });
    set((s) => ({ folders: [...s.folders, folder] }));
    return folder;
  },

  renameFolder: async (id, name) => {
    const updated = await api.folders.update(id, { name });
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? updated : f)),
    }));
  },

  deleteFolder: async (id) => {
    await api.folders.delete(id);
    set((s) => ({
      folders: s.folders.filter((f) => f.id !== id),
      selectedFolderId: s.selectedFolderId === id ? null : s.selectedFolderId,
    }));
  },

  selectFolder: (id) => set({ selectedFolderId: id }),
}));
