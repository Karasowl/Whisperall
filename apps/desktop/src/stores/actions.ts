import { create } from 'zustand';

export type ActionKind = 'mic' | 'live' | 'transcribe' | 'tts' | 'tts-read' | 'ai-edit' | 'upload';
export type ActionStatus = 'starting' | 'running' | 'paused' | 'finishing' | 'completed' | 'failed' | 'canceled';

export type ActionInstance = {
  id: string;
  kind: ActionKind;
  status: ActionStatus;
  label: string;
  sublabel?: string;
  progress?: number;          // 0..1; undefined = indeterminate
  startedAt: number;
  updatedAt: number;
  error?: string;
  canPause: boolean;
  canResume: boolean;
  canStop: boolean;
  canCancel: boolean;
  pause?: () => void | Promise<void>;
  resume?: () => void | Promise<void>;
  stop?: () => void | Promise<void>;
  cancel?: () => void | Promise<void>;
  preview?: { text?: string; timer?: number };
  // When set, clicking the pill navigates the renderer to the owning context.
  navigate?: () => void;
};

export type ActionInput = Omit<ActionInstance, 'startedAt' | 'updatedAt'> & {
  startedAt?: number;
};

type ActionsState = {
  items: Record<string, ActionInstance>;
  order: string[];
  register: (input: ActionInput) => string;
  update: (id: string, patch: Partial<ActionInstance>) => void;
  remove: (id: string) => void;
  clearCompleted: () => void;
  list: () => ActionInstance[];
};

const TERMINAL: ActionStatus[] = ['completed', 'failed', 'canceled'];

export const useActionsStore = create<ActionsState>((set, get) => ({
  items: {},
  order: [],

  register: (input) => {
    const now = Date.now();
    const instance: ActionInstance = {
      ...input,
      startedAt: input.startedAt ?? now,
      updatedAt: now,
    };
    set((s) => ({
      items: { ...s.items, [instance.id]: instance },
      order: s.order.includes(instance.id) ? s.order : [...s.order, instance.id],
    }));
    return instance.id;
  },

  update: (id, patch) => {
    set((s) => {
      const current = s.items[id];
      if (!current) return s;
      return {
        items: {
          ...s.items,
          [id]: { ...current, ...patch, updatedAt: Date.now() },
        },
      };
    });
    const next = get().items[id];
    // Auto-remove terminal actions after a short grace window so the pill
    // flashes completion then disappears without manual cleanup.
    if (next && TERMINAL.includes(next.status)) {
      const delay = next.status === 'failed' ? 8000 : 2500;
      setTimeout(() => {
        const live = get().items[id];
        if (live && TERMINAL.includes(live.status)) get().remove(id);
      }, delay);
    }
  },

  remove: (id) => set((s) => {
    if (!s.items[id]) return s;
    const { [id]: _drop, ...rest } = s.items;
    return { items: rest, order: s.order.filter((x) => x !== id) };
  }),

  clearCompleted: () => set((s) => {
    const keep: Record<string, ActionInstance> = {};
    const order: string[] = [];
    for (const id of s.order) {
      const item = s.items[id];
      if (item && !TERMINAL.includes(item.status)) {
        keep[id] = item;
        order.push(id);
      }
    }
    return { items: keep, order };
  }),

  list: () => {
    const { items, order } = get();
    return order.map((id) => items[id]).filter(Boolean);
  },
}));

// Convenience wrappers used by callers that already own their side effects.
export function startAction(input: ActionInput): string {
  return useActionsStore.getState().register(input);
}
export function updateAction(id: string, patch: Partial<ActionInstance>): void {
  useActionsStore.getState().update(id, patch);
}
export function endAction(id: string, outcome: 'completed' | 'failed' | 'canceled' = 'completed', error?: string): void {
  useActionsStore.getState().update(id, { status: outcome, error, progress: outcome === 'completed' ? 1 : undefined });
}
