import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/api', () => ({
  api: {
    documents: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { useDocumentsStore } from '../../src/stores/documents';
import { api } from '../../src/lib/api';

const DOC_1 = { id: 'd1', user_id: 'u1', title: 'Note 1', content: 'Hello', source: 'dictation', source_id: null, tags: [], created_at: '2025-01-01', updated_at: '2025-01-01' };
const DOC_2 = { id: 'd2', user_id: 'u1', title: 'Note 2', content: 'World', source: 'manual', source_id: null, tags: [], created_at: '2025-01-02', updated_at: '2025-01-02' };

describe('documents store', () => {
  beforeEach(() => {
    useDocumentsStore.setState({ documents: [], currentDocument: null, loading: false, error: null });
    vi.clearAllMocks();
    vi.mocked(api.documents.list).mockResolvedValue([DOC_1, DOC_2]);
    vi.mocked(api.documents.get).mockResolvedValue(DOC_1);
    vi.mocked(api.documents.create).mockResolvedValue({ ...DOC_1, id: 'd3', title: 'New' });
    vi.mocked(api.documents.update).mockResolvedValue({ ...DOC_1, title: 'Updated' });
    vi.mocked(api.documents.delete).mockResolvedValue(undefined as any);
  });

  it('fetchDocuments loads list', async () => {
    await useDocumentsStore.getState().fetchDocuments();
    expect(api.documents.list).toHaveBeenCalled();
    expect(useDocumentsStore.getState().documents).toHaveLength(2);
    expect(useDocumentsStore.getState().loading).toBe(false);
  });

  it('loadDocument sets currentDocument', async () => {
    await useDocumentsStore.getState().loadDocument('d1');
    expect(api.documents.get).toHaveBeenCalledWith('d1');
    expect(useDocumentsStore.getState().currentDocument?.id).toBe('d1');
  });

  it('createDocument adds to list', async () => {
    await useDocumentsStore.getState().createDocument({ title: 'New', content: 'Hi', source: 'dictation' });
    expect(api.documents.create).toHaveBeenCalled();
    expect(useDocumentsStore.getState().documents).toHaveLength(1);
    expect(useDocumentsStore.getState().documents[0].title).toBe('New');
  });

  it('updateDocument patches list and current', async () => {
    useDocumentsStore.setState({ documents: [DOC_1, DOC_2], currentDocument: DOC_1 as any });
    await useDocumentsStore.getState().updateDocument('d1', { title: 'Updated' });
    expect(api.documents.update).toHaveBeenCalledWith('d1', { title: 'Updated' });
    expect(useDocumentsStore.getState().documents[0].title).toBe('Updated');
    expect(useDocumentsStore.getState().currentDocument?.title).toBe('Updated');
  });

  it('deleteDocument removes from list', async () => {
    useDocumentsStore.setState({ documents: [DOC_1, DOC_2], currentDocument: DOC_1 as any });
    await useDocumentsStore.getState().deleteDocument('d1');
    expect(api.documents.delete).toHaveBeenCalledWith('d1');
    expect(useDocumentsStore.getState().documents).toHaveLength(1);
    expect(useDocumentsStore.getState().currentDocument).toBeNull();
  });

  it('fetchDocuments handles error', async () => {
    vi.mocked(api.documents.list).mockRejectedValueOnce(new Error('Network error'));
    await useDocumentsStore.getState().fetchDocuments();
    expect(useDocumentsStore.getState().error).toBe('Network error');
    expect(useDocumentsStore.getState().loading).toBe(false);
  });

  it('clearCurrent resets currentDocument', () => {
    useDocumentsStore.setState({ currentDocument: DOC_1 as any });
    useDocumentsStore.getState().clearCurrent();
    expect(useDocumentsStore.getState().currentDocument).toBeNull();
  });
});
