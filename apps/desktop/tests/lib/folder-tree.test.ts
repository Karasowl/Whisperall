import { describe, expect, it } from 'vitest';
import type { Folder } from '@whisperall/api-client';
import { buildFolderTree, computeRecursiveFolderCounts, flattenFolderTree } from '../../src/lib/folder-tree';

const now = '2026-02-20T00:00:00Z';

function folder(id: string, name: string, parent_id: string | null = null): Folder {
  return { id, name, parent_id, user_id: 'u1', created_at: now, updated_at: now };
}

describe('folder-tree', () => {
  it('builds tree and sorts siblings by name', () => {
    const tree = buildFolderTree([
      folder('3', 'zeta'),
      folder('2', 'bravo', '1'),
      folder('1', 'alpha'),
      folder('4', 'charlie', '1'),
    ]);

    expect(tree.map((n) => n.folder.name)).toEqual(['alpha', 'zeta']);
    expect(tree[0].children.map((n) => n.folder.name)).toEqual(['bravo', 'charlie']);
  });

  it('treats orphan and self-parent folders as roots', () => {
    const tree = buildFolderTree([
      folder('1', 'root'),
      folder('2', 'orphan', 'missing'),
      folder('3', 'self', '3'),
    ]);
    expect(tree.map((n) => n.folder.id)).toEqual(['2', '1', '3']);
  });

  it('flattens tree preserving depth', () => {
    const flat = flattenFolderTree(buildFolderTree([
      folder('1', 'root'),
      folder('2', 'child', '1'),
      folder('3', 'grandchild', '2'),
    ]));
    expect(flat.map((n) => [n.folder.id, n.depth])).toEqual([
      ['1', 0],
      ['2', 1],
      ['3', 2],
    ]);
  });

  it('computes recursive note counts by folder', () => {
    const folders = [
      folder('1', 'Work'),
      folder('2', 'Projects', '1'),
      folder('3', 'Meetings', '1'),
      folder('4', 'Private'),
    ];
    const docs = [
      { folder_id: '1' },
      { folder_id: '2' },
      { folder_id: '2' },
      { folder_id: '3' },
      { folder_id: '4' },
      { folder_id: null },
      { folder_id: 'missing' },
    ];
    const counts = computeRecursiveFolderCounts(folders, docs);
    expect(counts).toEqual({
      '1': 4,
      '2': 2,
      '3': 1,
      '4': 1,
    });
  });

  it('handles cyclic folder graphs without infinite loops', () => {
    const folders = [
      folder('1', 'A', '2'),
      folder('2', 'B', '1'),
      folder('3', 'C'),
    ];
    const docs = [
      { folder_id: '1' },
      { folder_id: '2' },
      { folder_id: '3' },
    ];
    const counts = computeRecursiveFolderCounts(folders, docs);
    expect(counts['1']).toBe(2);
    expect(counts['2']).toBe(2);
    expect(counts['3']).toBe(1);
  });
});
