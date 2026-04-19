import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Folder } from '@whisperall/api-client';

type Props = {
  currentFolderId: string | null;
  folders: Folder[];
  onChange: (folderId: string | null) => void;
  onClose?: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  /** Where to anchor the menu. `bottom-right` aligns the menu's
   *  top-right edge to the trigger's bottom-right. Clamped to viewport. */
  anchor?: 'bottom-right' | 'bottom-left';
  rootLabel?: string;
  duplicateLabel?: string;
};

/**
 * Custom folder picker used on note cards.
 *
 * Replaces the native `<select>` for three reasons:
 *   1. Native selects carry OS-specific styling that clashes with the
 *      warm-stone / ElevenLabs grammar.
 *   2. The native dropdown renders on top of other cards and clips to
 *      the card's DOM bounds — portal lets us escape.
 *   3. Native selects can't disambiguate folders with duplicate names
 *      ("Untitled" × 2). Here we suffix a short id fragment when the
 *      name is not unique.
 *
 * Rendered through `createPortal(document.body)` with fixed positioning
 * computed from the trigger's bounding rect. Closes on outside click,
 * Escape, or folder pick.
 */
export function FolderPicker({
  currentFolderId,
  folders,
  onChange,
  onClose,
  triggerRef,
  anchor = 'bottom-right',
  rootLabel = 'No folder',
  duplicateLabel,
}: Props) {
  void duplicateLabel; // reserved for future Spanish / locale variants
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const recompute = () => {
      const rect = trigger.getBoundingClientRect();
      const MENU_W = 220;
      const MENU_MAX_H = 280;
      const MARGIN = 8;
      let left = anchor === 'bottom-right' ? rect.right - MENU_W : rect.left;
      const maxLeft = window.innerWidth - MENU_W - MARGIN;
      if (left > maxLeft) left = maxLeft;
      if (left < MARGIN) left = MARGIN;
      // Prefer below. If not enough room, flip above.
      let top = rect.bottom + 4;
      const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
      const measured = menuRef.current?.getBoundingClientRect().height;
      const h = measured && measured > 0 ? measured : MENU_MAX_H;
      if (spaceBelow < h) top = rect.top - h - 4;
      if (top < MARGIN) top = MARGIN;
      setPos({ top, left });
    };
    recompute();
    const raf = requestAnimationFrame(recompute);
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [triggerRef, anchor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose?.();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, triggerRef]);

  if (!pos) return null;

  // Disambiguate folders with duplicate names by appending a short id.
  const nameCounts = new Map<string, number>();
  for (const f of folders) nameCounts.set(f.name, (nameCounts.get(f.name) ?? 0) + 1);
  const displayName = (f: Folder) =>
    (nameCounts.get(f.name) ?? 0) > 1 ? `${f.name} · ${f.id.slice(0, 6)}` : f.name;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[300] w-[220px] max-h-[280px] overflow-y-auto rounded-xl border border-edge bg-[#1a2230] shadow-2xl py-1 text-sm"
      style={{ top: pos.top, left: pos.left }}
      data-testid="folder-picker"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => { onChange(null); onClose?.(); }}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${currentFolderId === null ? 'text-primary bg-primary/10' : 'text-text hover:bg-surface-alt'}`}
        data-testid="folder-picker-root"
      >
        <span className="material-symbols-outlined text-[16px] text-muted">folder_off</span>
        <span className="flex-1 truncate">{rootLabel}</span>
        {currentFolderId === null && <span className="material-symbols-outlined text-[16px] text-primary">check</span>}
      </button>
      {folders.length > 0 && <div className="border-t border-edge/60 my-1" />}
      {folders.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => { onChange(f.id); onClose?.(); }}
          className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${currentFolderId === f.id ? 'text-primary bg-primary/10' : 'text-text hover:bg-surface-alt'}`}
          data-testid={`folder-picker-${f.id}`}
        >
          <span className="material-symbols-outlined text-[16px] text-muted">folder</span>
          <span className="flex-1 truncate">{displayName(f)}</span>
          {currentFolderId === f.id && <span className="material-symbols-outlined text-[16px] text-primary">check</span>}
        </button>
      ))}
    </div>,
    document.body,
  );
}
