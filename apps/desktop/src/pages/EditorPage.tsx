import { useTranscriptionStore } from '../stores/transcription';
import { useDocumentsStore } from '../stores/documents';
import { useDictationStore } from '../stores/dictation';
import { useLiveStore } from '../stores/live';
import { ApiError, type DocumentTranscriptionEntry, type TranscriptSegment } from '@whisperall/api-client';
import { api } from '../lib/api';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
// Editor type now provided by milkdown/api/EditorHandle (imported below).
import { TranscriptView } from '../components/editor/TranscriptView';
import { InsightsPanel } from '../components/editor/InsightsPanel';
import { Button } from '../components/ui/Button';
import { AudioPlayer, type AudioSeekRequest } from '../components/editor/AudioPlayer';
import { MilkdownEditor } from '../components/editor/MilkdownEditor';
import type { EditorHandle } from '../components/editor/milkdown/api/EditorHandle';
import { CustomPromptDialog, type CustomPrompt } from '../components/editor/CustomPromptDialog';
import { AiBudgetDialog } from '../components/editor/AiBudgetDialog';
import { useT } from '../lib/i18n';
import { promptText } from '../lib/prompt';
import { useNotificationsStore } from '../stores/notifications';
import { useSettingsStore } from '../stores/settings';
import { formatDocDate } from '../lib/format-date';
import {
  buildTranscriptionBlockHtml,
  extractTranscriptionBlocksFromHtml,
  replaceTranscriptionBlockInHtml,
  type ParsedTranscriptionBlock,
  safeHtmlParagraphs,
} from '../lib/editor-utils';
import { requestPlanRefresh, usePlanStore } from '../stores/plan';
import { projectAiEditBudget } from '../lib/ai-edit-budget';

const BUILT_IN_MODES = [
  { id: 'casual', icon: 'chat' },
  { id: 'clean_fillers', icon: 'cleaning_services' },
  { id: 'formal', icon: 'school' },
  { id: 'summarize', icon: 'summarize' },
] as const;

const PROMPTS_KEY = 'whisperall-custom-prompts';
function loadCustomPrompts(): CustomPrompt[] {
  try { return JSON.parse(localStorage.getItem(PROMPTS_KEY) ?? '[]'); } catch { return []; }
}
function saveCustomPrompts(p: CustomPrompt[]) { localStorage.setItem(PROMPTS_KEY, JSON.stringify(p)); }

const SPEAKER_ALIASES_PREFIX = 'whisperall-speaker-aliases-v1:';

function speakerAliasKey(id: string): string {
  return `${SPEAKER_ALIASES_PREFIX}${id}`;
}

function loadSpeakerAliases(id: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(speakerAliasKey(id)) ?? '{}');
  } catch {
    return {};
  }
}

function saveSpeakerAliases(id: string, aliases: Record<string, string>): void {
  localStorage.setItem(speakerAliasKey(id), JSON.stringify(aliases));
}

function createBlockId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type Props = { documentId?: string | null; onBack?: () => void };
type BudgetDialogKind = 'warn' | 'blocked';
type BlockSource = 'mic' | 'system' | 'audio';
type BlockHistoryEntry = DocumentTranscriptionEntry & {
  source: BlockSource | null;
  block_id: string | null;
};
type BlockSegment = DocumentTranscriptionEntry['segments'][number];

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeBlockSegments(value: unknown): BlockSegment[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<BlockSegment[]>((acc, raw) => {
    if (!raw || typeof raw !== 'object') return acc;
    const segment = raw as Record<string, unknown>;
    const text = typeof segment.text === 'string' ? segment.text.trim() : '';
    if (!text) return acc;
    const speaker = typeof segment.speaker === 'string' && segment.speaker.trim()
      ? segment.speaker.trim()
      : undefined;
    acc.push({
      text,
      start: asFiniteNumber(segment.start),
      end: asFiniteNumber(segment.end),
      speaker,
    });
    return acc;
  }, []);
}

function normalizeBlockHistory(entry: Partial<BlockHistoryEntry> & { id: string; text: string }): BlockHistoryEntry {
  return {
    id: entry.id,
    document_id: entry.document_id || '',
    user_id: entry.user_id || '',
    block_id: entry.block_id ?? null,
    source: (entry.source as BlockSource | null) ?? null,
    language: entry.language || 'auto',
    diarization: !!entry.diarization,
    text: entry.text || '',
    segments: normalizeBlockSegments(entry.segments),
    audio_url: entry.audio_url ?? null,
    created_at: entry.created_at || new Date().toISOString(),
    updated_at: entry.updated_at || new Date().toISOString(),
  };
}

export function EditorPage({ documentId, onBack }: Props) {
  const t = useT();
  const uiLanguage = useSettingsStore((s) => s.uiLanguage);
  const { segments, fullText, sourceAudioUrl, diarization, language } = useTranscriptionStore();
  const { currentDocument, loadDocument, createDocument, updateDocument, clearCurrent } = useDocumentsStore();
  const dictationText = useDictationStore((s) => s.text);
  const dictationStatus = useDictationStore((s) => s.status);
  const startDictation = useDictationStore((s) => s.start);
  const stopDictation = useDictationStore((s) => s.stop);
  const liveSegments = useLiveStore((s) => s.segments);
  const liveStatus = useLiveStore((s) => s.status);
  const liveSource = useLiveStore((s) => s.source);
  const setLiveSource = useLiveStore((s) => s.setSource);
  const startLive = useLiveStore((s) => s.start);
  const stopLive = useLiveStore((s) => s.stop);
  const [title, setTitle] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [plainText, setPlainText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [aiError, setAiError] = useState('');
  const [budgetDialog, setBudgetDialog] = useState<{ open: boolean; kind: BudgetDialogKind; message: string }>({
    open: false,
    kind: 'warn',
    message: '',
  });
  const [saved, setSaved] = useState(false);
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>(loadCustomPrompts);
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [noteSegments, setNoteSegments] = useState<TranscriptSegment[]>([]);
  const [speakerAliases, setSpeakerAliases] = useState<Record<string, string>>({});
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const [activeSegmentText, setActiveSegmentText] = useState<string>('');
  const [contentView, setContentView] = useState<'transcript' | 'note'>('note');
  const [blockHistory, setBlockHistory] = useState<BlockHistoryEntry[]>([]);
  const [blockHistoryLoading, setBlockHistoryLoading] = useState(false);
  const [blockHistoryError, setBlockHistoryError] = useState('');
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [retranscribingBlockId, setRetranscribingBlockId] = useState<string | null>(null);
  const [blockAudioUrl, setBlockAudioUrl] = useState<string | null>(null);
  const [seekRequest, setSeekRequest] = useState<AudioSeekRequest | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const editorRef = useRef<EditorHandle | null>(null);
  const budgetResolverRef = useRef<((ok: boolean) => void) | null>(null);
  const seekNonceRef = useRef(0);

  // Load document or create new one
  useEffect(() => {
    if (!documentId) { clearCurrent(); return; }
    if (documentId === 'new') {
      clearCurrent();
      // Empty title — the UI displays "Untitled" as placeholder until
      // the user names the note. Avoids polluting the title field with
      // a timestamp that reads like user content at the list / export
      // layer.
      createDocument({ title: '', content: '', source: 'manual' })
        .then((doc) => { setTitle(doc.title); setHtmlContent(doc.content); })
        .catch(() => {});
    } else {
      loadDocument(documentId);
    }
    return () => clearCurrent();
  }, [documentId, loadDocument, createDocument, clearCurrent]);

  // Sync from loaded document
  useEffect(() => {
    if (currentDocument) {
      setTitle(currentDocument.title);
      setHtmlContent(currentDocument.content);
    }
  }, [currentDocument]);

  useEffect(() => {
    const sourceId = currentDocument?.source_id;
    const isTranscriptDoc = currentDocument?.source === 'transcription' && !!sourceId;
    if (!isTranscriptDoc || !sourceId) {
      setNoteSegments([]);
      setSpeakerAliases({});
      setActiveSegmentIndex(null);
      setActiveSegmentText('');
      return;
    }
    setSpeakerAliases(loadSpeakerAliases(currentDocument.id));
    setActiveSegmentIndex(null);
    setActiveSegmentText('');
    api.transcribe.getResult(sourceId)
      .then((res) => {
        setNoteSegments(res.segments ?? []);
      })
      .catch(() => {
        setNoteSegments([]);
      });
  }, [currentDocument?.id, currentDocument?.source, currentDocument?.source_id]);

  // Debounced auto-save
  const autoSave = useCallback((newTitle: string, newContent: string) => {
    if (!currentDocument) return;
    clearTimeout(saveTimer.current);
    setSaved(false);
    saveTimer.current = setTimeout(() => {
      updateDocument(currentDocument.id, { title: newTitle, content: newContent })
        .then(() => setSaved(true))
        .catch(() => {});
    }, 1000);
  }, [currentDocument, updateDocument]);

  const handleTitleChange = (v: string) => { setTitle(v); autoSave(v, htmlContent); };
  const transcriptEditNoticeShownRef = useRef(false);
  const handleEditorChange = (html: string, text: string) => {
    // Detect if this edit mutated the body of a transcription block and show
    // the one-time "you're editing the transcript" notice per note.
    if (documentId && !transcriptEditNoticeShownRef.current) {
      const flagKey = `wa-transcript-edit-notice:${documentId}`;
      const alreadyShown = localStorage.getItem(flagKey) === '1';
      if (!alreadyShown) {
        const prevBodyMatch = htmlContent.match(/<div[^>]*class="[^"]*wa-transcription-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const nextBodyMatch = html.match(/<div[^>]*class="[^"]*wa-transcription-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (prevBodyMatch && nextBodyMatch && prevBodyMatch[1] !== nextBodyMatch[1]) {
          transcriptEditNoticeShownRef.current = true;
          localStorage.setItem(flagKey, '1');
          useNotificationsStore.getState().push(t('editor.transcriptEdited'), 'info');
        }
      }
    }
    setHtmlContent(html);
    setPlainText(text);
    autoSave(title, html);
  };

  const transcriptSegments = documentId ? noteSegments : segments;
  const transcriptText = transcriptSegments.map((seg) => seg.text).join('\n').trim();
  const transcriptAudioUrl = documentId ? (currentDocument?.audio_url ?? null) : sourceAudioUrl;
  const hasTranscript = transcriptSegments.length > 0 || (!documentId && !!fullText);
  const showTranscriptView = transcriptSegments.length > 0 && (!documentId || currentDocument?.source === 'transcription');
  const transcriptSpeakerCount = new Set(transcriptSegments.map((s) => s.speaker).filter(Boolean)).size;
  const text = documentId ? (transcriptText || plainText) : (plainText || fullText);

  useEffect(() => {
    setContentView(showTranscriptView ? 'transcript' : 'note');
  }, [showTranscriptView, currentDocument?.id]);

  const transcriptPanelVisible = showTranscriptView && contentView === 'transcript';
  const transcriptionBlocks = useMemo<ParsedTranscriptionBlock[]>(() => {
    if (!documentId || !htmlContent) return [];
    return extractTranscriptionBlocksFromHtml(htmlContent);
  }, [documentId, htmlContent]);
  const blockHistoryByBlockId = useMemo(() => {
    const grouped = new Map<string, BlockHistoryEntry[]>();
    for (const entry of blockHistory) {
      const key = entry.block_id?.trim();
      if (!key) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)?.push(entry);
    }
    for (const items of grouped.values()) {
      items.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
    }
    return grouped;
  }, [blockHistory]);
  const activeBlock = useMemo(
    () => transcriptionBlocks.find((block) => block.blockId === activeBlockId) ?? null,
    [activeBlockId, transcriptionBlocks],
  );
  const activeBlockEntries = useMemo(() => {
    if (!activeBlockId) return [];
    return blockHistoryByBlockId.get(activeBlockId) ?? [];
  }, [activeBlockId, blockHistoryByBlockId]);
  const activeBlockLatest = activeBlockEntries[0] ?? null;

  useEffect(() => {
    if (!currentDocument?.id) {
      setBlockHistory([]);
      setBlockHistoryError('');
      setBlockHistoryLoading(false);
      return;
    }
    let cancelled = false;
    setBlockHistoryLoading(true);
    setBlockHistoryError('');
    api.documents.listTranscriptions(currentDocument.id)
      .then((entries) => {
        if (cancelled) return;
        const normalized = (entries ?? []).map((entry) => normalizeBlockHistory(entry as BlockHistoryEntry));
        setBlockHistory(normalized);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.message.replace(/^API error \d+:\s*/i, '') : (err as Error)?.message;
        setBlockHistoryError(msg || t('notes.historyLoadFailed'));
        setBlockHistory([]);
      })
      .finally(() => {
        if (!cancelled) setBlockHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentDocument?.id, t]);

  useEffect(() => {
    if (!activeBlockId) return;
    if (transcriptionBlocks.some((block) => block.blockId === activeBlockId)) return;
    setActiveBlockId(transcriptionBlocks[0]?.blockId ?? null);
  }, [activeBlockId, transcriptionBlocks]);

  const formatUnits = (value: number) => value.toLocaleString(uiLanguage === 'es' ? 'es-ES' : 'en-US');
  const openBudgetDialog = useCallback((kind: BudgetDialogKind, message: string) => {
    if (budgetResolverRef.current) budgetResolverRef.current(false);
    setBudgetDialog({ open: true, kind, message });
    return new Promise<boolean>((resolve) => { budgetResolverRef.current = resolve; });
  }, []);
  const resolveBudgetDialog = useCallback((ok: boolean) => {
    setBudgetDialog((prev) => ({ ...prev, open: false }));
    const resolve = budgetResolverRef.current;
    budgetResolverRef.current = null;
    if (resolve) resolve(ok);
  }, []);
  const validateAiBudget = useCallback(async (txt: string): Promise<boolean> => {
    await usePlanStore.getState().fetch();
    const plan = usePlanStore.getState();
    const budget = projectAiEditBudget({
      text: txt,
      used: plan.getUsed('ai_edit_tokens'),
      limit: plan.getLimit('ai_edit_tokens'),
    });
    if (budget.overLimit) {
      const msg = t('ai.overLimitPrecheck')
        .replace('{estimate}', formatUnits(budget.tokenEstimate))
        .replace('{remaining}', formatUnits(budget.remaining));
      await openBudgetDialog('blocked', msg);
      setAiError(msg);
      requestPlanRefresh(0);
      return false;
    }
    if (budget.warnAtThreshold) {
      const msg = t('ai.warn75Confirm')
        .replace('{estimate}', formatUnits(budget.tokenEstimate))
        .replace('{projectedPercent}', String(budget.projectedPercent))
        .replace('{projected}', formatUnits(budget.projected))
        .replace('{limit}', formatUnits(budget.limit));
      if (!(await openBudgetDialog('warn', msg))) {
        setAiError(t('ai.cancelled'));
        return false;
      }
    }
    return true;
  }, [openBudgetDialog, t, uiLanguage]);

  useEffect(() => () => {
    if (budgetResolverRef.current) {
      budgetResolverRef.current(false);
      budgetResolverRef.current = null;
    }
  }, []);

  // AI edit — built-in mode
  const handleAiEdit = async (mode: string) => {
    if (!text) return;
    setAiError('');
    if (!(await validateAiBudget(text))) return;
    setProcessing(true);
    try {
      const res = await api.aiEdit.edit({ text, mode });
      setHtmlContent(safeHtmlParagraphs(res.text));
      requestPlanRefresh();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 429 || err.code === 'PLAN_LIMIT_EXCEEDED')) {
        setAiError(t('ai.limitReached'));
        requestPlanRefresh(0);
      } else if (err instanceof ApiError && err.status === 400) {
        setAiError(t('ai.tooLong'));
      } else {
        setAiError(t('ai.failed'));
      }
    }
    finally { setProcessing(false); }
  };

  // AI edit — custom prompt
  const handleCustomAi = async (prompt: CustomPrompt) => {
    if (!text) return;
    setAiError('');
    if (!(await validateAiBudget(text))) return;
    setProcessing(true);
    try {
      const res = await api.aiEdit.edit({ text, mode: 'custom', prompt: prompt.prompt });
      setHtmlContent(safeHtmlParagraphs(res.text));
      requestPlanRefresh();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 429 || err.code === 'PLAN_LIMIT_EXCEEDED')) {
        setAiError(t('ai.limitReached'));
        requestPlanRefresh(0);
      } else if (err instanceof ApiError && err.status === 400) {
        setAiError(t('ai.tooLong'));
      } else {
        setAiError(t('ai.failed'));
      }
    }
    finally { setProcessing(false); }
  };

  // Insert last dictation at cursor position
  const insertDictation = () => {
    if (!dictationText || !editorRef.current) return;
    editorRef.current.insertHtmlAtCursor(safeHtmlParagraphs(dictationText));
    autoSave(title, editorRef.current.getMarkdown());
  };

  const insertTranscriptionBlock = useCallback(async (args: {
    blockId?: string;
    source: 'mic' | 'system' | 'audio';
    text: string;
    segments?: BlockSegment[];
    audioUrl?: string | null;
    title: string;
  }): Promise<string | null> => {
    const blockId = args.blockId || createBlockId();
    const html = buildTranscriptionBlockHtml({
      blockId,
      source: args.source,
      text: args.text,
      title: args.title,
      language: language === 'auto' ? undefined : language,
      diarization: args.source === 'audio' ? diarization : undefined,
      audioUrl: args.audioUrl,
      segments: args.segments,
    });
    if (!html || !currentDocument) return null;
    if (editorRef.current) {
      editorRef.current.insertHtmlAtCursor(html);
      const next = editorRef.current.getMarkdown();
      setHtmlContent(next);
      autoSave(title, next);
      setContentView('note');
    } else {
      const next = `${htmlContent}${html}`;
      setHtmlContent(next);
      autoSave(title, next);
      setContentView('note');
    }
    try {
      const created = await api.documents.createTranscription(currentDocument.id, {
        block_id: blockId,
        source: args.source,
        language: language || 'auto',
        diarization: args.source === 'audio' ? diarization : false,
        text: args.text,
        segments: args.segments ?? [],
        audio_url: args.audioUrl ?? null,
      });
      const normalized = normalizeBlockHistory(created as BlockHistoryEntry);
      setBlockHistory((prev) => [normalized, ...prev]);
    } catch {
      // best-effort persistence for block history; block still stays in the note content
    }
    setActiveBlockId(blockId);
    return blockId;
  }, [autoSave, currentDocument, diarization, htmlContent, language, title]);

  const replaceBlockWithTranscription = useCallback((params: {
    blockId: string;
    source: BlockSource;
    title: string;
    text: string;
    segments?: BlockSegment[];
    audioUrl?: string | null;
  }) => {
    const section = buildTranscriptionBlockHtml({
      blockId: params.blockId,
      source: params.source,
      title: params.title,
      text: params.text,
      language: language === 'auto' ? undefined : language,
      diarization: params.source === 'audio' ? diarization : false,
      audioUrl: params.audioUrl ?? null,
      segments: params.segments,
    }).replace('<p><br></p>', '');
    if (!section) return;
    const next = replaceTranscriptionBlockInHtml(htmlContent, params.blockId, section);
    if (next !== htmlContent) {
      setHtmlContent(next);
      if (editorRef.current) editorRef.current.setMarkdown(next, { emitChange: false });
      autoSave(title, next);
      setContentView('note');
    }
  }, [autoSave, diarization, htmlContent, language, title]);

  const insertMicBlock = async () => {
    const textFromMic = dictationText.trim();
    if (!textFromMic || !documentId) return;
    await insertTranscriptionBlock({
      source: 'mic',
      text: textFromMic,
      title: `${t('editor.insertMicBlock')} — ${formatDocDate(new Date().toISOString(), uiLanguage)}`,
    });
  };

  const insertSystemBlock = async () => {
    const textFromSystem = liveSegments.map((s) => s.text).join('\n').trim();
    if (!textFromSystem || !documentId) return;
    await insertTranscriptionBlock({
      source: 'system',
      text: textFromSystem,
      segments: liveSegments.map((s) => ({ text: s.text, speaker: s.speaker })),
      title: `${t('editor.insertSystemBlock')} — ${formatDocDate(new Date().toISOString(), uiLanguage)}`,
    });
  };

  const insertAudioBlock = async () => {
    if (!documentId) return;
    const textFromAudio = transcriptText || fullText;
    if (!textFromAudio.trim()) return;
    await insertTranscriptionBlock({
      source: 'audio',
      text: textFromAudio,
      segments: transcriptSegments,
      audioUrl: transcriptAudioUrl,
      title: `${t('editor.insertAudioBlock')} — ${formatDocDate(new Date().toISOString(), uiLanguage)}`,
    });
  };

  const applyLatestForActiveBlock = useCallback(() => {
    if (!activeBlock || !activeBlockLatest?.text || !activeBlock.blockId) return;
    replaceBlockWithTranscription({
      blockId: activeBlock.blockId,
      source: (activeBlockLatest.source || activeBlock.source || 'audio') as BlockSource,
      title: activeBlock.title || `${t('editor.insertAudioBlock')}`,
      text: activeBlockLatest.text,
      segments: activeBlockLatest.segments ?? [],
      audioUrl: activeBlockLatest.audio_url,
    });
  }, [activeBlock, activeBlockLatest, replaceBlockWithTranscription, t]);

  const retranscribeActiveBlock = useCallback(async () => {
    if (!currentDocument?.id || !activeBlock?.blockId) return;
    const source = (activeBlock.source || 'audio') as BlockSource;
    const titleText = activeBlock.title || `${t('editor.insertAudioBlock')}`;
    if (source === 'mic') {
      const textFromMic = dictationText.trim();
      if (!textFromMic) return;
      setRetranscribingBlockId(activeBlock.blockId);
      try {
        const created = await api.documents.createTranscription(currentDocument.id, {
          block_id: activeBlock.blockId,
          source: 'mic',
          language: language || 'auto',
          diarization: false,
          text: textFromMic,
          segments: [],
          audio_url: null,
        });
        const normalized = normalizeBlockHistory(created as BlockHistoryEntry);
        setBlockHistory((prev) => [normalized, ...prev]);
        replaceBlockWithTranscription({
          blockId: activeBlock.blockId,
          source: 'mic',
          title: titleText,
          text: normalized.text,
          segments: normalized.segments,
          audioUrl: normalized.audio_url,
        });
      } finally {
        setRetranscribingBlockId(null);
      }
      return;
    }
    if (source === 'system') {
      const textFromSystem = liveSegments.map((s) => s.text).join('\n').trim();
      if (!textFromSystem) return;
      setRetranscribingBlockId(activeBlock.blockId);
      try {
        const created = await api.documents.createTranscription(currentDocument.id, {
          block_id: activeBlock.blockId,
          source: 'system',
          language: language || 'auto',
          diarization: false,
          text: textFromSystem,
          segments: liveSegments.map((s) => ({ text: s.text, speaker: s.speaker })),
          audio_url: null,
        });
        const normalized = normalizeBlockHistory(created as BlockHistoryEntry);
        setBlockHistory((prev) => [normalized, ...prev]);
        replaceBlockWithTranscription({
          blockId: activeBlock.blockId,
          source: 'system',
          title: titleText,
          text: normalized.text,
          segments: normalized.segments,
          audioUrl: normalized.audio_url,
        });
      } finally {
        setRetranscribingBlockId(null);
      }
      return;
    }
    const audioUrl = activeBlockLatest?.audio_url || transcriptAudioUrl || currentDocument.audio_url;
    if (!audioUrl) return;
    setRetranscribingBlockId(activeBlock.blockId);
    try {
      const result = await api.transcribe.fromUrl({
        url: audioUrl,
        language: language === 'auto' ? undefined : language,
        enable_diarization: diarization,
      });
      const created = await api.documents.createTranscription(currentDocument.id, {
        block_id: activeBlock.blockId,
        source: 'audio',
        language: language || 'auto',
        diarization,
        text: result.text,
        segments: result.segments ?? [],
        audio_url: audioUrl,
      });
      const normalized = normalizeBlockHistory(created as BlockHistoryEntry);
      setBlockHistory((prev) => [normalized, ...prev]);
      replaceBlockWithTranscription({
        blockId: activeBlock.blockId,
        source: 'audio',
        title: titleText,
        text: normalized.text,
        segments: normalized.segments,
        audioUrl: normalized.audio_url,
      });
    } finally {
      setRetranscribingBlockId(null);
    }
  }, [
    activeBlock,
    activeBlockLatest?.audio_url,
    currentDocument,
    diarization,
    dictationText,
    language,
    liveSegments,
    replaceBlockWithTranscription,
    t,
    transcriptAudioUrl,
  ]);

  const handleToggleBlockCapture = useCallback((source: BlockSource) => {
    if (source === 'mic') {
      if (dictationStatus === 'recording') stopDictation();
      else void startDictation();
      return;
    }
    if (liveSource !== 'system') setLiveSource('system');
    if (liveStatus === 'recording') stopLive();
    else void startLive();
  }, [dictationStatus, liveSource, liveStatus, setLiveSource, startDictation, startLive, stopDictation, stopLive]);

  const playBlockSegment = useCallback((entry: BlockHistoryEntry, seg: BlockSegment, index: number) => {
    setActiveSegmentText(seg.text);
    setActiveSegmentIndex(index);
    setBlockAudioUrl(entry.audio_url ?? null);
    seekNonceRef.current += 1;
    setSeekRequest({ seconds: Math.max(0, seg.start || 0), nonce: seekNonceRef.current });
  }, []);

  const handleSavePrompts = (prompts: CustomPrompt[]) => { setCustomPrompts(prompts); saveCustomPrompts(prompts); };

  const handleRenameSpeaker = async (speaker: string) => {
    const currentLabel = speakerAliases[speaker] || speaker;
    // Native window.prompt is blocked in Electron — see lib/prompt.tsx.
    const entered = await promptText({
      message: t('editor.renameSpeakerPrompt'),
      defaultValue: currentLabel,
    });
    const nextLabel = (entered ?? '').trim();
    if (!nextLabel || nextLabel === currentLabel || !currentDocument) return;
    const nextAliases = { ...speakerAliases, [speaker]: nextLabel };
    setSpeakerAliases(nextAliases);
    saveSpeakerAliases(currentDocument.id, nextAliases);
  };

  const handleSelectSegment = (index: number) => {
    const segment = transcriptSegments[index];
    if (!segment) return;
    setBlockAudioUrl(null);
    setActiveSegmentIndex(index);
    setActiveSegmentText(segment.text);
    seekNonceRef.current += 1;
    setSeekRequest({ seconds: Math.max(0, segment.start || 0), nonce: seekNonceRef.current });
  };

  const handlePlayerTimeUpdate = useCallback((seconds: number) => {
    const trackedSegments = blockAudioUrl && activeBlockLatest?.segments?.length
      ? activeBlockLatest.segments
      : transcriptSegments;
    if (trackedSegments.length === 0) return;
    const idx = trackedSegments.findIndex((seg) => seconds >= (seg.start ?? 0) && seconds <= (seg.end ?? seg.start ?? 0));
    if (idx < 0) return;
    setActiveSegmentIndex((prev) => {
      if (prev === idx) return prev;
      setActiveSegmentText(trackedSegments[idx]?.text ?? '');
      return idx;
    });
  }, [activeBlockLatest?.segments, blockAudioUrl, transcriptSegments]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden" data-testid="editor-page">
      {/* Header */}
      <div className="shrink-0 px-8 pt-6 pb-4 border-b border-edge bg-base/50 backdrop-blur-sm no-drag">
        {onBack && documentId && (
          <Button variant="ghost" size="sm" leftIcon="arrow_back" onClick={onBack} data-testid="back-to-notes" className="mb-3 -ml-2">
            {t('editor.backToNotes')}
          </Button>
        )}

        {/* Title row */}
        {documentId ? (
          <div className="mb-3">
            <div className="flex items-center gap-3">
              <input className="text-2xl font-bold text-text bg-transparent outline-none flex-1 border-b border-transparent focus:border-primary pb-1"
                value={title} onChange={(e) => handleTitleChange(e.target.value)} placeholder={t('editor.untitled')} data-testid="editor-title" />
              {saved && <span className="text-xs text-emerald-400 flex items-center gap-1 shrink-0"><span className="material-symbols-outlined text-[14px]">check_circle</span>{t('editor.saved')}</span>}
            </div>
            {currentDocument && (
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted">
                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">calendar_today</span>{formatDocDate(currentDocument.created_at, uiLanguage)}</span>
                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">edit</span>{formatDocDate(currentDocument.updated_at, uiLanguage)}</span>
              </div>
            )}
            {showTranscriptView && (
              <div className="flex items-center gap-4 mt-2 text-sm text-muted flex-wrap">
                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">group</span> {transcriptSpeakerCount} {t('editor.speakers')}</span>
                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">segment</span> {transcriptSegments.length} {t('editor.segments')}</span>
                <div className="inline-flex rounded-lg border border-edge overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setContentView('transcript')}
                    data-testid="editor-view-transcript"
                    className={`px-2.5 py-1 text-xs ${contentView === 'transcript' ? 'bg-primary/20 text-primary' : 'bg-surface text-muted hover:text-text'}`}
                  >
                    {t('editor.viewTranscript')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setContentView('note')}
                    data-testid="editor-view-note"
                    className={`px-2.5 py-1 text-xs border-l border-edge ${contentView === 'note' ? 'bg-primary/20 text-primary' : 'bg-surface text-muted hover:text-text'}`}
                  >
                    {t('editor.viewNote')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-text mb-2">{hasTranscript ? t('editor.transcript') : t('editor.aiEditor')}</h1>
            {hasTranscript && (
              <div className="flex items-center gap-4 text-sm text-muted">
                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">group</span> {transcriptSpeakerCount} {t('editor.speakers')}</span>
                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">segment</span> {transcriptSegments.length} {t('editor.segments')}</span>
              </div>
            )}
            {!hasTranscript && <p className="text-sm text-muted">{t('editor.desc')}</p>}
          </>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {BUILT_IN_MODES.map((m) => (
            <button key={m.id} onClick={() => handleAiEdit(m.id)} disabled={processing || !text}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted bg-surface border border-edge rounded-lg hover:bg-surface-alt hover:text-text transition-colors disabled:opacity-30 capitalize"
              data-testid={`ai-${m.id}`}>
              <span className="material-symbols-outlined text-[16px]">{m.icon}</span>
              {t(`editor.${m.id}`)}
            </button>
          ))}
          {customPrompts.map((p) => (
            <button key={p.id} onClick={() => handleCustomAi(p)} disabled={processing || !text}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary/80 bg-primary/5 border border-primary/20 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-30"
              data-testid={`ai-custom-${p.id}`}>
              <span className="material-symbols-outlined text-[16px]">{p.icon}</span>
              {p.name}
            </button>
          ))}
          <button onClick={() => setShowPromptDialog(true)}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted hover:text-primary transition-colors" title={t('editor.customPrompts')}>
            <span className="material-symbols-outlined text-[16px]">add_circle</span>
          </button>
          <span className="w-px h-5 bg-edge mx-1" />
          {documentId && !transcriptPanelVisible && (
            <button onClick={insertDictation} disabled={!dictationText || dictationStatus === 'recording'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted bg-surface border border-edge rounded-lg hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-30"
              title={t('editor.insertDictation')}>
              <span className="material-symbols-outlined text-[16px]">mic</span>
              {t('editor.insertDictation')}
            </button>
          )}
          {documentId && (
            <>
              <button
                onClick={() => { void insertMicBlock(); }}
                disabled={!dictationText.trim() || dictationStatus === 'recording'}
                data-testid="editor-insert-mic-block"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted bg-surface border border-edge rounded-lg hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-30"
                title={dictationText.trim() ? t('editor.insertMicBlock') : t('editor.noMicText')}
              >
                <span className="material-symbols-outlined text-[16px]">mic</span>
                {t('editor.insertMicBlock')}
              </button>
              <button
                onClick={() => { void insertSystemBlock(); }}
                disabled={liveSegments.length === 0}
                data-testid="editor-insert-system-block"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted bg-surface border border-edge rounded-lg hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-30"
                title={liveSegments.length > 0 ? t('editor.insertSystemBlock') : t('editor.noSystemText')}
              >
                <span className="material-symbols-outlined text-[16px]">desktop_windows</span>
                {t('editor.insertSystemBlock')}
              </button>
              <button
                onClick={() => { void insertAudioBlock(); }}
                disabled={!(transcriptText || fullText).trim()}
                data-testid="editor-insert-audio-block"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted bg-surface border border-edge rounded-lg hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-30"
                title={(transcriptText || fullText).trim() ? t('editor.insertAudioBlock') : t('editor.noAudioText')}
              >
                <span className="material-symbols-outlined text-[16px]">audio_file</span>
                {t('editor.insertAudioBlock')}
              </button>
            </>
          )}
          {processing && <span className="text-xs text-primary ml-2">{t('editor.processing')}</span>}
          {aiError && <span className="text-xs text-red-400 ml-2">{aiError}</span>}
        </div>
        {documentId && transcriptionBlocks.length > 0 && (
          <div className="mt-3 rounded-xl border border-edge bg-surface/60 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text">{t('editor.blockPanelTitle')} ({transcriptionBlocks.length})</span>
              {blockHistoryLoading && <span className="text-muted">{t('editor.blockHistoryLoading')}</span>}
            </div>
            {blockHistoryError && <p className="text-xs text-red-400">{blockHistoryError}</p>}
            <div className="flex flex-wrap gap-2">
              {transcriptionBlocks.map((block, idx) => {
                const id = block.blockId ?? `unknown-${idx}`;
                const history = block.blockId ? (blockHistoryByBlockId.get(block.blockId) ?? []) : [];
                const isActive = activeBlockId === block.blockId;
                return (
                  <button
                    key={`${id}-${idx}`}
                    type="button"
                    onClick={() => setActiveBlockId(block.blockId)}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs ${isActive ? 'border-primary text-primary bg-primary/10' : 'border-edge text-muted hover:text-text hover:bg-surface-alt'}`}
                  >
                    {block.title || `${t('editor.block')}${idx + 1}`} · {history.length}
                  </button>
                );
              })}
            </div>
            {activeBlock && (
              <div className="rounded-lg border border-edge bg-base/40 p-3 space-y-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-text">{activeBlock.title || t('editor.block')}</span>
                  <span className="px-2 py-0.5 rounded bg-surface-alt text-muted uppercase">{activeBlock.source}</span>
                  {activeBlockLatest && <span className="text-muted">{formatDocDate(activeBlockLatest.created_at, uiLanguage)}</span>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleToggleBlockCapture((activeBlock.source || 'audio') as BlockSource)}
                    className="px-2.5 py-1 rounded border border-edge text-muted hover:text-text hover:bg-surface-alt"
                  >
                    {(activeBlock.source === 'mic' && dictationStatus === 'recording') || (activeBlock.source === 'system' && liveStatus === 'recording')
                      ? t('widget.stop')
                      : t('editor.captureNow')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void retranscribeActiveBlock(); }}
                    disabled={retranscribingBlockId === activeBlock.blockId}
                    className="px-2.5 py-1 rounded border border-edge text-muted hover:text-text hover:bg-surface-alt disabled:opacity-40"
                  >
                    {retranscribingBlockId === activeBlock.blockId ? t('editor.processing') : t('notes.retranscribeNow')}
                  </button>
                  <button
                    type="button"
                    onClick={applyLatestForActiveBlock}
                    disabled={!activeBlockLatest}
                    className="px-2.5 py-1 rounded border border-edge text-muted hover:text-text hover:bg-surface-alt disabled:opacity-40"
                  >
                    {t('notes.applyTranscription')}
                  </button>
                </div>
                {activeBlockLatest?.segments?.length ? (
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-wide text-muted">{t('editor.blockSegments')}</p>
                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-1">
                      {activeBlockLatest.segments.slice(0, 20).map((seg, segIdx) => (
                        <button
                          key={`${activeBlockLatest.id}-${segIdx}`}
                          type="button"
                          onClick={() => playBlockSegment(activeBlockLatest, seg, segIdx)}
                          className="px-2 py-1 rounded border border-edge text-[11px] text-muted hover:text-text hover:bg-surface-alt"
                        >
                          {(seg.start ?? 0).toFixed(1)}s
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted">{t('notes.audioNoTranscript')}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto px-8 py-6 pb-32">
          {transcriptPanelVisible ? (
            <TranscriptView
              segments={transcriptSegments}
              activeIndex={activeSegmentIndex}
              speakerAliases={speakerAliases}
              onSelectSegment={handleSelectSegment}
              onRenameSpeaker={documentId ? handleRenameSpeaker : undefined}
            />
          ) : (
            <MilkdownEditor content={htmlContent} onChange={handleEditorChange}
              placeholder={documentId ? t('editor.notePlaceholder') : t('editor.placeholder')} onEditorReady={(h) => { editorRef.current = h; }} />
          )}
        </div>
        {hasTranscript && <InsightsPanel />}
      </div>

      {(blockAudioUrl || transcriptAudioUrl) && (
        <AudioPlayer
          audioUrl={blockAudioUrl || transcriptAudioUrl || ''}
          title={title || currentDocument?.title || 'Audio'}
          activeSegmentText={activeSegmentText}
          seekRequest={seekRequest}
          onTimeUpdate={handlePlayerTimeUpdate}
        />
      )}
      {showPromptDialog && <CustomPromptDialog prompts={customPrompts} onSave={handleSavePrompts} onClose={() => setShowPromptDialog(false)} />}
      <AiBudgetDialog
        open={budgetDialog.open}
        kind={budgetDialog.kind}
        message={budgetDialog.message}
        onConfirm={() => resolveBudgetDialog(true)}
        onCancel={() => resolveBudgetDialog(false)}
      />
    </div>
  );
}
