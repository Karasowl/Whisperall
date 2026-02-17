import { useEffect, useRef } from 'react';
import { useT } from '../../lib/i18n';

export type ReaderLibraryItem = {
  id: string;
  title: string;
  text: string;
  createdAt: number;
  updatedAt: number;
};

type Props = {
  items: ReaderLibraryItem[];
  currentId: string | null;
  hasText: boolean;
  onNew: () => void;
  onSave: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

export function ReaderLibrary({ items, currentId, hasText, onNew, onSave, onSelect, onDelete, onClose }: Props) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute right-8 top-full mt-2 w-80 max-h-[420px] bg-surface border border-edge rounded-xl shadow-xl z-30 flex flex-col" data-testid="reader-library">
      <div className="shrink-0 px-4 py-3 border-b border-edge flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">{t('reader.library')}</p>
          <p className="text-[11px] text-muted truncate">{t('reader.libraryHint')}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onNew} title={t('reader.new')} data-testid="reader-library-new"
            className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-surface-alt transition-colors">
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
          <button type="button" onClick={onSave} disabled={!hasText} title={t('reader.save')} data-testid="reader-library-save"
            className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-surface-alt transition-colors disabled:opacity-40">
            <span className="material-symbols-outlined text-[18px]">save</span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center px-4 py-8">
            <span className="material-symbols-outlined text-muted text-[32px]">library_books</span>
            <p className="mt-2 text-sm text-text-secondary font-medium">{t('reader.libraryEmpty')}</p>
            <p className="mt-1 text-[11px] text-muted">{t('reader.libraryHint')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-1 group">
                <button type="button" onClick={() => { onSelect(it.id); onClose(); }} title={it.title} data-testid="reader-library-item"
                  className={`flex-1 min-w-0 text-left px-3 py-2 rounded-lg text-sm transition-colors truncate ${
                    currentId === it.id ? 'bg-primary/15 text-primary font-medium' : 'text-text-secondary hover:bg-surface-alt hover:text-text'
                  }`}>
                  {it.title}
                </button>
                <button type="button" onClick={() => onDelete(it.id)} title={t('reader.delete')} data-testid="reader-library-delete"
                  className="p-1.5 rounded-lg text-muted opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all shrink-0">
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
