import type { Folder } from '@whisperall/api-client';

export type FolderTreeNode = {
  folder: Folder;
  children: FolderTreeNode[];
};

export type FlattenedFolderNode = {
  folder: Folder;
  depth: number;
};

function compareFolders(a: Folder, b: Folder): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

export function buildFolderTree(folders: Folder[]): FolderTreeNode[] {
  const map = new Map<string, FolderTreeNode>();
  for (const folder of folders) {
    map.set(folder.id, { folder, children: [] });
  }

  const roots: FolderTreeNode[] = [];
  for (const node of map.values()) {
    const parentId = node.folder.parent_id;
    if (!parentId || parentId === node.folder.id) {
      roots.push(node);
      continue;
    }
    const parent = map.get(parentId);
    if (!parent) {
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }

  const sortTree = (nodes: FolderTreeNode[]) => {
    nodes.sort((a, b) => compareFolders(a.folder, b.folder));
    for (const node of nodes) {
      sortTree(node.children);
    }
  };

  sortTree(roots);
  return roots;
}

export function flattenFolderTree(nodes: FolderTreeNode[]): FlattenedFolderNode[] {
  const flat: FlattenedFolderNode[] = [];
  const visited = new Set<string>();

  const walk = (items: FolderTreeNode[], depth: number) => {
    for (const item of items) {
      if (visited.has(item.folder.id)) continue;
      visited.add(item.folder.id);
      flat.push({ folder: item.folder, depth });
      walk(item.children, depth + 1);
    }
  };

  walk(nodes, 0);
  return flat;
}

type FolderDocumentLike = { folder_id: string | null };

export function computeRecursiveFolderCounts(folders: Folder[], docs: FolderDocumentLike[]): Record<string, number> {
  const childrenByParent: Record<string, string[]> = {};
  const directCounts: Record<string, number> = {};
  const folderIds = new Set<string>();

  for (const folder of folders) {
    folderIds.add(folder.id);
    directCounts[folder.id] = 0;
    childrenByParent[folder.id] = [];
  }

  for (const folder of folders) {
    const parentId = folder.parent_id;
    if (!parentId || parentId === folder.id || !folderIds.has(parentId)) continue;
    childrenByParent[parentId].push(folder.id);
  }

  for (const doc of docs) {
    if (!doc.folder_id || !folderIds.has(doc.folder_id)) continue;
    directCounts[doc.folder_id] = (directCounts[doc.folder_id] ?? 0) + 1;
  }

  const visit = (folderId: string, visited: Set<string>): number => {
    if (visited.has(folderId)) return 0;
    const nextVisited = new Set(visited);
    nextVisited.add(folderId);
    let total = directCounts[folderId] ?? 0;
    for (const childId of childrenByParent[folderId] ?? []) {
      total += visit(childId, nextVisited);
    }
    return total;
  };

  const counts: Record<string, number> = {};
  for (const folder of folders) {
    counts[folder.id] = visit(folder.id, new Set<string>());
  }
  return counts;
}
