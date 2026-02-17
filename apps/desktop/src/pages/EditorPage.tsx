import { useTranscriptionStore } from '../stores/transcription';
import { useDocumentsStore } from '../stores/documents';
import { useDictationStore } from '../stores/dictation';
import { ApiError } from '@whisperall/api-client';
import { api } from '../lib/api';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import { TranscriptView } from '../components/editor/TranscriptView';
import { InsightsPanel } from '../components/editor/InsightsPanel';
import { AudioPlayer } from '../components/editor/AudioPlayer';
import { RichEditor } from '../components/editor/RichEditor';
import { CustomPromptDialog, type CustomPrompt } from '../components/editor/CustomPromptDialog';
import { AiBudgetDialog } from '../components/editor/AiBudgetDialog';
import { useT } from '../lib/i18n';
import { useSettingsStore } from '../stores/settings';
import { formatDocDate, smartTitle } from '../lib/format-date';
import { safeHtmlParagraphs } from '../lib/editor-utils';
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

type Props = { documentId?: string | null; onBack?: () => void };
type BudgetDialogKind = 'warn' | 'blocked';

export function EditorPage({ documentId, onBack }: Props) {
  const t = useT();
  const uiLanguage = useSettingsStore((s) => s.uiLanguage);
  const { segments, fullText } = useTranscriptionStore();
  const { currentDocument, loadDocument, createDocument, updateDocument, clearCurrent } = useDocumentsStore();
  const dictationText = useDictationStore((s) => s.text);
  const dictationStatus = useDictationStore((s) => s.status);
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
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const editorRef = useRef<Editor | null>(null);
  const budgetResolverRef = useRef<((ok: boolean) => void) | null>(null);

  // Load document or create new one
  useEffect(() => {
    if (!documentId) { clearCurrent(); return; }
    if (documentId === 'new') {
      clearCurrent();
      createDocument({ title: smartTitle(uiLanguage), content: '', source: 'manual' })
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
  const handleEditorChange = (html: string, text: string) => {
    setHtmlContent(html);
    setPlainText(text);
    autoSave(title, html);
  };

  const text = documentId ? plainText : (plainText || fullText);
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
    editorRef.current.commands.insertContent(safeHtmlParagraphs(dictationText));
    autoSave(title, editorRef.current.getHTML());
  };

  const handleSavePrompts = (prompts: CustomPrompt[]) => { setCustomPrompts(prompts); saveCustomPrompts(prompts); };
  const hasTranscript = !documentId && (fullText || segments.length > 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden" data-testid="editor-page">
      {/* Header */}
      <div className="shrink-0 px-8 pt-12 pb-4 border-b border-edge bg-base/50 backdrop-blur-sm no-drag">
        {onBack && documentId && (
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted hover:text-primary mb-3 transition-colors py-1 px-1 -ml-1 rounded-lg hover:bg-white/5" data-testid="back-to-notes">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            <span className="font-medium">{t('editor.backToNotes')}</span>
          </button>
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
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-text mb-2">{hasTranscript ? t('editor.transcript') : t('editor.aiEditor')}</h1>
            {hasTranscript && (
              <div className="flex items-center gap-4 text-sm text-muted">
                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">group</span> {new Set(segments.map((s) => s.speaker).filter(Boolean)).size} {t('editor.speakers')}</span>
                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">segment</span> {segments.length} {t('editor.segments')}</span>
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
          {documentId && (
            <button onClick={insertDictation} disabled={!dictationText || dictationStatus === 'recording'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted bg-surface border border-edge rounded-lg hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-30"
              title={t('editor.insertDictation')}>
              <span className="material-symbols-outlined text-[16px]">mic</span>
              {t('editor.insertDictation')}
            </button>
          )}
          {processing && <span className="text-xs text-primary ml-2">{t('editor.processing')}</span>}
          {aiError && <span className="text-xs text-red-400 ml-2">{aiError}</span>}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto px-8 py-6 pb-32">
          {!documentId && segments.length > 0 ? (
            <TranscriptView segments={segments} />
          ) : (
            <RichEditor content={htmlContent} onChange={handleEditorChange}
              placeholder={documentId ? t('editor.notePlaceholder') : t('editor.placeholder')} onEditorReady={(e) => { editorRef.current = e; }} />
          )}
        </div>
        {hasTranscript && <InsightsPanel />}
      </div>

      {hasTranscript && <AudioPlayer />}
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
