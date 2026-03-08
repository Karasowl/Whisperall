const NOTE_DRAG_MIME = 'application/x-whisperall-note-ids';
const FOLDER_DRAG_MIME = 'application/x-whisperall-folder-id';

function uniqueNoteIds(noteIds: string[]): string[] {
  return Array.from(new Set(noteIds.map((id) => id.trim()).filter(Boolean)));
}

export function setDraggedNoteIds(dataTransfer: DataTransfer | null, noteIds: string[]): void {
  if (!dataTransfer) return;
  const ids = uniqueNoteIds(noteIds);
  if (ids.length === 0) return;
  dataTransfer.effectAllowed = 'move';
  dataTransfer.setData(NOTE_DRAG_MIME, JSON.stringify(ids));
  dataTransfer.setData('text/plain', ids.join(','));
}

export function getDraggedNoteIds(dataTransfer: DataTransfer | null): string[] {
  if (!dataTransfer) return [];

  const raw = dataTransfer.getData(NOTE_DRAG_MIME);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return uniqueNoteIds(parsed.filter((value): value is string => typeof value === 'string'));
      }
    } catch {
      return [];
    }
  }

  const textRaw = dataTransfer.getData('text/plain');
  if (!textRaw) return [];
  return uniqueNoteIds(textRaw.split(',').filter((id) => !id.startsWith('folder:')));
}

export function setDraggedFolderId(dataTransfer: DataTransfer | null, folderId: string): void {
  if (!dataTransfer) return;
  const id = folderId.trim();
  if (!id) return;
  dataTransfer.effectAllowed = 'move';
  dataTransfer.setData(FOLDER_DRAG_MIME, id);
}

export function getDraggedFolderId(dataTransfer: DataTransfer | null): string | null {
  if (!dataTransfer) return null;
  const id = dataTransfer.getData(FOLDER_DRAG_MIME).trim();
  return id || null;
}
