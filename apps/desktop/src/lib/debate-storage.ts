export type DebateProvider = 'openai' | 'claude';
export type DebateProviderMode = 'openai' | 'claude' | 'both';
export type DebateAgentProvider = DebateProvider | 'auto';
export type DebateMessageRole = 'user' | 'assistant' | 'system';

export type DebateMessage = {
  id: string;
  role: DebateMessageRole;
  speaker: string;
  provider: DebateProvider | 'internal';
  text: string;
  model?: string;
  createdAt: number;
  visible: boolean;
};

export type DebateSubagent = {
  id: string;
  name: string;
  prompt: string;
  provider: DebateAgentProvider;
  critical: boolean;
  enabled: boolean;
};

export type DebateSession = {
  id: string;
  title: string;
  createdAt: number;
  memory: string;
  memoryDepth: number;
  messages: DebateMessage[];
  overflowed: boolean;
};

export type NoteDebateState = {
  noteId: string;
  open: boolean;
  play: boolean;
  intervalSec: number;
  rounds: number;
  providerMode: DebateProviderMode;
  openaiModel: string;
  claudeModel: string;
  subagents: DebateSubagent[];
  sessions: DebateSession[];
  activeSessionId: string;
  summaryExhausted: boolean;
};

const STORAGE_PREFIX = 'whisperall-note-debate-v1:';
const MAX_MESSAGES = 64;
const COMPACT_CHUNK = 24;
const MAX_MEMORY = 9000;
const MAX_MEMORY_DEPTH = 5;

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function currentTitle(): string {
  const dt = new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

function clip(text: string, max: number): string {
  const norm = text.replace(/\s+/g, ' ').trim();
  if (norm.length <= max) return norm;
  return `${norm.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function summarizeChunk(chunk: DebateMessage[]): string {
  if (chunk.length === 0) return '';
  const lines = chunk.map((msg) => `- ${msg.speaker}: ${clip(msg.text, 140)}`);
  return lines.join('\n');
}

function compressMemory(memory: string): string {
  if (memory.length <= MAX_MEMORY) return memory;
  const lines = memory.split('\n').filter(Boolean);
  if (lines.length <= 10) return clip(memory, MAX_MEMORY);
  const keepHead = lines.slice(0, 6);
  const keepTail = lines.slice(-10);
  return `${keepHead.join('\n')}\n- ... condensed ...\n${keepTail.join('\n')}`;
}

function createSession(seedSummary?: string): DebateSession {
  return {
    id: createId('debate-session'),
    title: currentTitle(),
    createdAt: Date.now(),
    memory: seedSummary?.trim() ?? '',
    memoryDepth: 0,
    messages: [],
    overflowed: false,
  };
}

function defaultSubagents(): DebateSubagent[] {
  return [
    {
      id: createId('debate-sub'),
      name: 'Analyst',
      prompt: 'Find the strongest practical improvements for the current note context.',
      provider: 'auto',
      critical: false,
      enabled: true,
    },
    {
      id: createId('debate-sub'),
      name: 'Critic',
      prompt: 'Challenge weak assumptions, detect risks, and request concrete evidence.',
      provider: 'auto',
      critical: true,
      enabled: true,
    },
  ];
}

export const OPENAI_MODELS = [
  'gpt-4o-mini', 'gpt-4o', 'o3-mini', 'o4-mini',
  'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4.1',
  'codex-mini-latest', 'gpt-5-codex-mini', 'gpt-5.3-codex',
] as const;
export const CLAUDE_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'] as const;
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const DEFAULT_CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

function createDefaults(noteId: string): NoteDebateState {
  const first = createSession();
  return {
    noteId,
    open: false,
    play: false,
    intervalSec: 30,
    rounds: 2,
    providerMode: 'both',
    openaiModel: DEFAULT_OPENAI_MODEL,
    claudeModel: DEFAULT_CLAUDE_MODEL,
    subagents: defaultSubagents(),
    sessions: [first],
    activeSessionId: first.id,
    summaryExhausted: false,
  };
}

function ensureActiveSession(state: NoteDebateState): NoteDebateState {
  if (state.sessions.some((s) => s.id === state.activeSessionId)) return state;
  const first = state.sessions[0] ?? createSession();
  return { ...state, sessions: state.sessions.length ? state.sessions : [first], activeSessionId: first.id };
}

function compactSession(session: DebateSession): DebateSession {
  if (session.messages.length <= MAX_MESSAGES) return session;
  const compacted = session.messages.slice(0, COMPACT_CHUNK);
  const remaining = session.messages.slice(COMPACT_CHUNK);
  const chunkSummary = summarizeChunk(compacted);
  let nextMemory = session.memory ? `${session.memory}\n${chunkSummary}` : chunkSummary;
  let nextDepth = session.memoryDepth;
  while (nextMemory.length > MAX_MEMORY && nextDepth < MAX_MEMORY_DEPTH) {
    nextMemory = compressMemory(nextMemory);
    nextDepth += 1;
  }
  return {
    ...session,
    messages: remaining,
    memory: nextMemory,
    memoryDepth: nextDepth,
    overflowed: nextMemory.length > MAX_MEMORY && nextDepth >= MAX_MEMORY_DEPTH,
  };
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function sanitizeSubagent(raw: DebateSubagent | Record<string, unknown>): DebateSubagent | null {
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
  if (!name || !prompt) return null;
  const provider = raw.provider === 'openai' || raw.provider === 'claude' || raw.provider === 'auto'
    ? raw.provider
    : 'auto';
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createId('debate-sub'),
    name,
    prompt,
    provider,
    critical: !!raw.critical,
    enabled: raw.enabled !== false,
  };
}

function sanitizeMessage(raw: DebateMessage | Record<string, unknown>): DebateMessage | null {
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!text) return null;
  const role: DebateMessageRole = raw.role === 'assistant' || raw.role === 'system' ? raw.role : 'user';
  const provider: DebateMessage['provider'] = raw.provider === 'openai' || raw.provider === 'claude' ? raw.provider : 'internal';
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createId('debate-msg'),
    role,
    speaker: typeof raw.speaker === 'string' && raw.speaker ? raw.speaker : 'Agent',
    provider,
    text,
    model: typeof raw.model === 'string' ? raw.model : undefined,
    createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    visible: raw.visible !== false,
  };
}

function sanitizeSession(raw: DebateSession | Record<string, unknown>): DebateSession | null {
  const session = createSession();
  const messages = safeArray<DebateMessage | Record<string, unknown>>(raw.messages)
    .map((msg) => sanitizeMessage(msg))
    .filter((msg): msg is DebateMessage => !!msg);
  return {
    ...session,
    id: typeof raw.id === 'string' && raw.id ? raw.id : session.id,
    title: typeof raw.title === 'string' && raw.title ? raw.title : session.title,
    createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : session.createdAt,
    memory: typeof raw.memory === 'string' ? raw.memory : '',
    memoryDepth: typeof raw.memoryDepth === 'number' && Number.isFinite(raw.memoryDepth) ? raw.memoryDepth : 0,
    messages,
    overflowed: !!raw.overflowed,
  };
}

export function createDebateState(noteId: string): NoteDebateState {
  return createDefaults(noteId);
}

export function storageKey(noteId: string): string {
  return `${STORAGE_PREFIX}${noteId}`;
}

export function loadDebateState(noteId: string): NoteDebateState {
  if (!noteId) return createDefaults('');
  try {
    const raw = localStorage.getItem(storageKey(noteId));
    if (!raw) return createDefaults(noteId);
    const parsed = JSON.parse(raw) as Partial<NoteDebateState>;
    const base = createDefaults(noteId);
    const sessions = safeArray<DebateSession | Record<string, unknown>>(parsed.sessions)
      .map((session) => sanitizeSession(session))
      .filter((session): session is DebateSession => !!session);
    const subagents = safeArray<DebateSubagent | Record<string, unknown>>(parsed.subagents)
      .map((sub) => sanitizeSubagent(sub))
      .filter((sub): sub is DebateSubagent => !!sub);
    const next: NoteDebateState = {
      noteId,
      open: typeof parsed.open === 'boolean' ? parsed.open : base.open,
      play: typeof parsed.play === 'boolean' ? parsed.play : base.play,
      intervalSec: typeof parsed.intervalSec === 'number' && Number.isFinite(parsed.intervalSec)
        ? Math.max(5, Math.min(3600, Math.round(parsed.intervalSec)))
        : base.intervalSec,
      rounds: typeof parsed.rounds === 'number' && Number.isFinite(parsed.rounds)
        ? Math.max(1, Math.min(6, Math.round(parsed.rounds)))
        : base.rounds,
      providerMode: parsed.providerMode === 'openai' || parsed.providerMode === 'claude' || parsed.providerMode === 'both'
        ? parsed.providerMode
        : base.providerMode,
      openaiModel: typeof parsed.openaiModel === 'string' && parsed.openaiModel ? parsed.openaiModel : base.openaiModel,
      claudeModel: typeof parsed.claudeModel === 'string' && parsed.claudeModel ? parsed.claudeModel : base.claudeModel,
      subagents: subagents.length ? subagents : base.subagents,
      sessions: sessions.length ? sessions : base.sessions,
      activeSessionId: typeof parsed.activeSessionId === 'string' ? parsed.activeSessionId : base.activeSessionId,
      summaryExhausted: !!parsed.summaryExhausted,
    };
    return ensureActiveSession(next);
  } catch {
    return createDefaults(noteId);
  }
}

export function saveDebateState(state: NoteDebateState): void {
  if (!state.noteId) return;
  localStorage.setItem(storageKey(state.noteId), JSON.stringify(state));
}

export function getActiveSession(state: NoteDebateState): DebateSession {
  return state.sessions.find((s) => s.id === state.activeSessionId) ?? state.sessions[0];
}

export function appendMessages(state: NoteDebateState, messages: DebateMessage[]): NoteDebateState {
  if (messages.length === 0) return state;
  const nextSessions = state.sessions.map((session) => {
    if (session.id !== state.activeSessionId) return session;
    const merged = { ...session, messages: [...session.messages, ...messages] };
    return compactSession(merged);
  });
  return ensureActiveSession({ ...state, sessions: nextSessions });
}

export function createDebateMessage(input: {
  role: DebateMessageRole;
  speaker: string;
  provider: DebateMessage['provider'];
  text: string;
  model?: string;
  visible?: boolean;
}): DebateMessage {
  return {
    id: createId('debate-msg'),
    role: input.role,
    speaker: input.speaker,
    provider: input.provider,
    text: input.text.trim(),
    model: input.model,
    createdAt: Date.now(),
    visible: input.visible !== false,
  };
}

export function addSubagent(state: NoteDebateState): NoteDebateState {
  const next: DebateSubagent = {
    id: createId('debate-sub'),
    name: `Subagent ${state.subagents.length + 1}`,
    prompt: 'Review the context and provide concrete suggestions.',
    provider: 'auto',
    critical: false,
    enabled: true,
  };
  return { ...state, subagents: [...state.subagents, next] };
}

export function updateSubagent(state: NoteDebateState, id: string, patch: Partial<DebateSubagent>): NoteDebateState {
  return {
    ...state,
    subagents: state.subagents.map((sub) => (sub.id === id ? { ...sub, ...patch } : sub)),
  };
}

export function removeSubagent(state: NoteDebateState, id: string): NoteDebateState {
  const next = state.subagents.filter((sub) => sub.id !== id);
  return { ...state, subagents: next.length ? next : defaultSubagents() };
}

export function createNewSession(state: NoteDebateState, seedSummary?: string): NoteDebateState {
  const session = createSession(seedSummary);
  return {
    ...state,
    sessions: [...state.sessions, session],
    activeSessionId: session.id,
  };
}

export function switchSession(state: NoteDebateState, sessionId: string): NoteDebateState {
  if (!state.sessions.some((s) => s.id === sessionId)) return state;
  return { ...state, activeSessionId: sessionId };
}

export function sessionPromptMemory(session: DebateSession, tailItems = 10): string {
  const recent = session.messages
    .slice(-Math.max(1, tailItems))
    .map((msg) => {
      const label = msg.model ? `${msg.speaker} (${msg.model})` : msg.speaker;
      return `${label}: ${clip(msg.text, 220)}`;
    })
    .join('\n');
  return [session.memory, recent].filter(Boolean).join('\n').trim();
}

export function deleteMessage(state: NoteDebateState, messageId: string): NoteDebateState {
  return {
    ...state,
    sessions: state.sessions.map((s) =>
      s.id !== state.activeSessionId ? s : { ...s, messages: s.messages.filter((m) => m.id !== messageId) },
    ),
  };
}

export function clearSessionMessages(state: NoteDebateState): NoteDebateState {
  return {
    ...state,
    sessions: state.sessions.map((s) =>
      s.id !== state.activeSessionId ? s : { ...s, messages: [], memory: '', memoryDepth: 0, overflowed: false },
    ),
  };
}

export function rotateSessionIfNeeded(state: NoteDebateState): { state: NoteDebateState; rotated: boolean } {
  const active = getActiveSession(state);
  if (!active?.overflowed) return { state, rotated: false };
  const summary = `Previous chat reached compression limit.\n${clip(sessionPromptMemory(active, 12), 3200)}`;
  const rotated = createNewSession({ ...state, summaryExhausted: true }, summary);
  return { state: rotated, rotated: true };
}
