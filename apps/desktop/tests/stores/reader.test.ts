import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/api', () => ({
  api: {
    reader: {
      listDocuments: vi.fn(),
      importFile: vi.fn(),
      importUrl: vi.fn(),
      getProgress: vi.fn(),
      upsertProgress: vi.fn(),
      listBookmarks: vi.fn(),
      createBookmark: vi.fn(),
      deleteBookmark: vi.fn(),
      listAnnotations: vi.fn(),
      createAnnotation: vi.fn(),
      updateAnnotation: vi.fn(),
      deleteAnnotation: vi.fn(),
    },
    documents: {
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { api } from '../../src/lib/api';
import { useReaderStore } from '../../src/stores/reader';

const DOC = {
  id: 'r1',
  user_id: 'u1',
  title: 'Reader Doc',
  content: 'Hello world',
  source: 'reader',
  source_id: null,
  tags: [],
  folder_id: null,
  created_at: '2026-02-17T00:00:00Z',
  updated_at: '2026-02-17T00:00:00Z',
} as const;

describe('reader store', () => {
  beforeEach(() => {
    useReaderStore.setState({
      documents: [],
      currentDocument: null,
      text: '',
      bookmarks: [],
      annotations: [],
      progress: null,
      loading: false,
      error: null,
    } as any);
    vi.clearAllMocks();
    vi.mocked(api.reader.listDocuments).mockResolvedValue([DOC as any]);
    vi.mocked(api.reader.importUrl).mockResolvedValue({
      text: DOC.content,
      blocks: [],
      pages: 1,
      title: DOC.title,
      source: 'url',
      document_id: DOC.id,
      warning: null,
    } as any);
    vi.mocked(api.reader.getProgress).mockResolvedValue({
      document_id: DOC.id,
      char_offset: 0,
      playback_seconds: 0,
      section_index: 0,
      updated_at: '2026-02-17T00:00:00Z',
    } as any);
    vi.mocked(api.reader.listBookmarks).mockResolvedValue([]);
    vi.mocked(api.reader.listAnnotations).mockResolvedValue([]);
    vi.mocked(api.reader.createBookmark).mockResolvedValue({
      id: 'bm1',
      document_id: DOC.id,
      char_offset: 3,
      label: 'Bookmark 3',
      created_at: '2026-02-17T00:00:00Z',
    } as any);
    vi.mocked(api.reader.deleteBookmark).mockResolvedValue(undefined as any);
    vi.mocked(api.documents.create).mockResolvedValue({ ...(DOC as any), id: 'r2' });
    vi.mocked(api.documents.delete).mockResolvedValue(undefined as any);
  });

  it('fetchDocuments loads reader docs', async () => {
    await useReaderStore.getState().fetchDocuments();
    expect(api.reader.listDocuments).toHaveBeenCalled();
    expect(useReaderStore.getState().documents).toHaveLength(1);
  });

  it('importUrl updates current document and text', async () => {
    await useReaderStore.getState().importUrl('https://example.com/article');
    expect(api.reader.importUrl).toHaveBeenCalled();
    expect(useReaderStore.getState().currentDocument?.id).toBe('r1');
    expect(useReaderStore.getState().text).toBe('Hello world');
  });

  it('saveCurrentText creates synced reader document', async () => {
    useReaderStore.setState({ text: 'Manual note' } as any);
    await useReaderStore.getState().saveCurrentText('Manual');
    expect(api.documents.create).toHaveBeenCalledWith({ title: 'Manual', content: 'Manual note', source: 'reader' });
  });

  it('bookmark CRUD updates local state', async () => {
    useReaderStore.setState({ currentDocument: DOC as any } as any);
    await useReaderStore.getState().addBookmark(3);
    expect(useReaderStore.getState().bookmarks).toHaveLength(1);
    await useReaderStore.getState().removeBookmark('bm1');
    expect(api.reader.deleteBookmark).toHaveBeenCalledWith('bm1');
    expect(useReaderStore.getState().bookmarks).toHaveLength(0);
  });

  it('startNewDraft clears active reader context', () => {
    useReaderStore.setState({
      currentDocument: DOC as any,
      text: 'abc',
      bookmarks: [{ id: 'bm1' }] as any,
      annotations: [{ id: 'a1' }] as any,
      progress: { document_id: DOC.id } as any,
      error: 'x',
    } as any);
    useReaderStore.getState().startNewDraft();
    const s = useReaderStore.getState();
    expect(s.currentDocument).toBeNull();
    expect(s.text).toBe('');
    expect(s.bookmarks).toHaveLength(0);
    expect(s.annotations).toHaveLength(0);
    expect(s.progress).toBeNull();
    expect(s.error).toBeNull();
  });
});
