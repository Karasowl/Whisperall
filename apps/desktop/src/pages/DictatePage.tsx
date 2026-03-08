import { useState, useEffect, useRef, useMemo, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import type { Editor } from '@tiptap/react';
import { ApiError, type TranscriptSegment } from '@whisperall/api-client';
import { useDictationStore } from '../stores/dictation';
import { useLiveStore } from '../stores/live';
import { useSettingsStore } from '../stores/settings';
import { useDocumentsStore } from '../stores/documents';
import { useFoldersStore } from '../stores/folders';
import { useAuthStore } from '../stores/auth';
import { electron } from '../lib/electron';
import { api } from '../lib/api';
import { exportNote, exportNotesBundle, type ExportFormat } from '../lib/export';
import {
  buildImportedNoteHtml,
  escapeHtml,
  safeHtmlParagraphs,
} from '../lib/editor-utils';
import {
  downloadTTSAudio,
  hasTTSAudio,
  pauseTTS,
  resumeTTS,
  setTTSPlaybackRate,
  startReading,
  stopTTS,
  type TTSProgress,
} from '../lib/tts';
import { PlanGate } from '../components/PlanGate';
import { RichEditor } from '../components/editor/RichEditor';
import { TranscriptView } from '../components/editor/TranscriptView';
import { AudioPlayer, type AudioSeekRequest } from '../components/editor/AudioPlayer';
import { CustomPromptDialog, type CustomPrompt } from '../components/editor/CustomPromptDialog';
import { AiBudgetDialog } from '../components/editor/AiBudgetDialog';
import { DebatePanel } from '../components/notes/DebatePanel';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { FolderChips } from '../components/notes/FolderChips';
import { useT } from '../lib/i18n';
import { relativeDate, smartTitle } from '../lib/format-date';
import { projectAiEditBudget } from '../lib/ai-edit-budget';
import { requestPlanRefresh, usePlanStore } from '../stores/plan';

const SOURCE_ICONS: Record<string, string> = { dictation: 'mic', live: 'groups', transcription: 'description', manual: 'edit_note', reader: 'menu_book' };
const BUILT_IN_MODES = [
  { id: 'casual', icon: 'chat' }, { id: 'clean_fillers', icon: 'cleaning_services' },
  { id: 'formal', icon: 'school' }, { id: 'summarize', icon: 'summarize' },
] as const;

// ─── Color tag system ───
const NOTE_COLORS = ['blue', 'red', 'orange', 'yellow', 'green', 'purple', 'pink'] as const;
type NoteColor = typeof NOTE_COLORS[number];
const COLOR_STYLES: Record<NoteColor, { border: string; bg: string; dot: string }> = {
  blue:   { border: 'border-l-blue-500',   bg: 'bg-blue-500/8',   dot: 'bg-blue-500' },
  red:    { border: 'border-l-red-500',    bg: 'bg-red-500/8',    dot: 'bg-red-500' },
  orange: { border: 'border-l-orange-500', bg: 'bg-orange-500/8', dot: 'bg-orange-500' },
  yellow: { border: 'border-l-yellow-500', bg: 'bg-yellow-500/8', dot: 'bg-yellow-400' },
  green:  { border: 'border-l-green-500',  bg: 'bg-green-500/8',  dot: 'bg-green-500' },
  purple: { border: 'border-l-purple-500', bg: 'bg-purple-500/8', dot: 'bg-purple-500' },
  pink:   { border: 'border-l-pink-500',   bg: 'bg-pink-500/8',   dot: 'bg-pink-500' },
};
function getColor(tags: string[]): NoteColor { return (tags.find((t) => t.startsWith('color:'))?.slice(6) as NoteColor) || 'blue'; }
function setColorTag(tags: string[], color: NoteColor): string[] { return [...tags.filter((t) => !t.startsWith('color:')), `color:${color}`]; }

type ViewMode = 'grid' | 'list';
type BudgetDialogKind = 'warn' | 'blocked';
type ContextMenuMode = 'convert' | 'work';
const VIEW_KEY = 'whisperall-notes-view';
function loadViewMode(): ViewMode { return (localStorage.getItem(VIEW_KEY) as ViewMode) || 'grid'; }

const PROMPTS_KEY = 'whisperall-custom-prompts';
function loadCustomPrompts(): CustomPrompt[] { try { return JSON.parse(localStorage.getItem(PROMPTS_KEY) ?? '[]'); } catch { return []; } }
function saveCustomPrompts(p: CustomPrompt[]) { localStorage.setItem(PROMPTS_KEY, JSON.stringify(p)); }

type NoteTranscriptHistoryEntry = {
  id: string;
  created_at: string;
  updated_at?: string;
  document_id?: string;
  user_id?: string;
  language: string;
  diarization: boolean;
  text: string;
  segments: TranscriptSegment[];
  audio_url: string | null;
};

function normalizeHistoryEntry(entry: Partial<NoteTranscriptHistoryEntry> & { id: string; text: string }): NoteTranscriptHistoryEntry {
  return {
    id: entry.id,
    created_at: entry.created_at || new Date().toISOString(),
    updated_at: entry.updated_at,
    document_id: entry.document_id,
    user_id: entry.user_id,
    language: entry.language || 'auto',
    diarization: !!entry.diarization,
    text: entry.text || '',
    segments: Array.isArray(entry.segments) ? entry.segments : [],
    audio_url: entry.audio_url ?? null,
  };
}

const SPEAKER_ALIASES_PREFIX = 'whisperall-speaker-aliases-v1:';
function speakerAliasesKey(noteId: string): string {
  return `${SPEAKER_ALIASES_PREFIX}${noteId}`;
}
function loadSpeakerAliases(noteId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(speakerAliasesKey(noteId)) ?? '{}');
  } catch {
    return {};
  }
}
function saveSpeakerAliases(noteId: string, aliases: Record<string, string>): void {
  localStorage.setItem(speakerAliasesKey(noteId), JSON.stringify(aliases));
}

function formatLiveError(err: string, t: (k: string) => string): string {
  const low = err.toLowerCase();
  if (err.includes('Failed to fetch') || err.includes('NetworkError') || err.includes('WebSocket')) return t('live.errorConnection');
  if (err.includes('401') || low.includes('missing token') || low.includes('auth')) return t('live.errorAuth');
  if (err.includes('502')) return t('live.errorService');
  return err;
}

const NOTE_READER_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
const NOTE_READER_IDLE: TTSProgress = {
  status: 'idle',
  current: 0,
  total: 0,
  currentTime: 0,
  duration: 0,
  overallTime: 0,
  overallDuration: 0,
  rate: 1,
  error: null,
};

function htmlToPlainText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function DictatePage() {
  const t = useT();
  const dictation = useDictationStore();
  const live = useLiveStore();
  const { translateEnabled, setTranslateEnabled, uiLanguage, ttsLanguage, ttsVoice } = useSettingsStore();
  const { documents, loading, fetchDocuments, createDocument, updateDocument, deleteDocument } = useDocumentsStore();
  const { folders, selectedFolderId, fetchFolders, selectFolder, deleteFolder } = useFoldersStore();
  const user = useAuthStore((s) => s.user);

  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [docId, setDocId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [plainText, setPlainText] = useState('');
  const [noteColor, setNoteColor] = useState<NoteColor>('blue');
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [aiError, setAiError] = useState('');
  const [budgetDialog, setBudgetDialog] = useState<{ open: boolean; kind: BudgetDialogKind; message: string }>({
    open: false,
    kind: 'warn',
    message: '',
  });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [subtitlesActive, setSubtitlesActive] = useState(false);
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>(loadCustomPrompts);
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [colorFilter, setColorFilter] = useState<NoteColor | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [contextMenuMode, setContextMenuMode] = useState<ContextMenuMode>('convert');
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showBulkExport, setShowBulkExport] = useState(false);
  const [retranscribeLanguage, setRetranscribeLanguage] = useState('auto');
  const [retranscribeDiarization, setRetranscribeDiarization] = useState(true);
  const [retranscribeLoading, setRetranscribeLoading] = useState(false);
  const [retranscribeError, setRetranscribeError] = useState('');
  const [importDocLoading, setImportDocLoading] = useState(false);
  const [importDocForceOcr, setImportDocForceOcr] = useState(false);
  const [transcriptHistory, setTranscriptHistory] = useState<NoteTranscriptHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadedDocId, setHistoryLoadedDocId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [speakerAliases, setSpeakerAliases] = useState<Record<string, string>>({});
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const [activeSegmentText, setActiveSegmentText] = useState('');
  const [seekRequest, setSeekRequest] = useState<AudioSeekRequest | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<string | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [pendingDeleteFolderId, setPendingDeleteFolderId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [noteReadProgress, setNoteReadProgress] = useState<TTSProgress>(NOTE_READER_IDLE);
  const toggleView = () => { const v: ViewMode = viewMode === 'grid' ? 'list' : 'grid'; setViewMode(v); localStorage.setItem(VIEW_KEY, v); };
  const prevDictText = useRef('');
  const prevSegCount = useRef(0);
  const editorRef = useRef<Editor | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const actionFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const budgetResolverRef = useRef<((ok: boolean) => void) | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const seekNonceRef = useRef(0);
  const historyRequestSeq = useRef(0);
  const seededHistoryNotes = useRef<Record<string, boolean>>({});

  const isLive = live.source === 'system';
  const status = isLive ? live.status : dictation.status;
  const hasContent = htmlContent.replace(/<[^>]*>/g, '').trim().length > 0;
  const currentDoc = useMemo(() => documents.find((d) => d.id === docId) ?? null, [documents, docId]);
  const currentAudioUrl = currentDoc?.audio_url ?? null;
  const activeHistoryEntry = transcriptHistory.find((h) => h.id === activeHistoryId) ?? null;
  const activeSegments = activeHistoryEntry?.segments ?? [];
  const showAudioPanel = !!currentAudioUrl;
  const showTranscriptPanel = showAudioPanel && activeSegments.length > 0;
  const sourceLabel = (source: string) => {
    if (source === 'dictation') return t('dictate.dictation');
    if (source === 'live') return t('dictate.live');
    if (source === 'transcription') return t('transcribe.title');
    if (source === 'reader') return t('nav.reader');
    return t('nav.notes');
  };
  const noteReaderText = (plainText || htmlToPlainText(htmlContent)).trim();
  const noteReaderHasText = noteReaderText.length > 0;
  const noteCanDownloadRead = hasTTSAudio();
  const noteReaderPlayLabel = noteReadProgress.status === 'playing'
    ? t('reader.pause')
    : noteReadProgress.status === 'paused'
      ? t('reader.resume')
      : t('reader.readAloud');
  const contextMenuStyle = useMemo(() => {
    if (!contextMenuPos) return null;
    if (typeof window === 'undefined') return { left: contextMenuPos.x, top: contextMenuPos.y };
    const menuWidth = 236;
    const menuHeight = 540;
    const margin = 12;
    const clampedX = Math.max(margin, Math.min(contextMenuPos.x, window.innerWidth - menuWidth - margin));
    const clampedY = Math.max(72, Math.min(contextMenuPos.y, window.innerHeight - menuHeight - margin));
    return { left: clampedX, top: clampedY };
  }, [contextMenuPos]);

  const closeContextMenu = useCallback(() => {
    setContextMenuPos(null);
  }, []);

  const getSelectedEditorText = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return '';
    const { from, to } = editor.state.selection;
    if (from === to) return '';
    return editor.state.doc.textBetween(from, to, ' ').trim();
  }, []);

  const handleEditorContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.prose-editor')) return;
    event.preventDefault();
    const selectedText = getSelectedEditorText();
    setContextMenuMode(selectedText ? 'work' : 'convert');
    setContextMenuPos({ x: event.clientX + 10, y: event.clientY + 10 });
  }, [getSelectedEditorText]);

  useEffect(() => { if (user) { fetchFolders(); fetchDocuments(selectedFolderId ?? undefined); } }, [user, fetchFolders, fetchDocuments, selectedFolderId]);

  useEffect(() => {
    if (!contextMenuPos) return;
    const onWindowMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (contextMenuRef.current?.contains(target as Node)) return;
      closeContextMenu();
    };
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeContextMenu();
    };
    window.addEventListener('mousedown', onWindowMouseDown);
    window.addEventListener('keydown', onWindowKeyDown);
    return () => {
      window.removeEventListener('mousedown', onWindowMouseDown);
      window.removeEventListener('keydown', onWindowKeyDown);
    };
  }, [contextMenuPos, closeContextMenu]);

  // Handle pending document open (from Transcribe → Open in Notes)
  const pendingOpenId = useDocumentsStore((s) => s.pendingOpenId);
  useEffect(() => {
    if (pendingOpenId && documents.length > 0) {
      openNote(pendingOpenId);
      useDocumentsStore.getState().setPendingOpen(null);
    }
  }, [pendingOpenId, documents]);

  const loadTranscriptionHistory = useCallback(async (noteId: string) => {
    const reqId = ++historyRequestSeq.current;
    setHistoryLoading(true);
    setHistoryError('');
    setHistoryLoadedDocId(null);
    try {
      const items = await api.documents.listTranscriptions(noteId);
      if (reqId !== historyRequestSeq.current) return;
      const normalized = (items ?? []).map((entry) => normalizeHistoryEntry(entry as NoteTranscriptHistoryEntry));
      setTranscriptHistory(normalized);
      setActiveHistoryId(normalized[0]?.id ?? null);
      setHistoryLoadedDocId(noteId);
    } catch (err) {
      if (reqId !== historyRequestSeq.current) return;
      const msg = err instanceof ApiError ? err.message.replace(/^API error \d+:\s*/i, '') : (err as Error)?.message;
      setTranscriptHistory([]);
      setActiveHistoryId(null);
      setHistoryError(msg || t('notes.historyLoadFailed'));
      setHistoryLoadedDocId(noteId);
    } finally {
      if (reqId === historyRequestSeq.current) setHistoryLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!docId || !currentDoc?.source_id || !currentAudioUrl) return;
    if (historyLoadedDocId !== docId || historyLoading) return;
    if (transcriptHistory.length > 0 || seededHistoryNotes.current[docId]) return;
    seededHistoryNotes.current[docId] = true;
    api.transcribe.getResult(currentDoc.source_id)
      .then(async (res) => {
        const text = (res.text || '').trim();
        if (!text) return;
        const created = await api.documents.createTranscription(docId, {
          language: 'auto',
          diarization: !!(res.segments && res.segments.length > 0),
          text,
          segments: res.segments ?? [],
          audio_url: currentAudioUrl,
        });
        const entry = normalizeHistoryEntry(created as NoteTranscriptHistoryEntry);
        setTranscriptHistory([entry]);
        setActiveHistoryId(entry.id);
      })
      .catch(() => {});
  }, [docId, currentAudioUrl, currentDoc?.source_id, historyLoadedDocId, historyLoading, transcriptHistory.length]);

  // Filter documents
  const filteredDocs = useMemo(() => {
    let docs = documents;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      docs = docs.filter((d) => d.title.toLowerCase().includes(q) || d.content.replace(/<[^>]*>/g, '').toLowerCase().includes(q));
    }
    if (colorFilter) {
      docs = docs.filter((d) => getColor(d.tags ?? []) === colorFilter);
    }
    return docs;
  }, [documents, searchQuery, colorFilter]);

  const selectedDocs = useMemo(
    () => documents.filter((d) => selectedNoteIds.includes(d.id)),
    [documents, selectedNoteIds],
  );

  useEffect(() => {
    setSelectedNoteIds((prev) => prev.filter((id) => documents.some((d) => d.id === id)));
  }, [documents]);

  useEffect(() => {
    if (selectedNoteIds.length === 0) setShowBulkExport(false);
  }, [selectedNoteIds.length]);

  const openNote = (id: string) => {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;
    closeContextMenu();
    stopTTS();
    setNoteReadProgress(NOTE_READER_IDLE);
    historyRequestSeq.current += 1;
    setDocId(doc.id); setTitle(doc.title); setHtmlContent(doc.content);
    setNoteColor(getColor(doc.tags ?? [])); setNoteTags(doc.tags ?? []);
    setTranscriptHistory([]);
    setHistoryLoading(false);
    setActiveHistoryId(null);
    setHistoryLoadedDocId(null);
    setHistoryError('');
    void loadTranscriptionHistory(doc.id);
    setSpeakerAliases(loadSpeakerAliases(doc.id));
    setActiveSegmentIndex(null);
    setActiveSegmentText('');
    setSeekRequest(null);
    setRetranscribeError('');
    setMode('edit'); setSaved(true);
    prevDictText.current = ''; prevSegCount.current = 0;
  };

  const newNote = (autoRecord = false) => {
    closeContextMenu();
    stopTTS();
    setNoteReadProgress(NOTE_READER_IDLE);
    historyRequestSeq.current += 1;
    setDocId(null); setTitle(''); setHtmlContent(''); setPlainText('');
    setNoteColor('blue'); setNoteTags([]);
    setTranscriptHistory([]);
    setHistoryLoading(false);
    setHistoryLoadedDocId(null);
    setHistoryError('');
    setActiveHistoryId(null);
    setSpeakerAliases({});
    setActiveSegmentIndex(null);
    setActiveSegmentText('');
    setSeekRequest(null);
    setRetranscribeError('');
    setMode('edit'); setSaved(false);
    prevDictText.current = ''; prevSegCount.current = 0;
    if (autoRecord) {
      setTimeout(() => {
        if (isLive) live.start(); else dictation.start();
      }, 100);
    }
  };

  const goBack = () => {
    closeContextMenu();
    stopTTS();
    setNoteReadProgress(NOTE_READER_IDLE);
    historyRequestSeq.current += 1;
    setMode('list');
    setDocId(null);
    setSaved(false);
    setTranscriptHistory([]);
    setHistoryLoading(false);
    setHistoryLoadedDocId(null);
    setHistoryError('');
    setActiveHistoryId(null);
    setSpeakerAliases({});
    setActiveSegmentIndex(null);
    setActiveSegmentText('');
    setSeekRequest(null);
    setRetranscribeError('');
    if (user) fetchDocuments(selectedFolderId ?? undefined);
  };

  const handleMoveToFolder = async (docId: string, folderId: string | null) => {
    await updateDocument(docId, { folder_id: folderId });
    fetchDocuments(selectedFolderId ?? undefined);
  };

  const handleSave = async () => {
    const finalTitle = title.trim() || htmlContent.replace(/<[^>]*>/g, '').split(/[.\n]/)[0]?.slice(0, 60) || smartTitle(uiLanguage);
    const tags = setColorTag(noteTags, noteColor);
    setSaveError('');
    try {
      if (docId) {
        await updateDocument(docId, { title: finalTitle, content: htmlContent, tags });
      } else {
        const doc = await createDocument({ title: finalTitle, content: htmlContent, source: 'dictation', tags });
        setDocId(doc.id);
      }
      setNoteTags(tags); setTitle(finalTitle); setSaved(true);
    } catch (err) { setSaveError((err as Error).message); }
  };

  // Dictation text → insert at cursor (auto-flush every 30s + on stop)
  useEffect(() => {
    if (mode !== 'edit' || !editorRef.current) return;
    if (dictation.text && dictation.text !== prevDictText.current) {
      const newPart = dictation.text.slice(prevDictText.current.length).trim();
      if (newPart) {
        editorRef.current.commands.insertContent(safeHtmlParagraphs(newPart));
        setSaved(false);
      }
      prevDictText.current = dictation.text;
    }
  }, [dictation.text, mode]);

  // Live segments → append to editor
  useEffect(() => {
    if (mode !== 'edit' || !isLive || live.segments.length <= prevSegCount.current) return;
    const append = live.segments.slice(prevSegCount.current).map((s) =>
      `<p>${s.speaker ? `<strong>[${escapeHtml(s.speaker)}]</strong> ` : ''}${escapeHtml(s.text)}</p>`).join('');
    setHtmlContent((prev) => prev + append); setSaved(false);
    prevSegCount.current = live.segments.length;
  }, [isLive, live.segments, mode]);

  const handleColorChange = (c: NoteColor) => {
    setNoteColor(c);
    const tags = setColorTag(noteTags, c);
    setNoteTags(tags);
    if (docId) { updateDocument(docId, { tags }).catch(() => {}); }
    else { setSaved(false); }
  };
  const handleDeleteNote = (id: string) => { setPendingDeleteNoteId(id); };
  const confirmDeleteNote = () => {
    if (!pendingDeleteNoteId) return;
    setSelectedNoteIds((prev) => prev.filter((selectedId) => selectedId !== pendingDeleteNoteId));
    deleteDocument(pendingDeleteNoteId).catch(() => {});
    setPendingDeleteNoteId(null);
  };
  const confirmBulkDelete = async () => {
    const ids = [...selectedNoteIds];
    setPendingBulkDelete(false);
    await Promise.all(ids.map((id) => deleteDocument(id).catch(() => {})));
    setSelectedNoteIds([]);
  };
  const toggleSelection = (id: string) => {
    setSelectedNoteIds((prev) => (
      prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id]
    ));
  };
  const selectAllVisible = () => {
    const visibleIds = filteredDocs.map((d) => d.id);
    setSelectedNoteIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };
  const clearSelection = () => setSelectedNoteIds([]);
  const handleEditorChange = (html: string, text: string) => { setHtmlContent(html); setPlainText(text); setSaved(false); };
  const handleApplyHistoryEntry = (entryId: string) => {
    const entry = transcriptHistory.find((h) => h.id === entryId);
    if (!entry) return;
    setActiveHistoryId(entry.id);
    setHtmlContent(safeHtmlParagraphs(entry.text));
    setPlainText(entry.text);
    setSaved(false);
    setActiveSegmentIndex(null);
    setActiveSegmentText('');
    setSeekRequest(null);
  };
  const handleDeleteHistoryEntry = async (entryId: string) => {
    if (!docId) return;
    try {
      await api.documents.deleteTranscription(docId, entryId);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message.replace(/^API error \d+:\s*/i, '') : (err as Error)?.message;
      showActionFeedback(msg || t('notes.deleteTranscriptionFailed'), 'error');
      return;
    }
    const next = transcriptHistory.filter((h) => h.id !== entryId);
    setTranscriptHistory(next);
    if (activeHistoryId === entryId) {
      setActiveHistoryId(next[0]?.id ?? null);
      setActiveSegmentIndex(null);
      setActiveSegmentText('');
      setSeekRequest(null);
    }
  };
  const handleRenameSpeaker = (speaker: string) => {
    if (!docId) return;
    const currentLabel = speakerAliases[speaker] || speaker;
    const nextLabel = (window.prompt(t('editor.renameSpeakerPrompt'), currentLabel) ?? '').trim();
    if (!nextLabel || nextLabel === currentLabel) return;
    const nextAliases = { ...speakerAliases, [speaker]: nextLabel };
    setSpeakerAliases(nextAliases);
    saveSpeakerAliases(docId, nextAliases);
  };
  const handleSelectSegment = (index: number) => {
    const seg = activeSegments[index];
    if (!seg) return;
    setActiveSegmentIndex(index);
    setActiveSegmentText(seg.text);
    seekNonceRef.current += 1;
    setSeekRequest({ seconds: Math.max(0, seg.start || 0), nonce: seekNonceRef.current });
  };
  const handlePlayerTimeUpdate = useCallback((seconds: number) => {
    if (activeSegments.length === 0) return;
    const idx = activeSegments.findIndex((seg) => seconds >= (seg.start ?? 0) && seconds <= (seg.end ?? seg.start ?? 0));
    if (idx < 0) return;
    setActiveSegmentIndex((prev) => {
      if (prev === idx) return prev;
      setActiveSegmentText(activeSegments[idx]?.text ?? '');
      return idx;
    });
  }, [activeSegments]);
  const handleRetranscribeFromNote = async () => {
    if (!docId || !currentAudioUrl || retranscribeLoading) return;
    setRetranscribeLoading(true);
    setRetranscribeError('');
    try {
      const result = await api.transcribe.fromUrl({
        url: currentAudioUrl,
        language: retranscribeLanguage === 'auto' ? undefined : retranscribeLanguage,
        enable_diarization: retranscribeDiarization,
      });
      const created = await api.documents.createTranscription(docId, {
        language: retranscribeLanguage,
        diarization: retranscribeDiarization,
        text: result.text,
        segments: result.segments ?? [],
        audio_url: currentAudioUrl,
      });
      const entry = normalizeHistoryEntry(created as NoteTranscriptHistoryEntry);
      const nextHistory = [entry, ...transcriptHistory];
      setTranscriptHistory(nextHistory);
      setActiveHistoryId(entry.id);
      setHtmlContent(safeHtmlParagraphs(result.text));
      setPlainText(result.text);
      setSaved(false);
      setActiveSegmentIndex(null);
      setActiveSegmentText('');
      setSeekRequest(null);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message.replace(/^API error \d+:\s*/i, '') : (err as Error)?.message;
      setRetranscribeError(msg || 'Retranscription failed');
    } finally {
      setRetranscribeLoading(false);
    }
  };
  const handleToggle = () => {
    if (isLive) { live.status === 'recording' ? live.stop() : live.start(); }
    else { dictation.status === 'recording' ? dictation.stop() : dictation.start(); }
  };
  const handleToggleSource = () => { if (status !== 'recording') live.setSource(isLive ? 'mic' : 'system'); };
  const handleToggleSubtitles = () => {
    if (subtitlesActive) { electron?.hideOverlay(); setSubtitlesActive(false); }
    else { electron?.showOverlay('subtitles'); setSubtitlesActive(true); }
  };
  const showActionFeedback = (message: string, tone: 'success' | 'error' | 'info') => {
    if (actionFeedbackTimer.current) clearTimeout(actionFeedbackTimer.current);
    setActionFeedback({ tone, message });
    actionFeedbackTimer.current = setTimeout(() => { setActionFeedback(null); }, 2200);
  };
  const startNoteReader = (textOverride?: string) => {
    const textToRead = (textOverride?.trim() || noteReaderText).trim();
    if (!textToRead) {
      showActionFeedback(t('notes.readerNoText'), 'info');
      return;
    }
    const voice = ttsVoice && ttsVoice.toLowerCase() !== 'auto' ? ttsVoice : undefined;
    const language = ttsLanguage && ttsLanguage.toLowerCase() !== 'auto' ? ttsLanguage : undefined;
    void startReading(textToRead, voice, language, setNoteReadProgress);
  };
  const handleToggleNoteReader = () => {
    if (noteReadProgress.status === 'playing') {
      pauseTTS();
      setNoteReadProgress((prev) => ({ ...prev, status: 'paused' }));
      return;
    }
    if (noteReadProgress.status === 'paused') {
      resumeTTS();
      setNoteReadProgress((prev) => ({ ...prev, status: 'playing' }));
      return;
    }
    startNoteReader();
  };
  const handleStopNoteReader = () => {
    stopTTS();
    setNoteReadProgress(NOTE_READER_IDLE);
  };
  const handleCycleNoteReaderSpeed = () => {
    const current = noteReadProgress.rate || 1;
    const idx = NOTE_READER_SPEEDS.findIndex((s) => Math.abs(s - current) < 0.01);
    const next = NOTE_READER_SPEEDS[(idx === -1 ? 1 : idx + 1) % NOTE_READER_SPEEDS.length];
    setTTSPlaybackRate(next);
    setNoteReadProgress((prev) => ({ ...prev, rate: next }));
  };
  const handleDownloadNoteRead = () => {
    const blob = downloadTTSAudio();
    if (!blob) {
      showActionFeedback(t('notes.readerNoAudioToDownload'), 'info');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || t('notes.voiceNote')).trim() || 'note'}.mp3`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleImportDocument = async (file?: File | null) => {
    if (!file || importDocLoading) return;
    setImportDocLoading(true);
    try {
      const runImport = (forceOcr: boolean) => api.reader.importFile({
        file,
        filename: file.name,
        force_ocr: forceOcr,
        save: false,
      });
      let result = await runImport(importDocForceOcr);
      let importedText = (result.text || '').trim();
      let importedRich = (result.rich_html || '').trim();

      if (!importedText && !importedRich && !importDocForceOcr) {
        const allowOcr = window.confirm(t('notes.importAskOcr'));
        if (allowOcr) {
          setImportDocForceOcr(true);
          result = await runImport(true);
          importedText = (result.text || '').trim();
          importedRich = (result.rich_html || '').trim();
        }
      }

      if (!importedText && !importedRich) {
        showActionFeedback(t('notes.importNoText'), 'error');
        return;
      }

      const importedPlain = importedText || htmlToPlainText(importedRich);
      const importedHtml = buildImportedNoteHtml({
        text: importedPlain,
        richHtml: result.rich_html,
        toc: result.toc || [],
        indexTitle: t('notes.importIndex'),
      });
      if (hasContent) {
        setHtmlContent((prev) => `${prev}<p></p>${importedHtml}`);
        setPlainText((prev) => `${prev}\n\n${importedPlain}`.trim());
      } else {
        setHtmlContent(importedHtml);
        setPlainText(importedPlain);
        if (!title.trim() && result.title) setTitle(result.title);
      }
      setSaved(false);
      if (result.warning) {
        showActionFeedback(t('notes.importWithWarning').replace('{warning}', result.warning), 'info');
      } else {
        showActionFeedback(t('notes.importSuccess'), 'success');
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message.replace(/^API error \d+:\s*/i, '') : (err as Error)?.message;
      showActionFeedback(msg || t('notes.importNoText'), 'error');
    } finally {
      setImportDocLoading(false);
    }
  };
  const handleCopy = async () => {
    const text = (plainText || htmlContent.replace(/<[^>]*>/g, '') || dictation.text).trim();
    if (!text) { showActionFeedback(t('notes.copyEmpty'), 'info'); return; }
    try {
      await navigator.clipboard.writeText(text);
      showActionFeedback(t('notes.copySuccess'), 'success');
    } catch {
      showActionFeedback(t('notes.copyError'), 'error');
    }
  };
  const handleContextCopy = async () => {
    const selected = getSelectedEditorText();
    if (selected) {
      try {
        await navigator.clipboard.writeText(selected);
        showActionFeedback(t('notes.copySuccess'), 'success');
      } catch {
        showActionFeedback(t('notes.copyError'), 'error');
      }
      return;
    }
    await handleCopy();
  };
  const handleContextCut = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) {
      showActionFeedback(t('notes.cutNoSelection'), 'info');
      return;
    }
    const selected = editor.state.doc.textBetween(from, to, ' ');
    try {
      await navigator.clipboard.writeText(selected);
      editor.chain().focus().deleteSelection().run();
      setSaved(false);
      showActionFeedback(t('notes.cutSuccess'), 'success');
    } catch {
      showActionFeedback(t('notes.cutError'), 'error');
    }
  };
  const handleContextPaste = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const clipText = await navigator.clipboard.readText();
      if (!clipText.trim()) {
        showActionFeedback(t('notes.pasteEmpty'), 'info');
        return;
      }
      editor.chain().focus().insertContent(safeHtmlParagraphs(clipText)).run();
      setSaved(false);
      showActionFeedback(t('notes.pasteSuccess'), 'success');
    } catch {
      showActionFeedback(t('notes.pasteError'), 'error');
    }
  };
  const handleContextSelectAll = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.chain().focus().selectAll().run();
  };
  const handleExport = (fmt: ExportFormat) => {
    const noteTitle = title.trim() || smartTitle(uiLanguage);
    const ok = exportNote(noteTitle, htmlContent, fmt);
    if (ok) showActionFeedback(t('export.started').replace('{format}', fmt.toUpperCase()), 'success');
    else showActionFeedback(t('export.blocked'), 'error');
  };
  const handleExportSelected = (fmt: ExportFormat) => {
    if (selectedDocs.length === 0) {
      showActionFeedback(t('notes.selectToExport'), 'info');
      return;
    }
    const bundleTitle = `${t('notes.title')} ${new Date().toISOString().slice(0, 10)}`;
    const ok = exportNotesBundle(
      bundleTitle,
      selectedDocs.map((doc) => ({ title: doc.title, html: doc.content, updatedAt: doc.updated_at })),
      fmt,
    );
    if (ok) {
      showActionFeedback(
        t('export.startedMany')
          .replace('{count}', String(selectedDocs.length))
          .replace('{format}', fmt.toUpperCase()),
        'success',
      );
    } else {
      showActionFeedback(t('export.blocked'), 'error');
    }
  };
  const formatUnits = (value: number) => value.toLocaleString(uiLanguage === 'es' ? 'es-ES' : 'en-US');
  const openBudgetDialog = (kind: BudgetDialogKind, message: string) => {
    if (budgetResolverRef.current) budgetResolverRef.current(false);
    setBudgetDialog({ open: true, kind, message });
    return new Promise<boolean>((resolve) => { budgetResolverRef.current = resolve; });
  };
  const resolveBudgetDialog = (ok: boolean) => {
    setBudgetDialog((prev) => ({ ...prev, open: false }));
    const resolve = budgetResolverRef.current;
    budgetResolverRef.current = null;
    if (resolve) resolve(ok);
  };
  const validateAiBudget = async (txt: string): Promise<boolean> => {
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
  };
  const handleAiEdit = async (aiMode: string, prompt?: string, textOverride?: string) => {
    const txt = (textOverride?.trim() || plainText || htmlContent.replace(/<[^>]*>/g, '')).trim();
    if (!txt) return;
    setAiError('');
    if (!(await validateAiBudget(txt))) return;
    setProcessing(true);
    try {
      const res = await api.aiEdit.edit({ text: txt, mode: aiMode, prompt });
      setHtmlContent(safeHtmlParagraphs(res.text)); setSaved(false);
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
    } finally { setProcessing(false); }
  };

  const handleReadSelection = useCallback((text: string) => {
    startNoteReader(text);
  }, [startNoteReader]);

  const handleAiSelection = useCallback((text: string) => {
    void handleAiEdit('casual', undefined, text);
  }, [handleAiEdit]);

  const renderDockAction = ({
    icon,
    label,
    onClick,
    disabled,
    tone = 'neutral',
    kind = 'action',
    testId,
    title,
    iconClassName,
  }: {
    icon: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    tone?: 'neutral' | 'primary' | 'danger';
    kind?: 'action' | 'setting';
    testId?: string;
    title?: string;
    iconClassName?: string;
  }) => {
    const isAction = kind === 'action';
    const color = tone === 'primary'
      ? 'text-primary'
      : tone === 'danger'
        ? 'text-red-400'
        : isAction ? 'text-text/90' : 'text-muted/70';

    return (
      <button
        type="button"
        onClick={() => {
          onClick();
          if (isAction) closeContextMenu();
        }}
        disabled={disabled}
        data-testid={testId}
        title={title ?? label}
        className={`group flex min-h-8 w-full items-center gap-2.5 rounded px-2 py-1 text-[13px] leading-5 transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-25 ${color}`}
      >
        <span className={`material-symbols-outlined w-4 shrink-0 text-center text-[16px] ${!isAction ? 'opacity-60' : ''} ${iconClassName ?? ''}`}>{icon}</span>
        <span className={`truncate ${isAction ? 'font-medium' : 'font-normal opacity-80'}`}>{label}</span>
      </button>
    );
  };

  const renderDockDivider = () => (
    <div className="mx-2 my-1 h-px bg-white/[0.06]" />
  );

  const noteContextMenu = contextMenuPos && contextMenuStyle ? (
    <div
      ref={contextMenuRef}
      style={{ left: contextMenuStyle.left, top: contextMenuStyle.top }}
      className="fixed z-[90] w-[236px] rounded-lg border border-white/[0.08] bg-[#161e29]/[0.98] py-1 shadow-[0_8px_30px_rgba(0,0,0,0.5),0_0_0_0.5px_rgba(255,255,255,0.04)] backdrop-blur-xl"
      data-testid="note-context-menu"
    >
      <div className="max-h-[60vh] overflow-y-auto">
        <div data-testid="note-panel-edit">
          <p className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/40">{t('notes.groupEdit')}</p>
          {renderDockAction({
            icon: 'content_copy',
            label: t('dictate.copy'),
            onClick: () => { void handleContextCopy(); },
            testId: 'note-context-copy-btn',
          })}
          {renderDockAction({
            icon: 'content_cut',
            label: t('notes.cut'),
            onClick: () => { void handleContextCut(); },
            testId: 'note-context-cut-btn',
          })}
          {renderDockAction({
            icon: 'content_paste',
            label: t('widget.paste'),
            onClick: () => { void handleContextPaste(); },
            testId: 'note-context-paste-btn',
          })}
          {renderDockAction({
            icon: 'select_all',
            label: t('notes.selectAll'),
            onClick: handleContextSelectAll,
            testId: 'note-context-select-all-btn',
          })}
        </div>

        {renderDockDivider()}

        {contextMenuMode === 'convert' && (
          <div data-testid="note-panel-convert">
            <PlanGate resource="stt_seconds">
              <div>
                <p className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/40">{t('notes.groupCapture')}</p>
                {renderDockAction({
                  icon: status === 'recording' ? 'stop' : 'mic',
                  iconClassName: status === 'recording' ? '' : 'fill-1',
                  label: status === 'recording' ? t('voice.recording') : t('voice.record'),
                  onClick: handleToggle,
                  disabled: status === 'processing',
                  tone: status === 'recording' ? 'danger' : 'primary',
                  testId: 'record-btn',
                })}
                {renderDockAction({
                  icon: live.source === 'mic' ? 'mic' : 'desktop_windows',
                  label: live.source === 'mic' ? `${t('dictate.mic')} → ${t('dictate.system')}` : `${t('dictate.system')} → ${t('dictate.mic')}`,
                  onClick: handleToggleSource,
                  disabled: status === 'recording',
                  kind: 'setting',
                  testId: 'source-toggle',
                  title: live.source === 'mic' ? t('dictate.switchSystem') : t('dictate.switchMic'),
                })}
                {renderDockAction({
                  icon: 'translate',
                  label: t('dictate.translate'),
                  onClick: () => setTranslateEnabled(!translateEnabled),
                  tone: translateEnabled ? 'primary' : 'neutral',
                  kind: 'setting',
                  testId: 'translate-toggle',
                  title: translateEnabled ? t('dictate.disableTranslation') : t('dictate.enableTranslation'),
                })}
                {isLive && renderDockAction({
                  icon: 'subtitles',
                  label: subtitlesActive ? t('dictate.hideSubtitles') : t('dictate.showSubtitles'),
                  onClick: handleToggleSubtitles,
                  tone: subtitlesActive ? 'primary' : 'neutral',
                  kind: 'setting',
                  testId: 'subtitles-toggle',
                })}

                {renderDockDivider()}
                <p className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/40">{t('notes.groupImport')}</p>
                {renderDockAction({
                  icon: 'upload_file',
                  label: importDocLoading ? t('history.loading') : t('notes.importDocument'),
                  onClick: () => importFileInputRef.current?.click(),
                  disabled: importDocLoading,
                  testId: 'note-import-file-btn',
                })}
                {renderDockAction({
                  icon: importDocForceOcr ? 'check_box' : 'check_box_outline_blank',
                  label: t('notes.importForceOcr'),
                  onClick: () => setImportDocForceOcr((prev) => !prev),
                  tone: importDocForceOcr ? 'primary' : 'neutral',
                  kind: 'setting',
                  testId: 'note-import-force-ocr',
                })}

                {renderDockDivider()}
                <p className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/40">{t('notes.groupTranscribe')}</p>
                {renderDockAction({
                  icon: 'graphic_eq',
                  label: retranscribeLoading ? t('transcribe.processing') : t('notes.retranscribeNow'),
                  onClick: () => { void handleRetranscribeFromNote(); },
                  disabled: retranscribeLoading || !docId || !currentAudioUrl,
                  tone: 'primary',
                  testId: 'note-transcribe-file-btn',
                })}
                {renderDockAction({
                  icon: retranscribeDiarization ? 'check_box' : 'check_box_outline_blank',
                  label: t('transcribe.diarization'),
                  onClick: () => setRetranscribeDiarization((v) => !v),
                  tone: retranscribeDiarization ? 'primary' : 'neutral',
                  kind: 'setting',
                  testId: 'note-transcribe-diarize',
                })}
              </div>
            </PlanGate>
          </div>
        )}

        {contextMenuMode === 'work' && (
          <div data-testid="note-panel-work">
            <div>
              <p className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/40">{t('notes.groupRead')}</p>
              <PlanGate resource="tts_chars">
                <div>
                  {renderDockAction({
                    icon: noteReadProgress.status === 'playing' ? 'pause' : 'play_arrow',
                    label: noteReaderPlayLabel,
                    onClick: () => {
                      const selected = getSelectedEditorText();
                      if (selected) {
                        handleReadSelection(selected);
                        return;
                      }
                      handleToggleNoteReader();
                    },
                    disabled: !noteReaderHasText && !getSelectedEditorText(),
                    testId: 'note-reader-toggle-btn',
                  })}
                  {renderDockAction({
                    icon: 'stop',
                    label: t('reader.stop'),
                    onClick: handleStopNoteReader,
                    disabled: noteReadProgress.status === 'idle',
                    testId: 'note-reader-stop-btn',
                  })}
                  {renderDockAction({
                    icon: 'speed',
                    label: `${(noteReadProgress.rate || 1).toFixed(2)}x`,
                    onClick: handleCycleNoteReaderSpeed,
                    kind: 'setting',
                    testId: 'note-reader-speed-btn',
                    title: `${t('reader.speed')} ${(noteReadProgress.rate || 1).toFixed(2)}x`,
                  })}
                  {renderDockAction({
                    icon: 'download',
                    label: t('reader.download'),
                    onClick: handleDownloadNoteRead,
                    disabled: !noteCanDownloadRead,
                    testId: 'note-reader-download-btn',
                  })}
                </div>
              </PlanGate>

              {renderDockDivider()}
              <p className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/40">{t('notes.groupAi')}</p>
              <div>
                {renderDockAction({
                  icon: 'auto_awesome',
                  label: t('editor.casual'),
                  onClick: () => {
                    const selected = getSelectedEditorText();
                    void handleAiEdit('casual', undefined, selected || undefined);
                  },
                  disabled: processing || !hasContent,
                  tone: 'primary',
                  testId: 'ai-casual',
                })}
                {BUILT_IN_MODES.filter((m) => m.id !== 'casual').map((m) => renderDockAction({
                  icon: m.icon,
                  label: t(`editor.${m.id}`),
                  onClick: () => {
                    const selected = getSelectedEditorText();
                    void handleAiEdit(m.id, undefined, selected || undefined);
                  },
                  disabled: processing || !hasContent,
                  testId: `ai-${m.id}`,
                }))}
                {renderDockAction({
                  icon: 'add_circle',
                  label: t('editor.customPrompts'),
                  onClick: () => setShowPromptDialog(true),
                })}
                {customPrompts.slice(0, 2).map((p) => renderDockAction({
                  icon: p.icon,
                  label: p.name,
                  onClick: () => {
                    const selected = getSelectedEditorText();
                    void handleAiEdit('custom', p.prompt, selected || undefined);
                  },
                  disabled: processing || !hasContent,
                  tone: 'primary',
                  title: p.name,
                }))}
              </div>
            </div>
          </div>
        )}

        {renderDockDivider()}
        <p className="px-3 pb-1 text-[10px] leading-tight text-muted/40">{t('notes.processNeedsSave')}</p>
      </div>
    </div>
  ) : null;

  useEffect(() => {
    return () => {
      stopTTS();
      if (actionFeedbackTimer.current) clearTimeout(actionFeedbackTimer.current);
      if (budgetResolverRef.current) {
        budgetResolverRef.current(false);
        budgetResolverRef.current = null;
      }
    };
  }, []);

  // ─── LIST MODE ───
  if (mode === 'list') return (
    <div className="flex-1 min-h-0 relative flex flex-col bg-base" data-testid="dictate-page">
      <div className="px-8 pt-12 pb-4">
        <div className="flex justify-between items-start mb-5">
          <div><h2 className="text-3xl font-black tracking-tight mb-2">{t('notes.title')}</h2><p className="text-muted">{t('notes.desc')}</p></div>
          <div className="flex items-center gap-2">
            <button onClick={() => newNote(true)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface border border-edge text-muted text-sm font-medium hover:text-primary hover:border-primary/30 transition-colors" data-testid="voice-note-btn" title={t('notes.voiceNote')}>
              <span className="material-symbols-outlined text-[18px] fill-1">mic</span>{t('notes.voiceNote')}
            </button>
            <button onClick={() => newNote()} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors" data-testid="new-note-btn">
              <span className="material-symbols-outlined text-[18px]">add</span>{t('notes.new')}
            </button>
          </div>
        </div>
        <div className="mt-1 rounded-2xl border border-edge bg-surface/40 p-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[240px] max-w-[420px]">
              <span className="material-symbols-outlined text-[20px] text-muted absolute left-3 top-1/2 -translate-y-1/2">search</span>
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t('notes.search')}
                className="w-full pl-10 pr-4 h-11 rounded-xl bg-surface border border-edge text-sm text-text placeholder:text-muted/50 outline-none focus:border-primary transition-colors" data-testid="notes-search" />
            </div>
            <div className="flex items-center gap-1.5 px-2.5 h-11 rounded-xl bg-surface border border-edge shrink-0">
              {NOTE_COLORS.map((c) => (
                <button key={c} onClick={() => setColorFilter(colorFilter === c ? null : c)}
                  className={`w-5 h-5 rounded-full ${COLOR_STYLES[c].dot} transition-all ${colorFilter === c ? 'ring-2 ring-[var(--theme-text)] ring-offset-1 ring-offset-[var(--theme-base)] scale-110' : 'opacity-60 hover:opacity-100'}`}
                  title={c} data-testid={`filter-${c}`} />
              ))}
              {(colorFilter || searchQuery) && (
                <button onClick={() => { setColorFilter(null); setSearchQuery(''); }} className="ml-1 p-0.5 rounded text-muted hover:text-text" title={t('notes.clearFilter')}>
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>
            <button onClick={toggleView} className="h-11 w-11 rounded-xl bg-surface border border-edge text-muted hover:text-text transition-colors shrink-0 grid place-items-center" title={viewMode === 'grid' ? 'List view' : 'Grid view'} data-testid="view-toggle">
              <span className="material-symbols-outlined text-[20px]">{viewMode === 'grid' ? 'view_list' : 'grid_view'}</span>
            </button>
            <button
              type="button"
              onClick={selectAllVisible}
              disabled={filteredDocs.length === 0}
              className="h-11 px-3 rounded-xl bg-surface border border-edge text-xs text-muted hover:text-text transition-colors disabled:opacity-30"
              data-testid="select-all-notes-btn"
            >
              {t('notes.selectAllVisible')}
            </button>
          </div>
          {selectedNoteIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pl-0.5">
              <span className="text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-2.5 py-1.5 font-medium" data-testid="selected-count">
                {t('notes.selectedCount').replace('{count}', String(selectedNoteIds.length))}
              </span>
              <button type="button" onClick={clearSelection}
                className="px-2.5 py-1.5 rounded-lg bg-surface border border-edge text-xs text-muted hover:text-text transition-colors"
                data-testid="clear-selection-btn">
                {t('notes.clearSelection')}
              </button>
              <button type="button" onClick={() => setPendingBulkDelete(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-edge text-xs text-muted hover:text-red-400 hover:border-red-400/30 transition-colors"
                data-testid="bulk-delete-btn" title={t('notes.deleteSelected')}>
                <span className="material-symbols-outlined text-[16px]">delete</span>{t('notes.deleteSelected')}
              </button>
              <div className="relative">
                <button type="button" onClick={() => setShowBulkExport((prev) => !prev)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-edge text-xs text-muted hover:text-text transition-colors"
                  data-testid="bulk-export-btn" title={t('notes.exportSelected')}>
                  <span className="material-symbols-outlined text-[16px]">download</span>{t('notes.exportSelected')}
                </button>
                {showBulkExport && (
                  <div className="absolute right-0 top-full mt-1 bg-surface border border-edge rounded-xl shadow-xl py-1 z-50 min-w-[160px]" data-testid="bulk-export-menu">
                    {(['txt', 'md', 'docx', 'pdf'] as ExportFormat[]).map((fmt) => (
                      <button key={fmt} type="button"
                        onClick={() => { handleExportSelected(fmt); setShowBulkExport(false); }}
                        className="w-full px-4 py-2 text-sm text-left text-text hover:bg-surface-alt transition-colors"
                        data-testid={`bulk-export-${fmt}`}>
                        {t(`export.${fmt}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <FolderChips documents={documents} selectedFolderId={selectedFolderId} onSelectFolder={selectFolder} onDeleteFolder={(id) => setPendingDeleteFolderId(id)} />
        </div>
      </div>
      <div className="flex-1 overflow-auto px-8 pb-8">
        {loading && filteredDocs.length > 0 && (
          <div className="mb-3 flex items-center">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" data-testid="notes-loading-indicator" />
          </div>
        )}
        {loading && filteredDocs.length === 0 && (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-2" data-testid="notes-loading-skeleton-grid">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={`grid-skeleton-${idx}`} className="h-[140px] rounded-xl border border-edge bg-surface animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2 mb-2" data-testid="notes-loading-skeleton-list">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={`list-skeleton-${idx}`} className="h-[76px] rounded-xl border border-edge bg-surface animate-pulse" />
              ))}
            </div>
          )
        )}
        {!loading && filteredDocs.length === 0 && (
          <div className="text-center py-16 text-muted">
            <span className="material-symbols-outlined text-[48px] mb-4 block">note_stack</span>
            <p>{searchQuery || colorFilter ? t('notes.noResults') : t('notes.empty')}</p>
          </div>
        )}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="notes-grid">
            {filteredDocs.map((doc) => {
              const color = getColor(doc.tags ?? []);
              const cs = COLOR_STYLES[color];
              const src = doc.source ?? 'manual';
              const preview = doc.content.replace(/<[^>]*>/g, '').slice(0, 120);
              const isSelected = selectedNoteIds.includes(doc.id);
              return (
                <div key={doc.id} onClick={() => openNote(doc.id)}
                  className={`flex flex-col p-4 rounded-2xl border border-edge/80 border-l-4 ${cs.border} bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 transition-all text-left group min-h-[170px] cursor-pointer`} data-testid={`note-${doc.id}`}>
                  <div className="flex items-start gap-2 mb-2.5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleSelection(doc.id); }}
                      className="p-0.5 rounded text-muted hover:text-text mt-0.5"
                      data-testid={`select-note-${doc.id}`}
                      title={t('notes.exportSelected')}
                    >
                      <span className="material-symbols-outlined text-[18px]">{isSelected ? 'check_box' : 'check_box_outline_blank'}</span>
                    </button>
                    <span className={`material-symbols-outlined text-[16px] grid place-items-center h-6 w-6 rounded-md ${cs.bg} text-muted shrink-0`}>{SOURCE_ICONS[src]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-text truncate">{doc.title}</p>
                      <p className="text-[11px] text-muted uppercase tracking-wide mt-0.5">{sourceLabel(src)}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {folders.length > 0 && (
                        <select value={doc.folder_id ?? ''} onClick={(e) => e.stopPropagation()}
                          onChange={(e) => { e.stopPropagation(); handleMoveToFolder(doc.id, e.target.value || null); }}
                          className="styled-select text-[10px] bg-surface border border-edge rounded px-1 py-0.5 text-text cursor-pointer outline-none shrink-0"
                          title={t('folders.moveToFolder')} data-testid={`move-doc-${doc.id}`}>
                          <option value="">{t('folders.allNotes')}</option>
                          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteNote(doc.id); }}
                        className="p-1 rounded text-muted hover:text-red-400 hover:bg-red-400/10 transition-all shrink-0" title={t('notes.delete')}>
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-[13px] text-text-secondary/90 leading-5 line-clamp-3 flex-1">{preview || '...'}</p>
                  <div className="mt-3 pt-2 border-t border-edge/60 flex items-center justify-between">
                    <span className="text-[11px] text-muted">{relativeDate(doc.updated_at, uiLanguage)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-2" data-testid="notes-list">
            {filteredDocs.map((doc) => {
              const color = getColor(doc.tags ?? []);
              const cs = COLOR_STYLES[color];
              const src = doc.source ?? 'manual';
              const preview = doc.content.replace(/<[^>]*>/g, '').slice(0, 100);
              const isSelected = selectedNoteIds.includes(doc.id);
              return (
                <div key={doc.id} onClick={() => openNote(doc.id)}
                  className={`flex items-start gap-3 p-4 rounded-2xl border border-edge border-l-4 ${cs.border} bg-surface hover:bg-surface-alt/70 transition-colors text-left group cursor-pointer`} data-testid={`note-${doc.id}`}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleSelection(doc.id); }}
                    className="p-0.5 rounded text-muted hover:text-text shrink-0 mt-1"
                    data-testid={`select-note-${doc.id}`}
                    title={t('notes.exportSelected')}
                  >
                    <span className="material-symbols-outlined text-[18px]">{isSelected ? 'check_box' : 'check_box_outline_blank'}</span>
                  </button>
                  <span className={`material-symbols-outlined text-[18px] grid place-items-center h-8 w-8 rounded-lg ${cs.bg} text-muted shrink-0`}>{SOURCE_ICONS[src]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-text truncate">{doc.title}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-edge text-muted uppercase tracking-wide shrink-0">{sourceLabel(src)}</span>
                    </div>
                    <p className="text-xs text-text-secondary/90 line-clamp-2 mt-1.5">{preview}</p>
                    <span className="text-[11px] text-muted mt-2 block">{relativeDate(doc.updated_at, uiLanguage)}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {folders.length > 0 && (
                      <select value={doc.folder_id ?? ''} onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { e.stopPropagation(); handleMoveToFolder(doc.id, e.target.value || null); }}
                        className="styled-select text-xs bg-surface border border-edge rounded px-1.5 py-1 text-text cursor-pointer outline-none shrink-0"
                        title={t('folders.moveToFolder')} data-testid={`move-doc-${doc.id}`}>
                        <option value="">{t('folders.allNotes')}</option>
                        {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteNote(doc.id); }}
                      className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-all shrink-0" title={t('notes.delete')}>
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={!!pendingDeleteNoteId}
        title={t('notes.delete')}
        message={t('notes.confirmDelete')}
        confirmLabel={t('notes.delete')}
        cancelLabel={t('editor.cancel')}
        tone="danger"
        onConfirm={confirmDeleteNote}
        onCancel={() => setPendingDeleteNoteId(null)}
      />
      <ConfirmDialog
        open={pendingBulkDelete}
        title={t('notes.deleteSelected')}
        message={t('notes.confirmBulkDelete').replace('{count}', String(selectedNoteIds.length))}
        confirmLabel={t('notes.delete')}
        cancelLabel={t('editor.cancel')}
        tone="danger"
        onConfirm={confirmBulkDelete}
        onCancel={() => setPendingBulkDelete(false)}
      />
      <ConfirmDialog
        open={!!pendingDeleteFolderId}
        title={t('folders.delete')}
        message={t('folders.confirmDelete')}
        confirmLabel={t('folders.delete')}
        cancelLabel={t('editor.cancel')}
        tone="danger"
        onConfirm={() => { if (pendingDeleteFolderId) { deleteFolder(pendingDeleteFolderId); setPendingDeleteFolderId(null); } }}
        onCancel={() => setPendingDeleteFolderId(null)}
      />
    </div>
  );

  // ─── EDIT MODE ───
  return (
    <div className="flex-1 min-h-0 relative flex flex-col bg-base" data-testid="dictate-page">
      <header className="shrink-0 px-8 pt-8 pb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <button onClick={goBack} className="flex items-center gap-2 text-sm text-muted hover:text-primary transition-colors" data-testid="back-to-notes">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span><span className="font-medium">{t('editor.backToNotes')}</span>
          </button>
          <div className="flex items-center gap-3">
            {status === 'recording' && <span className="flex h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />}
            {!isLive && dictation.error && status !== 'recording' && <span className="text-xs text-red-400 max-w-[200px] truncate" title={dictation.error}>{t('dictate.flushError')}</span>}
            {isLive && live.error && <span className="text-xs text-red-400 max-w-[260px] truncate" title={live.error}>{formatLiveError(live.error, t)}</span>}
            {live.autoSaveError && <span className="text-xs text-yellow-400 max-w-[200px] truncate" title={live.autoSaveError}>{t('live.autoSaveError')}</span>}
            {saveError && <span className="text-xs text-red-400 max-w-[300px] truncate" title={saveError}>{saveError}</span>}
            {saved && !saveError && <span className="text-xs text-emerald-400 flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">check_circle</span>{t('editor.saved')}</span>}
            {actionFeedback && (
              <span className={`text-xs flex items-center gap-1 ${actionFeedback.tone === 'success' ? 'text-emerald-400' : actionFeedback.tone === 'error' ? 'text-red-400' : 'text-primary'}`}>
                <span className="material-symbols-outlined text-[14px]">{actionFeedback.tone === 'success' ? 'check_circle' : actionFeedback.tone === 'error' ? 'error' : 'info'}</span>
                {actionFeedback.message}
              </span>
            )}
            <button onClick={handleCopy} disabled={!hasContent} title={t('dictate.copy')}
              className="p-2 rounded-lg text-muted hover:text-primary hover:bg-surface transition-colors disabled:opacity-30" data-testid="copy-btn">
              <span className="material-symbols-outlined text-[18px]">content_copy</span>
            </button>
            <div className="relative">
              <button type="button" onClick={() => { const next = !showExport; setShowExport(next); if (next) showActionFeedback(t('export.chooseFormat'), 'info'); }} disabled={!hasContent} title={t('export.title')}
                className="p-2 rounded-lg text-muted hover:text-primary hover:bg-surface transition-colors disabled:opacity-30" data-testid="export-btn">
                <span className="material-symbols-outlined text-[18px]">download</span>
              </button>
              {showExport && (
                <div className="absolute right-0 top-full mt-1 bg-surface border border-edge rounded-xl shadow-xl py-1 z-50 min-w-[160px]" data-testid="export-menu">
                  {(['txt', 'md', 'docx', 'pdf'] as ExportFormat[]).map((fmt) => (
                    <button key={fmt} type="button" onClick={() => { handleExport(fmt); setShowExport(false); }}
                      className="w-full px-4 py-2 text-sm text-left text-text hover:bg-surface-alt transition-colors" data-testid={`export-${fmt}`}>
                      {t(`export.${fmt}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={handleSave} disabled={!hasContent}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-30" data-testid="save-btn">
              <span className="material-symbols-outlined text-[18px]">save</span>{t('notes.save')}
            </button>
          </div>
        </div>
        {/* Title + color picker */}
        <div className="flex items-center gap-3">
          <input className="text-2xl font-bold text-text bg-transparent outline-none border-b border-transparent focus:border-primary pb-1 flex-1"
            value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} placeholder={t('editor.untitled')} data-testid="editor-title" />
          <div className="flex items-center gap-1.5 shrink-0">
            {NOTE_COLORS.map((c) => (
              <button key={c} onClick={() => handleColorChange(c)}
                className={`w-4 h-4 rounded-full ${COLOR_STYLES[c].dot} transition-all ${noteColor === c ? 'ring-2 ring-[var(--theme-text)] scale-125' : 'opacity-40 hover:opacity-80'}`}
                title={c} />
            ))}
          </div>
        </div>
        <input
          ref={importFileInputRef}
          type="file"
          accept=".txt,.md,.markdown,.html,.htm,.pdf,.docx,.epub,.rtf,.odt,.png,.jpg,.jpeg,.webp,.tif,.tiff"
          className="hidden"
          onChange={(e) => { void handleImportDocument(e.target.files?.[0]); e.currentTarget.value = ''; }}
          data-testid="note-import-file-input"
        />
        {docId && currentAudioUrl && (
          <div className="mt-2 rounded-xl border border-edge bg-surface/50 px-3 py-2 flex flex-wrap items-center gap-2" data-testid="note-retranscribe-controls">
            <span className="text-xs text-muted">{t('notes.retranscribe')}</span>
            <select
              value={retranscribeLanguage}
              onChange={(e) => setRetranscribeLanguage(e.target.value)}
              className="styled-select text-xs bg-surface border border-edge rounded px-2 py-1 text-text cursor-pointer outline-none"
              data-testid="note-retranscribe-language"
            >
              <option value="auto">{t('transcribe.autoDetect')}</option>
              <option value="es">Español</option>
              <option value="en">English</option>
              <option value="pt">Português</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="it">Italiano</option>
            </select>
            <label className="inline-flex items-center gap-1.5 text-xs text-muted select-none">
              <input
                type="checkbox"
                checked={retranscribeDiarization}
                onChange={(e) => setRetranscribeDiarization(e.target.checked)}
                className="accent-primary"
                data-testid="note-retranscribe-diarization"
              />
              {t('transcribe.diarization')}
            </label>
            <button
              type="button"
              onClick={() => { void handleRetranscribeFromNote(); }}
              disabled={retranscribeLoading}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              data-testid="note-retranscribe-btn"
            >
              <span className="material-symbols-outlined text-[14px]">refresh</span>
              {retranscribeLoading ? t('transcribe.processing') : t('notes.retranscribeNow')}
            </button>
            {retranscribeError && <span className="w-full text-xs text-red-400 mt-1">{retranscribeError}</span>}
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-y-auto px-8 pb-8 flex justify-center">
          <div className="w-full max-w-3xl">
            {isLive && live.status === 'recording' && live.segments.length === 0 && !live.interimText && !live.error && (
              <div className="flex flex-col items-center justify-center py-16 gap-4" data-testid="live-listening-inline">
                <div className="relative flex items-center justify-center h-16 w-16">
                  <span className="material-symbols-outlined text-[52px] text-primary">hearing</span>
                  <span className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
                </div>
                <p className="text-base font-semibold text-text">{t('live.listening')}</p>
                <p className="text-sm text-muted text-center max-w-md">{t('live.listeningDesc')}</p>
              </div>
            )}
            {isLive && live.status === 'recording' && live.interimText && (
              <div className="px-4 py-3 mb-4 rounded-lg border border-primary/30 bg-primary/10" data-testid="live-interim">
                <span className="text-base text-text-secondary/70">{live.interimText}</span>
                <span className="inline-block w-0.5 h-5 bg-primary ml-1 animate-pulse align-middle" />
              </div>
            )}
            {docId && (historyLoading || !!historyError || transcriptHistory.length > 0) && (
              <div className="mb-4 rounded-xl border border-edge bg-surface/50 p-3" data-testid="note-transcript-history">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-text">{t('notes.transcriptionHistory')}</p>
                  <span className="text-[11px] text-muted">{transcriptHistory.length}</span>
                </div>
                {historyLoading && <p className="text-xs text-muted">{t('history.loading')}</p>}
                {historyError && !historyLoading && <p className="text-xs text-red-400">{historyError}</p>}
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                  {transcriptHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className={`rounded-lg border px-2 py-2 ${activeHistoryId === entry.id ? 'border-primary/50 bg-primary/10' : 'border-edge bg-surface'}`}
                      data-testid={`history-entry-${entry.id}`}
                    >
                      <div className="flex items-center gap-2 text-[11px] text-muted">
                        <span>{new Date(entry.created_at).toLocaleString(uiLanguage === 'es' ? 'es-ES' : 'en-US')}</span>
                        <span>•</span>
                        <span>{entry.language}</span>
                        <span>•</span>
                        <span>{entry.diarization ? t('transcribe.diarization') : t('notes.noDiarization')}</span>
                      </div>
                      <p className="text-xs text-text mt-1 line-clamp-2">{entry.text || '...'}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleApplyHistoryEntry(entry.id)}
                          className="text-[11px] px-2 py-1 rounded bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                          data-testid={`history-apply-${entry.id}`}
                        >
                          {t('notes.applyTranscription')}
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleDeleteHistoryEntry(entry.id); }}
                          className="text-[11px] px-2 py-1 rounded bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors"
                          data-testid={`history-delete-${entry.id}`}
                        >
                          {t('notes.deleteTranscription')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="relative" onContextMenu={handleEditorContextMenu} data-testid="note-editor-interaction-zone">
              <RichEditor
                content={htmlContent}
                onChange={handleEditorChange}
                placeholder={t('dictate.placeholder')}
                onEditorReady={(e) => { editorRef.current = e; }}
                onReadSelection={handleReadSelection}
                onAiSelection={handleAiSelection}
              />
            </div>
            {showAudioPanel && (
              <div className="mt-6 rounded-xl border border-edge bg-surface/40 p-4">
                {showTranscriptPanel ? (
                  <TranscriptView
                    segments={activeSegments}
                    activeIndex={activeSegmentIndex}
                    speakerAliases={speakerAliases}
                    onSelectSegment={handleSelectSegment}
                    onRenameSpeaker={handleRenameSpeaker}
                  />
                ) : (
                  <p className="text-xs text-muted mb-2">{t('notes.audioNoTranscript')}</p>
                )}
                {currentAudioUrl && (
                  <div className="mt-4">
                    <AudioPlayer
                      audioUrl={currentAudioUrl}
                      title={title || t('notes.voiceNote')}
                      activeSegmentText={activeSegmentText}
                      seekRequest={seekRequest}
                      onTimeUpdate={handlePlayerTimeUpdate}
                    />
                  </div>
                )}
              </div>
            )}
            {dictation.translatedText && (
              <div className="pt-2 mt-4 border-t border-edge text-base text-muted italic whitespace-pre-wrap" data-testid="translated-text">{dictation.translatedText}</div>
            )}
          </div>
        </div>
        <DebatePanel
          noteId={docId}
          noteTitle={title}
          noteText={noteReaderText}
          getEditor={() => editorRef.current}
          onNotify={(message, tone) => { showActionFeedback(message, tone); }}
        />
      </div>
      {noteContextMenu}
      {showPromptDialog && <CustomPromptDialog prompts={customPrompts} onSave={(p) => { setCustomPrompts(p); saveCustomPrompts(p); }} onClose={() => setShowPromptDialog(false)} />}
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
