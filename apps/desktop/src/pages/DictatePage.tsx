import { useState, useEffect, useRef, useMemo, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import type { EditorHandle } from '../components/editor/milkdown/api/EditorHandle';
import type { Page } from '../App';
import { ApiError, type TranscriptSegment, type Folder } from '@whisperall/api-client';
import { useDictationStore } from '../stores/dictation';
import { useLiveStore } from '../stores/live';
import { useSettingsStore } from '../stores/settings';
import { useDocumentsStore } from '../stores/documents';
import { useUiStore } from '../stores/ui';
import { useFoldersStore } from '../stores/folders';
import { useAuthStore } from '../stores/auth';
import { useProcessesStore } from '../stores/processes';
import { useNotificationsStore } from '../stores/notifications';
import { resolveTranscriptionJobProgress, resolveTranscriptionJobStage, transcriptionStageDetailKey, transcriptionStageLabelKey, useTranscriptionStore } from '../stores/transcription';
import { electron } from '../lib/electron';
import { api } from '../lib/api';
import { createRevealQueue } from '../lib/typewriter';
import { copyText } from '../lib/clipboard-utils';
import { Button } from '../components/ui/Button';
// WidgetDock moved to AppShell (global dock slot).
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
import { MilkdownEditor } from '../components/editor/MilkdownEditor';
import { type AudioSeekRequest } from '../components/editor/AudioPlayer';
import { NoteAudioPanel } from '../components/notes/NoteAudioPanel';
import { NoteRetranscribePanel } from '../components/notes/NoteRetranscribePanel';
import { NoteTranscriptHistoryPanel } from '../components/notes/NoteTranscriptHistoryPanel';
import { NoteProcessesPanel } from '../components/notes/NoteProcessesPanel';
import { CustomPromptDialog, type CustomPrompt } from '../components/editor/CustomPromptDialog';
import { AiBudgetDialog } from '../components/editor/AiBudgetDialog';
import { DebatePanel } from '../components/notes/DebatePanel';
import { FolderPicker } from '../components/notes/FolderPicker';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useNotesActionsStore } from '../stores/notes-actions';
import { useT } from '../lib/i18n';
import { promptText } from '../lib/prompt';
import { relativeDate, smartTitle, stripMediaExtension, sanitizeDisplayTitle } from '../lib/format-date';
import { projectAiEditBudget } from '../lib/ai-edit-budget';
import { requestPlanRefresh, usePlanStore } from '../stores/plan';

const SOURCE_ICONS: Record<string, string> = { dictation: 'mic', live: 'groups', transcription: 'description', manual: 'edit_note', reader: 'menu_book' };
type TranscribeLanguage = { code: string; label?: string; labelKey?: string };
const TRANSCRIBE_LANGUAGES: ReadonlyArray<TranscribeLanguage> = [
  { code: 'auto', labelKey: 'transcribe.autoDetect' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
];
const BUILT_IN_MODES = [
  { id: 'casual', icon: 'chat' }, { id: 'clean_fillers', icon: 'cleaning_services' },
  { id: 'formal', icon: 'school' }, { id: 'summarize', icon: 'summarize' },
] as const;

// ——— Color tag system ———
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
type NoteUtilityPanel = 'none' | 'history' | 'retranscribe' | 'audio';
const VIEW_KEY = 'whisperall-notes-view';
function loadViewMode(): ViewMode { return (localStorage.getItem(VIEW_KEY) as ViewMode) || 'grid'; }

const PROMPTS_KEY = 'whisperall-custom-prompts';
function loadCustomPrompts(): CustomPrompt[] { try { return JSON.parse(localStorage.getItem(PROMPTS_KEY) ?? '[]'); } catch { return []; } }
function saveCustomPrompts(p: CustomPrompt[]) { localStorage.setItem(PROMPTS_KEY, JSON.stringify(p)); }

type DictatePageProps = { onNavigate?: (page: Page) => void };

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

/**
 * Per-card hover-actions cluster. Absolute-positioned at the card's
 * top-right so it never reflows the title row. Owns its own ref + open
 * state for the folder picker so each card can trigger an independent
 * portal menu.
 */
type NoteCardActionsProps = {
  doc: { id: string; folder_id: string | null };
  folders: Folder[];
  isSelected: boolean;
  onToggleSelect: () => void;
  onMoveToFolder: (folderId: string | null) => void;
  onDelete: () => void;
  labels: { select: string; move: string; del: string; root: string };
};
function NoteCardActions({ doc, folders, isSelected, onToggleSelect, onMoveToFolder, onDelete, labels }: NoteCardActionsProps) {
  const folderBtnRef = useRef<HTMLButtonElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const btnBase = 'h-7 w-7 grid place-items-center rounded-full bg-surface/90 backdrop-blur border border-edge text-muted hover:text-text hover:bg-surface transition-colors';
  return (
    <>
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity z-10" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onToggleSelect} className={btnBase} data-testid={`select-note-${doc.id}`} title={labels.select}>
          <span className="material-symbols-outlined text-[15px]">{isSelected ? 'check_box' : 'check_box_outline_blank'}</span>
        </button>
        {folders.length > 0 && (
          <button
            ref={folderBtnRef}
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className={`${btnBase} ${doc.folder_id ? 'text-primary' : ''}`}
            data-testid={`move-doc-${doc.id}`}
            title={labels.move}
            aria-expanded={pickerOpen}
          >
            <span className="material-symbols-outlined text-[15px]">folder_open</span>
          </button>
        )}
        <button type="button" onClick={onDelete} className={`${btnBase} hover:text-red-400`} title={labels.del} data-testid={`delete-note-${doc.id}`}>
          <span className="material-symbols-outlined text-[15px]">delete</span>
        </button>
      </div>
      {pickerOpen && (
        <FolderPicker
          triggerRef={folderBtnRef}
          currentFolderId={doc.folder_id}
          folders={folders}
          onChange={(id) => onMoveToFolder(id)}
          onClose={() => setPickerOpen(false)}
          rootLabel={labels.root}
        />
      )}
    </>
  );
}

function htmlToPlainText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function DictatePage({ onNavigate }: DictatePageProps) {
  const t = useT();
  const dictation = useDictationStore();
  const live = useLiveStore();
  const { translateEnabled, setTranslateEnabled, uiLanguage, ttsLanguage, ttsVoice } = useSettingsStore();
  const { documents, loading, error: documentsError, fetchDocuments, createDocument, updateDocument, deleteDocument } = useDocumentsStore();
  const { folders, selectedFolderId, fetchFolders, selectFolder, deleteFolder } = useFoldersStore();
  const user = useAuthStore((s) => s.user);
  const {
    diarization: transcribeDiarization,
    aiSummary: transcribeAiSummary,
    punctuation: transcribePunctuation,
    language: transcribeLanguage,
    loading: transcribeLoading,
    error: transcribeErrorState,
    fullText: transcribeFullText,
    stagedFile: stagedTranscribeFile,
    stagedUrl: stagedTranscribeUrl,
    jobs: transcribeJobs,
    activeJobId: transcribeActiveJobId,
    savedDocumentId: transcribeSavedDocumentId,
    sourceAudioUrl: transcribeSourceAudioUrl,
    setDiarization: setTranscribeDiarization,
    setAiSummary: setTranscribeAiSummary,
    setPunctuation: setTranscribePunctuation,
    setLanguage: setTranscribeLanguage,
    startTranscription,
    cancelUrlTranscription,
    cancelJob: cancelTranscribeJob,
    urlStartedAt: transcribeUrlStartedAt,
    setTargetDocumentId,
  } = useTranscriptionStore();

  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [docId, setDocId] = useState<string | null>(null);
  // Mirror the edit/list state onto the shell UI store so AppShell can
  // hide the widget-dock when the user is inside a note. Cleaned up on
  // unmount so navigating away (e.g. to Transcribe) doesn't leave the
  // flag stuck.
  const setNoteOpen = useUiStore((s) => s.setNoteOpen);
  useEffect(() => {
    setNoteOpen(mode === 'edit');
    return () => setNoteOpen(false);
  }, [mode, setNoteOpen]);
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
  // Declared early so `filteredDocs` (below) can reference it. See
  // handleDeleteNote / undoDeleteNote later for the delete-with-undo logic.
  const [scheduledDeletes, setScheduledDeletes] = useState<Map<string, { timer: number; startedAt: number }>>(new Map());
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [contextMenuMode, setContextMenuMode] = useState<ContextMenuMode>('convert');
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [transcribeDialogOpen, setTranscribeDialogOpen] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showBulkExport, setShowBulkExport] = useState(false);
  const [utilityPanel, setUtilityPanel] = useState<NoteUtilityPanel>('none');
  const [retranscribeLanguage, setRetranscribeLanguage] = useState('auto');
  const [retranscribeDiarization, setRetranscribeDiarization] = useState(true);
  // Feature parity with the transcribe dialog — these two are currently
  // cosmetic (neither Groq whisper-large-v3-turbo nor Deepgram nova-3 take
  // a client-side punctuation flag, and AI-summary post-processing isn't
  // wired through the retranscribe loop yet) but keeping them visible means
  // the retranscribe panel matches user expectations set by the main dialog.
  const [retranscribeAiSummary, setRetranscribeAiSummary] = useState(false);
  const [retranscribePunctuation, setRetranscribePunctuation] = useState(true);
  const [retranscribeLoading, setRetranscribeLoading] = useState(false);
  const [retranscribeError, setRetranscribeError] = useState('');
  const [importDocLoading, setImportDocLoading] = useState(false);
  const [importDocForceOcr, setImportDocForceOcr] = useState(false);
  const [transcribeUrlDraft, setTranscribeUrlDraft] = useState('');
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
  const editorRef = useRef<EditorHandle | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const transcribeFileInputRef = useRef<HTMLInputElement | null>(null);
  const actionFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const budgetResolverRef = useRef<((ok: boolean) => void) | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const seekNonceRef = useRef(0);
  const historyRequestSeq = useRef(0);
  const seededHistoryNotes = useRef<Record<string, boolean>>({});
  const noteTranscribeProcessIdRef = useRef<string | null>(null);
  const retranscribeAbortRef = useRef<AbortController | null>(null);

  const isLive = live.source === 'system';
  const status = isLive ? live.status : dictation.status;
  const hasContent = htmlContent.replace(/<[^>]*>/g, '').trim().length > 0;
  const currentDoc = useMemo(() => documents.find((d) => d.id === docId) ?? null, [documents, docId]);
  const persistedAudioUrl = currentDoc?.audio_url ?? null;
  const jobAudioUrl = useMemo(() => {
    if (!docId) return null;
    const matchingJob = [...transcribeJobs].reverse().find((job) => job.documentId === docId && job.audioUrl);
    return matchingJob?.audioUrl ?? null;
  }, [docId, transcribeJobs]);
  // Any non-terminal transcription job attached to THIS note — either it
  // already references the doc, or it was fired with this doc as its target.
  // Drives the small "in progress" spinner chip in the note header so the
  // user always knows there's background work happening for this note.
  const attachedActiveJob = useMemo(() => {
    if (!docId) return null;
    return transcribeJobs.find((job) => {
      const matchesDoc = job.documentId === docId || job.targetDocumentId === docId;
      if (!matchesDoc) return false;
      return job.status === 'processing' || job.status === 'pending' || job.status === 'paused';
    }) ?? null;
  }, [docId, transcribeJobs]);
  const runtimeAudioUrl = persistedAudioUrl ?? jobAudioUrl ?? (transcribeSavedDocumentId === docId ? transcribeSourceAudioUrl : null);
  const activeHistoryEntry = transcriptHistory.find((h) => h.id === activeHistoryId) ?? null;
  const activeSegments = activeHistoryEntry?.segments ?? [];
  const activePlaybackAudioUrl = activeHistoryEntry?.audio_url ?? runtimeAudioUrl;
  const retranscribeAudioUrl = activeHistoryEntry?.audio_url ?? persistedAudioUrl;
  const hasAudioUtilities = !!activePlaybackAudioUrl;
  const activeHistoryMeta = activeHistoryEntry
    ? `${new Date(activeHistoryEntry.created_at).toLocaleString(uiLanguage === 'es' ? 'es-ES' : 'en-US')} • ${activeHistoryEntry.language} • ${activeHistoryEntry.diarization ? t('transcribe.diarization') : t('notes.noDiarization')}`
    : '';
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
  const activeTranscribeJob = transcribeActiveJobId ? transcribeJobs.find((job) => job.id === transcribeActiveJobId) ?? null : null;
  const transcribeHasResumableJob = !!activeTranscribeJob && (
    activeTranscribeJob.status === 'paused' ||
    activeTranscribeJob.status === 'processing' ||
    activeTranscribeJob.status === 'pending'
  );
  const transcribeHasInput = !!stagedTranscribeFile || !!stagedTranscribeUrl.trim();
  const transcribeCanStart = (transcribeHasInput || transcribeHasResumableJob) && !transcribeLoading;
  const transcribeButtonLabel = transcribeLoading
    ? t('transcribe.processing')
    : transcribeHasInput
      ? t('transcribe.start')
      : transcribeHasResumableJob
        ? t('transcribe.resume')
        : t('transcribe.start');
  const transcribeStatusText = stagedTranscribeFile?.name || stagedTranscribeUrl || '';
  const activeTranscribeStage = activeTranscribeJob ? resolveTranscriptionJobStage(activeTranscribeJob) : null;
  const activeTranscribeProgress = activeTranscribeJob ? resolveTranscriptionJobProgress(activeTranscribeJob) : null;
  const transcribeStageLabel = activeTranscribeStage ? t(transcriptionStageLabelKey(activeTranscribeStage)) : t('transcribe.processing');
  // Elapsed-time ticker for URL jobs: the backend doesn't stream progress so
  // the only honest signal we can surface while awaiting the blocking call is
  // how long we've been waiting. Re-renders every second while loading.
  const [elapsedTick, setElapsedTick] = useState(0);
  useEffect(() => {
    if (!transcribeUrlStartedAt || !transcribeLoading) return;
    setElapsedTick((n) => n + 1);
    const id = setInterval(() => setElapsedTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [transcribeUrlStartedAt, transcribeLoading]);
  const transcribeElapsedLabel = useMemo(() => {
    if (!transcribeUrlStartedAt || !transcribeLoading) return '';
    const secs = Math.max(0, Math.round((Date.now() - transcribeUrlStartedAt) / 1000));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcribeUrlStartedAt, transcribeLoading, elapsedTick]);
  const transcribeStageDetail = activeTranscribeProgress && activeTranscribeProgress.total > 0
    ? `${activeTranscribeProgress.done}/${activeTranscribeProgress.total} · ${activeTranscribeProgress.pct}%`
    : activeTranscribeStage
      ? (() => {
          const key = transcriptionStageDetailKey(activeTranscribeStage);
          return key ? t(key) : '';
        })()
      : '';
  const showInlineTranscribeStatus = transcribeLoading || !!transcribeErrorState || !!transcribeSavedDocumentId || !!activeTranscribeJob;
  const contextMenuStyle = useMemo(() => {
    if (!contextMenuPos) return null;
    if (typeof window === 'undefined') return { left: contextMenuPos.x, top: contextMenuPos.y };
    const menuWidth = 296;
    const menuHeight = 520;
    const margin = 12;
    const clampedX = Math.max(margin, Math.min(contextMenuPos.x, window.innerWidth - menuWidth - margin));
    const clampedY = Math.max(72, Math.min(contextMenuPos.y, window.innerHeight - menuHeight - margin));
    return { left: clampedX, top: clampedY };
  }, [contextMenuPos]);

  const closeContextMenu = useCallback(() => {
    setContextMenuPos(null);
  }, []);
  const toggleUtilityPanel = useCallback((panel: NoteUtilityPanel) => {
    setUtilityPanel((prev) => (prev === panel ? 'none' : panel));
  }, []);

  const getSelectedEditorText = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return '';
    return editor.getSelectedText();
  }, []);

  const handleEditorContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.ProseMirror')) return;
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

  // Sidebar signals: new note / voice note / delete folder
  const newNoteSignal = useNotesActionsStore((s) => s.newNoteSignal);
  const voiceNoteSignal = useNotesActionsStore((s) => s.voiceNoteSignal);
  const signalDeleteFolderId = useNotesActionsStore((s) => s.pendingDeleteFolderId);
  const clearDeleteFolder = useNotesActionsStore((s) => s.clearDeleteFolder);
  useEffect(() => { if (newNoteSignal > 0) newNote(); }, [newNoteSignal]);
  useEffect(() => { if (voiceNoteSignal > 0) newNote(true); }, [voiceNoteSignal]);
  useEffect(() => {
    if (signalDeleteFolderId) { setPendingDeleteFolderId(signalDeleteFolderId); clearDeleteFolder(); }
  }, [signalDeleteFolderId, clearDeleteFolder]);

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
    if (!docId || !currentDoc?.source_id) return;
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
          audio_url: persistedAudioUrl,
        });
        const entry = normalizeHistoryEntry(created as NoteTranscriptHistoryEntry);
        setTranscriptHistory([entry]);
        setActiveHistoryId(entry.id);
      })
      .catch(() => {});
  }, [docId, persistedAudioUrl, currentDoc?.source_id, historyLoadedDocId, historyLoading, transcriptHistory.length]);

  useEffect(() => {
    if (utilityPanel === 'history' && !docId) setUtilityPanel('none');
    if (utilityPanel === 'retranscribe' && !retranscribeAudioUrl) setUtilityPanel('none');
    if (utilityPanel === 'audio' && !hasAudioUtilities) setUtilityPanel('none');
  }, [docId, retranscribeAudioUrl, hasAudioUtilities, utilityPanel]);

  useEffect(() => {
    const processId = noteTranscribeProcessIdRef.current;
    if (!processId) return;
    const processStore = useProcessesStore.getState();

    if (activeTranscribeJob && activeTranscribeJob.documentId === docId) {
      processStore.remove(processId);
      noteTranscribeProcessIdRef.current = null;
      return;
    }

    if (activeTranscribeStage === 'paused') {
      processStore.setStatus(processId, 'paused', 'transcribe.paused');
      return;
    }

    if (activeTranscribeStage === 'canceled') {
      processStore.setStatus(processId, 'canceled', 'processes.filter.canceled');
      noteTranscribeProcessIdRef.current = null;
      return;
    }

    if (activeTranscribeStage === 'failed') {
      processStore.fail(processId, transcribeErrorState || t('transcribe.failed'), 'transcribe.failed');
      noteTranscribeProcessIdRef.current = null;
      return;
    }

    if (transcribeLoading) {
      if (activeTranscribeProgress) {
        processStore.setProgress(
          processId,
          activeTranscribeProgress.done,
          activeTranscribeProgress.total,
          activeTranscribeStage ? transcriptionStageLabelKey(activeTranscribeStage) : 'transcribe.processing',
        );
      } else {
        processStore.setStatus(processId, 'running', activeTranscribeStage ? transcriptionStageLabelKey(activeTranscribeStage) : 'transcribe.processing');
      }
      return;
    }

    if (transcribeErrorState) {
      processStore.fail(processId, transcribeErrorState, 'transcribe.failed');
      noteTranscribeProcessIdRef.current = null;
      return;
    }

    if (!activeTranscribeJob && (transcribeSavedDocumentId === docId || transcribeFullText.trim())) {
      processStore.complete(processId, 'transcribe.completed');
      noteTranscribeProcessIdRef.current = null;
    }
  }, [
    activeTranscribeJob,
    activeTranscribeProgress,
    activeTranscribeStage,
    docId,
    t,
    transcribeErrorState,
    transcribeFullText,
    transcribeLoading,
    transcribeSavedDocumentId,
  ]);

  useEffect(() => {
    if (!docId || transcribeSavedDocumentId !== docId || !currentDoc) return;
    if (currentDoc.content !== htmlContent) {
      setHtmlContent(currentDoc.content);
      setPlainText(htmlToPlainText(currentDoc.content));
    }
    setSaved(true);
    if (utilityPanel === 'none') {
      setUtilityPanel(hasAudioUtilities ? 'audio' : 'history');
    }
  }, [currentDoc, docId, hasAudioUtilities, htmlContent, transcribeSavedDocumentId, utilityPanel]);
  // Filter documents. Scheduled-for-delete notes are hidden so the
  // undo toast's "gone until you click undo" promise holds visually.
  const filteredDocs = useMemo(() => {
    let docs = documents;
    if (scheduledDeletes.size > 0) {
      docs = docs.filter((d) => !scheduledDeletes.has(d.id));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      docs = docs.filter((d) => d.title.toLowerCase().includes(q) || d.content.replace(/<[^>]*>/g, '').toLowerCase().includes(q));
    }
    if (colorFilter) {
      docs = docs.filter((d) => getColor(d.tags ?? []) === colorFilter);
    }
    return docs;
  }, [documents, searchQuery, colorFilter, scheduledDeletes]);

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
    // B2 fix — opening an existing note must not carry dictation buffer
    // from a prior session into the editor.
    dictation.reset();
    live.reset?.();
    // Legacy notes auto-titled with a timestamp get loaded with an
    // empty title so the input shows the "Untitled" placeholder.
    // `persistCurrentNote` falls back to first-line-of-content when
    // the user leaves the input empty, so we don't lose information.
    setDocId(doc.id); setTitle(sanitizeDisplayTitle(doc.title)); setHtmlContent(doc.content);
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
    setUtilityPanel('none');
    setMode('edit'); setSaved(true);
    prevDictText.current = ''; prevSegCount.current = 0;
  };

  const newNote = (autoRecord = false) => {
    closeContextMenu();
    stopTTS();
    setNoteReadProgress(NOTE_READER_IDLE);
    historyRequestSeq.current += 1;
    // B2 fix — clear prior dictation/live payload so the fresh note never
    // inherits a stale transcript from the previous session.
    dictation.reset();
    live.reset?.();
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
    setUtilityPanel('none');
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
    setUtilityPanel('none');
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

  const persistCurrentNote = useCallback(async () => {
    // Title resolution: user-typed → first line of content → blank.
    // We deliberately DO NOT auto-fill the title with a timestamp any
    // more — an "Untitled" state is cleaner than a fake title like
    // "Note — Apr 16, 2026, 3:55 PM". Display falls back via
    // `t('editor.untitled')` everywhere a title is rendered.
    const finalTitle = title.trim() || htmlContent.replace(/<[^>]*>/g, '').trim().split(/[.\n]/)[0]?.slice(0, 60).trim() || '';
    const tags = setColorTag(noteTags, noteColor);
    setSaveError('');
    try {
      if (docId) {
        await updateDocument(docId, { title: finalTitle, content: htmlContent, tags });
        setNoteTags(tags); setTitle(finalTitle); setSaved(true);
        return docId;
      }
      const doc = await createDocument({ title: finalTitle, content: htmlContent, source: 'dictation', tags });
      setDocId(doc.id);
      setNoteTags(tags); setTitle(finalTitle); setSaved(true);
      return doc.id;
    } catch (err) {
      setSaveError((err as Error).message);
      return null;
    }
  }, [createDocument, docId, htmlContent, noteColor, noteTags, title, uiLanguage, updateDocument]);

  const handleSave = async () => {
    await persistCurrentNote();
  };

  // Phase C — typewriter reveal queue (word-by-word fade-in via CSS).
  const revealQueueRef = useRef<ReturnType<typeof createRevealQueue> | null>(null);
  useEffect(() => {
    if (mode !== 'edit' || !editorRef.current) return;
    if (revealQueueRef.current) revealQueueRef.current.dispose();
    revealQueueRef.current = createRevealQueue({
      maxWps: 8,
      write: (word) => {
        const ed = editorRef.current;
        if (!ed) return;
        ed.insertHtmlAtCursor(`<span class="wa-reveal">${escapeHtml(word)}</span>`);
        requestAnimationFrame(() => {
          const dom = ed.view.dom as HTMLElement;
          dom.querySelectorAll('span.wa-reveal:not(.wa-reveal-shown)').forEach((el) => {
            el.classList.add('wa-reveal-shown');
          });
        });
        setSaved(false);
      },
    });
    return () => { revealQueueRef.current?.dispose(); revealQueueRef.current = null; };
  }, [mode]);

  // Dictation text → insert at cursor (auto-flush every 30s + on stop)
  useEffect(() => {
    if (mode !== 'edit' || !editorRef.current) return;
    if (dictation.text && dictation.text !== prevDictText.current && revealQueueRef.current) {
      // Phase C: enqueue delta into the typewriter queue instead of
      // inserting the full chunk at once.
      const newPart = dictation.text.slice(prevDictText.current.length);
      if (newPart.trim()) {
        revealQueueRef.current.enqueue((prevDictText.current ? ' ' : '') + newPart.trim());
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
  // Delete-with-undo (Gmail style). Instead of a modal confirmation on
  // every trash click, we hide the note immediately and show a toast
  // with an Undo button. After UNDO_DELETE_MS the delete is actually
  // flushed to the server. If the user clicks Undo, we cancel the
  // timeout and the card reappears — no server call happens.
  const UNDO_DELETE_MS = 5000;
  const handleDeleteNote = (id: string) => {
    setSelectedNoteIds((prev) => prev.filter((selectedId) => selectedId !== id));
    // If already scheduled, bail — prevents double-click from doubling
    // the timeout or losing the undo window.
    if (scheduledDeletes.has(id)) return;
    const timer = window.setTimeout(() => {
      deleteDocument(id).catch(() => {});
      setScheduledDeletes((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }, UNDO_DELETE_MS);
    setScheduledDeletes((prev) => {
      const next = new Map(prev);
      next.set(id, { timer, startedAt: Date.now() });
      return next;
    });
  };
  const undoDeleteNote = (id: string) => {
    setScheduledDeletes((prev) => {
      const entry = prev.get(id);
      if (!entry) return prev;
      window.clearTimeout(entry.timer);
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };
  // Kept for bulk-delete flow below (which still uses the confirm dialog
  // because bulk is higher-risk and the user explicitly opted into it).
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
    showActionFeedback(t('notes.transcriptionApplied'), 'success');
  };
  const handleSelectHistoryEntry = (entryId: string) => {
    setActiveHistoryId(entryId);
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
  const handleRenameSpeaker = async (speaker: string) => {
    if (!docId) return;
    const currentLabel = speakerAliases[speaker] || speaker;
    // Electron disables native prompt() — use our portal-based modal instead.
    const entered = await promptText({
      message: t('editor.renameSpeakerPrompt'),
      defaultValue: currentLabel,
    });
    const nextLabel = (entered ?? '').trim();
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
    const idx = activeSegments.findIndex((seg) => seconds >= (seg.start ?? 0) && seconds <= (seg.end ?? seg.start ?? Number.MAX_SAFE_INTEGER));
    if (idx < 0) return;
    setActiveSegmentIndex((prev) => {
      if (prev === idx) return prev;
      setActiveSegmentText(activeSegments[idx]?.text ?? '');
      return idx;
    });
  }, [activeSegments]);
  const handleRetranscribeFromNote = async () => {
    if (!docId || !retranscribeAudioUrl || retranscribeLoading) return;
    const processStore = useProcessesStore.getState();
    const processId = processStore.start({
      type: 'note_retranscribe',
      title: [t('notes.retranscribeShort'), (title || t('notes.voiceNote')).trim()].join(' - '),
      stageLabelKey: 'transcribe.detailProcessing',
      documentId: docId,
      total: 2,
    });
    retranscribeAbortRef.current?.abort();
    const controller = new AbortController();
    retranscribeAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 180_000);
    setRetranscribeLoading(true);
    setRetranscribeError('');
    try {
      const result = await api.transcribe.fromUrl({
        url: retranscribeAudioUrl,
        language: retranscribeLanguage === 'auto' ? undefined : retranscribeLanguage,
        enable_diarization: retranscribeDiarization,
      }, { signal: controller.signal });
      processStore.setProgress(processId, 1, 2, 'transcribe.detailSaving');
      const created = await api.documents.createTranscription(docId, {
        language: retranscribeLanguage,
        diarization: retranscribeDiarization,
        text: result.text,
        segments: result.segments ?? [],
        audio_url: retranscribeAudioUrl,
      });
      const entry = normalizeHistoryEntry(created as NoteTranscriptHistoryEntry);
      setTranscriptHistory((prev) => [entry, ...prev]);
      setActiveHistoryId(entry.id);
      setActiveSegmentIndex(null);
      setActiveSegmentText('');
      setSeekRequest(null);
      setUtilityPanel('history');
      processStore.complete(processId, 'processes.noteRetranscribeDone');
      showActionFeedback(t('notes.transcriptionVersionAdded'), 'success');
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        processStore.fail(processId, 'Cancelled', 'processes.noteRetranscribeFailed');
        return;
      }
      const msg = err instanceof ApiError ? err.message.replace(/^API error \d+:\s*/i, '') : (err as Error)?.message;
      setRetranscribeError(msg || 'Retranscription failed');
      processStore.fail(processId, msg || 'Retranscription failed', 'processes.noteRetranscribeFailed');
    } finally {
      clearTimeout(timeoutId);
      if (retranscribeAbortRef.current === controller) retranscribeAbortRef.current = null;
      setRetranscribeLoading(false);
    }
  };
  const handleCancelRetranscribe = () => {
    retranscribeAbortRef.current?.abort();
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
  const showActionFeedback = useCallback((message: string, tone: 'success' | 'error' | 'info') => {
    if (actionFeedbackTimer.current) clearTimeout(actionFeedbackTimer.current);
    setActionFeedback({ tone, message });
    if (useSettingsStore.getState().showNotifications) {
      useNotificationsStore.getState().push(message, tone);
    }
    actionFeedbackTimer.current = setTimeout(() => { setActionFeedback(null); }, 2200);
  }, []);
  useEffect(() => {
    const handlePasteIntent = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<string>;
      const text = typeof event.detail === 'string' ? event.detail : '';
      if (!text || mode !== 'edit') return;
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement
      ) {
        return;
      }
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      editor.insertHtmlAtCursor(safeHtmlParagraphs(text));
      setSaved(false);
      showActionFeedback(t('notes.pasteSuccess'), 'success');
      event.preventDefault();
    };
    window.addEventListener('whisperall:paste-text', handlePasteIntent as EventListener);
    return () => {
      window.removeEventListener('whisperall:paste-text', handlePasteIntent as EventListener);
    };
  }, [mode, showActionFeedback, t]);
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
  const handleTranscribeFile = (file?: File | null) => {
    if (!file) return;
    useTranscriptionStore.getState().stageFile(file);
    setTranscribeUrlDraft('');
  };
  const handleStageTranscribeUrl = () => {
    const next = transcribeUrlDraft.trim();
    if (!next) return;
    useTranscriptionStore.getState().stageUrl(next);
  };
  const handleStartInlineTranscription = async () => {
    if (!transcribeCanStart) return;
    const targetId = await persistCurrentNote();
    if (!targetId) {
      showActionFeedback(saveError || t('notes.processNeedsSave'), 'error');
      return;
    }
    setTargetDocumentId(targetId);
    const isUrlJob = !stagedTranscribeFile && !!stagedTranscribeUrl.trim();
    // Only register a LocalProcess for FILE jobs. URL jobs are already tracked
    // via the synthetic TranscriptionJob created inside the transcription
    // store — creating a LocalProcess too produces duplicate entries in the
    // Processes hub and leaves a phantom "running" row behind in localStorage
    // when the synthetic completes (which never notifies the processes store).
    if (!isUrlJob && !noteTranscribeProcessIdRef.current) {
      noteTranscribeProcessIdRef.current = useProcessesStore.getState().start({
        type: 'transcribe_file',
        title: stagedTranscribeFile?.name || title.trim() || t('transcribe.title'),
        stageLabelKey: activeTranscribeStage ? transcriptionStageLabelKey(activeTranscribeStage) : 'transcribe.stagePreparing',
        documentId: targetId,
        total: activeTranscribeProgress?.total || 1,
      });
    }
    closeContextMenu();
    // For URL jobs: close the dialog immediately after kicking the job off so
    // the user can queue another transcription. `startTranscription` resolves
    // synchronously for URL (fire-and-forget via runUrlTranscription), so the
    // await here is effectively a no-op for that path.
    void startTranscription();
    if (isUrlJob) {
      setTranscribeDialogOpen(false);
      noteTranscribeProcessIdRef.current = null;
    }
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
    const ok = await copyText(text);
    showActionFeedback(ok ? t('notes.copySuccess') : t('notes.copyError'), ok ? 'success' : 'error');
  };
  const handleContextCopy = async () => {
    const selected = getSelectedEditorText();
    if (selected) {
      const ok = await copyText(selected);
      showActionFeedback(ok ? t('notes.copySuccess') : t('notes.copyError'), ok ? 'success' : 'error');
      return;
    }
    await handleCopy();
  };
  const handleContextCut = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.isSelectionEmpty()) {
      showActionFeedback(t('notes.cutNoSelection'), 'info');
      return;
    }
    const selected = editor.getSelectedText();
    try {
      await copyText(selected);
      editor.focus();
      editor.deleteSelection();
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
      editor.focus();
      editor.insertHtmlAtCursor(safeHtmlParagraphs(clipText));
      setSaved(false);
      showActionFeedback(t('notes.pasteSuccess'), 'success');
    } catch {
      showActionFeedback(t('notes.pasteError'), 'error');
    }
  };
  const handleContextSelectAll = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    editor.selectAll();
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
      className="fixed z-[90] w-[296px] rounded-lg border border-white/[0.08] bg-[#161e29]/[0.98] py-1 shadow-[0_8px_30px_rgba(0,0,0,0.5),0_0_0_0.5px_rgba(255,255,255,0.04)] backdrop-blur-xl"
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

        {(contextMenuMode === 'convert' || contextMenuMode === 'work') && (
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
                {renderDockAction({
                  icon: 'upload_file',
                  label: t('transcribe.openDialog'),
                  onClick: () => { setTranscribeDialogOpen(true); closeContextMenu(); },
                  tone: transcribeHasInput || transcribeLoading ? 'primary' : 'neutral',
                  testId: 'note-open-transcribe-dialog-btn',
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

      </div>
    </div>
  ) : null;

  const transcribeDialog = transcribeDialogOpen ? (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      data-testid="transcribe-dialog"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setTranscribeDialogOpen(false); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-edge bg-surface shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-edge">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary">graphic_eq</span>
            <h3 className="text-[13px] font-semibold text-text">{t('transcribe.dialogTitle')}</h3>
          </div>
          <button
            type="button"
            onClick={() => setTranscribeDialogOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
            aria-label="Close"
            data-testid="transcribe-dialog-close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <PlanGate resource="stt_seconds">
          <div className="max-h-[70vh] overflow-y-auto px-4 py-4 space-y-3">
            <button
              type="button"
              onClick={() => { transcribeFileInputRef.current?.click(); }}
              className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-colors ${
                stagedTranscribeFile
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-edge bg-base text-text/90 hover:border-primary/50 hover:text-primary'
              }`}
              data-testid="note-transcribe-file-btn"
            >
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              <span className="truncate">{stagedTranscribeFile ? stagedTranscribeFile.name : t('transcribe.upload')}</span>
            </button>
            <div data-testid="note-transcribe-url-row">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/60">{t('transcribe.pasteLink')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={transcribeUrlDraft}
                  onChange={(e) => setTranscribeUrlDraft(e.target.value)}
                  placeholder={t('transcribe.urlPlaceholder')}
                  className="min-w-0 flex-1 rounded-md border border-edge bg-base px-2.5 py-2 text-[12px] text-text outline-none transition-colors placeholder:text-muted/40 focus:border-primary"
                  data-testid="note-transcribe-url-input"
                />
                <button
                  type="button"
                  onClick={handleStageTranscribeUrl}
                  className="rounded-md border border-edge bg-surface px-2.5 py-2 text-[11px] font-medium text-text/90 transition-colors hover:border-primary hover:text-primary"
                  data-testid="note-transcribe-url-btn"
                >
                  {t('transcribe.loadUrl')}
                </button>
              </div>
            </div>
            {transcribeStatusText && !showInlineTranscribeStatus && (
              <p className="text-[11px] leading-5 text-primary/85 break-all" data-testid="note-transcribe-staged-source">
                {transcribeStatusText}
              </p>
            )}
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/60">{t('transcribe.spokenLang')}</label>
              <select
                value={transcribeLanguage}
                onChange={(e) => setTranscribeLanguage(e.target.value)}
                className="w-full rounded-md border border-edge bg-base px-2.5 py-2 text-[12px] text-text outline-none transition-colors focus:border-primary"
                data-testid="note-transcribe-language"
              >
                {TRANSCRIBE_LANGUAGES.map((option) => (
                  <option key={option.code} value={option.code}>{option.labelKey ? t(option.labelKey) : option.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center justify-between gap-3 rounded-md border border-edge/70 bg-white/[0.02] px-2.5 py-2 text-[12px] text-text/90" data-testid="note-transcribe-diarization-row">
                <span className="font-medium">{t('transcribe.diarization')}</span>
                <input type="checkbox" checked={transcribeDiarization} onChange={(e) => setTranscribeDiarization(e.target.checked)} className="accent-primary" />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-md border border-edge/70 bg-white/[0.02] px-2.5 py-2 text-[12px] text-text/90" data-testid="note-transcribe-summary-row">
                <span className="font-medium">{t('transcribe.aiSummary')}</span>
                <input type="checkbox" checked={transcribeAiSummary} onChange={(e) => setTranscribeAiSummary(e.target.checked)} className="accent-primary" />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-md border border-edge/70 bg-white/[0.02] px-2.5 py-2 text-[12px] text-text/90" data-testid="note-transcribe-punctuation-row">
                <span className="font-medium">{t('transcribe.punctuation')}</span>
                <input type="checkbox" checked={transcribePunctuation} onChange={(e) => setTranscribePunctuation(e.target.checked)} className="accent-primary" />
              </label>
            </div>
            <button
              type="button"
              onClick={handleStartInlineTranscription}
              disabled={!transcribeCanStart}
              title={!transcribeCanStart && !transcribeLoading ? t('transcribe.needsInput') : undefined}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              data-testid="note-start-transcribe-btn"
            >
              <span>{transcribeButtonLabel}</span>
              {transcribeLoading && <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>}
            </button>
            {!transcribeCanStart && !transcribeLoading && !showInlineTranscribeStatus && (
              <p className="text-[11px] leading-5 text-muted/60 text-center" data-testid="note-transcribe-hint">
                {t('transcribe.needsInput')}
              </p>
            )}
            {showInlineTranscribeStatus && (
              <div
                className={`rounded-lg border px-3 py-2.5 ${
                  transcribeErrorState
                    ? 'border-red-500/25 bg-red-500/8'
                    : transcribeSavedDocumentId
                      ? 'border-emerald-500/25 bg-emerald-500/8'
                      : 'border-primary/20 bg-primary/8'
                }`}
                data-testid="note-transcribe-status-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={`text-[12px] font-semibold ${
                      transcribeErrorState ? 'text-red-200' : transcribeSavedDocumentId ? 'text-emerald-200' : 'text-text'
                    }`}>
                      {transcribeErrorState ? t('transcribe.failed') : transcribeSavedDocumentId ? t('transcribe.savedToNotes') : transcribeStageLabel}
                    </p>
                    {!transcribeErrorState && transcribeStageDetail && (
                      <p className="pt-0.5 text-[11px] text-muted/70">{transcribeStageDetail}</p>
                    )}
                    {transcribeStatusText && (
                      <p className="pt-1 text-[11px] leading-5 text-muted/65 break-all">{transcribeStatusText}</p>
                    )}
                    {transcribeElapsedLabel && !transcribeErrorState && !transcribeSavedDocumentId && (
                      <p className="pt-1 text-[11px] leading-5 text-muted/55" data-testid="note-transcribe-elapsed">
                        {t('transcribe.elapsed')}: {transcribeElapsedLabel}
                      </p>
                    )}
                    {transcribeErrorState && (
                      <p className="pt-1 text-[11px] leading-5 text-red-200/90">{transcribeErrorState}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {transcribeLoading && (
                      <button
                        type="button"
                        onClick={() => {
                          if (transcribeUrlStartedAt != null) cancelUrlTranscription();
                          else if (transcribeActiveJobId) cancelTranscribeJob(transcribeActiveJobId);
                        }}
                        className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/15"
                        data-testid="note-cancel-transcribe-btn"
                      >
                        {t('reader.stop')}
                      </button>
                    )}
                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => {
                          setTranscribeDialogOpen(false);
                          onNavigate('processes');
                        }}
                        className="rounded-md border border-edge px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:border-primary hover:text-primary"
                        data-testid="note-open-processes-hub-btn"
                      >
                        {t('processes.openHub')}
                      </button>
                    )}
                  </div>
                </div>
                {!transcribeErrorState && activeTranscribeProgress && activeTranscribeProgress.total > 0 && (
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${activeTranscribeProgress.pct}%` }}
                      />
                    </div>
                  </div>
                )}
                {/* Indeterminate pulse bar when we have no chunk counter (URL jobs) */}
                {!transcribeErrorState && transcribeLoading && (!activeTranscribeProgress || activeTranscribeProgress.total === 0) && (
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                      <div className="h-full w-1/3 rounded-full bg-primary/70 wa-indeterminate" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </PlanGate>
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

  // ——— LIST MODE ———
  if (mode === 'list') return (
    <div className="flex-1 min-h-0 relative flex flex-col bg-base" data-testid="dictate-page">
      {/* E4 — ElevenLabs-inspired header: whisper-thin title, airy spacing. */}
      <div className="px-10 pt-14 pb-6">
        <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h2 className="text-[44px] leading-[1.05] font-light tracking-[-0.02em] mb-2 text-text">{t('notes.title')}</h2>
            <p className="text-[13px] text-text-tertiary tracking-[0.14px]">
              {documents.length === filteredDocs.length
                ? (uiLanguage === 'es' ? `${documents.length} ${documents.length === 1 ? 'nota' : 'notas'}` : `${documents.length} ${documents.length === 1 ? 'note' : 'notes'}`)
                : (uiLanguage === 'es' ? `${filteredDocs.length} de ${documents.length} notas` : `${filteredDocs.length} of ${documents.length} notes`)}
              {folders.length > 0 && ` · ${folders.length} ${uiLanguage === 'es' ? (folders.length === 1 ? 'carpeta' : 'carpetas') : (folders.length === 1 ? 'folder' : 'folders')}`}
            </p>
          </div>
          {/* Primary CTA lives with the page header so creating a note is a
              one-glance action, not a hunt-in-the-sidebar task. */}
          <button
            type="button"
            onClick={() => newNote()}
            className="h-11 px-5 rounded-full bg-primary text-white text-sm font-semibold tracking-[0.14px] shadow-[var(--theme-shadow-card)] hover:brightness-110 hover:-translate-y-[0.5px] active:brightness-95 transition-all flex items-center gap-2"
            data-testid="new-note-cta"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            {uiLanguage === 'es' ? 'Nueva nota' : 'New note'}
          </button>
        </div>
        <div className="rounded-2xl bg-[var(--theme-warm)] shadow-[var(--theme-shadow-inset-border),var(--theme-shadow-warm)] p-2.5 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[240px] max-w-[420px]">
              <span className="material-symbols-outlined text-[20px] text-muted absolute left-3 top-1/2 -translate-y-1/2">search</span>
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={uiLanguage === 'es' ? 'Buscar por título, contenido, hablante…' : 'Search by title, content, speaker…'}
                className="w-full pl-11 pr-10 h-11 rounded-full bg-surface shadow-[var(--theme-shadow-inset-border)] text-sm text-text placeholder:text-muted/50 outline-none focus:shadow-[var(--theme-shadow-inset-border),0_0_0_3px_rgba(19,127,236,0.15)] transition-shadow tracking-[0.14px]" data-testid="notes-search" />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted hover:text-text"
                  title={uiLanguage === 'es' ? 'Limpiar' : 'Clear'}>
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>
            {/* Color filter — "All" button first, then each color. Active
                filter reads unambiguously via ring + scale. */}
            <div className="flex items-center gap-1.5 px-3 h-11 rounded-full bg-surface shadow-[var(--theme-shadow-inset-border)] shrink-0" title={uiLanguage === 'es' ? 'Filtrar por color' : 'Filter by color'}>
              <button
                type="button"
                onClick={() => setColorFilter(null)}
                className={`h-6 px-2.5 rounded-full text-[11px] font-medium tracking-[0.04em] transition-colors ${colorFilter === null ? 'bg-primary text-white' : 'text-muted hover:text-text'}`}
                data-testid="filter-all"
              >
                {uiLanguage === 'es' ? 'Todos' : 'All'}
              </button>
              {NOTE_COLORS.map((c) => (
                <button key={c} onClick={() => setColorFilter(colorFilter === c ? null : c)}
                  className={`w-5 h-5 rounded-full ${COLOR_STYLES[c].dot} transition-all ${colorFilter === c ? 'ring-2 ring-[var(--theme-text)] ring-offset-1 ring-offset-[var(--theme-base)] scale-110' : 'opacity-60 hover:opacity-100'}`}
                  title={c} data-testid={`filter-${c}`} />
              ))}
            </div>
            {/* Grid / list — segmented two-button control, no mystery icon
                toggle. Active state is dominant; inactive is muted. */}
            <div className="flex items-center h-11 rounded-full bg-surface shadow-[var(--theme-shadow-inset-border)] shrink-0 p-0.5" role="group" aria-label={uiLanguage === 'es' ? 'Vista' : 'View'}>
              <button
                type="button"
                onClick={() => viewMode !== 'grid' && toggleView()}
                aria-pressed={viewMode === 'grid'}
                className={`h-10 w-10 rounded-full grid place-items-center transition-colors ${viewMode === 'grid' ? 'bg-[var(--theme-warm)] text-primary shadow-[var(--theme-shadow-inset-border)]' : 'text-muted hover:text-text'}`}
                title={uiLanguage === 'es' ? 'Cuadrícula' : 'Grid'}
                data-testid="view-toggle-grid"
              >
                <span className="material-symbols-outlined text-[18px]">grid_view</span>
              </button>
              <button
                type="button"
                onClick={() => viewMode !== 'list' && toggleView()}
                aria-pressed={viewMode === 'list'}
                className={`h-10 w-10 rounded-full grid place-items-center transition-colors ${viewMode === 'list' ? 'bg-[var(--theme-warm)] text-primary shadow-[var(--theme-shadow-inset-border)]' : 'text-muted hover:text-text'}`}
                title={uiLanguage === 'es' ? 'Lista' : 'List'}
                data-testid="view-toggle-list"
              >
                <span className="material-symbols-outlined text-[18px]">view_list</span>
              </button>
            </div>
            <button
              type="button"
              onClick={selectAllVisible}
              disabled={filteredDocs.length === 0}
              className="h-11 px-3 rounded-full bg-surface shadow-[var(--theme-shadow-inset-border)] text-xs text-muted hover:text-text transition-colors disabled:opacity-30 flex items-center gap-1.5"
              data-testid="select-all-notes-btn"
              title={uiLanguage === 'es' ? 'Seleccionar todas las visibles' : 'Select all visible'}
            >
              <span className="material-symbols-outlined text-[16px]">check_box_outline_blank</span>
              {uiLanguage === 'es' ? 'Seleccionar' : 'Select'}
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
        {!loading && documentsError && filteredDocs.length === 0 && (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/8 px-5 py-4 mb-4 flex flex-wrap items-center justify-between gap-3" data-testid="notes-load-error">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-300">{t('notes.loadFailed')}</p>
              <p className="text-xs text-red-200/80 break-words">{documentsError}</p>
            </div>
            <button
              type="button"
              onClick={() => { void fetchDocuments(selectedFolderId ?? undefined); }}
              className="h-10 px-3 rounded-xl bg-surface border border-edge text-sm text-text hover:border-primary hover:text-primary transition-colors"
              data-testid="notes-retry-load-btn"
            >
              {t('history.retry')}
            </button>
          </div>
        )}
        {!loading && !documentsError && filteredDocs.length === 0 && (
          <div className="text-center py-16 text-muted">
            <span className="material-symbols-outlined text-[48px] mb-4 block">note_stack</span>
            <p>{searchQuery || colorFilter ? t('notes.noResults') : t('notes.empty')}</p>
          </div>
        )}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="notes-grid">
            {filteredDocs.map((doc) => {
              const src = doc.source ?? 'manual';
              const preview = doc.content.replace(/<[^>]*>/g, '').trim().slice(0, 140);
              const isSelected = selectedNoteIds.includes(doc.id);
              // `sanitizeDisplayTitle` recognizes legacy auto-generated
              // timestamp titles and treats them as empty; display falls
              // back to "Untitled". DB value untouched.
              const displayTitle = sanitizeDisplayTitle(stripMediaExtension(doc.title)) || t('editor.untitled');
              const emptyLabel = uiLanguage === 'es' ? 'Sin contenido' : 'Empty';
              const folder = doc.folder_id ? folders.find((f) => f.id === doc.folder_id) : null;
              return (
                <div key={doc.id} onClick={() => openNote(doc.id)}
                  className="relative flex flex-col p-5 rounded-2xl bg-surface shadow-[var(--theme-shadow-inset-border)] hover:shadow-[var(--theme-shadow-inset-border),var(--theme-shadow-soft),var(--theme-shadow-warm)] hover:-translate-y-[1px] transition-all duration-200 text-left group min-h-[180px] cursor-pointer"
                  data-testid={`note-${doc.id}`}>
                  {/* Title row owns the full width — actions don't reflow
                   * it. The overlay cluster below lives in its own layer
                   * so hover never squeezes the title. */}
                  <h3 className="text-[15.5px] font-normal leading-snug text-text tracking-[-0.005em] line-clamp-2 mb-3 pr-24">
                    {displayTitle}
                  </h3>
                  {preview ? (
                    <p className="text-[13px] text-muted/85 leading-[1.6] tracking-[0.14px] line-clamp-3 flex-1">{preview}</p>
                  ) : (
                    <p className="text-[13px] text-muted/40 italic leading-[1.6] flex-1">{emptyLabel}</p>
                  )}
                  <div className="flex items-center gap-2 mt-4 text-[11px] text-muted/60 flex-wrap">
                    <span className="material-symbols-outlined text-[13px]">{SOURCE_ICONS[src]}</span>
                    <span className="capitalize tracking-[0.02em]">{sourceLabel(src).toLowerCase()}</span>
                    <span className="opacity-40">·</span>
                    <span>{relativeDate(doc.updated_at, uiLanguage)}</span>
                    {folder && (
                      <>
                        <span className="opacity-40">·</span>
                        <span className="inline-flex items-center gap-1" title={folder.name}>
                          <span className="material-symbols-outlined text-[13px]">folder</span>
                          <span className="truncate max-w-[120px]">{folder.name}</span>
                        </span>
                      </>
                    )}
                  </div>
                  <NoteCardActions
                    doc={doc}
                    folders={folders}
                    isSelected={isSelected}
                    onToggleSelect={() => toggleSelection(doc.id)}
                    onMoveToFolder={(folderId) => handleMoveToFolder(doc.id, folderId)}
                    onDelete={() => handleDeleteNote(doc.id)}
                    labels={{
                      select: t('notes.exportSelected'),
                      move: t('folders.moveToFolder'),
                      del: t('notes.delete'),
                      root: uiLanguage === 'es' ? 'Sin carpeta' : 'No folder',
                    }}
                  />
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
              const preview = doc.content.replace(/<[^>]*>/g, '').trim().slice(0, 100);
              const isSelected = selectedNoteIds.includes(doc.id);
              const displayTitle = sanitizeDisplayTitle(stripMediaExtension(doc.title)) || t('editor.untitled');
              const emptyLabel = uiLanguage === 'es' ? 'Sin contenido' : 'Empty';
              const folder = doc.folder_id ? folders.find((f) => f.id === doc.folder_id) : null;
              return (
                <div key={doc.id} onClick={() => openNote(doc.id)}
                  className="relative flex items-center gap-4 px-5 py-3.5 pr-28 rounded-2xl bg-surface shadow-[var(--theme-shadow-inset-border)] hover:shadow-[var(--theme-shadow-inset-border),var(--theme-shadow-soft)] transition-shadow text-left group cursor-pointer"
                  data-testid={`note-${doc.id}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cs.dot} opacity-50 shrink-0`} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-[14px] font-normal text-text tracking-[-0.005em] truncate">{displayTitle}</h3>
                      {folder && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted/60 shrink-0" title={folder.name}>
                          <span className="material-symbols-outlined text-[12px]">folder</span>
                          <span className="truncate max-w-[100px]">{folder.name}</span>
                        </span>
                      )}
                    </div>
                    <p className={`text-[12px] leading-[1.55] tracking-[0.14px] line-clamp-1 mt-0.5 ${preview ? 'text-muted/80' : 'text-muted/40 italic'}`}>{preview || emptyLabel}</p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted/60 shrink-0">
                    <span className="material-symbols-outlined text-[13px]">{SOURCE_ICONS[src]}</span>
                    <span className="capitalize tracking-[0.02em]">{sourceLabel(src).toLowerCase()}</span>
                    <span className="opacity-40">·</span>
                    <span>{relativeDate(doc.updated_at, uiLanguage)}</span>
                  </div>
                  <NoteCardActions
                    doc={doc}
                    folders={folders}
                    isSelected={isSelected}
                    onToggleSelect={() => toggleSelection(doc.id)}
                    onMoveToFolder={(folderId) => handleMoveToFolder(doc.id, folderId)}
                    onDelete={() => handleDeleteNote(doc.id)}
                    labels={{
                      select: t('notes.exportSelected'),
                      move: t('folders.moveToFolder'),
                      del: t('notes.delete'),
                      root: uiLanguage === 'es' ? 'Sin carpeta' : 'No folder',
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Undo-delete toast stack. Sits bottom-right above the action dock.
       * Each scheduled delete gets its own toast with an Undo button; the
       * 5 s timer fires the real `deleteDocument` when it expires. */}
      {scheduledDeletes.size > 0 && (
        <div className="fixed bottom-24 right-6 z-[120] flex flex-col gap-2" data-testid="undo-delete-stack">
          {Array.from(scheduledDeletes.keys()).map((id) => {
            const doc = documents.find((d) => d.id === id);
            const titleLabel = doc ? (sanitizeDisplayTitle(stripMediaExtension(doc.title)) || t('editor.untitled')) : '';
            return (
              <div key={id} className="flex items-center gap-3 rounded-xl border border-edge bg-surface px-3.5 py-2.5 shadow-[var(--theme-shadow-card),var(--theme-shadow-inset-border)] text-sm max-w-sm">
                <span className="material-symbols-outlined text-[18px] text-muted">delete</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-text truncate">
                    {uiLanguage === 'es' ? 'Nota eliminada' : 'Note deleted'}
                  </p>
                  <p className="text-[11px] text-muted truncate">{titleLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => undoDeleteNote(id)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold text-primary hover:bg-primary/10 transition-colors"
                  data-testid={`undo-delete-${id}`}
                >
                  {uiLanguage === 'es' ? 'Deshacer' : 'Undo'}
                </button>
              </div>
            );
          })}
        </div>
      )}
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

  // ——— EDIT MODE ———
  return (
    <div className="flex-1 min-h-0 relative flex flex-col bg-base" data-testid="dictate-page">
      {/* Top padding: AppShell's dedicated TopBar (48 px, separate
          chrome strip) now owns theme toggle + notification bell +
          widget-dock, so this header only needs breathing room from
          the TopBar's bottom border. `pt-6` (24 px) matches the
          horizontal px-8 visual rhythm. */}
      <header className="shrink-0 px-8 pt-6 pb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={goBack} className="flex items-center gap-2 text-sm text-muted hover:text-primary transition-colors" data-testid="back-to-notes">
              <span className="material-symbols-outlined text-[20px]">arrow_back</span><span className="font-medium">{t('editor.backToNotes')}</span>
            </button>
            {attachedActiveJob && onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('processes')}
                className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15"
                title={t('transcribe.attachedJobIndicator')}
                data-testid="note-attached-job-indicator"
              >
                <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                <span>{t('transcribe.inProgress')}</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
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
            {docId && (
              <Button variant="outline" size="sm" leftIcon="history" active={utilityPanel === 'history'}
                onClick={() => toggleUtilityPanel('history')} data-testid="note-history-toggle">
                {t('notes.historyShort')}
                {transcriptHistory.length > 0 && <span className="ml-1 rounded-full bg-base/70 px-1.5 py-0.5 text-[10px] text-muted">{transcriptHistory.length}</span>}
              </Button>
            )}
            {hasAudioUtilities && (
              <Button variant="outline" size="sm" leftIcon="audio_file" active={utilityPanel === 'audio'}
                onClick={() => toggleUtilityPanel('audio')} data-testid="note-audio-toggle">
                {t('notes.audioShort')}
              </Button>
            )}
            {retranscribeAudioUrl && (
              <Button variant="outline" size="sm" leftIcon="graphic_eq" active={utilityPanel === 'retranscribe'}
                onClick={() => toggleUtilityPanel('retranscribe')} data-testid="note-retranscribe-toggle">
                {t('notes.retranscribeShort')}
              </Button>
            )}
            <Button variant="ghost" size="icon" leftIcon="content_copy" onClick={handleCopy} disabled={!hasContent} title={t('dictate.copy')} data-testid="copy-btn" />
            <div className="relative">
              <Button variant="ghost" size="icon" leftIcon="download" onClick={() => { const next = !showExport; setShowExport(next); if (next) showActionFeedback(t('export.chooseFormat'), 'info'); }} disabled={!hasContent} title={t('export.title')} data-testid="export-btn" />
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
            {/* Save button is only meaningful when there are UNSAVED
                changes. When `saved` is true the emerald badge above
                already communicates the state; re-showing a prominent
                blue "Save" button duplicates the information and makes
                the user wonder whether a click would re-save or
                re-serialize something. Hide it until dirty. */}
            {!saved && (
              <button onClick={handleSave} disabled={!hasContent}
                className="flex items-center gap-2 h-9 px-5 rounded-full bg-primary text-white text-sm font-semibold tracking-[0.14px] shadow-[var(--theme-shadow-card)] hover:brightness-110 hover:-translate-y-[0.5px] active:brightness-95 transition-all disabled:opacity-30 disabled:hover:translate-y-0" data-testid="save-btn">
                <span className="material-symbols-outlined text-[18px]">save</span>{t('notes.save')}
              </button>
            )}
          </div>
        </div>
        {/* Title + color picker. The color picker gets a proper label
            on hover so users understand it tags the note by color. */}
        <div className="flex items-center gap-3">
          <input className="text-2xl font-bold text-text bg-transparent outline-none border-b border-transparent focus:border-primary pb-1 flex-1"
            value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} placeholder={t('editor.untitled')} data-testid="editor-title" />
          <div
            className="flex items-center gap-1.5 shrink-0"
            role="radiogroup"
            aria-label={uiLanguage === 'es' ? 'Color de la nota' : 'Note color tag'}
            title={uiLanguage === 'es' ? 'Etiqueta de color — agrupa notas por color' : 'Color tag — groups notes by color'}
          >
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleColorChange(c)}
                role="radio"
                aria-checked={noteColor === c}
                className={`w-4 h-4 rounded-full ${COLOR_STYLES[c].dot} transition-all ${noteColor === c ? 'ring-2 ring-[var(--theme-text)] scale-125' : 'opacity-40 hover:opacity-80'}`}
                title={c}
              />
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
        <input
          ref={transcribeFileInputRef}
          type="file"
          accept="audio/*,video/*"
          className="hidden"
          onChange={(e) => { handleTranscribeFile(e.target.files?.[0]); e.currentTarget.value = ''; }}
          data-testid="note-transcribe-file-input"
        />

      </header>

      <div className="flex-1 min-h-0 flex">
        {/* B5: stretch to full available width (honors collapsed sidebar).
            Soft upper cap on ultra-wide screens to keep lines readable. */}
        <div className="flex-1 min-w-0 overflow-y-auto px-8 pb-8 flex justify-center">
          <div className="w-full max-w-none 2xl:max-w-[1400px]">
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
            {docId && <NoteProcessesPanel documentId={docId} onOpenProcesses={onNavigate ? () => onNavigate('processes') : undefined} />}
            {utilityPanel !== 'none' && (
              <div className="mb-4" data-testid={`note-utility-panel-${utilityPanel}`}>
                {utilityPanel === 'history' && docId && (
                  <NoteTranscriptHistoryPanel
                    entries={transcriptHistory}
                    activeId={activeHistoryId}
                    loading={historyLoading}
                    error={historyError}
                    locale={uiLanguage}
                    onSelect={handleSelectHistoryEntry}
                    onApply={handleApplyHistoryEntry}
                    onDelete={(entryId) => { void handleDeleteHistoryEntry(entryId); }}
                  />
                )}
                {utilityPanel === 'retranscribe' && retranscribeAudioUrl && (
                  <NoteRetranscribePanel
                    language={retranscribeLanguage}
                    diarization={retranscribeDiarization}
                    aiSummary={retranscribeAiSummary}
                    punctuation={retranscribePunctuation}
                    loading={retranscribeLoading}
                    error={retranscribeError}
                    onChangeLanguage={setRetranscribeLanguage}
                    onChangeDiarization={setRetranscribeDiarization}
                    onChangeAiSummary={setRetranscribeAiSummary}
                    onChangePunctuation={setRetranscribePunctuation}
                    onRun={() => { void handleRetranscribeFromNote(); }}
                    onCancel={retranscribeLoading ? handleCancelRetranscribe : undefined}
                  />
                )}
                {utilityPanel === 'audio' && (
                  <NoteAudioPanel
                    audioUrl={activePlaybackAudioUrl}
                    title={title || t('notes.voiceNote')}
                    metaText={activeHistoryMeta}
                    activeSegmentText={activeSegmentText}
                    seekRequest={seekRequest}
                    onTimeUpdate={handlePlayerTimeUpdate}
                    segments={activeSegments}
                    activeIndex={activeSegmentIndex}
                    speakerAliases={speakerAliases}
                    onSelectSegment={handleSelectSegment}
                    onRenameSpeaker={handleRenameSpeaker}
                  />
                )}
              </div>
            )}
            <div className="relative" data-testid="note-editor-interaction-zone">
              <MilkdownEditor
                content={htmlContent}
                onChange={handleEditorChange}
                placeholder={t('dictate.placeholder')}
                onEditorReady={(h) => { editorRef.current = h; }}
                onReadSelection={handleReadSelection}
                onAiSelection={handleAiSelection}
                onContextMenu={handleEditorContextMenu}
              />
            </div>

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
          ensureNoteId={persistCurrentNote}
        />
      </div>
      {noteContextMenu}
      {transcribeDialog}
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
