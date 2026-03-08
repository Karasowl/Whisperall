import { beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_PROCESSES_STORAGE_KEY, useProcessesStore } from '../../src/stores/processes';

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function createMemoryStorage(): MemoryStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
    clear: () => { map.clear(); },
  };
}

function storage(): MemoryStorage {
  return (globalThis as { window?: { localStorage?: MemoryStorage } }).window!.localStorage!;
}

function readStored() {
  return JSON.parse(storage().getItem(LOCAL_PROCESSES_STORAGE_KEY) ?? '[]');
}

describe('processes store', () => {
  beforeEach(() => {
    (globalThis as { window?: { localStorage?: MemoryStorage } }).window = {
      localStorage: createMemoryStorage(),
    };
    useProcessesStore.getState().setRemoteSync(false);
    storage().removeItem(LOCAL_PROCESSES_STORAGE_KEY);
    useProcessesStore.setState({ localProcesses: [] });
    useProcessesStore.getState().hydrate();
  });

  it('start creates a running process', () => {
    const id = useProcessesStore.getState().start({
      type: 'ai_edit',
      title: 'Rewrite note',
      stageLabelKey: 'processes.stageAiEdit',
      documentId: 'doc-1',
      total: 3,
    });
    const p = useProcessesStore.getState().localProcesses.find((x) => x.id === id);
    expect(p).toBeTruthy();
    expect(p?.status).toBe('running');
    expect(p?.documentId).toBe('doc-1');
    expect(p?.total).toBe(3);
    expect(readStored()).toHaveLength(1);
  });

  it('setProgress updates done/total/pct', () => {
    const id = useProcessesStore.getState().start({
      type: 'note_import',
      title: 'Import md',
      stageLabelKey: 'processes.stageImport',
      total: 4,
    });
    useProcessesStore.getState().setProgress(id, 2, 4);
    const p = useProcessesStore.getState().localProcesses.find((x) => x.id === id);
    expect(p?.done).toBe(2);
    expect(p?.pct).toBe(50);
  });

  it('setStatus changes process status', () => {
    const id = useProcessesStore.getState().start({
      type: 'tts_read',
      title: 'Read note',
      stageLabelKey: 'processes.stageTtsLoading',
    });
    useProcessesStore.getState().setStatus(id, 'paused', 'processes.stageTtsPaused');
    const p = useProcessesStore.getState().localProcesses.find((x) => x.id === id);
    expect(p?.status).toBe('paused');
    expect(p?.stageLabelKey).toBe('processes.stageTtsPaused');
  });

  it('complete marks process as completed at 100%', () => {
    const id = useProcessesStore.getState().start({
      type: 'tts_read',
      title: 'Read note',
      stageLabelKey: 'processes.stageTts',
      total: 2,
    });
    useProcessesStore.getState().complete(id, 'processes.stageDone');
    const p = useProcessesStore.getState().localProcesses.find((x) => x.id === id);
    expect(p?.status).toBe('completed');
    expect(p?.pct).toBe(100);
    expect(p?.stageLabelKey).toBe('processes.stageDone');
  });

  it('fail stores failure state and error', () => {
    const id = useProcessesStore.getState().start({
      type: 'note_import',
      title: 'Import pdf',
      stageLabelKey: 'processes.stageImport',
    });
    useProcessesStore.getState().fail(id, 'bad file');
    const p = useProcessesStore.getState().localProcesses.find((x) => x.id === id);
    expect(p?.status).toBe('failed');
    expect(p?.error).toBe('bad file');
  });

  it('remove deletes a process', () => {
    const id = useProcessesStore.getState().start({
      type: 'ai_edit',
      title: 'Rewrite',
      stageLabelKey: 'processes.stageAiEdit',
    });
    useProcessesStore.getState().remove(id);
    expect(useProcessesStore.getState().localProcesses.find((x) => x.id === id)).toBeUndefined();
    expect(readStored()).toHaveLength(0);
  });

  it('hydrate restores processes from storage', () => {
    storage().setItem(LOCAL_PROCESSES_STORAGE_KEY, JSON.stringify([{
      id: 'lp-1',
      type: 'note_import',
      title: 'Import file',
      status: 'running',
      stageLabelKey: 'processes.stageImport',
      done: 0,
      total: 1,
      pct: 0,
      documentId: 'doc-9',
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }]));
    useProcessesStore.getState().hydrate();
    expect(useProcessesStore.getState().localProcesses).toHaveLength(1);
    expect(useProcessesStore.getState().localProcesses[0]?.id).toBe('lp-1');
  });

  it('hydrate prunes stale completed/failed processes', () => {
    storage().setItem(LOCAL_PROCESSES_STORAGE_KEY, JSON.stringify([
      {
        id: 'old-failed',
        type: 'ai_edit',
        title: 'Old process',
        status: 'failed',
        stageLabelKey: 'processes.stageFailed',
        done: 0,
        total: 1,
        pct: 0,
        documentId: null,
        error: 'x',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      },
      {
        id: 'fresh-running',
        type: 'note_import',
        title: 'Fresh process',
        status: 'running',
        stageLabelKey: 'processes.stageImport',
        done: 0,
        total: 1,
        pct: 0,
        documentId: null,
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]));
    useProcessesStore.getState().hydrate();
    const ids = useProcessesStore.getState().localProcesses.map((p) => p.id);
    expect(ids).toEqual(['fresh-running']);
  });
});
