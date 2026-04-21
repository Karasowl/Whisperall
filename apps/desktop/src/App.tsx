import { useState, useEffect, useRef } from 'react';
import { AppShell } from './components/shell/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DictatePage } from './pages/DictatePage';
import { TranscribePage } from './pages/TranscribePage';
import { HistoryPage } from './pages/HistoryPage';
import { ProcessesPage } from './pages/ProcessesPage';
import { LogsPage } from './pages/LogsPage';
import { AuthPage } from './pages/AuthPage';
import { reportError, useNotificationsStore } from './stores/notifications';
import { useAuthStore } from './stores/auth';
import { requestPlanRefresh, usePlanStore } from './stores/plan';
import { useSettingsStore } from './stores/settings';
import { useDictationStore } from './stores/dictation';
import { useLiveStore } from './stores/live';
import { electron } from './lib/electron';
import { playCueSound } from './lib/cue-sounds';
import { playTTS } from './lib/tts';
import { inferTTSLanguage } from './lib/lang-detect';
import { useT } from './lib/i18n';
import { PricingContext } from './lib/pricing-context';
import { useNotesActionsStore } from './stores/notes-actions';

export type Page = 'dictate' | 'transcribe' | 'history' | 'processes' | 'logs';

const PASTE_EVENT_NAME = 'whisperall:paste-text';

function insertIntoTextField(target: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? start;
  const nextValue = `${target.value.slice(0, start)}${text}${target.value.slice(end)}`;
  target.value = nextValue;
  const caret = start + text.length;
  target.setSelectionRange(caret, caret);
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
}

function insertIntoContentEditable(target: HTMLElement, text: string): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    target.focus();
    document.execCommand('insertText', false, text);
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.setEndAfter(textNode);
  selection.removeAllRanges();
  selection.addRange(range);
  target.dispatchEvent(new Event('input', { bubbles: true }));
}

export default function App() {
  const [page, setPage] = useState<Page>('dictate');
  const [showSettings, setShowSettings] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const initAuth = useAuthStore((s) => s.init);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const fetchPlan = usePlanStore((s) => s.fetch);
  const loadSettings = useSettingsStore((s) => s.load);
  const dictationCueSounds = useSettingsStore((s) => s.dictationCueSounds);
  const dictationStatus = useDictationStore((s) => s.status);
  const dictationError = useDictationStore((s) => s.error);
  const liveStatus = useLiveStore((s) => s.status);
  const liveError = useLiveStore((s) => s.error);
  const prevDictationStatus = useRef(dictationStatus);
  const prevLiveStatus = useRef(liveStatus);
  const prevDictationError = useRef<string | null>(dictationError);
  const prevLiveError = useRef<string | null>(liveError);

  useEffect(() => { initAuth(); loadSettings(); }, [initAuth, loadSettings]);

  // Global error capture — never let an error die silently.
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportError('window.error', e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => reportError('unhandledRejection', e.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    // Safety net: if the window unloads/hides with the mic still open, force
    // release so Windows can switch Bluetooth back to A2DP (fixes the "audio
    // extremely loud on Bluetooth" bug when the app closes mid-dictation).
    const onBeforeUnload = () => { void import('./lib/audio').then((m) => m.forceReleaseMic()); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  // Bridge backend stderr / exit events into the logs store.
  useEffect(() => {
    // Backend lifecycle events are session-scoped — a notification about the
    // previous session's shutdown has no actionable value for the user once
    // a new session is running. Drop any persisted `backend.*` entries at
    // boot so the panel starts clean and only reflects *this* session.
    useNotificationsStore.setState((s) => ({
      items: s.items.filter((n) => !n.context?.startsWith('backend.')),
    }));
    const api = (window as Window).whisperall?.backend;
    if (!api?.onEvent) return;
    return api.onEvent((evt) => {
      const tone = evt.kind === 'start' ? 'info' : 'error';
      useNotificationsStore.getState().push(
        { message: `[backend.${evt.kind}] ${evt.message.split('\n')[0]}`, detail: evt.message, context: `backend.${evt.kind}`, source: 'backend' },
        tone
      );
    });
  }, []);
  useEffect(() => {
    if (user) {
      void fetchPlan();
    }
  }, [user, fetchPlan]);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => { requestPlanRefresh(0); }, 60_000);
    return () => clearInterval(timer);
  }, [user]);

  useEffect(() => {
    if (!electron?.onHotkey || !electron.readClipboard) return;
    const el = electron;
    return el.onHotkey(async (action: string) => {
      if (action === 'open-settings') setShowSettings(true);
      else if (action === 'read-clipboard') {
        const text = await el.readClipboard();
        if (text) {
          const s = useSettingsStore.getState();
          const voice = s.ttsVoice && s.ttsVoice !== 'auto' ? s.ttsVoice : undefined;
          const forced = s.ttsLanguage && s.ttsLanguage !== 'auto' ? s.ttsLanguage : undefined;
          const lang = forced ?? inferTTSLanguage(text, { fallback: s.uiLanguage, voice });
          playTTS(text, voice, lang);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!electron?.onPasteText) return;
    return electron.onPasteText((text: string) => {
      const pasteEvent = new CustomEvent<string>(PASTE_EVENT_NAME, { detail: text, cancelable: true });
      window.dispatchEvent(pasteEvent);
      if (pasteEvent.defaultPrevented) return;
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
        insertIntoTextField(activeElement, text);
        return;
      }
      if (activeElement instanceof HTMLElement && activeElement.isContentEditable) {
        insertIntoContentEditable(activeElement, text);
      }
    });
  }, []);

  // Relay errors from the translator overlay (separate renderer with its own
  // zustand) into this window's notifications store so the user sees them in
  // the bell icon.
  useEffect(() => {
    const bridge = electron?.translator;
    if (!bridge?.onError) return;
    return bridge.onError((payload) => {
      useNotificationsStore.getState().pushError(
        { message: payload.message, detail: payload.detail, context: 'screen-translator', source: 'renderer' },
      );
    });
  }, []);

  // Generic diagnostic channel: main process pushes any lifecycle events
  // (hotkey registered, widget shown, etc.) into the bell icon. Replaces
  // native Windows toasts since those silently fail under Focus Assist and
  // on portable builds without an AppUserModelID.
  useEffect(() => {
    if (!electron?.onDiag) return;
    return electron.onDiag((payload) => {
      const tone = payload.tone ?? 'info';
      const input = {
        message: payload.message,
        detail: payload.detail,
        context: payload.context,
        source: 'electron' as const,
      };
      if (tone === 'error') {
        useNotificationsStore.getState().pushError(input);
      } else {
        useNotificationsStore.getState().push(input, tone);
      }
    });
  }, []);

  useEffect(() => {
    const previous = prevDictationStatus.current;
    if (dictationCueSounds && previous !== dictationStatus) {
      if (dictationStatus === 'recording') playCueSound('ready');
      else if (previous === 'recording' && dictationStatus === 'processing') playCueSound('stop');
      else if (previous === 'processing' && dictationStatus === 'done') playCueSound('done');
    }
    prevDictationStatus.current = dictationStatus;
  }, [dictationCueSounds, dictationStatus]);

  useEffect(() => {
    const previous = prevLiveStatus.current;
    if (dictationCueSounds && previous !== liveStatus) {
      if (liveStatus === 'recording') playCueSound('ready');
      else if (previous === 'recording' && liveStatus === 'idle') playCueSound('stop');
    }
    prevLiveStatus.current = liveStatus;
  }, [dictationCueSounds, liveStatus]);

  useEffect(() => {
    if (dictationCueSounds && !prevDictationError.current && dictationError) {
      playCueSound('error');
    }
    prevDictationError.current = dictationError;
  }, [dictationCueSounds, dictationError]);

  useEffect(() => {
    if (dictationCueSounds && !prevLiveError.current && liveError) {
      playCueSound('error');
    }
    prevLiveError.current = liveError;
  }, [dictationCueSounds, liveError]);

  const t = useT();
  const { triggerNewNote, triggerVoiceNote, requestDeleteFolder } = useNotesActionsStore();

  if (authLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-base font-display">
        <div className="h-10 w-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted">{t('app.connecting')}</p>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  const handleNavigate = (p: Page) => { setPage(p); };

  let content: JSX.Element;
  switch (page) {
    case 'dictate': content = <DictatePage onNavigate={handleNavigate} />; break;
    case 'transcribe': content = <TranscribePage onNavigate={handleNavigate} />; break;
    case 'history': content = <HistoryPage />; break;
    case 'processes': content = <ProcessesPage onNavigate={handleNavigate} />; break;
    case 'logs': content = <LogsPage />; break;
  }

  const openPricing = () => setShowPricing(true);

  return (
    <ErrorBoundary>
      <PricingContext.Provider value={openPricing}>
        <AppShell page={page} onNavigate={handleNavigate} showSettings={showSettings} onToggleSettings={setShowSettings} showPricing={showPricing} onTogglePricing={setShowPricing}
          onNewNote={triggerNewNote} onVoiceNote={triggerVoiceNote} onDeleteFolder={requestDeleteFolder}>
          {content}
        </AppShell>
      </PricingContext.Provider>
    </ErrorBoundary>
  );
}
