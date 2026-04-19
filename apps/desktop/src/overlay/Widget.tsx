import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useWidgetStore, OVERLAY_BAR_SIZE, OVERLAY_DICTATING_SIZE, SUBTITLE_SIZE } from './widget-store';
import type { WidgetModule } from './widget-store';
import { electron } from '../lib/electron';
import { getMicStream, stopMicStream, createRecorder, isMicActive, forceReleaseMic } from '../lib/audio';
import { api } from '../lib/api';
import { useSettingsStore } from '../stores/settings';
import { requestPlanRefresh } from '../stores/plan';
import { t as i18nT } from '../lib/i18n';
import { inferTTSLanguage } from '../lib/lang-detect';
import type { TTSProgress } from '../lib/tts';
import { pauseTTS, resumeTTS, setTTSPlaybackRate, startReading, stopTTS } from '../lib/tts';

export type WidgetProps = {
  /** When true, renders inline (no drag, no resize, no overlay hide). */
  docked?: boolean;
  /** Callback for dictation results when docked (replaces electron?.pasteText). */
  onResult?: (text: string) => void;
  /** Called when the user drags the grip handle past a threshold while docked.
   *  The parent should undock and hand off to the overlay at (screenX, screenY). */
  onDragOut?: (screenX: number, screenY: number) => void;
};

let recorder: MediaRecorder | null = null;
// Guards against rapid hotkey toggle races where a second press arrives
// before the first `getMicStream` resolves, leaving the mic orphaned.
let startInFlight = false;
let pendingAbort = false;
let audioChunks: Blob[] = [];
const CUSTOM_PROMPTS_KEY = 'whisperall-custom-prompts';

type CustomPrompt = { id: string; name: string; prompt: string };
const IDLE_READER_PROGRESS: TTSProgress = { status: 'idle', current: 0, total: 0, currentTime: 0, duration: 0, overallTime: 0, overallDuration: 0, rate: 1, error: null };

function useWT(): (key: string) => string {
  const locale = useSettingsStore((s) => s.uiLanguage);
  return (key: string) => i18nT(key, locale);
}

function Waveform({ processing }: { processing?: boolean }): JSX.Element {
  return (
    <div className={`waveform${processing ? ' processing' : ''}`}>
      {Array.from({ length: 10 }, (_, i) => <div key={i} className="waveform-bar" />)}
    </div>
  );
}

export function Widget({ docked = false, onResult, onDragOut }: WidgetProps = {}) {
  const t = useWT();
  const {
    mode, dictateStatus, translatedText, dragging,
    collapse, switchModule, setTranslatedText, startDictation,
    stopDictation, setDone, setError, resetDictation, setDragging,
  } = useWidgetStore();
  const hotkeyMode = useSettingsStore((s) => s.hotkeyMode);
  const audioDevice = useSettingsStore((s) => s.audioDevice);
  const translateTo = useSettingsStore((s) => s.translateTo);
  const uiLanguage = useSettingsStore((s) => s.uiLanguage);
  const ttsLanguage = useSettingsStore((s) => s.ttsLanguage);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const subtitleTranslateReq = useRef(0);
  const [selectedPromptId, setSelectedPromptId] = useState('default');
  const [subtitleRaw, setSubtitleRaw] = useState('');
  const [subtitleTranslateEnabled, setSubtitleTranslateEnabled] = useState(true);
  const [readerProgress, setReaderProgress] = useState<TTSProgress>(IDLE_READER_PROGRESS);
  const [quickOpen, setQuickOpen] = useState(false);
  const quickCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingRef = useRef(dragging);

  useEffect(() => {
    if (docked) return; // Docked widget doesn't resize the Electron window.
    const size =
      mode === 'subtitles' ? SUBTITLE_SIZE :
      mode === 'dictating' ? OVERLAY_DICTATING_SIZE :
      OVERLAY_BAR_SIZE;
    electron?.resizeOverlay(size);
  }, [mode, docked]);

  useEffect(() => {
    if (mode !== 'bar' && quickOpen) setQuickOpen(false);
  }, [mode, quickOpen]);

  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);

  const cancelQuickClose = useCallback(() => {
    if (quickCloseTimer.current) {
      clearTimeout(quickCloseTimer.current);
      quickCloseTimer.current = null;
    }
  }, []);

  const openQuickPill = useCallback(() => {
    cancelQuickClose();
    setQuickOpen(true);
  }, [cancelQuickClose]);

  const queueQuickClose = useCallback(() => {
    cancelQuickClose();
    quickCloseTimer.current = setTimeout(() => {
      if (!draggingRef.current) setQuickOpen(false);
    }, 160);
  }, [cancelQuickClose]);

  const promptOptions = useMemo(() => {
    const base = [{ id: 'default', name: t('widget.promptDefault'), prompt: '' }];
    try {
      const parsed = JSON.parse(localStorage.getItem(CUSTOM_PROMPTS_KEY) ?? '[]') as CustomPrompt[];
      const custom = parsed.filter((p) => p?.id && p?.name && p?.prompt);
      return [...base, ...custom];
    } catch {
      return base;
    }
  }, [t]);

  const selectedPrompt = promptOptions.find((p) => p.id === selectedPromptId) ?? promptOptions[0];
  const readerSpeed = 1;

  const endDrag = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    electron?.overlayDragEnd();
  }, [dragging, setDragging]);

  const startDrag = useCallback((e: PointerEvent<HTMLElement>) => {
    if (docked || e.button !== 0) return; // No OS-level drag when docked.
    setDragging(true);
    electron?.overlayDragStart({ screenX: e.screenX, screenY: e.screenY });
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [docked, setDragging]);

  const moveDrag = useCallback((e: PointerEvent<HTMLElement>) => {
    if (!dragging) return;
    electron?.overlayDragMove({ screenX: e.screenX, screenY: e.screenY });
  }, [dragging]);

  const loadClipboardText = useCallback(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return '';
    }
  }, []);

  const startReader = useCallback((textToSpeak: string) => {
    if (!textToSpeak.trim()) return;
    const voice = ttsVoice && ttsVoice.toLowerCase() !== 'auto' ? ttsVoice : undefined;
    const forced = ttsLanguage && ttsLanguage.toLowerCase() !== 'auto' ? ttsLanguage : undefined;
    const language = forced ?? inferTTSLanguage(textToSpeak, { fallback: uiLanguage, voice });
    setTTSPlaybackRate(readerSpeed);
    setReaderProgress((p) => ({ ...p, rate: readerSpeed, error: null }));
    void startReading(textToSpeak, voice, language, setReaderProgress);
  }, [readerSpeed, ttsLanguage, ttsVoice, uiLanguage]);

  const handleReaderPrimary = useCallback(async () => {
    if (readerProgress.status === 'playing') return pauseTTS();
    if (readerProgress.status === 'paused') return resumeTTS();
    const clip = await loadClipboardText();
    if (!clip) return;
    startReader(clip);
  }, [loadClipboardText, readerProgress.status, startReader]);

  const handleReaderStop = useCallback(() => {
    stopTTS();
    setReaderProgress(IDLE_READER_PROGRESS);
  }, []);

  const handleTranslateClipboard = useCallback(async () => {
    const clip = await loadClipboardText();
    if (!clip) return;
    try {
      const res = await api.translate.translate({ text: clip, target_language: translateTo || 'es' });
      requestPlanRefresh();
      electron?.setDictationText(res.text);
      try {
        await navigator.clipboard.writeText(res.text);
      } catch {
        // best-effort
      }
    } catch { /* best-effort */ }
  }, [loadClipboardText, translateTo]);

  useEffect(() => {
    return electron?.onHotkey((action) => {
      if (action === 'dictate-toggle') {
        const s = useWidgetStore.getState().dictateStatus;
        if (s === 'recording') handleStop(); else handleStart();
      } else if (action === 'dictate-start') handleStart();
      else if (action === 'dictate-stop') handleStop();
      else if (action === 'read-clipboard') { void handleReaderPrimary(); }
      else if (action === 'translate') { void handleTranslateClipboard(); }
    });
  }, [handleReaderPrimary, handleTranslateClipboard]);

  useEffect(() => {
    return electron?.onOverlayVisible((visible) => {
      if (!visible) collapse();
    });
  }, [collapse]);

  useEffect(() => {
    return electron?.onOverlaySwitchModule((m) => {
      const module = m as WidgetModule;
      switchModule(module);
      if (module === 'reader') void handleReaderPrimary();
      if (module === 'translator') void handleTranslateClipboard();
    });
  }, [handleReaderPrimary, handleTranslateClipboard, switchModule]);

  useEffect(() => {
    return electron?.onSubtitleText((txt) => setSubtitleRaw(txt));
  }, []);

  useEffect(() => {
    if (mode !== 'subtitles') return;
    if (!subtitleRaw) {
      setTranslatedText('');
      return;
    }
    if (!subtitleTranslateEnabled) {
      setTranslatedText(subtitleRaw);
      return;
    }
    const reqId = ++subtitleTranslateReq.current;
    api.translate.translate({ text: subtitleRaw, target_language: translateTo || 'es' })
      .then((res) => {
        if (reqId === subtitleTranslateReq.current) {
          requestPlanRefresh();
          setTranslatedText(res.text);
        }
      })
      .catch(() => {
        if (reqId === subtitleTranslateReq.current) setTranslatedText(subtitleRaw);
      });
  }, [mode, setTranslatedText, subtitleRaw, subtitleTranslateEnabled, translateTo]);

  useEffect(() => {
    return () => {
      cancelQuickClose();
    };
  }, [cancelQuickClose]);

  const handleStart = useCallback(async () => {
    // If a start is already in flight, a second press acts as a cancel-pending.
    if (startInFlight) { pendingAbort = true; return; }
    if (recorder && recorder.state !== 'inactive') return;
    startInFlight = true;
    pendingAbort = false;
    startDictation();
    try {
      audioChunks = [];
      const stream = await getMicStream(audioDevice);
      if (pendingAbort) {
        // User toggled off while getUserMedia was resolving — release immediately.
        stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
        forceReleaseMic();
        resetDictation();
        return;
      }
      recorder = createRecorder(stream, (chunk) => audioChunks.push(chunk), 30_000);
    } catch (err) {
      // Any failure: ensure the mic is released before surfacing the error.
      forceReleaseMic();
      setError((err as Error).message);
    } finally {
      startInFlight = false;
      pendingAbort = false;
    }
  }, [startDictation, resetDictation, setError, audioDevice]);

  const handleStop = useCallback(() => {
    // If a start is still in flight, flag it for abort — the start path will
    // release the mic as soon as getUserMedia resolves.
    if (startInFlight) { pendingAbort = true; return; }
    if (!recorder || recorder.state === 'inactive') {
      // Safety net: even with no active recorder, make sure the mic isn't
      // lingering (orphan from an errored start).
      if (isMicActive()) forceReleaseMic();
      return;
    }
    stopDictation();
    const activeRecorder = recorder;
    recorder = null;
    activeRecorder.onstop = async () => {
      // Release the mic FIRST so Windows can switch Bluetooth back to A2DP.
      forceReleaseMic();
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      try {
        const res = await api.dictate.send({
          audio: blob,
          prompt: selectedPrompt.id === 'default' ? undefined : selectedPrompt.prompt,
        });
        requestPlanRefresh();
        setDone(res.text);
        if (docked && onResult) {
          onResult(res.text);
        } else {
          electron?.setDictationText(res.text);
          electron?.pasteText(res.text);
        }
      } catch (err) { setError((err as Error).message); }
    };
    activeRecorder.stop();
  }, [selectedPrompt.id, selectedPrompt.prompt, setDone, setError, stopDictation, docked, onResult]);

  const handleCancel = useCallback(() => {
    pendingAbort = true;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      try { recorder.stop(); } catch { /* ignore */ }
      recorder = null;
    }
    forceReleaseMic();
    resetDictation();
    collapse();
  }, [resetDictation, collapse]);

  const handleClose = () => {
    resetDictation();
    collapse();
    setQuickOpen(false);
  };

  if (mode === 'subtitles') {
    return (
      <div className="widget-subtitles">
        <div
          className="widget-drag-handle"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span />
          <span />
          <span />
        </div>
        <div className="subtitle-toolbar">
          <button
            className="widget-btn-chip"
            onClick={() => setSubtitleTranslateEnabled((v) => !v)}
            title={subtitleTranslateEnabled ? t('widget.translationToggleOn') : t('widget.translationToggleOff')}
          >
            <span className="material-symbols-outlined">translate</span>
            {subtitleTranslateEnabled ? t('widget.translationToggleOn') : t('widget.translationToggleOff')}
          </button>
          <button className="widget-btn-icon" onClick={handleClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className={`subtitle-line${translatedText ? '' : ' subtitle-placeholder'}`}>
          {translatedText || t('widget.subtitlesPlaceholder')}
        </div>
      </div>
    );
  }

  if (mode === 'dictating') {
    return (
      <div className="widget-base widget-base-dictating">
        <div
          className="widget-drag-handle"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span />
          <span />
          <span />
        </div>
        <div className="dictating-wrap">
          <div className="dictating-label">
            {dictateStatus === 'processing' ? t('widget.processing') : t('widget.dictatingLabel')}
          </div>
          <div className="dictating-controls">
            {hotkeyMode === 'toggle' && (
              <button className="dictating-cancel" onClick={handleCancel} title={t('widget.cancel')}>
                <span className="material-symbols-outlined">close</span>
              </button>
            )}
            <Waveform processing={dictateStatus === 'processing'} />
            {hotkeyMode === 'toggle' && dictateStatus === 'recording' && (
              <button className="dictating-stop" onClick={handleStop} title={t('widget.stop')}>
                <span className="material-symbols-outlined">stop</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Docked drag-out state — tracked separately from the overlay drag.
  const dockedDragOrigin = useRef<{ x: number; y: number } | null>(null);
  const DRAG_OUT_PX = 20;
  const onGripPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    if (docked) {
      // Track for potential drag-out.
      dockedDragOrigin.current = { x: e.screenX, y: e.screenY };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    startDrag(e);
  }, [docked, startDrag]);
  const onGripPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    if (docked && dockedDragOrigin.current) {
      const dx = e.screenX - dockedDragOrigin.current.x;
      const dy = e.screenY - dockedDragOrigin.current.y;
      if (Math.hypot(dx, dy) > DRAG_OUT_PX) {
        dockedDragOrigin.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onDragOut?.(e.screenX, e.screenY);
      }
      return;
    }
    moveDrag(e);
  }, [docked, moveDrag, onDragOut]);
  const onGripPointerUp = useCallback((e: PointerEvent<HTMLElement>) => {
    dockedDragOrigin.current = null;
    if (!docked) endDrag();
  }, [docked, endDrag]);

  // When docked: always show the expanded pill (skip the idle notch).
  const showPill = docked || quickOpen;

  return (
    <div className={`widget-base ${docked ? 'widget-base-idle' : 'widget-base-idle'}`}>
      {!showPill ? (
        <div
          className="notch-idle"
          onMouseEnter={openQuickPill}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      ) : (
        <div className="notch-pill open" onMouseEnter={docked ? undefined : cancelQuickClose} onMouseLeave={docked ? undefined : queueQuickClose}>
          <div
            className="notch-grip"
            style={{ cursor: docked ? 'grab' : undefined }}
            onPointerDown={onGripPointerDown}
            onPointerMove={onGripPointerMove}
            onPointerUp={onGripPointerUp}
            onPointerCancel={onGripPointerUp}
          >
            <span className="material-symbols-outlined">drag_indicator</span>
          </div>
          <div className="notch-prompt">
            <span className="material-symbols-outlined">short_text</span>
            <select
              className="notch-prompt-select"
              value={selectedPromptId}
              onChange={(e) => setSelectedPromptId(e.target.value)}
            >
              {promptOptions.map((prompt) => (
                <option key={prompt.id} value={prompt.id}>{prompt.name}</option>
              ))}
            </select>
          </div>
          <div className="notch-wave">
            {Array.from({ length: 6 }, (_, i) => <span key={i} className="notch-wave-bar" />)}
          </div>
          <button className="hover-btn primary" onClick={handleStart} title={t('widget.dictate')}>
            <span className="material-symbols-outlined">mic</span>
          </button>
          <button
            className="hover-btn"
            onClick={() => { void handleReaderPrimary(); }}
            title={t('widget.readClipboard')}
          >
            <span className="material-symbols-outlined">
              {readerProgress.status === 'playing' ? 'pause' : 'volume_up'}
            </span>
          </button>
          {readerProgress.status !== 'idle' && (
            <button className="hover-btn" onClick={handleReaderStop} title={t('widget.stop')}>
              <span className="material-symbols-outlined">stop</span>
            </button>
          )}
          <button
            className="hover-btn"
            onClick={() => { void handleTranslateClipboard(); }}
            title={t('widget.translateClipboard')}
          >
            <span className="material-symbols-outlined">translate</span>
          </button>
        </div>
      )}
    </div>
  );
}
