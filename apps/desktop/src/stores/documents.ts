import { create } from 'zustand';
import { api } from '../lib/api';
import type { Document, CreateDocumentParams, UpdateDocumentParams } from '@whisperall/api-client';

export type DocumentsState = {
  documents: Document[];
  currentDocument: Document | null;
  loading: boolean;
  error: string | null;
  pendingOpenId: string | null;
  fetchDocuments: () => Promise<void>;
  loadDocument: (id: string) => Promise<void>;
  createDocument: (params: CreateDocumentParams) => Promise<Document>;
  updateDocument: (id: string, params: UpdateDocumentParams) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  clearCurrent: () => void;
  setPendingOpen: (id: string | null) => void;
};

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  documents: [],
  currentDocument: null,
  loading: false,
  error: null,
  pendingOpenId: null,

  fetchDocuments: async () => {
    set({ loading: true, error: null });
    try {
      const docs = await api.documents.list();
      set({ documents: docs, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  loadDocument: async (id) => {
    set({ loading: true, error: null });
    try {
      const doc = await api.documents.get(id);
      set({ currentDocument: doc, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  createDocument: async (params) => {
    const doc = await api.documents.create(params);
    set((s) => ({ documents: [doc, ...s.documents], currentDocument: doc }));
    return doc;
  },

  updateDocument: async (id, params) => {
    const updated = await api.documents.update(id, params);
    set((s) => ({
      documents: s.documents.map((d) => (d.id === id ? updated : d)),
      currentDocument: s.currentDocument?.id === id ? updated : s.currentDocument,
    }));
  },

  deleteDocument: async (id) => {
    await api.documents.delete(id);
    set((s) => ({
      documents: s.documents.filter((d) => d.id !== id),
      currentDocument: s.currentDocument?.id === id ? null : s.currentDocument,
    }));
  },

  clearCurrent: () => set({ currentDocument: null }),
  setPendingOpen: (id) => set({ pendingOpenId: id }),
}));
