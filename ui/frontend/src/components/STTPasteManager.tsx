'use client';

import { useEffect } from 'react';
import { getLastSttTranscript, insertTextAtCursor } from '@/lib/sttHelper';

export function STTPasteManager() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Alt+Shift+S inserts the last STT transcript at the cursor
      if (
        event.altKey &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.code === 'KeyS'
      ) {
        event.preventDefault();
        const text = getLastSttTranscript();
        if (!text) return;
        insertTextAtCursor(text);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return null;
}
