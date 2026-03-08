import { create } from 'zustand';
import { api } from '../lib/api';
import type { Folder } from '@whisperall/api-client';

export type FolderNode = Folder & { children: FolderNode[] };

export type FoldersState = {
  folders: Folder[];
  selectedFolderId: string | null;
  expandedIds: Set<string>;
  loading: boolean;
  error: string | null;
  fetchFolders: () => Promise<void>;
  createFolder: (name: string, parentId?: string | null) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  updateFolder: (id: string, params: { name?: string; parent_id?: string | null }) => Promise<void>;
  moveFolder: (id: string, parentId: string | null) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  selectFolder: (id: string | null) => void;
  toggleExpand: (id: string) => void;
};

/** Build tree from flat list. */
export function buildTree(folders: Folder[]): FolderNode[] {
  const map = new Map<string, FolderNode>();
  for (const f of folders) map.set(f.id, { ...f, children: [] });
  const roots: FolderNode[] = [];
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** Get all descendant folder IDs (inclusive). */
export function getDescendantIds(folders: Folder[], rootId: string): string[] {
  const ids = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const pid = queue.shift()!;
    for (const f of folders) {
      if (f.parent_id === pid) {
        ids.push(f.id);
        queue.push(f.id);
      }
    }
  }
  return ids;
}

export const useFoldersStore = create<FoldersState>((set, get) => ({
  folders: [],
  selectedFolderId: null,
  expandedIds: new Set<string>(),
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

  createFolder: async (name, parentId = null) => {
    set({ error: null });
    try {
      const folder = await api.folders.create(parentId ? { name, parent_id: parentId } : { name });
      set((s) => {
        const expanded = new Set(s.expandedIds);
        if (parentId) expanded.add(parentId);
        return { folders: [...s.folders, folder], expandedIds: expanded };
      });
      return folder;
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  renameFolder: async (id, name) => {
    set({ error: null });
    try {
      const updated = await api.folders.update(id, { name });
      set((s) => ({ folders: s.folders.map((f) => (f.id === id ? updated : f)) }));
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  updateFolder: async (id, params) => {
    set({ error: null });
    try {
      const updated = await api.folders.update(id, params);
      set((s) => ({ folders: s.folders.map((f) => (f.id === id ? updated : f)) }));
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  moveFolder: async (id, parentId) => {
    set({ error: null });
    try {
      const existing = get().folders.find((f) => f.id === id);
      if (!existing) throw new Error('Folder not found');
      const updated = await api.folders.update(id, { name: existing.name, parent_id: parentId });
      set((s) => ({
        folders: s.folders.map((f) => (f.id === id ? updated : f)),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  deleteFolder: async (id) => {
    set({ error: null });
    try {
      await api.folders.delete(id);
      const { folders } = get();
      const removed = new Set(getDescendantIds(folders, id));
      set((s) => ({
        folders: s.folders.filter((f) => !removed.has(f.id)),
        selectedFolderId: removed.has(s.selectedFolderId ?? '') ? null : s.selectedFolderId,
      }));
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  selectFolder: (id) => set({ selectedFolderId: id }),

  toggleExpand: (id) =>
    set((s) => {
      const next = new Set(s.expandedIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return { expandedIds: next };
    }),
}));
