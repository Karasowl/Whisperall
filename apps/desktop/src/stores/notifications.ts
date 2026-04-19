import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotifTone = 'success' | 'error' | 'info' | 'warning' | 'debug';
export type NotifSource = 'renderer' | 'backend' | 'electron' | 'network' | 'unknown';

export type Notification = {
  id: string;
  tone: NotifTone;
  message: string;
  detail?: string;
  source?: NotifSource;
  context?: string;
  timestamp: number;
  read: boolean;
};

export type PushInput =
  | string
  | {
      message: string;
      detail?: string;
      source?: NotifSource;
      context?: string;
    };

type State = {
  items: Notification[];
  push: (input: PushInput, tone: NotifTone) => void;
  pushError: (input: PushInput, error?: unknown) => void;
  dismiss: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
};

function serializeError(e: unknown): string | undefined {
  if (!e) return undefined;
  if (e instanceof Error) {
    const parts = [e.name, e.message].filter(Boolean).join(': ');
    return e.stack ? `${parts}\n${e.stack}` : parts;
  }
  try { return typeof e === 'string' ? e : JSON.stringify(e, null, 2); }
  catch { return String(e); }
}

let _seq = 0;
function nextId() { return `n-${Date.now()}-${++_seq}`; }

function normalize(input: PushInput, tone: NotifTone): Notification {
  const base = typeof input === 'string' ? { message: input } : input;
  return {
    id: nextId(),
    tone,
    message: base.message,
    detail: base.detail,
    source: base.source ?? 'renderer',
    context: base.context,
    timestamp: Date.now(),
    read: false,
  };
}

export const useNotificationsStore = create<State>()(
  persist(
    (set, get) => ({
      items: [],
      push: (input, tone) => set((s) => ({ items: [normalize(input, tone), ...s.items].slice(0, 500) })),
      pushError: (input, error) => {
        const base = typeof input === 'string' ? { message: input } : input;
        const detail = base.detail ?? serializeError(error);
        get().push({ ...base, detail }, 'error');
      },
      dismiss: (id) => set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
      markAllRead: () => set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'whisperall-logs', version: 2, partialize: (s) => ({ items: s.items.slice(0, 200) }) }
  )
);

export function reportError(context: string, error: unknown, extra?: Partial<{ source: NotifSource; message: string }>) {
  const msg = extra?.message ?? (error instanceof Error ? error.message : String(error ?? 'Unknown error'));
  useNotificationsStore.getState().pushError({ message: `[${context}] ${msg}`, context, source: extra?.source ?? 'renderer' }, error);
}
