import { useEffect, useRef, useState } from 'react';
import type { Document } from '@whisperall/api-client';
import { useT } from '../../lib/i18n';
import { useFoldersStore } from '../../stores/folders';

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
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editingId && editRef.current) editRef.current.focus(); }, [editingId]);
  const docCount = (fid: string) => documents.filter((d) => d.folder_id === fid).length;
  const humanizeFolderError = (msg: string) => {
    const low = msg.toLowerCase();
    return low.includes('pgrst205') || low.includes('public.folders') || low.includes('folders are unavailable')
      ? t('folders.unavailable')
      : t('folders.createError');
  };

  const handleNew = async () => {
    setCreateError('');
    setCreating(true);
    try {
      const folder = await createFolder(t('folders.untitled'));
      setEditingId(folder.id);
      setEditName(folder.name);
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

  const base = 'h-10 px-4 rounded-full text-sm font-medium transition-all shrink-0 inline-flex items-center gap-1.5';
  const active = 'bg-primary/14 text-primary border border-primary/30 shadow-[inset_0_0_0_1px_rgba(19,127,236,0.08)]';
  const inactive = 'bg-surface border border-edge text-text/85 hover:text-text hover:border-primary/35';

  return (
    <div className="py-1" data-testid="folder-chips">
      <div className="flex items-center gap-2 overflow-x-auto">
        <button onClick={() => onSelectFolder(null)} className={`${base} ${selectedFolderId === null ? active : inactive}`} data-testid="folder-chip-all">
          {t('folders.allNotes')} <span className="opacity-60">{documents.length}</span>
        </button>
        {folders.map((f) => {
          const isSelected = selectedFolderId === f.id;
          if (editingId === f.id) {
            return (
              <input key={f.id} ref={editRef} value={editName} onChange={(e) => setEditName(e.target.value)}
                onBlur={() => commitRename(f.id)} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(f.id); if (e.key === 'Escape') setEditingId(null); }}
                className="h-10 px-4 rounded-full text-sm bg-surface border border-primary outline-none text-text w-36"
                data-testid={`folder-edit-${f.id}`} />
            );
          }
          return (
            <div key={f.id} className="relative shrink-0">
              <button onClick={() => onSelectFolder(f.id)} onDoubleClick={() => { setEditingId(f.id); setEditName(f.name); }}
                className={`${base} ${isSelected ? `${active} pr-9` : inactive}`} data-testid={`folder-chip-${f.id}`} title={t('folders.doubleClickRename')}>
                {f.name} <span className="opacity-60">{docCount(f.id)}</span>
              </button>
              {isSelected && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onDeleteFolder(f.id); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted hover:text-text hover:bg-surface"
                  title={t('folders.delete')} data-testid={`folder-delete-${f.id}`}>
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              )}
            </div>
          );
        })}
        <button onClick={handleNew} disabled={creating} className={`${base} border-dashed text-primary/85 hover:text-primary ${inactive} disabled:opacity-50`} data-testid="folder-new-btn" title={t('folders.new')} aria-label={t('folders.new')}>
          <span className="material-symbols-outlined text-[16px]">add</span>
          <span>{t('folders.new')}</span>
        </button>
      </div>
      {createError && <p className="text-xs text-red-400 mt-1.5">{createError}</p>}
    </div>
  );
}
