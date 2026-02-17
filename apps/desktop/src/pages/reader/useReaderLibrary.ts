import { useCallback, useEffect, useMemo, useState } from 'react';

export type ReaderLibraryItem = {
  id: string;
  title: string;
  text: string;
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = 'whisperall-reader-library-v1';
const MAX_ITEMS = 50;

function safeParse(): ReaderLibraryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.id === 'string' && typeof x.text === 'string')
      .map((x) => ({
        id: String(x.id),
        title: typeof x.title === 'string' ? x.title : 'Untitled',
        text: String(x.text),
        createdAt: Number.isFinite(x.createdAt) ? x.createdAt : Date.now(),
        updatedAt: Number.isFinite(x.updatedAt) ? x.updatedAt : Date.now(),
      }))
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function persist(items: ReaderLibraryItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch { /* ignore */ }
}

function makeTitle(text: string): string {
  const firstLine = (text || '').split('\n').map((l) => l.trim()).find((l) => l) ?? '';
  const base = firstLine || (text || '').trim().slice(0, 80);
  return (base || 'Untitled').slice(0, 64);
}

function uid(): string {
  return `r_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function useReaderLibrary(opts: {
  text: string;
  setText: (v: string) => void;
  stop: () => void;
}) {
  const [items, setItems] = useState<ReaderLibraryItem[]>(() => safeParse());
  const [currentId, setCurrentId] = useState<string | null>(null);

  useEffect(() => {
    persist(items);
  }, [items]);

  const current = useMemo(
    () => items.find((it) => it.id === currentId) ?? null,
    [currentId, items],
  );

  const newDoc = useCallback(() => {
    opts.stop();
    setCurrentId(null);
    opts.setText('');
  }, [opts]);

  const saveDoc = useCallback(() => {
    const txt = opts.text.trim();
    if (!txt) return;
    const now = Date.now();
    const hasCurrent = !!currentId && items.some((it) => it.id === currentId);
    const newId = hasCurrent ? null : uid();
    if (newId) setCurrentId(newId);
    setItems((prev) => {
      const next = [...prev];
      const idx = currentId ? next.findIndex((x) => x.id === currentId) : -1;
      if (idx >= 0) {
        const prevItem = next[idx];
        next.splice(idx, 1);
        next.unshift({ ...prevItem, title: makeTitle(opts.text), text: opts.text, updatedAt: now });
        return next.slice(0, MAX_ITEMS);
      }
      const item: ReaderLibraryItem = {
        id: newId ?? uid(),
        title: makeTitle(opts.text),
        text: opts.text,
        createdAt: now,
        updatedAt: now,
      };
      return [item, ...next].slice(0, MAX_ITEMS);
    });
  }, [currentId, items, opts]);

  const selectDoc = useCallback((id: string) => {
    const doc = items.find((it) => it.id === id);
    if (!doc) return;
    opts.stop();
    setCurrentId(id);
    opts.setText(doc.text);
  }, [items, opts]);

  const deleteDoc = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    if (currentId === id) setCurrentId(null);
  }, [currentId]);

  return {
    items,
    currentId,
    current,
    newDoc,
    saveDoc,
    selectDoc,
    deleteDoc,
  };
}
