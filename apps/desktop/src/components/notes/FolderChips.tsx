import { useState, useRef, useEffect } from 'react';
import { useFoldersStore } from '../../stores/folders';
import { useT } from '../../lib/i18n';
import type { Document } from '@whisperall/api-client';

type Props = {
  documents: Document[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onDeleteFolder: (id: string) => void;
};

export function FolderChips({ documents, selectedFolderId, onSelectFolder, onDeleteFolder }: Props) {
  const t = useT();
  const { folders, createFolder, renameFolder } = useFoldersStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

  const docCount = (fid: string) => documents.filter((d) => d.folder_id === fid).length;

  const handleNew = async () => {
    const folder = await createFolder(t('folders.untitled'));
    setEditingId(folder.id);
    setEditName(folder.name);
  };

  const commitRename = async (id: string) => {
    const trimmed = editName.trim();
    if (trimmed) await renameFolder(id, trimmed);
    setEditingId(null);
  };

  const base = 'px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0';
  const active = 'bg-primary/15 text-primary';
  const inactive = 'bg-surface border border-edge text-muted hover:text-text hover:border-primary/30';

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-1" data-testid="folder-chips">
      <button onClick={() => onSelectFolder(null)} className={`${base} ${selectedFolderId === null ? active : inactive}`} data-testid="folder-chip-all">
        {t('folders.allNotes')} <span className="opacity-60 ml-0.5">{documents.length}</span>
      </button>
      {folders.map((f) =>
        editingId === f.id ? (
          <input key={f.id} ref={editRef} value={editName} onChange={(e) => setEditName(e.target.value)}
            onBlur={() => commitRename(f.id)} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(f.id); if (e.key === 'Escape') setEditingId(null); }}
            className="px-3 py-1 rounded-full text-xs bg-surface border border-primary outline-none text-text w-28"
            data-testid={`folder-edit-${f.id}`} />
        ) : (
          <div key={f.id} className="relative group flex items-center shrink-0">
            <button onClick={() => onSelectFolder(f.id)} onDoubleClick={() => { setEditingId(f.id); setEditName(f.name); }}
              className={`${base} pr-7 ${selectedFolderId === f.id ? active : inactive}`} data-testid={`folder-chip-${f.id}`}>
              {f.name} <span className="opacity-60 ml-0.5">{docCount(f.id)}</span>
            </button>
            <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-0.5">
              <button onClick={(e) => { e.stopPropagation(); setEditingId(f.id); setEditName(f.name); }}
                className="p-0.5 rounded text-muted hover:text-text" title={t('folders.rename')}>
                <span className="material-symbols-outlined text-[12px]">edit</span>
              </button>
              <button onClick={(e) => { e.stopPropagation(); onDeleteFolder(f.id); }}
                className="p-0.5 rounded text-muted hover:text-red-400" title={t('folders.delete')}>
                <span className="material-symbols-outlined text-[12px]">delete</span>
              </button>
            </div>
          </div>
        ),
      )}
      <button onClick={handleNew} className={`${base} ${inactive} flex items-center gap-1`} data-testid="folder-new-btn" title={t('folders.new')}>
        <span className="material-symbols-outlined text-[14px]">add</span>
      </button>
    </div>
  );
}
