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
import { useFoldersStore, buildTree, getDescendantIds } from '../../src/stores/folders';

const mockFolders = api.folders as {
  list: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const FOLDER = { id: 'f1', user_id: 'u1', name: 'Work', parent_id: null, created_at: '2025-01-01', updated_at: '2025-01-01' };
const CHILD = { id: 'f2', user_id: 'u1', name: 'Projects', parent_id: 'f1', created_at: '2025-01-02', updated_at: '2025-01-02' };
const GRANDCHILD = { id: 'f3', user_id: 'u1', name: 'Meeting Logs', parent_id: 'f2', created_at: '2025-01-03', updated_at: '2025-01-03' };

describe('useFoldersStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFoldersStore.setState({ folders: [], selectedFolderId: null, expandedIds: new Set(), loading: false, error: null });
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
    expect(mockFolders.create).toHaveBeenCalledWith({ name: 'Work', parent_id: undefined });
  });

  it('createFolder with parentId expands parent', async () => {
    mockFolders.create.mockResolvedValue(CHILD);
    useFoldersStore.setState({ folders: [FOLDER] });
    await useFoldersStore.getState().createFolder('Projects', 'f1');
    expect(mockFolders.create).toHaveBeenCalledWith({ name: 'Projects', parent_id: 'f1' });
    expect(useFoldersStore.getState().folders).toHaveLength(2);
    expect(useFoldersStore.getState().expandedIds.has('f1')).toBe(true);
  });

  it('createFolder stores error and rethrows', async () => {
    mockFolders.create.mockRejectedValue(new Error('boom'));
    await expect(useFoldersStore.getState().createFolder('Work')).rejects.toThrow('boom');
    expect(useFoldersStore.getState().error).toBe('boom');
  });

  it('renameFolder updates in list', async () => {
    const updated = { ...FOLDER, name: 'Personal' };
    mockFolders.update.mockResolvedValue(updated);
    useFoldersStore.setState({ folders: [FOLDER] });
    await useFoldersStore.getState().renameFolder('f1', 'Personal');
    expect(useFoldersStore.getState().folders[0].name).toBe('Personal');
  });

  it('renameFolder stores error and rethrows', async () => {
    mockFolders.update.mockRejectedValue(new Error('rename-fail'));
    await expect(useFoldersStore.getState().renameFolder('f1', 'Personal')).rejects.toThrow('rename-fail');
    expect(useFoldersStore.getState().error).toBe('rename-fail');
  });

  it('deleteFolder removes from list', async () => {
    mockFolders.delete.mockResolvedValue(undefined);
    useFoldersStore.setState({ folders: [FOLDER], selectedFolderId: 'f1' });
    await useFoldersStore.getState().deleteFolder('f1');
    expect(useFoldersStore.getState().folders).toHaveLength(0);
    expect(useFoldersStore.getState().selectedFolderId).toBeNull();
  });

  it('deleteFolder removes descendants too', async () => {
    mockFolders.delete.mockResolvedValue(undefined);
    useFoldersStore.setState({ folders: [FOLDER, CHILD, GRANDCHILD], selectedFolderId: 'f3' });
    await useFoldersStore.getState().deleteFolder('f1');
    expect(useFoldersStore.getState().folders).toHaveLength(0);
    expect(useFoldersStore.getState().selectedFolderId).toBeNull();
  });

  it('deleteFolder stores error and rethrows', async () => {
    mockFolders.delete.mockRejectedValue(new Error('delete-fail'));
    await expect(useFoldersStore.getState().deleteFolder('f1')).rejects.toThrow('delete-fail');
    expect(useFoldersStore.getState().error).toBe('delete-fail');
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

  it('toggleExpand adds and removes IDs', () => {
    useFoldersStore.getState().toggleExpand('f1');
    expect(useFoldersStore.getState().expandedIds.has('f1')).toBe(true);
    useFoldersStore.getState().toggleExpand('f1');
    expect(useFoldersStore.getState().expandedIds.has('f1')).toBe(false);
  });
});

describe('buildTree', () => {
  it('builds flat list into tree', () => {
    const tree = buildTree([FOLDER, CHILD, GRANDCHILD]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('f1');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe('f2');
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].id).toBe('f3');
  });

  it('handles orphans as roots', () => {
    const orphan = { ...CHILD, parent_id: 'missing' };
    const tree = buildTree([FOLDER, orphan]);
    expect(tree).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(buildTree([])).toEqual([]);
  });
});

describe('getDescendantIds', () => {
  it('returns root + all descendants', () => {
    const ids = getDescendantIds([FOLDER, CHILD, GRANDCHILD], 'f1');
    expect(ids).toContain('f1');
    expect(ids).toContain('f2');
    expect(ids).toContain('f3');
    expect(ids).toHaveLength(3);
  });

  it('returns only self if no children', () => {
    const ids = getDescendantIds([FOLDER, CHILD, GRANDCHILD], 'f3');
    expect(ids).toEqual(['f3']);
  });
});
