import { useEffect, useMemo, useRef, useState } from 'react';
import type { Document } from '@whisperall/api-client';
import { useFoldersStore } from '../../stores/folders';
import { buildFolderTree, computeRecursiveFolderCounts } from '../../lib/folder-tree';
import { getDraggedFolderId, getDraggedNoteIds } from '../../lib/note-dnd';
import type { FolderTreeContext } from './FolderTreeRow';

type Args = {
  documents: Document[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onDeleteFolder: (id: string) => void;
  onMoveNotes?: (folderId: string | null, noteIds: string[]) => Promise<void> | void;
  t: (key: string) => string;
};

export function useFolderChipsModel({ documents, selectedFolderId, onSelectFolder, onDeleteFolder, onMoveNotes, t }: Args) {
  const { folders, createFolder, renameFolder, moveFolder } = useFoldersStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [movingNotes, setMovingNotes] = useState(false);
  const [movingFolders, setMovingFolders] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [noteDropTargetId, setNoteDropTargetId] = useState<string | null>(null);
  const [folderDropTargetId, setFolderDropTargetId] = useState<string | null>(null);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);
  const countById = useMemo(
    () => computeRecursiveFolderCounts(folders, documents),
    [documents, folders],
  );
  const parentById = useMemo(() => folders.reduce<Record<string, string | null>>((acc, folder) => {
    acc[folder.id] = folder.parent_id ?? null;
    return acc;
  }, {}), [folders]);

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

  useEffect(() => {
    if (!selectedFolderId) return;
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      const visited = new Set<string>();
      let cursor = parentById[selectedFolderId] ?? null;
      let changed = false;
      while (cursor && !visited.has(cursor)) {
        visited.add(cursor);
        if (next.delete(cursor)) changed = true;
        cursor = parentById[cursor] ?? null;
      }
      return changed ? next : prev;
    });
  }, [parentById, selectedFolderId]);

  const humanizeFolderError = (msg: string) => {
    const low = msg.toLowerCase();
    return low.includes('pgrst205') || low.includes('public.folders') || low.includes('folders are unavailable') || low.includes('folder hierarchy is unavailable')
      ? t('folders.unavailable')
      : t('folders.createError');
  };

  const canMoveFolder = (folderId: string, targetParentId: string | null): boolean => {
    if (!folderId) return false;
    if (targetParentId === folderId) return false;
    const visited = new Set<string>();
    let cursor = targetParentId;
    while (cursor && !visited.has(cursor)) {
      if (cursor === folderId) return false;
      visited.add(cursor);
      cursor = parentById[cursor] ?? null;
    }
    return true;
  };

  const handleCreate = async (parentId: string | null) => {
    setCreateError('');
    setCreating(true);
    try {
      const folder = await createFolder(t('folders.untitled'), parentId ?? undefined);
      if (parentId) {
        setCollapsedIds((prev) => {
          const next = new Set(prev);
          next.delete(parentId);
          return next;
        });
      }
      setEditingId(folder.id);
      setEditName(folder.name);
      onSelectFolder(folder.id);
    } catch (err) {
      setCreateError(humanizeFolderError((err as Error).message));
    } finally {
      setCreating(false);
    }
  };

  const commitRename = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return setEditingId(null);
    try {
      setCreateError('');
      await renameFolder(id, trimmed);
    } catch {
      setCreateError(t('folders.renameError'));
    }
    setEditingId(null);
  };

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMoveNotes = async (folderId: string | null, noteIds: string[]) => {
    if (!onMoveNotes || noteIds.length === 0) return;
    setCreateError('');
    setMovingNotes(true);
    try {
      await onMoveNotes(folderId, noteIds);
    } catch {
      setCreateError(t('folders.moveError'));
    } finally {
      setMovingNotes(false);
      setNoteDropTargetId(null);
    }
  };

  const handleMoveFolder = async (folderId: string, targetParentId: string | null) => {
    if (!canMoveFolder(folderId, targetParentId)) {
      setCreateError(t('folders.moveFolderInvalid'));
      setFolderDropTargetId(null);
      setDraggingFolderId(null);
      return;
    }

    setCreateError('');
    setMovingFolders(true);
    try {
      await moveFolder(folderId, targetParentId);
      if (targetParentId) {
        setCollapsedIds((prev) => {
          const next = new Set(prev);
          next.delete(targetParentId);
          return next;
        });
      }
    } catch {
      setCreateError(t('folders.moveFolderError'));
    } finally {
      setMovingFolders(false);
      setFolderDropTargetId(null);
      setDraggingFolderId(null);
    }
  };

  const rowCtx: FolderTreeContext = {
    selectedFolderId,
    collapsedIds,
    editingId,
    editName,
    editRef,
    countById,
    noteDropTargetId,
    folderDropTargetId,
    draggingFolderId,
    labels: {
      deleteFolder: t('folders.delete'),
      renameFolder: t('folders.rename'),
      renameHint: t('folders.doubleClickRename'),
      newSubfolder: t('folders.newSubfolder'),
      folderActions: t('folders.actions'),
      dragFolder: t('folders.dragFolder'),
    },
    onSelectFolder: (id) => onSelectFolder(id),
    onDeleteFolder,
    onStartRename: (folder) => {
      setEditingId(folder.id);
      setEditName(folder.name);
    },
    onSetEditName: setEditName,
    onCommitRename: commitRename,
    onCancelRename: () => setEditingId(null),
    onCreateSubfolder: (parentId) => { void handleCreate(parentId); },
    onToggleCollapse: toggleCollapse,
    onSetNoteDropTarget: setNoteDropTargetId,
    onSetFolderDropTarget: setFolderDropTargetId,
    readDraggedNoteIds: getDraggedNoteIds,
    readDraggedFolderId: getDraggedFolderId,
    canDropFolder: canMoveFolder,
    onDropNotesToFolder: (folderId, noteIds) => { void handleMoveNotes(folderId, noteIds); },
    onDropFolderToFolder: (targetParentId, draggedFolderId) => { void handleMoveFolder(draggedFolderId, targetParentId); },
    onFolderDragStart: (folderId) => {
      setCreateError('');
      setDraggingFolderId(folderId);
    },
    onFolderDragEnd: () => {
      setDraggingFolderId(null);
      setFolderDropTargetId(null);
    },
  };

  return {
    folderTree,
    rowCtx,
    createError,
    creating,
    movingNotes,
    movingFolders,
    noteDropTargetId,
    folderDropTargetId,
    setNoteDropTargetId,
    setFolderDropTargetId,
    dropNotesToFolder: (folderId: string | null, noteIds: string[]) => { void handleMoveNotes(folderId, noteIds); },
    dropFolderToParent: (targetParentId: string | null, folderId: string) => { void handleMoveFolder(folderId, targetParentId); },
    canDropFolderToRoot: (folderId: string) => canMoveFolder(folderId, null),
    createRootFolder: () => { void handleCreate(null); },
  };
}
