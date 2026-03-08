import { create } from 'zustand';

export type NotifTone = 'success' | 'error' | 'info';

export type Notification = {
  id: string;
  tone: NotifTone;
  message: string;
  timestamp: number;
  read: boolean;
};

type NotificationsState = {
  items: Notification[];
  push: (message: string, tone: NotifTone) => void;
  dismiss: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
};

let _seq = 0;

export const useNotificationsStore = create<NotificationsState>((set) => ({
  items: [],
  push: (message, tone) => {
    const id = `n-${Date.now()}-${++_seq}`;
    set((s) => ({ items: [{ id, tone, message, timestamp: Date.now(), read: false }, ...s.items].slice(0, 50) }));
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
  markAllRead: () => set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) })),
  clear: () => set({ items: [] }),
}));
