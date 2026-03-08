import { ApiError, type ProcessRecord } from '@whisperall/api-client';
import { create } from 'zustand';
import { api } from '../lib/api';
import { getSupabase } from '../lib/supabase';

export type LocalProcessType = 'note_import' | 'ai_edit' | 'tts_read' | 'transcribe_file';
export type LocalProcessStatus = 'queued' | 'running' | 'paused' | 'failed' | 'completed' | 'canceled';
export type LocalProcess = {
  id: string;
  type: LocalProcessType;
  title: string;
  status: LocalProcessStatus;
  stageLabelKey: string;
  done: number;
  total: number;
  pct: number;
  documentId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

type StartParams = {
  type: LocalProcessType;
  title: string;
  stageLabelKey: string;
  documentId?: string | null;
  total?: number;
};

type LocalProcessState = {
  localProcesses: LocalProcess[];
  hydrate: () => void;
  setRemoteSync: (enabled: boolean) => void;
  syncFromServer: () => Promise<void>;
  start: (params: StartParams) => string;
  setProgress: (id: string, done: number, total?: number, stageLabelKey?: string) => void;
  setStatus: (id: string, status: LocalProcessStatus, stageLabelKey?: string) => void;
  complete: (id: string, stageLabelKey?: string) => void;
  fail: (id: string, error?: string, stageLabelKey?: string) => void;
  remove: (id: string) => void;
};

export const LOCAL_PROCESSES_STORAGE_KEY = 'whisperall-local-processes-v1';
const TERMINAL_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_STORED_PROCESSES = 200;
const LOCAL_PROCESS_TYPES = new Set<LocalProcessType>(['note_import', 'ai_edit', 'tts_read', 'transcribe_file']);
const LOCAL_PROCESS_STATUSES = new Set<LocalProcessStatus>(['queued', 'running', 'paused', 'failed', 'completed', 'canceled']);

let remoteSyncEnabled = false;
let remoteUnavailable = false;
let remoteUnsubscribe: (() => void) | null = null;

function nowIso(): string { return new Date().toISOString(); }
function processId(): string { return `lp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function toTs(value: string | undefined): number {
  const ts = Date.parse(value || '');
  return Number.isFinite(ts) ? ts : 0;
}
function progressPct(done: number, total: number): number {
  if (total <= 0) return 0;
  const bounded = Math.max(0, Math.min(done, total));
  return Math.round((bounded / total) * 100);
}

function hasStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function normalizeStoredProcess(value: unknown): LocalProcess | null {
  const row = value as Partial<LocalProcess> | null;
  if (!row || typeof row !== 'object') return null;
  if (!row.id || !row.type || !row.title || !row.status || !row.stageLabelKey) return null;
  if (!LOCAL_PROCESS_TYPES.has(row.type as LocalProcessType)) return null;
  if (!LOCAL_PROCESS_STATUSES.has(row.status as LocalProcessStatus)) return null;
  return {
    id: String(row.id),
    type: row.type as LocalProcessType,
    title: String(row.title),
    status: row.status as LocalProcessStatus,
    stageLabelKey: String(row.stageLabelKey),
    done: Number.isFinite(row.done) ? Number(row.done) : 0,
    total: Number.isFinite(row.total) ? Math.max(1, Number(row.total)) : 1,
    pct: Number.isFinite(row.pct) ? Number(row.pct) : 0,
    documentId: row.documentId ? String(row.documentId) : null,
    error: row.error ? String(row.error) : null,
    createdAt: row.createdAt ? String(row.createdAt) : nowIso(),
    updatedAt: row.updatedAt ? String(row.updatedAt) : nowIso(),
  };
}

function mapRemoteProcess(row: ProcessRecord): LocalProcess | null {
  if (!LOCAL_PROCESS_TYPES.has(row.process_type as LocalProcessType)) return null;
  if (!LOCAL_PROCESS_STATUSES.has(row.status as LocalProcessStatus)) return null;
  return {
    id: row.id,
    type: row.process_type as LocalProcessType,
    title: row.title,
    status: row.status as LocalProcessStatus,
    stageLabelKey: row.stage_label_key || '',
    done: Math.max(0, Number(row.done) || 0),
    total: Math.max(1, Number(row.total) || 1),
    pct: Math.max(0, Math.min(100, Number(row.pct) || 0)),
    documentId: row.document_id ?? null,
    error: row.error ?? null,
    createdAt: row.created_at || nowIso(),
    updatedAt: row.updated_at || nowIso(),
  };
}

function pruneProcesses(processes: LocalProcess[]): LocalProcess[] {
  const now = Date.now();
  const kept = processes.filter((p) => {
    if (p.status !== 'completed' && p.status !== 'failed' && p.status !== 'canceled') return true;
    const ts = toTs(p.updatedAt || p.createdAt);
    if (!Number.isFinite(ts)) return true;
    return now - ts <= TERMINAL_RETENTION_MS;
  });
  return kept
    .sort((a, b) => toTs(b.updatedAt || b.createdAt) - toTs(a.updatedAt || a.createdAt))
    .slice(0, MAX_STORED_PROCESSES);
}

function persistProcesses(processes: LocalProcess[]): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(LOCAL_PROCESSES_STORAGE_KEY, JSON.stringify(processes));
}

function loadStoredProcesses(): LocalProcess[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_PROCESSES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed.map(normalizeStoredProcess).filter((p): p is LocalProcess => !!p);
    const pruned = pruneProcesses(normalized);
    if (pruned.length !== normalized.length) persistProcesses(pruned);
    return pruned;
  } catch {
    return [];
  }
}

function isRemoteUnavailableError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.status !== 503) return false;
  const low = err.message.toLowerCase();
  return low.includes('processes are unavailable') || low.includes('public.processes');
}

function shouldIgnoreRemoteError(err: unknown): boolean {
  if (isRemoteUnavailableError(err)) {
    remoteUnavailable = true;
    if (remoteUnsubscribe) {
      remoteUnsubscribe();
      remoteUnsubscribe = null;
    }
    return true;
  }
  if (err instanceof ApiError && err.status === 404) {
    // Endpoint not deployed yet on older backends.
    remoteUnavailable = true;
    if (remoteUnsubscribe) {
      remoteUnsubscribe();
      remoteUnsubscribe = null;
    }
    return true;
  }
  if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return true;
  return false;
}

async function upsertRemoteProcess(process: LocalProcess): Promise<void> {
  if (!remoteSyncEnabled || remoteUnavailable) return;
  try {
    await api.processes.upsert(process.id, {
      process_type: process.type,
      title: process.title,
      status: process.status,
      stage_label_key: process.stageLabelKey,
      done: process.done,
      total: process.total,
      pct: process.pct,
      document_id: process.documentId,
      error: process.error,
      completed_at: process.status === 'completed' || process.status === 'failed' || process.status === 'canceled' ? process.updatedAt : null,
    });
  } catch (err) {
    if (shouldIgnoreRemoteError(err)) return;
    console.warn('[processes] upsert remote failed', err);
  }
}

async function deleteRemoteProcess(id: string): Promise<void> {
  if (!remoteSyncEnabled || remoteUnavailable) return;
  try {
    await api.processes.delete(id);
  } catch (err) {
    if (shouldIgnoreRemoteError(err)) return;
    console.warn('[processes] delete remote failed', err);
  }
}

function mergeProcesses(local: LocalProcess[], remoteRows: ProcessRecord[]): LocalProcess[] {
  const byId = new Map<string, LocalProcess>();
  for (const process of local) byId.set(process.id, process);
  for (const row of remoteRows) {
    const mapped = mapRemoteProcess(row);
    if (!mapped) continue;
    const existing = byId.get(mapped.id);
    if (!existing || toTs(mapped.updatedAt) >= toTs(existing.updatedAt)) {
      byId.set(mapped.id, mapped);
    }
  }
  return pruneProcesses(Array.from(byId.values()));
}

function removeProcessById(local: LocalProcess[], processId: string): LocalProcess[] {
  return pruneProcesses(local.filter((p) => p.id !== processId));
}

const initialProcesses = loadStoredProcesses();

export const useProcessesStore = create<LocalProcessState>((set, get) => ({
  localProcesses: initialProcesses,

  hydrate: () => {
    const localProcesses = loadStoredProcesses();
    set({ localProcesses });
    if (remoteSyncEnabled) void get().syncFromServer();
  },

  setRemoteSync: (enabled) => {
    remoteSyncEnabled = enabled;
    if (!enabled) {
      if (remoteUnsubscribe) {
        remoteUnsubscribe();
        remoteUnsubscribe = null;
      }
      return;
    }
    remoteUnavailable = false;
    if (!remoteUnsubscribe) {
      const sb = getSupabase();
      if (sb) {
        const channel = sb
          .channel('processes-updates')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'processes' },
            (payload) => {
              const rawPayload = payload as unknown as { eventType?: string; new?: unknown; old?: { id?: string } };
              const evt = rawPayload.eventType ?? '';
              if (evt === 'DELETE') {
                const removeId = String(rawPayload.old?.id ?? '');
                if (!removeId) return;
                set((s) => {
                  const localProcesses = removeProcessById(s.localProcesses, removeId);
                  persistProcesses(localProcesses);
                  return { localProcesses };
                });
                return;
              }
              const row = rawPayload.new as ProcessRecord | undefined;
              if (!row) return;
              if (!mapRemoteProcess(row)) return;
              set((s) => {
                const localProcesses = mergeProcesses(s.localProcesses, [row]);
                persistProcesses(localProcesses);
                return { localProcesses };
              });
            },
          )
          .subscribe();
        remoteUnsubscribe = () => { sb.removeChannel(channel); };
      }
    }
    void get().syncFromServer();
  },

  syncFromServer: async () => {
    if (!remoteSyncEnabled || remoteUnavailable) return;
    try {
      const rows = await api.processes.list({ limit: MAX_STORED_PROCESSES });
      const localProcesses = mergeProcesses(get().localProcesses, rows);
      persistProcesses(localProcesses);
      set({ localProcesses });
    } catch (err) {
      if (shouldIgnoreRemoteError(err)) return;
      console.warn('[processes] sync from server failed', err);
    }
  },

  start: ({ type, title, stageLabelKey, documentId = null, total = 1 }) => {
    const ts = nowIso();
    const id = processId();
    const process: LocalProcess = {
      id,
      type,
      title,
      status: 'running',
      stageLabelKey,
      done: 0,
      total,
      pct: 0,
      documentId,
      error: null,
      createdAt: ts,
      updatedAt: ts,
    };
    set((s) => {
      const localProcesses = pruneProcesses([process, ...s.localProcesses]);
      persistProcesses(localProcesses);
      return { localProcesses };
    });
    void upsertRemoteProcess(process);
    return id;
  },

  setProgress: (id, done, total, stageLabelKey) => {
    let changed: LocalProcess | null = null;
    set((s) => {
      const localProcesses = s.localProcesses.map((p) => {
        if (p.id !== id) return p;
        const nextTotal = total ?? p.total;
        changed = {
          ...p,
          done,
          total: nextTotal,
          pct: progressPct(done, nextTotal),
          stageLabelKey: stageLabelKey ?? p.stageLabelKey,
          updatedAt: nowIso(),
        };
        return changed;
      });
      persistProcesses(localProcesses);
      return { localProcesses };
    });
    if (changed) void upsertRemoteProcess(changed);
  },

  setStatus: (id, status, stageLabelKey) => {
    let changed: LocalProcess | null = null;
    set((s) => {
      const localProcesses = s.localProcesses.map((p) => {
        if (p.id !== id) return p;
        changed = { ...p, status, stageLabelKey: stageLabelKey ?? p.stageLabelKey, updatedAt: nowIso() };
        return changed;
      });
      persistProcesses(localProcesses);
      return { localProcesses };
    });
    if (changed) void upsertRemoteProcess(changed);
  },

  complete: (id, stageLabelKey) => {
    let changed: LocalProcess | null = null;
    set((s) => {
      const localProcesses = pruneProcesses(s.localProcesses.map((p) => {
        if (p.id !== id) return p;
        changed = {
          ...p,
          status: 'completed',
          done: p.total,
          pct: 100,
          stageLabelKey: stageLabelKey ?? p.stageLabelKey,
          updatedAt: nowIso(),
        };
        return changed;
      }));
      persistProcesses(localProcesses);
      return { localProcesses };
    });
    if (changed) void upsertRemoteProcess(changed);
  },

  fail: (id, error, stageLabelKey) => {
    let changed: LocalProcess | null = null;
    set((s) => {
      const localProcesses = pruneProcesses(s.localProcesses.map((p) => {
        if (p.id !== id) return p;
        changed = {
          ...p,
          status: 'failed',
          error: error ?? p.error,
          stageLabelKey: stageLabelKey ?? p.stageLabelKey,
          updatedAt: nowIso(),
        };
        return changed;
      }));
      persistProcesses(localProcesses);
      return { localProcesses };
    });
    if (changed) void upsertRemoteProcess(changed);
  },

  remove: (id) => {
    set((s) => {
      const localProcesses = s.localProcesses.filter((p) => p.id !== id);
      persistProcesses(localProcesses);
      return { localProcesses };
    });
    void deleteRemoteProcess(id);
  },
}));
