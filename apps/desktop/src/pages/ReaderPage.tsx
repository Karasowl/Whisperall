import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlanGate } from '../components/PlanGate';
import { useT } from '../lib/i18n';
import { useSettingsStore, type ReaderHighlightMode } from '../stores/settings';
import { ReaderPlayerBar } from '../components/reader/ReaderPlayerBar';
import { ReaderLibrary } from '../components/reader/ReaderLibrary';
import { useReaderController } from './reader/useReaderController';
import { useReaderStore } from '../stores/reader';

const READER_V2_ENABLED = (import.meta.env.VITE_READER_V2_ENABLED as string | undefined) !== 'false';

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function rangeForMode(text: string, offset: number, mode: ReaderHighlightMode): [number, number] {
  const len = text.length;
  const at = clamp(offset, 0, len);
  if (mode === 'none' || len === 0) return [at, at];

  if (mode === 'paragraph') {
    const before = text.lastIndexOf('\n\n', Math.max(0, at - 1));
    const after = text.indexOf('\n\n', at);
    const start = before === -1 ? 0 : before + 2;
    const end = after === -1 ? len : after;
    return start < end ? [start, end] : [at, at];
  }

  if (mode === 'sentence') {
    let start = 0;
    for (let i = Math.max(0, at - 1); i >= 0; i -= 1) {
      const ch = text[i];
      if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
        start = i + 1;
        break;
      }
    }
    let end = len;
    for (let i = at; i < len; i += 1) {
      const ch = text[i];
      if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
        end = i + 1;
        break;
      }
    }
    return start < end ? [start, end] : [at, at];
  }

  let start = at;
  while (start > 0 && /\S/.test(text[start - 1] ?? '')) start -= 1;
  let end = at;
  while (end < len && /\S/.test(text[end] ?? '')) end += 1;
  return start < end ? [start, end] : [at, at];
}

function captionFromOffset(text: string, offset: number): string {
  const [start, end] = rangeForMode(text, offset, 'sentence');
  const sentence = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (!sentence) return '';
  return sentence.length > 220 ? `${sentence.slice(0, 217)}...` : sentence;
}

export function ReaderPage() {
  const t = useT();
  const uiLanguage = useSettingsStore((s) => s.uiLanguage);
  const ttsLanguage = useSettingsStore((s) => s.ttsLanguage);
  const setTtsLanguage = useSettingsStore((s) => s.setTtsLanguage);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const setTtsVoice = useSettingsStore((s) => s.setTtsVoice);
  const readerDisplay = useSettingsStore((s) => s.readerDisplay);
  const setReaderDisplay = useSettingsStore((s) => s.setReaderDisplay);
  const c = useReaderController(uiLanguage, t, ttsLanguage, ttsVoice);
  const fetchDocuments = useReaderStore((s) => s.fetchDocuments);
  const documents = useReaderStore((s) => s.documents);
  const currentDocument = useReaderStore((s) => s.currentDocument);
  const readerText = useReaderStore((s) => s.text);
  const setReaderText = useReaderStore((s) => s.setText);
  const importFile = useReaderStore((s) => s.importFile);
  const importUrl = useReaderStore((s) => s.importUrl);
  const openDocument = useReaderStore((s) => s.openDocument);
  const deleteDocument = useReaderStore((s) => s.deleteDocument);
  const saveCurrentText = useReaderStore((s) => s.saveCurrentText);
  const startNewDraft = useReaderStore((s) => s.startNewDraft);
  const bookmarks = useReaderStore((s) => s.bookmarks);
  const annotations = useReaderStore((s) => s.annotations);
  const addBookmark = useReaderStore((s) => s.addBookmark);
  const removeBookmark = useReaderStore((s) => s.removeBookmark);
  const addAnnotation = useReaderStore((s) => s.addAnnotation);
  const updateAnnotation = useReaderStore((s) => s.updateAnnotation);
  const removeAnnotation = useReaderStore((s) => s.removeAnnotation);
  const progress = useReaderStore((s) => s.progress);
  const saveProgress = useReaderStore((s) => s.saveProgress);
  const readerLoading = useReaderStore((s) => s.loading);
  const readerError = useReaderStore((s) => s.error);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [forceOcr, setForceOcr] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toggleLibrary = useCallback(() => setLibraryOpen((v) => !v), []);

  useEffect(() => { void fetchDocuments(); }, [fetchDocuments]);
  useEffect(() => { if (readerText !== c.text) c.setText(readerText); }, [readerText, c.text, c.setText]);
  useEffect(() => { if (c.text !== readerText) setReaderText(c.text); }, [c.text, readerText, setReaderText]);

  useEffect(() => {
    const docId = currentDocument?.id;
    if (!docId || !c.text.trim()) return;
    const timer = window.setTimeout(() => {
      const ratio = c.progress.overallDuration > 0 ? c.progress.overallTime / c.progress.overallDuration : 0;
      const charOffset = Math.max(0, Math.min(c.text.length, Math.floor(ratio * c.text.length)));
      void saveProgress({
        char_offset: charOffset,
        playback_seconds: c.progress.overallTime,
        section_index: c.progress.current,
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [currentDocument?.id, c.progress.overallTime, c.progress.overallDuration, c.progress.current, c.text, saveProgress]);

  useEffect(() => {
    const el = c.textareaRef.current;
    if (!el || !progress || !currentDocument) return;
    const next = Math.max(0, Math.min(c.text.length, progress.char_offset || 0));
    el.setSelectionRange(next, next);
  }, [progress, currentDocument, c.text, c.textareaRef]);

  const activeOffset = useMemo(() => {
    if (!c.text.length) return 0;
    if (c.progress.overallDuration > 0 && c.progress.status !== 'idle') {
      const ratio = c.progress.overallTime / c.progress.overallDuration;
      return clamp(Math.floor(ratio * c.text.length), 0, c.text.length);
    }
    return clamp(progress?.char_offset ?? 0, 0, c.text.length);
  }, [c.progress.overallDuration, c.progress.overallTime, c.progress.status, c.text, progress?.char_offset]);

  const captionText = useMemo(() => captionFromOffset(c.text, activeOffset), [c.text, activeOffset]);

  useEffect(() => {
    if (readerDisplay.highlight_mode === 'none') return;
    if (c.progress.status !== 'playing' && c.progress.status !== 'paused') return;
    const el = c.textareaRef.current;
    if (!el) return;
    const [start, end] = rangeForMode(c.text, activeOffset, readerDisplay.highlight_mode);
    if (start >= end) return;
    el.setSelectionRange(start, end);
  }, [activeOffset, c.progress.status, c.text, c.textareaRef, readerDisplay.highlight_mode]);

  const onPickFile = async (file?: File | null) => {
    if (!READER_V2_ENABLED) return;
    if (!file) return;
    await importFile(file, { save: true, forceOcr });
  };

  const onImportUrl = async () => {
    if (!READER_V2_ENABLED) return;
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    await importUrl(trimmed, { save: true, forceOcr });
    setUrlInput('');
  };

  const jumpToOffset = (offset: number) => {
    const el = c.textareaRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(c.text.length, offset));
    el.focus();
    el.setSelectionRange(clamped, clamped);
  };

  const onCreateBookmark = async () => {
    if (!READER_V2_ENABLED) return;
    const start = c.textareaRef.current?.selectionStart ?? 0;
    await addBookmark(start);
  };

  const onCreateAnnotation = async () => {
    if (!READER_V2_ENABLED) return;
    const el = c.textareaRef.current;
    if (!el) return;
    const start = Math.min(el.selectionStart ?? 0, el.selectionEnd ?? 0);
    const end = Math.max(el.selectionStart ?? 0, el.selectionEnd ?? 0);
    if (end <= start) return;
    const note = window.prompt(t('reader.annotationPrompt')) ?? '';
    await addAnnotation(start, end, note, '#137fec');
  };

  const onEditAnnotation = async (id: string, currentNote: string) => {
    const next = window.prompt(t('reader.annotationEditPrompt'), currentNote ?? '');
    if (next === null) return;
    await updateAnnotation(id, { note: next });
  };

  const libraryItems = useMemo(() => documents.map((d) => ({
    id: d.id,
    title: d.title,
    text: d.content,
    createdAt: Date.parse(d.created_at) || 0,
    updatedAt: Date.parse(d.updated_at) || 0,
  })), [documents]);

  const toolbarBtn = (icon: string, label: string, onClick: () => void, testId: string, disabled = false) =>
    <button type="button" onClick={onClick} data-testid={testId} disabled={disabled}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-edge text-xs font-semibold text-muted hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40 disabled:hover:border-edge disabled:hover:text-muted">
      <span className="material-symbols-outlined text-[18px]">{icon}</span>{label}
    </button>;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-base" data-testid="reader-page">
      <div className="px-8 pt-12 pb-6">
        <h2 className="text-3xl font-black tracking-tight mb-2 text-text">{t('reader.title')}</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted">{t('reader.desc')}</p>
          <div className="text-xs text-muted bg-surface border border-edge rounded-lg px-3 py-1.5">
            <span className="font-mono">Ctrl+Shift+R</span> {t('reader.hotkeyHint')}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 relative flex-wrap">
          <input ref={fileInputRef} type="file" accept=".txt,.md,.markdown,.html,.htm,.pdf,.docx,.epub,.rtf,.odt,.png,.jpg,.jpeg,.webp,.tif,.tiff" className="hidden"
            aria-label={t('reader.upload')} onChange={(e) => { void onPickFile(e.target.files?.[0]); e.currentTarget.value = ''; }} />
          {toolbarBtn('add', t('reader.addText'), () => { c.onStop(); startNewDraft(); }, 'reader-add-btn')}
          {toolbarBtn('upload_file', t('reader.upload'), () => fileInputRef.current?.click(), 'reader-upload-btn', !READER_V2_ENABLED)}
          <div className="flex items-center gap-1 rounded-lg border border-edge bg-surface px-2 py-1">
            <span className="material-symbols-outlined text-[16px] text-muted">link</span>
            <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder={t('reader.urlPlaceholder')}
              className="bg-transparent outline-none text-xs text-text w-52 disabled:opacity-50" data-testid="reader-url-input" disabled={!READER_V2_ENABLED} />
            <button type="button" onClick={() => { void onImportUrl(); }} data-testid="reader-url-import-btn" disabled={!READER_V2_ENABLED}
              className="px-2 py-1 text-[11px] rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40 disabled:hover:bg-primary/20">{t('reader.importUrl')}</button>
          </div>
          {toolbarBtn('content_paste', t('reader.fromClipboard'), c.onFromClipboard, 'reader-clipboard-btn')}
          <button type="button" onClick={() => setDisplayOpen((v) => !v)} data-testid="reader-display-btn"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
              displayOpen ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-surface border-edge text-muted hover:border-primary/40 hover:text-primary'
            }`}>
            <span className="material-symbols-outlined text-[18px]">tune</span>{t('reader.display')}
          </button>
          <button type="button" onClick={() => setForceOcr((v) => !v)} data-testid="reader-force-ocr-btn"
            disabled={!READER_V2_ENABLED}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
              forceOcr ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-surface border-edge text-muted hover:border-primary/40 hover:text-primary'
            } disabled:opacity-40 disabled:hover:border-edge disabled:hover:text-muted`}>
            <span className="material-symbols-outlined text-[18px]">document_scanner</span>{t('reader.forceOcr')}
          </button>
          <button type="button" onClick={() => { void onCreateBookmark(); }} disabled={!currentDocument || !READER_V2_ENABLED}
            data-testid="reader-add-bookmark-btn" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-edge text-xs font-semibold text-muted hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40">
            <span className="material-symbols-outlined text-[18px]">bookmark_added</span>{t('reader.addBookmark')}
          </button>
          <button type="button" onClick={() => { void onCreateAnnotation(); }} disabled={!currentDocument || !READER_V2_ENABLED}
            data-testid="reader-add-annotation-btn" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-edge text-xs font-semibold text-muted hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40">
            <span className="material-symbols-outlined text-[18px]">edit_note</span>{t('reader.addAnnotation')}
          </button>
          <button type="button" onClick={c.onClear} disabled={!c.text.trim()} data-testid="reader-clear-btn"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-edge text-xs font-semibold text-muted hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40">
            <span className="material-symbols-outlined text-[18px]">backspace</span>{t('reader.clear')}
          </button>
          <button type="button" onClick={() => { void saveCurrentText(); }} disabled={!c.text.trim() || !READER_V2_ENABLED} data-testid="reader-save-sync-btn"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-edge text-xs font-semibold text-muted hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40">
            <span className="material-symbols-outlined text-[18px]">cloud_upload</span>{t('reader.saveSync')}
          </button>
          <button type="button" onClick={toggleLibrary} data-testid="reader-library-btn" disabled={!READER_V2_ENABLED}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
              libraryOpen ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-surface border-edge text-muted hover:border-primary/40 hover:text-primary'
            } disabled:opacity-40 disabled:hover:border-edge disabled:hover:text-muted`}>
            <span className="material-symbols-outlined text-[18px]">library_books</span>{t('reader.library')}
            <span className="material-symbols-outlined text-[14px]">{libraryOpen ? 'expand_less' : 'expand_more'}</span>
          </button>
          {!READER_V2_ENABLED && <p className="text-xs text-amber-400">{t('reader.v2Disabled')}</p>}
          {READER_V2_ENABLED && libraryOpen && (
            <ReaderLibrary items={libraryItems} currentId={currentDocument?.id ?? null} hasText={c.hasText}
              onNew={() => { c.onStop(); startNewDraft(); }} onSave={() => { void saveCurrentText(); }} onSelect={(id) => { void openDocument(id); }}
              onDelete={(id) => { void deleteDocument(id); }} onClose={toggleLibrary} />
          )}
        </div>
      </div>

      <PlanGate resource="tts_chars">
        <div className="flex-1 min-h-0 px-8 pb-4 flex gap-4">
          <div className="flex-1 min-h-0 flex flex-col">
            {displayOpen && (
              <div className="mb-3 p-3 rounded-xl border border-edge bg-surface flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-2">{t('reader.fontSize')}
                  <input type="range" min={14} max={36} value={readerDisplay.font_size} onChange={(e) => setReaderDisplay({ font_size: Number(e.target.value) })} />
                </label>
                <label className="flex items-center gap-2">{t('reader.lineHeight')}
                  <input type="range" min={12} max={26} value={Math.round(readerDisplay.line_height * 10)}
                    onChange={(e) => setReaderDisplay({ line_height: Number(e.target.value) / 10 })} />
                </label>
                <label className="flex items-center gap-2">{t('reader.letterSpacing')}
                  <input type="range" min={-1} max={6} step={0.2} value={readerDisplay.letter_spacing}
                    onChange={(e) => setReaderDisplay({ letter_spacing: Number(e.target.value) })} />
                </label>
                <label className="flex items-center gap-2">{t('reader.theme')}
                  <select value={readerDisplay.theme} onChange={(e) => setReaderDisplay({ theme: e.target.value as typeof readerDisplay.theme })}
                    className="bg-base border border-edge rounded px-2 py-1">
                    <option value="paper">Paper</option><option value="dark">Dark</option><option value="high_contrast">High Contrast</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">{t('reader.highlightMode')}
                  <select value={readerDisplay.highlight_mode} onChange={(e) => setReaderDisplay({ highlight_mode: e.target.value as typeof readerDisplay.highlight_mode })}
                    className="bg-base border border-edge rounded px-2 py-1">
                    <option value="word">Word</option><option value="sentence">Sentence</option><option value="paragraph">Paragraph</option><option value="none">None</option>
                  </select>
                </label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={readerDisplay.captions_on}
                  onChange={(e) => setReaderDisplay({ captions_on: e.target.checked })} />{t('reader.captions')}</label>
              </div>
            )}
            <div className="relative flex-1 min-h-0">
              <textarea ref={c.textareaRef} value={c.text} onChange={(e) => c.setText(e.target.value)}
                placeholder={t('reader.placeholder')} data-testid="reader-textarea"
                style={{ fontSize: `${readerDisplay.font_size}px`, lineHeight: String(readerDisplay.line_height), letterSpacing: `${readerDisplay.letter_spacing}px` }}
                className={`w-full h-full p-6 border border-edge rounded-2xl text-text-secondary outline-none resize-none placeholder:text-muted/60 focus:border-primary/40 transition-colors ${
                  readerDisplay.theme === 'dark' ? 'bg-base' : readerDisplay.theme === 'high_contrast' ? 'bg-white text-black' : 'bg-surface paper-texture'
                }`} />
              <span className="absolute bottom-3 right-4 text-[11px] text-muted/60 pointer-events-none">
                {t('reader.textHint').replace('{count}', c.text.length.toLocaleString())}
              </span>
            </div>
          </div>
          <aside className="w-72 shrink-0 rounded-2xl border border-edge bg-surface p-3 overflow-y-auto">
            <p className="text-sm font-semibold text-text mb-2">{t('reader.bookmarks')}</p>
            <div className="space-y-1 mb-4">
              {bookmarks.length === 0 ? <p className="text-xs text-muted">{t('reader.noneYet')}</p> : bookmarks.map((b) => (
                <div key={b.id} className="flex items-center gap-1">
                  <button type="button" className="flex-1 text-left text-xs px-2 py-1 rounded bg-base border border-edge hover:border-primary/30"
                    onClick={() => jumpToOffset(b.char_offset)}>{b.label || `@${b.char_offset}`}</button>
                  <button type="button" className="p-1 rounded hover:text-red-400" onClick={() => { void removeBookmark(b.id); }}>
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              ))}
            </div>
            <p className="text-sm font-semibold text-text mb-2">{t('reader.annotations')}</p>
            <div className="space-y-1">
              {annotations.length === 0 ? <p className="text-xs text-muted">{t('reader.noneYet')}</p> : annotations.map((a) => (
                <div key={a.id} className="rounded bg-base border border-edge p-2">
                  <button type="button" className="text-xs font-medium text-primary hover:underline"
                    onClick={() => jumpToOffset(a.start_offset)}>{a.start_offset} - {a.end_offset}</button>
                  <p className="text-xs text-text-secondary mt-1 break-words">{a.note || '(no note)'}</p>
                  <button type="button" className="mt-1 text-[11px] text-primary hover:underline"
                    onClick={() => { void onEditAnnotation(a.id, a.note); }}>{t('reader.annotationEdit')}</button>
                  <button type="button" className="mt-1 ml-2 text-[11px] text-red-400 hover:underline"
                    onClick={() => { void removeAnnotation(a.id); }}>{t('reader.delete')}</button>
                </div>
              ))}
            </div>
            {readerError && <p className="mt-3 text-xs text-red-400">{readerError}</p>}
            {readerLoading && <p className="mt-2 text-xs text-muted">{t('history.loading')}</p>}
          </aside>
        </div>

        {readerDisplay.captions_on && c.progress.status !== 'idle' && (
          <div className="mx-8 mb-3 rounded-xl border border-edge bg-[#b9c9b8] text-[#1d2820] px-6 py-4 text-center text-2xl font-medium leading-snug" data-testid="reader-captions">
            {captionText || t('reader.captionsEmpty')}
          </div>
        )}

        <ReaderPlayerBar progress={c.progress} hasText={c.hasText}
          onToggle={c.onToggle} onStop={c.onStop} onReadSelection={c.onReadSelection}
          onJump={c.onJump} onSeek={c.onSeek} onCycleSpeed={c.onCycleSpeed}
          onPrevSection={c.onPrevSection} onNextSection={c.onNextSection}
          onDownload={c.onDownload} canDownload={c.canDownload}
          ttsLanguage={ttsLanguage} onTtsLanguageChange={setTtsLanguage}
          ttsVoice={ttsVoice} onTtsVoiceChange={setTtsVoice} />
      </PlanGate>
    </div>
  );
}
