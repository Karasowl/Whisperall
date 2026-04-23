import { useEffect, useRef } from 'react';
import { electron } from '../lib/electron';
import { useTranslatorStore } from '../stores/translator';

type Anchor = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const ANCHORS: Anchor[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/**
 * 8-way resize handles. We go through the electron bridge because the
 * Electron window itself is NOT `resizable: true` (that would break
 * transparency on Windows). Instead main.ts's translator-window.ts
 * tracks the anchor + start bounds and calls setBounds() on each move.
 */
export function ResizeHandles(): JSX.Element {
  const setResizing = useTranslatorStore((s) => s.setResizing);
  const activeAnchor = useRef<Anchor | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!activeAnchor.current) return;
      electron?.translator?.resizeMove({ screenX: e.screenX, screenY: e.screenY });
    };
    const onUp = () => {
      if (!activeAnchor.current) return;
      activeAnchor.current = null;
      setResizing(false);
      electron?.translator?.resizeEnd();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setResizing]);

  function onMouseDown(anchor: Anchor) {
    return (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      activeAnchor.current = anchor;
      setResizing(true);
      electron?.translator?.resizeStart({ screenX: e.screenX, screenY: e.screenY, anchor });
    };
  }

  return (
    <>
      {ANCHORS.map((anchor) => (
        <div
          key={anchor}
          className={`translator-handle translator-handle-${anchor}`}
          data-testid={`translator-resize-${anchor}`}
          onMouseDown={onMouseDown(anchor)}
        />
      ))}
    </>
  );
}
