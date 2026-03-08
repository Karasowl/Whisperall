import { useEffect, useRef, useState, type DragEvent, type RefObject } from 'react';
import type { Folder } from '@whisperall/api-client';
import { setDraggedFolderId } from '../../lib/note-dnd';
import type { FolderTreeNode } from '../../lib/folder-tree';

export type FolderTreeContext = {
  selectedFolderId: string | null;
  collapsedIds: Set<string>;
  editingId: string | null;
  editName: string;
  editRef: RefObject<HTMLInputElement>;
  countById: Record<string, number>;
  noteDropTargetId: string | null;
  folderDropTargetId: string | null;
  draggingFolderId: string | null;
  labels: {
    deleteFolder: string;
    renameFolder: string;
    renameHint: string;
    newSubfolder: string;
    folderActions: string;
    dragFolder: string;
  };
  onSelectFolder: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onStartRename: (folder: Folder) => void;
  onSetEditName: (name: string) => void;
  onCommitRename: (id: string) => void;
  onCancelRename: () => void;
  onCreateSubfolder: (parentId: string) => void;
  onToggleCollapse: (id: string) => void;
  onSetNoteDropTarget: (id: string | null) => void;
  onSetFolderDropTarget: (id: string | null) => void;
  readDraggedNoteIds: (dataTransfer: DataTransfer | null) => string[];
  readDraggedFolderId: (dataTransfer: DataTransfer | null) => string | null;
  canDropFolder: (draggedFolderId: string, targetFolderId: string) => boolean;
  onDropNotesToFolder: (folderId: string | null, noteIds: string[]) => void;
  onDropFolderToFolder: (targetParentId: string, draggedFolderId: string) => void;
  onFolderDragStart: (folderId: string) => void;
  onFolderDragEnd: () => void;
};

type Props = { node: FolderTreeNode; depth: number; ctx: FolderTreeContext };

function FolderActions({ folder, ctx }: { folder: Folder; ctx: FolderTreeContext }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="relative flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <button
        type="button"
        draggable
        onDragStart={(event) => { event.stopPropagation(); ctx.onFolderDragStart(folder.id); setDraggedFolderId(event.dataTransfer, folder.id); }}
        onDragEnd={ctx.onFolderDragEnd}
        className="grid h-7 w-7 cursor-grab place-items-center rounded text-muted/70 transition-colors hover:bg-surface-alt hover:text-primary active:cursor-grabbing"
        data-testid={`folder-drag-${folder.id}`}
        title={ctx.labels.dragFolder}
        aria-label={ctx.labels.dragFolder}
      >
        <span className="material-symbols-outlined text-[14px]">drag_indicator</span>
      </button>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); setOpen((prev) => !prev); }}
        className="grid h-7 w-7 place-items-center rounded text-muted transition-colors hover:bg-surface-alt hover:text-text"
        title={ctx.labels.folderActions}
        aria-label={ctx.labels.folderActions}
        data-testid={`folder-actions-${folder.id}`}
      >
        <span className="material-symbols-outlined text-[16px]">more_horiz</span>
      </button>
      {open && (
        <div ref={menuRef} className="absolute right-0 top-8 z-30 min-w-[150px] rounded-lg border border-edge bg-surface p-1 shadow-xl" role="menu">
          <button
            type="button"
            onClick={() => { ctx.onStartRename(folder); setOpen(false); }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-text hover:bg-surface-alt"
          >
            <span className="material-symbols-outlined text-[14px]">edit</span>{ctx.labels.renameFolder}
          </button>
          <button
            type="button"
            onClick={() => { ctx.onCreateSubfolder(folder.id); setOpen(false); }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-text hover:bg-surface-alt"
          >
            <span className="material-symbols-outlined text-[14px]">create_new_folder</span>{ctx.labels.newSubfolder}
          </button>
          <button
            type="button"
            onClick={() => { ctx.onDeleteFolder(folder.id); setOpen(false); }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-red-300 hover:bg-red-500/10"
          >
            <span className="material-symbols-outlined text-[14px]">delete</span>{ctx.labels.deleteFolder}
          </button>
        </div>
      )}
    </div>
  );
}

export function FolderTreeRow({ node, depth, ctx }: Props) {
  const { folder, children } = node;
  const hasChildren = children.length > 0;
  const isCollapsed = ctx.collapsedIds.has(folder.id);
  const isSelected = ctx.selectedFolderId === folder.id;
  const isNoteDropTarget = ctx.noteDropTargetId === folder.id;
  const isFolderDropTarget = ctx.folderDropTargetId === folder.id;
  const isDraggingFolder = ctx.draggingFolderId === folder.id;
  const count = ctx.countById[folder.id] ?? 0;
  const rowHighlight = isFolderDropTarget ? 'bg-primary/14 ring-1 ring-primary/50' : isNoteDropTarget ? 'bg-primary/8 ring-1 ring-primary/30' : '';

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    const draggedFolderId = ctx.readDraggedFolderId(event.dataTransfer);
    if (draggedFolderId) {
      if (!ctx.canDropFolder(draggedFolderId, folder.id)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (!isFolderDropTarget) ctx.onSetFolderDropTarget(folder.id);
      if (ctx.noteDropTargetId) ctx.onSetNoteDropTarget(null);
      return;
    }
    const noteIds = ctx.readDraggedNoteIds(event.dataTransfer);
    if (noteIds.length === 0) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (!isNoteDropTarget) ctx.onSetNoteDropTarget(folder.id);
    if (ctx.folderDropTargetId) ctx.onSetFolderDropTarget(null);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    if (isNoteDropTarget) ctx.onSetNoteDropTarget(null);
    if (isFolderDropTarget) ctx.onSetFolderDropTarget(null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const draggedFolderId = ctx.readDraggedFolderId(event.dataTransfer);
    if (draggedFolderId) {
      if (!ctx.canDropFolder(draggedFolderId, folder.id)) return;
      event.preventDefault();
      ctx.onDropFolderToFolder(folder.id, draggedFolderId);
      return;
    }
    const noteIds = ctx.readDraggedNoteIds(event.dataTransfer);
    if (noteIds.length === 0) return;
    event.preventDefault();
    ctx.onDropNotesToFolder(folder.id, noteIds);
  };

  if (ctx.editingId === folder.id) {
    return (
      <div style={{ paddingLeft: depth * 14 + 6 }}>
        <input
          ref={ctx.editRef}
          value={ctx.editName}
          onChange={(e) => ctx.onSetEditName(e.target.value)}
          onBlur={() => ctx.onCommitRename(folder.id)}
          onKeyDown={(e) => { if (e.key === 'Enter') ctx.onCommitRename(folder.id); if (e.key === 'Escape') ctx.onCancelRename(); }}
          className="h-8 w-full rounded-lg border border-primary bg-surface px-3 text-sm text-text outline-none"
          data-testid={`folder-edit-${folder.id}`}
        />
      </div>
    );
  }

  return (
    <>
      <div
        className={`group flex items-center gap-1 rounded-lg px-1 py-0.5 transition-all duration-150 ${rowHighlight}`}
        style={{ paddingLeft: depth * 14 + 4 }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid={`folder-drop-${folder.id}`}
      >
        <button
          type="button"
          onClick={() => { if (hasChildren) ctx.onToggleCollapse(folder.id); }}
          disabled={!hasChildren}
          className="grid h-6 w-6 place-items-center rounded text-muted transition-colors hover:bg-surface-alt hover:text-text disabled:text-muted/30 disabled:hover:bg-transparent"
        >
          <span className={`material-symbols-outlined text-[15px] transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}>chevron_right</span>
        </button>
        <button
          type="button"
          onClick={() => ctx.onSelectFolder(folder.id)}
          onDoubleClick={() => ctx.onStartRename(folder)}
          className={`flex min-w-0 flex-1 items-center justify-between rounded-md border px-2 py-1.5 text-left text-sm transition-all ${isSelected ? 'border-primary/45 bg-primary/12 text-text' : 'border-edge/60 bg-surface/60 text-text/90 hover:border-primary/30 hover:text-text'} ${isDraggingFolder ? 'opacity-60' : ''}`}
          title={ctx.labels.renameHint}
          data-testid={`folder-chip-${folder.id}`}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className={`material-symbols-outlined text-[15px] ${isSelected ? 'text-primary' : 'text-muted'}`}>{hasChildren && !isCollapsed ? 'folder_open' : 'folder'}</span>
            <span className="truncate">{folder.name}</span>
          </span>
          <span className="ml-2 shrink-0 text-[11px] text-muted">{count}</span>
        </button>
        <FolderActions folder={folder} ctx={ctx} />
      </div>
      {hasChildren && (
        <div className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[1200px] opacity-100'}`}>
          <div className="space-y-0.5 py-0.5">
            {children.map((child) => <FolderTreeRow key={child.folder.id} node={child} depth={depth + 1} ctx={ctx} />)}
          </div>
        </div>
      )}
    </>
  );
}

