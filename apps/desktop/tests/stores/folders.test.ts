import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/api', () => ({
  api: {
    folders: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { api } from '../../src/lib/api';
import { useFoldersStore } from '../../src/stores/folders';

const mockFolders = api.folders as {
  list: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const FOLDER = { id: 'f1', user_id: 'u1', name: 'Work', created_at: '2025-01-01', updated_at: '2025-01-01' };

describe('useFoldersStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFoldersStore.setState({ folders: [], selectedFolderId: null, loading: false, error: null });
  });

  it('fetchFolders populates state', async () => {
    mockFolders.list.mockResolvedValue([FOLDER]);
    await useFoldersStore.getState().fetchFolders();
    expect(useFoldersStore.getState().folders).toEqual([FOLDER]);
    expect(useFoldersStore.getState().loading).toBe(false);
  });

  it('fetchFolders handles error', async () => {
    mockFolders.list.mockRejectedValue(new Error('fail'));
    await useFoldersStore.getState().fetchFolders();
    expect(useFoldersStore.getState().error).toBe('fail');
  });

  it('createFolder appends to list', async () => {
    mockFolders.create.mockResolvedValue(FOLDER);
    const result = await useFoldersStore.getState().createFolder('Work');
    expect(result).toEqual(FOLDER);
    expect(useFoldersStore.getState().folders).toHaveLength(1);
    expect(mockFolders.create).toHaveBeenCalledWith({ name: 'Work' });
  });

  it('renameFolder updates in list', async () => {
    const updated = { ...FOLDER, name: 'Personal' };
    mockFolders.update.mockResolvedValue(updated);
    useFoldersStore.setState({ folders: [FOLDER] });
    await useFoldersStore.getState().renameFolder('f1', 'Personal');
    expect(useFoldersStore.getState().folders[0].name).toBe('Personal');
  });

  it('deleteFolder removes from list', async () => {
    mockFolders.delete.mockResolvedValue(undefined);
    useFoldersStore.setState({ folders: [FOLDER], selectedFolderId: 'f1' });
    await useFoldersStore.getState().deleteFolder('f1');
    expect(useFoldersStore.getState().folders).toHaveLength(0);
    expect(useFoldersStore.getState().selectedFolderId).toBeNull();
  });

  it('deleteFolder preserves selectedFolderId if different', async () => {
    mockFolders.delete.mockResolvedValue(undefined);
    useFoldersStore.setState({ folders: [FOLDER], selectedFolderId: 'other' });
    await useFoldersStore.getState().deleteFolder('f1');
    expect(useFoldersStore.getState().selectedFolderId).toBe('other');
  });

  it('selectFolder updates selectedFolderId', () => {
    useFoldersStore.getState().selectFolder('f1');
    expect(useFoldersStore.getState().selectedFolderId).toBe('f1');
    useFoldersStore.getState().selectFolder(null);
    expect(useFoldersStore.getState().selectedFolderId).toBeNull();
  });
});
