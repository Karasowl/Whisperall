import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addSubagent,
  appendMessages,
  createDebateMessage,
  createDebateState,
  getActiveSession,
  loadDebateState,
  removeSubagent,
  rotateSessionIfNeeded,
  saveDebateState,
  updateSubagent,
} from '../../src/lib/debate-storage';

const storage: Record<string, string> = {};

vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
  removeItem: vi.fn((key: string) => { delete storage[key]; }),
});

describe('debate-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(storage).forEach((key) => delete storage[key]);
  });

  it('creates and persists default state', () => {
    const state = createDebateState('note-1');
    saveDebateState(state);
    const loaded = loadDebateState('note-1');
    expect(loaded.noteId).toBe('note-1');
    expect(loaded.sessions.length).toBeGreaterThan(0);
    expect(loaded.subagents.length).toBeGreaterThan(0);
  });

  it('compacts messages into session memory', () => {
    let state = createDebateState('note-2');
    const batch = Array.from({ length: 90 }, (_, idx) => createDebateMessage({
      role: 'assistant',
      speaker: `Agent ${idx}`,
      provider: 'internal',
      text: `Message ${idx} with enough body to trigger compaction in storage logic`,
      visible: true,
    }));
    state = appendMessages(state, batch);
    const session = getActiveSession(state);
    expect(session.messages.length).toBeLessThan(90);
    expect(session.memory.length).toBeGreaterThan(0);
  });

  it('rotates session when overflow flag is set', () => {
    const base = createDebateState('note-3');
    const active = getActiveSession(base);
    const forced = {
      ...base,
      sessions: [{ ...active, overflowed: true, memory: 'x'.repeat(12000) }],
      activeSessionId: active.id,
    };
    const rotated = rotateSessionIfNeeded(forced);
    expect(rotated.rotated).toBe(true);
    expect(rotated.state.sessions.length).toBe(2);
    expect(rotated.state.activeSessionId).not.toBe(active.id);
    expect(rotated.state.summaryExhausted).toBe(true);
  });

  it('keeps at least one subagent after removals', () => {
    let state = createDebateState('note-4');
    state = addSubagent(state);
    const allIds = state.subagents.map((sub) => sub.id);
    for (const id of allIds) state = removeSubagent(state, id);
    expect(state.subagents.length).toBeGreaterThan(0);
  });

  it('updates subagent fields', () => {
    let state = createDebateState('note-5');
    const target = state.subagents[0];
    state = updateSubagent(state, target.id, { name: 'Reviewer X', critical: true });
    expect(state.subagents[0].name).toBe('Reviewer X');
    expect(state.subagents[0].critical).toBe(true);
  });
});
