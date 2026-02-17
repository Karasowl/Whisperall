import { create } from 'zustand';
import type {
  ReaderAnnotation,
  ReaderBookmark,
  ReaderDocument,
  ReaderImportResponse,
  ReaderProgress,
} from '@whisperall/api-client';
import { ApiError } from '@whisperall/api-client';
import { api } from '../lib/api';

type ReaderState = {
  documents: ReaderDocument[];
  currentDocument: ReaderDocument | null;
  text: string;
  bookmarks: ReaderBookmark[];
  annotations: ReaderAnnotation[];
  progress: ReaderProgress | null;
  loading: boolean;
  error: string | null;

  fetchDocuments: () => Promise<void>;
  openDocument: (documentId: string) => Promise<void>;
  setText: (text: string) => void;
  importFile: (file: File, opts?: { forceOcr?: boolean; save?: boolean; languageHint?: string }) => Promise<ReaderImportResponse>;
  importUrl: (url: string, opts?: { forceOcr?: boolean; save?: boolean; languageHint?: string }) => Promise<ReaderImportResponse>;
  startNewDraft: () => void;
  saveCurrentText: (title?: string) => Promise<void>;
  deleteDocument: (documentId: string) => Promise<void>;

  loadProgress: (documentId: string) => Promise<void>;
  saveProgress: (payload: { char_offset: number; playback_seconds: number; section_index: number }) => Promise<void>;

  loadBookmarks: (documentId: string) => Promise<void>;
  addBookmark: (charOffset: number, label?: string) => Promise<void>;
  removeBookmark: (bookmarkId: string) => Promise<void>;

  loadAnnotations: (documentId: string) => Promise<void>;
  addAnnotation: (startOffset: number, endOffset: number, note?: string, color?: string) => Promise<void>;
  updateAnnotation: (annotationId: string, patch: { note?: string; color?: string }) => Promise<void>;
  removeAnnotation: (annotationId: string) => Promise<void>;

  clearError: () => void;
};

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message.replace(/^API error \d+:\s*/i, '');
  return (err as Error)?.message || 'Reader request failed';
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  documents: [],
  currentDocument: null,
  text: '',
  bookmarks: [],
  annotations: [],
  progress: null,
  loading: false,
  error: null,

  fetchDocuments: async () => {
    set({ loading: true, error: null });
    try {
      const docs = await api.reader.listDocuments({ limit: 100 });
      set({ documents: docs, loading: false });
    } catch (err) {
      set({ loading: false, error: errorMessage(err) });
    }
  },

  openDocument: async (documentId) => {
    const doc = get().documents.find((d) => d.id === documentId) ?? null;
    if (!doc) {
      await get().fetchDocuments();
    }
    const current = get().documents.find((d) => d.id === documentId) ?? null;
    if (!current) {
      set({ error: 'Reader document not found' });
      return;
    }
    set({ currentDocument: current, text: current.content, error: null });
    await Promise.all([
      get().loadProgress(current.id),
      get().loadBookmarks(current.id),
      get().loadAnnotations(current.id),
    ]);
  },

  setText: (text) => set({ text }),

  importFile: async (file, opts) => {
    set({ loading: true, error: null });
    try {
      const result = await api.reader.importFile({
        file,
        filename: file.name,
        force_ocr: opts?.forceOcr ?? false,
        language_hint: opts?.languageHint,
        save: opts?.save ?? true,
      });
      if (result.document_id) await get().fetchDocuments();
      if (result.document_id) {
        await get().openDocument(result.document_id);
      } else {
        set({ text: result.text, currentDocument: null, bookmarks: [], annotations: [], progress: null });
      }
      set({ loading: false });
      return result;
    } catch (err) {
      set({ loading: false, error: errorMessage(err) });
      throw err;
    }
  },

  importUrl: async (url, opts) => {
    set({ loading: true, error: null });
    try {
      const result = await api.reader.importUrl({
        url,
        force_ocr: opts?.forceOcr ?? false,
        language_hint: opts?.languageHint,
        save: opts?.save ?? true,
      });
      if (result.document_id) await get().fetchDocuments();
      if (result.document_id) {
        await get().openDocument(result.document_id);
      } else {
        set({ text: result.text, currentDocument: null, bookmarks: [], annotations: [], progress: null });
      }
      set({ loading: false });
      return result;
    } catch (err) {
      set({ loading: false, error: errorMessage(err) });
      throw err;
    }
  },

  startNewDraft: () => set({ currentDocument: null, text: '', bookmarks: [], annotations: [], progress: null, error: null }),

  saveCurrentText: async (title) => {
    const text = get().text.trim();
    if (!text) return;
    set({ loading: true, error: null });
    try {
      const doc = await api.documents.create({
        title: (title || text.slice(0, 80) || 'Reader Note').trim(),
        content: text,
        source: 'reader',
      });
      await get().fetchDocuments();
      const casted = doc as ReaderDocument;
      set({ currentDocument: casted, text: casted.content, loading: false });
      await get().openDocument(casted.id);
    } catch (err) {
      set({ loading: false, error: errorMessage(err) });
      throw err;
    }
  },

  deleteDocument: async (documentId) => {
    set({ loading: true, error: null });
    try {
      await api.documents.delete(documentId);
      const currentId = get().currentDocument?.id;
      await get().fetchDocuments();
      set({
        loading: false,
        currentDocument: currentId === documentId ? null : get().currentDocument,
        text: currentId === documentId ? '' : get().text,
        bookmarks: currentId === documentId ? [] : get().bookmarks,
        annotations: currentId === documentId ? [] : get().annotations,
        progress: currentId === documentId ? null : get().progress,
      });
    } catch (err) {
      set({ loading: false, error: errorMessage(err) });
      throw err;
    }
  },

  loadProgress: async (documentId) => {
    try {
      const progress = await api.reader.getProgress(documentId);
      set({ progress });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  saveProgress: async (payload) => {
    const docId = get().currentDocument?.id;
    if (!docId) return;
    try {
      const progress = await api.reader.upsertProgress(docId, payload);
      set({ progress });
    } catch {
      // Best effort to avoid noisy UX while reading.
    }
  },

  loadBookmarks: async (documentId) => {
    try {
      const bookmarks = await api.reader.listBookmarks(documentId);
      set({ bookmarks });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  addBookmark: async (charOffset, label) => {
    const docId = get().currentDocument?.id;
    if (!docId) return;
    const created = await api.reader.createBookmark({
      document_id: docId,
      char_offset: Math.max(0, Math.floor(charOffset)),
      label,
    });
    set((s) => ({ bookmarks: [...s.bookmarks, created].sort((a, b) => a.char_offset - b.char_offset) }));
  },

  removeBookmark: async (bookmarkId) => {
    await api.reader.deleteBookmark(bookmarkId);
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== bookmarkId) }));
  },

  loadAnnotations: async (documentId) => {
    try {
      const annotations = await api.reader.listAnnotations(documentId);
      set({ annotations });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  addAnnotation: async (startOffset, endOffset, note, color) => {
    const docId = get().currentDocument?.id;
    if (!docId) return;
    const created = await api.reader.createAnnotation({
      document_id: docId,
      start_offset: Math.max(0, Math.floor(startOffset)),
      end_offset: Math.max(0, Math.floor(endOffset)),
      note,
      color,
    });
    set((s) => ({
      annotations: [...s.annotations, created].sort((a, b) => a.start_offset - b.start_offset),
    }));
  },

  updateAnnotation: async (annotationId, patch) => {
    const updated = await api.reader.updateAnnotation(annotationId, patch);
    set((s) => ({
      annotations: s.annotations.map((a) => (a.id === annotationId ? updated : a)),
    }));
  },

  removeAnnotation: async (annotationId) => {
    await api.reader.deleteAnnotation(annotationId);
    set((s) => ({ annotations: s.annotations.filter((a) => a.id !== annotationId) }));
  },

  clearError: () => set({ error: null }),
}));
