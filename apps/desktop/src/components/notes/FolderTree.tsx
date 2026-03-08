import { useEffect, useRef, useState } from 'react';
import type { Document } from '@whisperall/api-client';
import { useFoldersStore, buildTree, getDescendantIds, type FolderNode } from '../../stores/folders';
import { useT } from '../../lib/i18n';

type Props = {
  documents: Document[];
  onDeleteFolder: (id: string) => void;
};

function FolderRow({ node, depth, documents, onDelete }: {
  node: FolderNode; depth: number; documents: Document[]; onDelete: (id: string) => void;
}) {
  const t = useT();
  const { folders, selectedFolderId, expandedIds, selectFolder, toggleExpand, renameFolder } = useFoldersStore();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing && editRef.current) editRef.current.focus(); }, [editing]);

  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(node.id);
  const selected = selectedFolderId === node.id;
  const descendantIds = getDescendantIds(folders, node.id);
  const count = documents.filter((d) => d.folder_id && descendantIds.includes(d.folder_id)).length;

  const commitRename = async () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== node.name) {
      try { await renameFolder(node.id, trimmed); } catch { /* store sets error */ }
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center h-9 rounded-lg px-2 bg-surface border border-primary" style={{ paddingLeft: `${depth * 20 + 8}px` }}>
        <input ref={editRef} value={editName} onChange={(e) => setEditName(e.target.value)}
          onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false); }}
          className="flex-1 bg-transparent text-sm text-text outline-none" data-testid={`folder-edit-${node.id}`} />
      </div>
    );
  }

  return (
    <>
      <div
        className={`group flex items-center h-9 rounded-lg cursor-pointer transition-colors relative ${selected ? 'bg-primary/10 text-primary' : 'text-text/85 hover:bg-surface'}`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => selectFolder(node.id)}
        onDoubleClick={() => { setEditing(true); setEditName(node.name); }}
        data-testid={`folder-row-${node.id}`}
      >
        <button
          className={`w-5 h-5 grid place-items-center shrink-0 ${hasChildren ? 'text-muted hover:text-text' : 'invisible'}`}
          onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
          data-testid={`folder-toggle-${node.id}`}
        >
          <span className="material-symbols-outlined text-[18px]">{expanded ? 'expand_more' : 'chevron_right'}</span>
        </button>
        <span className={`material-symbols-outlined text-[18px] mr-2 ${selected ? 'fill-1 text-primary' : 'text-muted'}`}>
          {expanded && hasChildren ? 'folder_open' : 'folder'}
        </span>
        <span className={`flex-1 text-sm truncate ${selected ? 'font-semibold' : 'font-medium'}`}>{node.name}</span>
        <span className="text-xs text-muted/60 mr-1 tabular-nums">{count || ''}</span>
        <button
          className="w-6 h-6 grid place-items-center rounded text-muted hover:text-text opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          data-testid={`folder-menu-${node.id}`}
        >
          <span className="material-symbols-outlined text-[16px]">more_horiz</span>
        </button>
        {showMenu && (
          <div className="absolute right-0 top-full mt-0.5 bg-surface border border-edge rounded-lg shadow-xl py-1 z-50 min-w-[120px]" data-testid={`folder-dropdown-${node.id}`}>
            <button className="w-full px-3 py-1.5 text-xs text-left text-text hover:bg-surface-alt" onClick={(e) => { e.stopPropagation(); setShowMenu(false); setEditing(true); setEditName(node.name); }}>
              {t('folders.rename')}
            </button>
            <button className="w-full px-3 py-1.5 text-xs text-left text-red-400 hover:bg-surface-alt" onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete(node.id); }}>
              {t('folders.delete')}
            </button>
          </div>
        )}
      </div>
      {expanded && node.children.map((child: FolderNode) => (
        <FolderRow key={child.id} node={child} depth={depth + 1} documents={documents} onDelete={onDelete} />
      ))}
    </>
  );
}

export function FolderTree({ documents, onDeleteFolder }: Props) {
  const t = useT();
  const { folders, selectedFolderId, selectFolder } = useFoldersStore();
  const tree = buildTree(folders);

  return (
    <div className="flex flex-col gap-0.5 overflow-y-auto" data-testid="folder-tree">
      <div
        className={`flex items-center h-9 rounded-lg px-2 cursor-pointer transition-colors ${selectedFolderId === null ? 'bg-primary/10 text-primary' : 'text-text/85 hover:bg-surface'}`}
        onClick={() => selectFolder(null)}
        data-testid="folder-all-notes"
      >
        <span className={`material-symbols-outlined text-[18px] mr-2 ${selectedFolderId === null ? 'fill-1 text-primary' : 'text-muted'}`}>inbox</span>
        <span className={`flex-1 text-sm ${selectedFolderId === null ? 'font-semibold' : 'font-medium'}`}>{t('folders.allNotes')}</span>
        <span className="text-xs text-muted/60 tabular-nums">{documents.length}</span>
      </div>
      {tree.map((node) => (
        <FolderRow key={node.id} node={node} depth={0} documents={documents} onDelete={onDeleteFolder} />
      ))}
    </div>
  );
}
