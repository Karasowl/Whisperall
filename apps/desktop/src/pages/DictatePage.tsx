import { useState, useEffect, useRef, useMemo } from 'react';
import type { Editor } from '@tiptap/react';
import { useDictationStore } from '../stores/dictation';
import { useLiveStore } from '../stores/live';
import { useSettingsStore } from '../stores/settings';
import { useDocumentsStore } from '../stores/documents';
import { useAuthStore } from '../stores/auth';
import { electron } from '../lib/electron';
import { api } from '../lib/api';
import { exportNote, exportNotesBundle, type ExportFormat } from '../lib/export';
import { escapeHtml, safeHtmlParagraphs } from '../lib/editor-utils';
import { PlanGate } from '../components/PlanGate';
import { RichEditor } from '../components/editor/RichEditor';
import { VoiceToolbar } from '../components/editor/VoiceToolbar';
import { CustomPromptDialog, type CustomPrompt } from '../components/editor/CustomPromptDialog';
import { useT } from '../lib/i18n';
import { relativeDate, smartTitle } from '../lib/format-date';
import { requestPlanRefresh } from '../stores/plan';

const SOURCE_ICONS: Record<string, string> = { dictation: 'mic', live: 'groups', transcription: 'description', manual: 'edit_note' };
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
const VIEW_KEY = 'whisperall-notes-view';
function loadViewMode(): ViewMode { return (localStorage.getItem(VIEW_KEY) as ViewMode) || 'grid'; }

const PROMPTS_KEY = 'whisperall-custom-prompts';
function loadCustomPrompts(): CustomPrompt[] { try { return JSON.parse(localStorage.getItem(PROMPTS_KEY) ?? '[]'); } catch { return []; } }
function saveCustomPrompts(p: CustomPrompt[]) { localStorage.setItem(PROMPTS_KEY, JSON.stringify(p)); }

export function DictatePage() {
  const t = useT();
  const dictation = useDictationStore();
  const live = useLiveStore();
  const { translateEnabled, setTranslateEnabled, uiLanguage } = useSettingsStore();
  const { documents, loading, fetchDocuments, createDocument, updateDocument, deleteDocument } = useDocumentsStore();
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
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [subtitlesActive, setSubtitlesActive] = useState(false);
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>(loadCustomPrompts);
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [colorFilter, setColorFilter] = useState<NoteColor | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [showExport, setShowExport] = useState(false);
  const [showBulkExport, setShowBulkExport] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [actionFeedback, setActionFeedback] = useState<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null);
  const toggleView = () => { const v: ViewMode = viewMode === 'grid' ? 'list' : 'grid'; setViewMode(v); localStorage.setItem(VIEW_KEY, v); };
  const prevDictText = useRef('');
  const prevSegCount = useRef(0);
  const editorRef = useRef<Editor | null>(null);
  const actionFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLive = live.source === 'system';
  const status = isLive ? live.status : dictation.status;
  const hasContent = htmlContent.replace(/<[^>]*>/g, '').trim().length > 0;

  useEffect(() => { if (user) fetchDocuments(); }, [user, fetchDocuments]);

  // Handle pending document open (from Transcribe → Open in Notes)
  const pendingOpenId = useDocumentsStore((s) => s.pendingOpenId);
  useEffect(() => {
    if (pendingOpenId && documents.length > 0) {
      openNote(pendingOpenId);
      useDocumentsStore.getState().setPendingOpen(null);
    }
  }, [pendingOpenId, documents]);

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

  const openNote = (id: string) => {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;
    setDocId(doc.id); setTitle(doc.title); setHtmlContent(doc.content);
    setNoteColor(getColor(doc.tags ?? [])); setNoteTags(doc.tags ?? []);
    setMode('edit'); setSaved(true);
    prevDictText.current = ''; prevSegCount.current = 0;
  };

  const newNote = (autoRecord = false) => {
    setDocId(null); setTitle(''); setHtmlContent(''); setPlainText('');
    setNoteColor('blue'); setNoteTags([]);
    setMode('edit'); setSaved(false);
    prevDictText.current = ''; prevSegCount.current = 0;
    if (autoRecord) {
      setTimeout(() => {
        if (isLive) live.start(); else dictation.start();
      }, 100);
    }
  };

  const goBack = () => { setMode('list'); setDocId(null); setSaved(false); if (user) fetchDocuments(); };

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
  const handleDeleteNote = (id: string) => {
    if (!window.confirm(t('notes.confirmDelete'))) return;
    setSelectedNoteIds((prev) => prev.filter((selectedId) => selectedId !== id));
    deleteDocument(id).catch(() => {});
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
  const handleAiEdit = async (aiMode: string, prompt?: string) => {
    const txt = plainText || htmlContent.replace(/<[^>]*>/g, '');
    if (!txt) return;
    setProcessing(true); setAiError('');
    try {
      const res = await api.aiEdit.edit({ text: txt, mode: aiMode, prompt });
      setHtmlContent(safeHtmlParagraphs(res.text)); setSaved(false);
      requestPlanRefresh();
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? '';
      if (msg.includes('429')) setAiError(t('ai.limitReached'));
      else if (msg.includes('400')) setAiError(t('ai.tooLong'));
      else setAiError(t('ai.failed'));
    } finally { setProcessing(false); }
  };

  useEffect(() => {
    return () => {
      if (actionFeedbackTimer.current) clearTimeout(actionFeedbackTimer.current);
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
        {/* Search + color filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined text-[20px] text-muted absolute left-3 top-1/2 -translate-y-1/2">search</span>
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t('notes.search')}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-edge text-sm text-text placeholder:text-muted/50 outline-none focus:border-primary transition-colors" data-testid="notes-search" />
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-surface border border-edge">
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
          <button onClick={toggleView} className="p-2 rounded-lg bg-surface border border-edge text-muted hover:text-text transition-colors shrink-0" title={viewMode === 'grid' ? 'List view' : 'Grid view'} data-testid="view-toggle">
            <span className="material-symbols-outlined text-[20px]">{viewMode === 'grid' ? 'view_list' : 'grid_view'}</span>
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted" data-testid="selected-count">
              {t('notes.selectedCount').replace('{count}', String(selectedNoteIds.length))}
            </span>
            <button
              type="button"
              onClick={selectAllVisible}
              disabled={filteredDocs.length === 0}
              className="px-2.5 py-1.5 rounded-lg bg-surface border border-edge text-xs text-muted hover:text-text transition-colors disabled:opacity-30"
              data-testid="select-all-notes-btn"
            >
              {t('notes.selectAllVisible')}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedNoteIds.length === 0}
              className="px-2.5 py-1.5 rounded-lg bg-surface border border-edge text-xs text-muted hover:text-text transition-colors disabled:opacity-30"
              data-testid="clear-selection-btn"
            >
              {t('notes.clearSelection')}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  const next = !showBulkExport;
                  setShowBulkExport(next);
                  if (next && selectedNoteIds.length === 0) showActionFeedback(t('notes.selectToExport'), 'info');
                }}
                disabled={selectedNoteIds.length === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-edge text-xs text-muted hover:text-text transition-colors disabled:opacity-30"
                data-testid="bulk-export-btn"
                title={t('notes.exportSelected')}
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                {t('notes.exportSelected')}
              </button>
              {showBulkExport && (
                <div className="absolute right-0 top-full mt-1 bg-surface border border-edge rounded-xl shadow-xl py-1 z-50 min-w-[160px]" data-testid="bulk-export-menu">
                  {(['txt', 'md', 'docx', 'pdf'] as ExportFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => { handleExportSelected(fmt); setShowBulkExport(false); }}
                      className="w-full px-4 py-2 text-sm text-left text-text hover:bg-surface-alt transition-colors"
                      data-testid={`bulk-export-${fmt}`}
                    >
                      {t(`export.${fmt}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-8 pb-8">
        {loading && <p className="text-primary text-sm mb-4">{t('notes.loading')}</p>}
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
                  className={`flex flex-col p-4 rounded-xl border border-edge border-l-4 ${cs.border} ${cs.bg} hover:brightness-125 transition-all text-left group h-[140px] cursor-pointer`} data-testid={`note-${doc.id}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleSelection(doc.id); }}
                      className="p-0.5 rounded text-muted hover:text-text"
                      data-testid={`select-note-${doc.id}`}
                      title={t('notes.exportSelected')}
                    >
                      <span className="material-symbols-outlined text-[18px]">{isSelected ? 'check_box' : 'check_box_outline_blank'}</span>
                    </button>
                    <span className="material-symbols-outlined text-[16px] text-muted">{SOURCE_ICONS[src]}</span>
                    <p className="text-sm font-semibold text-text truncate flex-1">{doc.title}</p>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteNote(doc.id); }}
                      className="p-1 rounded text-muted opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all shrink-0" title={t('notes.delete')}>
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                  <p className="text-xs text-muted/70 leading-relaxed line-clamp-3 flex-1">{preview || '...'}</p>
                  <span className="text-[11px] text-muted/50 mt-2">{relativeDate(doc.updated_at, uiLanguage)}</span>
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
                  className={`flex items-center gap-4 p-4 rounded-xl border border-edge border-l-4 ${cs.border} bg-surface hover:bg-surface-alt transition-colors text-left group cursor-pointer`} data-testid={`note-${doc.id}`}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleSelection(doc.id); }}
                    className="p-0.5 rounded text-muted hover:text-text shrink-0"
                    data-testid={`select-note-${doc.id}`}
                    title={t('notes.exportSelected')}
                  >
                    <span className="material-symbols-outlined text-[18px]">{isSelected ? 'check_box' : 'check_box_outline_blank'}</span>
                  </button>
                  <span className="material-symbols-outlined text-[20px] text-muted">{SOURCE_ICONS[src]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text truncate">{doc.title}</p>
                    <p className="text-xs text-muted truncate mt-0.5">{preview}</p>
                  </div>
                  <span className="text-xs text-muted shrink-0">{relativeDate(doc.updated_at, uiLanguage)}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteNote(doc.id); }}
                    className="p-1.5 rounded-lg text-muted opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all shrink-0" title={t('notes.delete')}>
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
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
            {dictation.error && status !== 'recording' && <span className="text-xs text-red-400 max-w-[200px] truncate" title={dictation.error}>{t('dictate.flushError')}</span>}
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
        {/* Voice controls + AI modes */}
        <div className="flex items-center gap-2 flex-wrap">
          <PlanGate resource="stt_seconds">
            <VoiceToolbar status={status} source={live.source}
              onToggleRecord={handleToggle} onToggleSource={handleToggleSource}
              translateEnabled={translateEnabled} onToggleTranslate={() => setTranslateEnabled(!translateEnabled)}
              subtitlesActive={subtitlesActive} onToggleSubtitles={handleToggleSubtitles} />
          </PlanGate>
          <div className="w-px h-5 bg-edge mx-1" />
          {BUILT_IN_MODES.map((m) => (
            <button key={m.id} onClick={() => handleAiEdit(m.id)} disabled={processing || !hasContent}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted bg-surface border border-edge rounded-lg hover:bg-surface-alt hover:text-text transition-colors disabled:opacity-30 capitalize" data-testid={`ai-${m.id}`}>
              <span className="material-symbols-outlined text-[16px]">{m.icon}</span>{t(`editor.${m.id}`)}
            </button>
          ))}
          {customPrompts.map((p) => (
            <button key={p.id} onClick={() => handleAiEdit('custom', p.prompt)} disabled={processing || !hasContent}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary/80 bg-primary/5 border border-primary/20 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-30">
              <span className="material-symbols-outlined text-[16px]">{p.icon}</span>{p.name}
            </button>
          ))}
          <button onClick={() => setShowPromptDialog(true)} className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted hover:text-primary transition-colors" title={t('editor.customPrompts')}>
            <span className="material-symbols-outlined text-[16px]">add_circle</span>
          </button>
          {processing && <span className="text-xs text-primary ml-2">{t('editor.processing')}</span>}
          {aiError && <span className="text-xs text-red-400 ml-2">{aiError}</span>}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 pb-8 flex justify-center">
        <div className="w-full max-w-3xl">
          {isLive && live.status === 'recording' && live.interimText && (
            <div className="px-4 py-3 mb-4 rounded-lg border border-primary/30 bg-primary/10" data-testid="live-interim">
              <span className="text-base text-text-secondary/70">{live.interimText}</span>
              <span className="inline-block w-0.5 h-5 bg-primary ml-1 animate-pulse align-middle" />
            </div>
          )}
          <RichEditor content={htmlContent} onChange={handleEditorChange} placeholder={t('dictate.placeholder')} onEditorReady={(e) => { editorRef.current = e; }} />
          {dictation.translatedText && (
            <div className="pt-2 mt-4 border-t border-edge text-base text-muted italic whitespace-pre-wrap" data-testid="translated-text">{dictation.translatedText}</div>
          )}
        </div>
      </div>
      {showPromptDialog && <CustomPromptDialog prompts={customPrompts} onSave={(p) => { setCustomPrompts(p); saveCustomPrompts(p); }} onClose={() => setShowPromptDialog(false)} />}
    </div>
  );
}
