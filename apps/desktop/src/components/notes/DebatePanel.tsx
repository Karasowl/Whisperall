import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useT } from '../../lib/i18n';
import { api } from '../../lib/api';
import { electron } from '../../lib/electron';
import { safeHtmlParagraphs } from '../../lib/editor-utils';
import { useSettingsStore } from '../../stores/settings';
import { useProviderAuthStore } from '../../stores/provider-auth';
import { extractDebateContext } from '../../lib/debate-context';
import { runDebateCycle } from '../../lib/debate-ai';
import {
  appendMessages, clearSessionMessages, createDebateMessage, createDebateState, createNewSession,
  deleteMessage, getActiveSession, loadDebateState, rotateSessionIfNeeded, saveDebateState,
  sessionPromptMemory, storageKey, switchSession, type NoteDebateState,
} from '../../lib/debate-storage';
import { DebatePanelHeader } from './DebatePanelHeader';
import { DebatePanelMessages } from './DebatePanelMessages';
import { DebatePanelInput } from './DebatePanelInput';
import { DebatePanelEmptyState } from './DebatePanelEmptyState';
import { DebatePanelSettings } from './DebatePanelSettings';

type Props = {
  noteId: string | null;
  noteTitle: string;
  noteText: string;
  getEditor: () => Editor | null;
  onNotify: (message: string, tone: 'success' | 'error' | 'info') => void;
};

type ApplyMode = 'insert' | 'replace' | 'append';
type ParsedTargetPosition = 'start' | 'end' | 'before_match' | 'after_match';
type ParsedEditTarget = { position: ParsedTargetPosition; match?: string };
type ParsedEditCommand = { mode: ApplyMode; text: string; target?: ParsedEditTarget };

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseTargetPosition(raw: string): ParsedTargetPosition | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value === 'start' || value === 'prepend' || value === 'top' || value === 'beginning') return 'start';
  if (value === 'end' || value === 'append_note' || value === 'bottom' || value === 'finish') return 'end';
  if (value === 'before_match' || value === 'before_text' || value === 'before_anchor') return 'before_match';
  if (value === 'after_match' || value === 'after_text' || value === 'after_anchor') return 'after_match';
  return null;
}

function parseEditCommand(raw: string): ParsedEditCommand | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidates = [trimmed];
  for (const m of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (m[1]?.trim()) candidates.push(m[1].trim());
  }
  for (const c of candidates) {
    let parsed: Record<string, unknown> | null = null;
    try { parsed = asRecord(JSON.parse(c)); } catch { parsed = null; }
    if (!parsed) continue;
    const act = typeof parsed.action === 'string' ? parsed.action.trim().toLowerCase() : '';
    const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
    if (!text) continue;
    const mode: ApplyMode | null = act === 'insert' || act === 'prepend' ? 'insert' : act === 'append' ? 'append'
      : (act === 'replace' || act === 'replace_selection') ? 'replace' : null;
    if (!mode) continue;
    const targetSource = asRecord(parsed.target) ?? parsed;
    const positionRaw = typeof targetSource.position === 'string' ? targetSource.position
      : typeof targetSource.anchor === 'string' ? targetSource.anchor
        : typeof targetSource.placement === 'string' ? targetSource.placement
          : act;
    const position = parseTargetPosition(positionRaw);
    const match = typeof targetSource.match === 'string' ? targetSource.match.trim()
      : typeof targetSource.anchorText === 'string' ? targetSource.anchorText.trim()
        : typeof targetSource.targetText === 'string' ? targetSource.targetText.trim()
          : '';
    const target = position
      ? (position === 'before_match' || position === 'after_match'
        ? (match ? { position, match } : undefined)
        : { position })
      : undefined;
    return { mode, text, target: target || (mode === 'append' ? { position: 'end' } : undefined) };
  }
  return null;
}

function stripDebateArtifacts(raw: string): string {
  return raw
    .replace(/```(?:json)?\s*[\s\S]*?```/gi, '')
    .replace(/`json\s*[\s\S]*?`/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractLabeledSuggestion(raw: string): string | null {
  const lines = stripDebateArtifacts(raw).split(/\r?\n/);
  const stop = /^(?:[-*]\s*)?(?:\d+[.)]\s*)?(?:best improvement|mejor mejora|why it strengthens|por qu[eÃ©]|porque)\b/i;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    const match = line.match(/^(?:[-*]\s*)?(?:\d+[.)]\s*)?(?:suggested edit|edici[oÃ³]n sugerida)\s*:\s*(.*)$/i);
    if (!match) continue;
    const inline = match[1].trim().replace(/^["â€œâ€]+|["â€œâ€]+$/g, '').trim();
    if (inline) return inline;
    const collected: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j].trim();
      if (!next) {
        if (collected.length > 0) break;
        continue;
      }
      if (stop.test(next)) break;
      collected.push(next.replace(/^["â€œâ€]+|["â€œâ€]+$/g, '').trim());
    }
    if (collected.length > 0) return collected.join(' ').trim();
  }
  return null;
}

function extractSuggestionText(raw: string): string | null {
  return parseEditCommand(raw)?.text ?? extractLabeledSuggestion(raw);
}

function visibleDebateText(raw: string): string {
  return stripDebateArtifacts(raw) || raw.trim();
}

function normalizeSearch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function findBlockAnchor(editor: Editor, match: string): { before: number; after: number } | null {
  const needle = normalizeSearch(match);
  if (!needle) return null;
  let found: { before: number; after: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.isTextblock) return;
    const hay = normalizeSearch(node.textContent || '');
    if (!hay) return;
    if (hay.includes(needle) || needle.includes(hay)) {
      found = { before: pos, after: pos + node.nodeSize };
      return false;
    }
  });
  return found;
}

function insertionPayload(text: string, placement: 'standalone' | 'before' | 'after'): string {
  const html = safeHtmlParagraphs(text.trim());
  if (placement === 'before') return `${html}<p><br></p>`;
  if (placement === 'after') return `<p><br></p>${html}`;
  return html;
}

export function DebatePanel({ noteId, noteTitle, noteText, getEditor, onNotify }: Props) {
  const t = useT();
  const codexApiKey = useSettingsStore((s) => s.codexApiKey);
  const claudeApiKey = useSettingsStore((s) => s.claudeApiKey);
  const codexState = useProviderAuthStore((s) => s.codexState);
  const claudeState = useProviderAuthStore((s) => s.claudeState);
  const claudeAuthMode = useProviderAuthStore((s) => s.claudeAuthMode);

  const [debate, setDebate] = useState<NoteDebateState | null>(null);
  const [running, setRunning] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [lastSuggestion, setLastSuggestion] = useState('');
  const [lastSuggestedMode, setLastSuggestedMode] = useState<ApplyMode>('insert');
  const [lastSuggestedCommand, setLastSuggestedCommand] = useState<ParsedEditCommand | null>(null);
  const [lastScope, setLastScope] = useState<'selection' | 'viewport' | 'full' | null>(null);
  const [lastFocusChars, setLastFocusChars] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [noSuggestion, setNoSuggestion] = useState(false);
  const [claudeProxyAvailable, setClaudeProxyAvailable] = useState(false);
  const [codexProxyAvailable, setCodexProxyAvailable] = useState(false);

  useEffect(() => {
    electron?.claudeAuth.canInfer().then(setClaudeProxyAvailable).catch(() => setClaudeProxyAvailable(false));
  }, [claudeState]);
  useEffect(() => {
    electron?.codexAuth.canInfer().then(setCodexProxyAvailable).catch(() => setCodexProxyAvailable(false));
  }, [codexState]);

  const debateRef = useRef<NoteDebateState | null>(null);
  const runningRef = useRef(false);
  const promptRef = useRef('');
  const persistDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistedHashRef = useRef('');
  const syncErrorShownRef = useRef(false);

  useEffect(() => { promptRef.current = prompt; }, [prompt]);
  useEffect(() => { debateRef.current = debate; }, [debate]);

  useEffect(() => {
    if (!noteId) { setDebate(null); persistedHashRef.current = ''; syncErrorShownRef.current = false; return; }
    const loaded = loadDebateState(noteId);
    const initial = loaded.noteId ? loaded : createDebateState(noteId);
    setDebate(initial);
    persistedHashRef.current = JSON.stringify(initial);
    setPrompt(''); setLastSuggestion(''); setLastSuggestedMode('insert'); setLastSuggestedCommand(null);
    setLastScope(null); setLastFocusChars(0); setShowSettings(false); setNoSuggestion(false);
    let cancelled = false;
    void api.documents.getDebateState(noteId).then((remote) => {
      if (cancelled) return;
      const rs = asRecord(remote.state_json);
      if (!rs) return;
      localStorage.setItem(storageKey(noteId), JSON.stringify(rs));
      const hydrated = loadDebateState(noteId);
      setDebate(hydrated);
      persistedHashRef.current = JSON.stringify(hydrated);
      syncErrorShownRef.current = false;
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [noteId]);

  useEffect(() => { if (debate?.noteId) saveDebateState(debate); }, [debate]);

  useEffect(() => {
    if (!debate?.noteId || !noteId || debate.noteId !== noteId) return;
    const json = JSON.parse(JSON.stringify(debate)) as Record<string, unknown>;
    const hash = JSON.stringify(json);
    if (hash === persistedHashRef.current) return;
    if (persistDebounceRef.current) clearTimeout(persistDebounceRef.current);
    persistDebounceRef.current = setTimeout(() => {
      void api.documents.upsertDebateState(noteId, { state_json: json })
        .then((s) => { if (s.persisted !== false) { persistedHashRef.current = hash; syncErrorShownRef.current = false; } })
        .catch((err) => { if (!syncErrorShownRef.current) { syncErrorShownRef.current = true; onNotify((err as Error)?.message || 'Sync failed', 'error'); } });
    }, 800);
    return () => { if (persistDebounceRef.current) clearTimeout(persistDebounceRef.current); };
  }, [debate, noteId, onNotify]);

  const patch = useCallback((fn: (prev: NoteDebateState) => NoteDebateState) => {
    setDebate((prev) => (prev ? fn(prev) : prev));
  }, []);

  const activeSession = useMemo(() => (debate ? getActiveSession(debate) : null), [debate]);
  const allMessages = activeSession?.messages ?? [];
  const visibleMessages = useMemo(() => (
    allMessages.filter((m) => m.visible && !(m.provider === 'internal' && m.speaker === t('notes.debateCurated')))
  ), [allMessages, t]);
  const traceMessages = useMemo(() => {
    const limit = Math.max(4, (debate?.subagents.length ?? 0) * (debate?.rounds ?? 1) + 4);
    return allMessages
      .filter((m) => !m.visible && m.speaker !== t('notes.debateCurated'))
      .slice(-limit);
  }, [allMessages, debate?.rounds, debate?.subagents.length, t]);
  const traceParticipants = useMemo(() => {
    const names: string[] = [];
    const push = (name: string) => { if (name && !names.includes(name)) names.push(name); };
    traceMessages.forEach((msg) => {
      if (msg.role === 'assistant') push(msg.speaker);
      else if (msg.role === 'system') push(msg.speaker.split('Â·')[0]?.trim() || msg.speaker);
    });
    visibleMessages
      .filter((msg) => msg.role === 'assistant' && msg.provider !== 'internal')
      .forEach((msg) => push(msg.speaker));
    return names;
  }, [traceMessages, visibleMessages]);
  const traceSubagentCount = useMemo(() => new Set(
    traceMessages.filter((msg) => msg.role === 'assistant').map((msg) => msg.speaker),
  ).size, [traceMessages]);
  const traceToolCount = useMemo(() => traceMessages.filter((msg) => msg.role === 'system').length, [traceMessages]);
  const tracePrincipalCount = useMemo(() => new Set(
    visibleMessages.filter((msg) => msg.role === 'assistant' && msg.provider !== 'internal').map((msg) => msg.provider),
  ).size, [visibleMessages]);

  const resolveProviderCredentials = useCallback(async () => {
    const manualOpenAi = codexApiKey.trim();
    const manualClaude = claudeApiKey.trim();
    let authOpenAi = '', authClaude = '';
    let useClaudeProxy = false;
    let useCodexProxy = false;
    if (electron) {
      const [oak, cak] = await Promise.all([
        manualOpenAi ? Promise.resolve(null) : electron.getAuthStorageItem('codex_api_key'),
        manualClaude ? Promise.resolve(null) : electron.getAuthStorageItem('claude_api_key'),
      ]);
      authOpenAi = oak?.trim() || '';
      authClaude = cak?.trim() || '';
      if (!manualClaude && !authClaude && claudeProxyAvailable) useClaudeProxy = true;
      if (!manualOpenAi && !authOpenAi && codexProxyAvailable) useCodexProxy = true;
    }
    const openaiKey = manualOpenAi || authOpenAi;
    const claudeKey = manualClaude || authClaude;
    return {
      openaiKey, claudeKey, openaiAccountId: '',
      hasOpenai: !!openaiKey || useCodexProxy,
      hasClaude: !!claudeKey || useClaudeProxy,
      useClaudeProxy, useCodexProxy,
    };
  }, [claudeApiKey, codexApiKey, claudeProxyAvailable, codexProxyAvailable]);

  const runCycle = useCallback(async (trigger: 'manual' | 'interval') => {
    if (runningRef.current) return;
    const current = debateRef.current;
    if (!current || !noteId) return;
    const editor = getEditor();
    if (!editor) { onNotify(t('notes.debateNoEditor'), 'error'); return; }
    runningRef.current = true; setRunning(true);
    try {
      const ctx = extractDebateContext(editor, noteText);
      setLastScope(ctx.source);
      setLastFocusChars(ctx.focus.length);
      const instruction = trigger === 'manual' ? promptRef.current.trim() : '';
      let next = current;
      if (instruction) {
        next = appendMessages(next, [createDebateMessage({ role: 'user', speaker: t('notes.debateUser'), provider: 'internal', text: instruction, visible: true })]);
        setDebate(next);
      }
      const memory = sessionPromptMemory(getActiveSession(next), 12);
      const creds = await resolveProviderCredentials();
      let effectiveMode = next.providerMode;
      if (!creds.hasClaude && creds.hasOpenai && effectiveMode !== 'openai') {
        effectiveMode = 'openai';
        if (trigger === 'manual') onNotify(t('notes.debateFallbackOpenai'), 'info');
      } else if (!creds.hasOpenai && creds.hasClaude && effectiveMode !== 'claude') {
        effectiveMode = 'claude';
        if (trigger === 'manual') onNotify(t('notes.debateFallbackClaude'), 'info');
      }
      if (effectiveMode === 'openai' && !creds.hasOpenai) throw new Error(t('notes.debateNeedOpenai'));
      if (effectiveMode === 'claude' && !creds.hasClaude) throw new Error(t('notes.debateNeedClaude'));

      const el = electron;
      const claudeProxy = el && creds.useClaudeProxy ? (system: string, userMsg: string) => el.claudeAuth.chat({ system, userPrompt: userMsg }) : undefined;
      const codexProxy = el && creds.useCodexProxy ? (system: string, userMsg: string) => el.codexAuth.chat({ system, userPrompt: userMsg }) : undefined;

      const result = await runDebateCycle({
        noteTitle: noteTitle || t('editor.untitled'), context: ctx, providerMode: effectiveMode,
        subagents: next.subagents, rounds: next.rounds, priorMemory: memory, userPrompt: instruction,
        openaiKey: creds.openaiKey || (creds.useCodexProxy ? 'proxy' : ''), claudeKey: creds.claudeKey || (creds.useClaudeProxy ? 'proxy' : ''), openaiAccountId: creds.openaiAccountId,
        openaiModel: next.openaiModel, claudeModel: next.claudeModel,
        tools: {
          maxToolCalls: Math.min(8, Math.max(2, next.rounds * 2)),
          webSearch: async (q: string) => { const found = await api.documents.searchDebateWeb(noteId, q, 6); return found.results; },
        },
        claudeProxy, codexProxy,
      });

      const internal = result.internalTurns.map((turn) => createDebateMessage({ role: 'assistant', speaker: turn.speaker, provider: turn.provider, model: turn.model, text: turn.text, visible: false }));
      const toolNotes = result.toolCalls.map((call) => createDebateMessage({
        role: 'system', speaker: `${call.subagent} Â· web_search`, provider: 'internal',
        text: `Query: ${call.query}\n${call.results.slice(0, 3).map((r, i) => `${i + 1}. ${r.title} (${r.url})`).join('\n') || 'No results'}`, visible: false,
      }));
      const principals = result.principalTurns.map((turn) => createDebateMessage({
        role: 'assistant',
        speaker: turn.speaker,
        provider: turn.provider,
        model: turn.model,
        text: visibleDebateText(turn.text),
        visible: true,
      }));
      const curated = createDebateMessage({ role: 'assistant', speaker: t('notes.debateCurated'), provider: 'internal', text: visibleDebateText(result.curated), visible: false });
      next = appendMessages(next, [...internal, ...toolNotes, ...principals, curated]);
      const rotated = rotateSessionIfNeeded(next);
      setDebate(rotated.state);
      if (instruction) setPrompt('');

      const suggested = parseEditCommand(result.curated) ?? result.principalTurns.map((turn) => parseEditCommand(turn.text)).find((e): e is ParsedEditCommand => !!e) ?? null;
      const extractedSuggestion = extractSuggestionText(result.curated)
        ?? result.principalTurns.map((turn) => extractSuggestionText(turn.text)).find((text): text is string => !!text)
        ?? '';
      if (suggested) {
        setLastSuggestion(suggested.text);
        setLastSuggestedMode(suggested.mode);
        setLastSuggestedCommand(suggested);
        setNoSuggestion(false);
      } else if (extractedSuggestion) {
        setLastSuggestion(extractedSuggestion);
        setLastSuggestedMode('insert');
        setLastSuggestedCommand(null);
        setNoSuggestion(false);
      } else {
        setLastSuggestion(visibleDebateText(result.curated));
        setLastSuggestedMode('insert');
        setLastSuggestedCommand(null);
        setNoSuggestion(true);
      }
      if (rotated.rotated) onNotify(t('notes.debateRotated'), 'info');
    } catch (err) {
      onNotify((err as Error)?.message || t('notes.debateRunFailed'), 'error');
    } finally { runningRef.current = false; setRunning(false); }
  }, [getEditor, noteId, noteText, noteTitle, onNotify, resolveProviderCredentials, t]);

  useEffect(() => {
    if (!debate?.play) return;
    const sec = Math.max(5, debate.intervalSec || 30);
    const id = setInterval(() => { void runCycle('interval'); }, sec * 1000);
    return () => clearInterval(id);
  }, [debate?.intervalSec, debate?.play, runCycle]);

  const applySuggestion = useCallback((mode: ApplyMode) => {
    const editor = getEditor();
    if (!editor || !lastSuggestion.trim()) { onNotify(t('notes.debateNothingToApply'), 'info'); return; }
    const text = lastSuggestion.trim();
    const html = safeHtmlParagraphs(text);
    const suggested = lastSuggestedCommand && lastSuggestedCommand.mode === mode ? lastSuggestedCommand : null;

    if (mode === 'replace') {
      if (editor.state.selection.empty) { onNotify(t('notes.debateNeedSelection'), 'info'); return; }
      editor.chain().focus().insertContent(html).run();
      onNotify(t('notes.debateApplied'), 'success');
      return;
    }

    if (suggested?.target?.position === 'start') {
      editor.chain().focus().insertContentAt(0, insertionPayload(text, 'before')).run();
      onNotify(t('notes.debateApplied'), 'success');
      return;
    }
    if (suggested?.target?.position === 'end') {
      const end = editor.state.doc.content.size;
      editor.chain().focus().insertContentAt(end, insertionPayload(text, end > 0 ? 'after' : 'standalone')).run();
      onNotify(t('notes.debateApplied'), 'success');
      return;
    }
    if (suggested?.target?.position === 'before_match' || suggested?.target?.position === 'after_match') {
      const anchor = findBlockAnchor(editor, suggested.target.match || '');
      if (!anchor) {
        onNotify(t('notes.debateTargetMissing'), 'info');
        return;
      }
      const at = suggested.target.position === 'before_match' ? anchor.before : anchor.after;
      const placement = suggested.target.position === 'before_match' ? 'before' : 'after';
      editor.chain().focus().insertContentAt(at, insertionPayload(text, placement)).run();
      onNotify(t('notes.debateApplied'), 'success');
      return;
    }

    if (mode === 'append') {
      const end = editor.state.doc.content.size;
      editor.chain().focus().insertContentAt(end, insertionPayload(text, end > 0 ? 'after' : 'standalone')).run();
    } else {
      editor.chain().focus().insertContent(html).run();
    }
    onNotify(t('notes.debateApplied'), 'success');
  }, [getEditor, lastSuggestion, lastSuggestedCommand, onNotify, t]);

  const undoApply = useCallback(() => {
    const editor = getEditor();
    if (!editor) return;
    editor.chain().focus().undo().run();
    onNotify(t('notes.debateUndo'), 'info');
  }, [getEditor, onNotify, t]);

  const isOpen = debate?.open ?? false;
  const providerInfo = debate ? (debate.providerMode === 'both' ? 'OpenAI + Claude' : debate.providerMode === 'openai' ? 'OpenAI' : 'Claude') : '';
  const hasSelection = !!(getEditor()?.state.selection && !getEditor()?.state.selection.empty);
  const claudeCanInfer = !!(claudeApiKey.trim() || (claudeState === 'connected' && claudeAuthMode === 'apikey') || claudeProxyAvailable);
  const hasCredentials = !!(codexApiKey.trim() || codexState === 'connected' || codexProxyAvailable || claudeCanInfer);
  const claudeOAuthOnly = claudeState === 'connected' && !claudeCanInfer;
  const contextChars = lastFocusChars || noteText.length;

  return (
    <aside
      className={`${isOpen ? 'w-[360px]' : 'w-11'} shrink-0 border-l border-edge bg-surface/55 backdrop-blur-sm transition-[width] duration-200`}
      data-testid="debate-panel"
    >
      <div className="h-full flex flex-col relative overflow-hidden">
        <DebatePanelHeader
          open={isOpen}
          providerInfo={providerInfo}
          running={running}
          play={debate?.play ?? false}
          sessions={debate?.sessions ?? []}
          activeSessionId={debate?.activeSessionId ?? ''}
          onToggle={() => {
            if (!debate) { onNotify(t('notes.processNeedsSave'), 'info'); return; }
            patch((s) => ({ ...s, open: !s.open }));
          }}
          onShowSettings={() => setShowSettings(true)}
          onNewSession={() => patch((s) => createNewSession(s))}
          onSwitchSession={(id) => patch((s) => switchSession(s, id))}
        />

        {isOpen && debate && (
          <>
            {!hasCredentials ? (
              <DebatePanelEmptyState hasCredentials={false} claudeOAuthOnly={claudeOAuthOnly} onRun={() => {}} onOpenSettings={() => setShowSettings(true)} />
            ) : visibleMessages.length === 0 && !running ? (
              <DebatePanelEmptyState hasCredentials onRun={() => { void runCycle('manual'); }} onOpenSettings={() => setShowSettings(true)} />
            ) : (
              <DebatePanelMessages
                messages={visibleMessages}
                traceMessages={traceMessages}
                traceParticipants={traceParticipants}
                tracePrincipalCount={tracePrincipalCount}
                traceSubagentCount={traceSubagentCount}
                traceToolCount={traceToolCount}
                running={running}
                providerInfo={providerInfo}
                lastSuggestion={lastSuggestion}
                suggestedMode={lastSuggestedMode}
                suggestedTarget={lastSuggestedCommand?.target ?? null}
                hasSelection={hasSelection}
                noSuggestion={noSuggestion}
                onApply={applySuggestion}
                onUndo={undoApply}
                onDeleteMessage={(id) => { patch((s) => deleteMessage(s, id)); setLastSuggestion(''); setLastSuggestedCommand(null); }}
                onClearChat={() => { patch((s) => clearSessionMessages(s)); setLastSuggestion(''); setLastSuggestedCommand(null); }}
              />
            )}

            {hasCredentials && (
              <DebatePanelInput
                prompt={prompt}
                onPromptChange={setPrompt}
                onRun={() => { void runCycle('manual'); }}
                running={running}
                play={debate.play}
                onTogglePlay={() => patch((s) => ({ ...s, play: !s.play }))}
                intervalSec={debate.intervalSec}
                contextSource={lastScope}
                contextChars={contextChars}
                disabled={false}
              />
            )}

            {showSettings && (
              <DebatePanelSettings debate={debate} onPatch={patch} onClose={() => setShowSettings(false)} />
            )}
          </>
        )}
      </div>
    </aside>
  );
}
