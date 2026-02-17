import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useWidgetStore, OVERLAY_BASE_SIZE, SUBTITLE_SIZE } from './widget-store';
import type { WidgetModule } from './widget-store';
import { electron } from '../lib/electron';
import { getMicStream, stopMicStream, createRecorder } from '../lib/audio';
import { api } from '../lib/api';
import { useSettingsStore } from '../stores/settings';
import { requestPlanRefresh } from '../stores/plan';
import { t as i18nT } from '../lib/i18n';
import { inferTTSLanguage } from '../lib/lang-detect';
import type { TTSProgress } from '../lib/tts';
import { downloadTTSAudio, hasTTSAudio, pauseTTS, resumeTTS, seekTTSOverall, setTTSPlaybackRate, startReading, stopTTS } from '../lib/tts';

let recorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
const READER_SPEEDS = [1, 1.5, 2, 3, 4];
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

export function Widget() {
  const t = useWT();
  const {
    mode, activeModule, dictateStatus, text, translatedText, error, dragging,
    expand, collapse, switchModule, setTranslatedText, startDictation,
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
  const [pendingReaderSeek, setPendingReaderSeek] = useState<number | null>(null);
  const [readerSpeedIdx, setReaderSpeedIdx] = useState(0);
  const [translatorInput, setTranslatorInput] = useState('');
  const [translatorOutput, setTranslatorOutput] = useState('');
  const [translatorTarget, setTranslatorTarget] = useState(translateTo || 'es');
  const [quickOpen, setQuickOpen] = useState(false);
  const quickCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingRef = useRef(dragging);

  useEffect(() => {
    const size = mode === 'subtitles' ? SUBTITLE_SIZE : OVERLAY_BASE_SIZE;
    electron?.resizeOverlay(size);
  }, [mode]);

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

  useEffect(() => {
    setTranslatorTarget(translateTo || 'es');
  }, [translateTo]);

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
  const readerSpeed = READER_SPEEDS[readerSpeedIdx];

  const endDrag = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    electron?.overlayDragEnd();
  }, [dragging, setDragging]);

  const startDrag = useCallback((e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    setDragging(true);
    electron?.overlayDragStart({ screenX: e.screenX, screenY: e.screenY });
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [setDragging]);

  const moveDrag = useCallback((e: PointerEvent<HTMLElement>) => {
    if (!dragging) return;
    electron?.overlayDragMove({ screenX: e.screenX, screenY: e.screenY });
  }, [dragging]);

  useEffect(() => {
    if (readerProgress.status === 'idle') setPendingReaderSeek(null);
  }, [readerProgress.status]);

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
    setPendingReaderSeek(null);
  }, []);

  const handleReaderDownload = useCallback(() => {
    const blob = downloadTTSAudio();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reading.mp3';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleTranslateClipboard = useCallback(async () => {
    const clip = await loadClipboardText();
    if (!clip) return;
    setTranslatorInput(clip);
    try {
      const res = await api.translate.translate({ text: clip, target_language: translatorTarget });
      requestPlanRefresh();
      setTranslatorOutput(res.text);
    } catch { /* best-effort */ }
  }, [loadClipboardText, translatorTarget]);

  const handleTranslateFromInput = useCallback(async () => {
    if (!translatorInput.trim()) return;
    try {
      const res = await api.translate.translate({ text: translatorInput, target_language: translatorTarget });
      requestPlanRefresh();
      setTranslatorOutput(res.text);
    } catch { /* best-effort */ }
  }, [translatorInput, translatorTarget]);

  useEffect(() => {
    return electron?.onHotkey((action) => {
      if (action === 'dictate-toggle') {
        const s = useWidgetStore.getState().dictateStatus;
        if (s === 'recording') handleStop(); else handleStart();
      } else if (action === 'dictate-start') handleStart();
      else if (action === 'dictate-stop') handleStop();
      else if (action === 'read-clipboard') { switchModule('reader'); void handleReaderPrimary(); }
      else if (action === 'translate') { switchModule('translator'); void handleTranslateClipboard(); }
    });
  }, [handleReaderPrimary, handleTranslateClipboard, switchModule]);

  useEffect(() => {
    return electron?.onOverlayVisible((visible) => {
      if (!visible) collapse();
    });
  }, [collapse]);

  useEffect(() => {
    return electron?.onOverlaySwitchModule((m) => switchModule(m as WidgetModule));
  }, [switchModule]);

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
    startDictation();
    try {
      audioChunks = [];
      const stream = await getMicStream(audioDevice);
      recorder = createRecorder(stream, (chunk) => audioChunks.push(chunk), 30_000);
    } catch (err) { setError((err as Error).message); }
  }, [startDictation, setError, audioDevice]);

  const handleStop = useCallback(() => {
    if (!recorder || recorder.state === 'inactive') return;
    stopDictation();
    recorder.onstop = async () => {
      stopMicStream();
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      try {
        const res = await api.dictate.send({
          audio: blob,
          prompt: selectedPrompt.id === 'default' ? undefined : selectedPrompt.prompt,
        });
        requestPlanRefresh();
        setDone(res.text);
        electron?.setDictationText(res.text);
        electron?.pasteText(res.text);
      } catch (err) { setError((err as Error).message); }
    };
    recorder.stop();
    recorder = null;
  }, [selectedPrompt.id, selectedPrompt.prompt, setDone, setError, stopDictation]);

  const handleCancel = useCallback(() => {
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
      recorder = null;
    }
    stopMicStream();
    resetDictation();
    collapse();
  }, [resetDictation, collapse]);

  const handleClose = () => {
    resetDictation();
    collapse();
    setQuickOpen(false);
  };

  const readerDuration = Math.max(readerProgress.overallDuration, 0);
  const readerHasAudio = hasTTSAudio();

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

  if (mode === 'panel') {
    const tabs: { module: WidgetModule; icon: string }[] = [
      { module: 'dictate', icon: 'mic' },
      { module: 'reader', icon: 'volume_up' },
      { module: 'translator', icon: 'translate' },
      { module: 'subtitles', icon: 'subtitles' },
    ];
    return (
      <div className="widget-expanded">
        <div className="widget-header">
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
          <div className="widget-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.module}
                className={`widget-tab ${activeModule === tab.module ? 'active' : ''}`}
                onClick={() => switchModule(tab.module)}
                title={tab.module}
              >
                <span className="material-symbols-outlined">{tab.icon}</span>
              </button>
            ))}
          </div>
          <button className="widget-btn-icon" onClick={handleClose} title={t('widget.minimize')}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="widget-body">
          {activeModule === 'dictate' && dictateStatus === 'idle' && (
            <div className="widget-module-stack">
              <label className="widget-label" htmlFor="widget-prompt-select">{t('widget.prompt')}</label>
              <select
                id="widget-prompt-select"
                className="widget-select"
                value={selectedPromptId}
                onChange={(e) => setSelectedPromptId(e.target.value)}
              >
                {promptOptions.map((prompt) => (
                  <option key={prompt.id} value={prompt.id}>{prompt.name}</option>
                ))}
              </select>
              <button className="widget-btn-record" onClick={handleStart}>
                <span className="material-symbols-outlined">mic</span> {t('widget.dictate')}
              </button>
            </div>
          )}
          {activeModule === 'dictate' && dictateStatus === 'done' && text && (
            <div className="widget-result">
              <p className="widget-text">{text}</p>
              <p className="widget-hint">{t('widget.autoPasted')}</p>
              <div className="widget-actions">
                <button className="widget-btn-primary" onClick={() => electron?.pasteText(text)}>
                  <span className="material-symbols-outlined">content_paste</span> {t('widget.paste')}
                </button>
                <button className="widget-btn-ghost" onClick={resetDictation}>{t('widget.again')}</button>
              </div>
            </div>
          )}
          {activeModule === 'dictate' && dictateStatus === 'error' && (
            <div className="widget-error">
              <span>{error}</span>
              <button className="widget-btn-ghost" onClick={resetDictation}>{t('widget.retry')}</button>
            </div>
          )}
          {activeModule === 'reader' && (
            <div className="widget-module-stack">
              <div className="widget-reader-actions">
                <button className="widget-btn-record" onClick={() => { void handleReaderPrimary(); }}>
                  <span className="material-symbols-outlined">
                    {readerProgress.status === 'playing' ? 'pause' : 'play_arrow'}
                  </span>
                  {t('widget.readClipboard')}
                </button>
                <button
                  className="widget-btn-ghost"
                  onClick={() => setReaderSpeedIdx((idx) => {
                    const nextIdx = (idx + 1) % READER_SPEEDS.length;
                    const nextSpeed = READER_SPEEDS[nextIdx];
                    setTTSPlaybackRate(nextSpeed);
                    setReaderProgress((p) => ({ ...p, rate: nextSpeed }));
                    return nextIdx;
                  })}
                >
                  {t('widget.readerSpeed')}: {readerSpeed.toFixed(readerSpeed % 1 === 0 ? 0 : 1)}x
                </button>
                <button
                  className="widget-btn-ghost"
                  onClick={handleReaderStop}
                  disabled={readerProgress.status === 'idle'}
                  title={t('widget.stop')}
                >
                  <span className="material-symbols-outlined">stop</span>
                </button>
                <button
                  className="widget-btn-ghost"
                  onClick={handleReaderDownload}
                  disabled={!readerHasAudio}
                  title={t('reader.download')}
                >
                  <span className="material-symbols-outlined">download</span>
                </button>
              </div>
              <label className="widget-label" htmlFor="widget-reader-slider">
                {t('widget.readerSlider')}
              </label>
              <input
                id="widget-reader-slider"
                type="range"
                min={0}
                max={readerDuration || 0}
                step={0.01}
                disabled={readerProgress.status === 'idle' || !readerDuration}
                value={Math.min(pendingReaderSeek ?? readerProgress.overallTime, readerDuration)}
                onChange={(e) => {
                  setPendingReaderSeek(Number(e.target.value));
                }}
                onMouseUp={(e) => { seekTTSOverall(Number((e.target as HTMLInputElement).value)); setPendingReaderSeek(null); }}
                onTouchEnd={(e) => { seekTTSOverall(Number((e.target as HTMLInputElement).value)); setPendingReaderSeek(null); }}
                onKeyUp={(e) => { seekTTSOverall(Number((e.target as HTMLInputElement).value)); setPendingReaderSeek(null); }}
                className="widget-slider"
              />
            </div>
          )}
          {activeModule === 'translator' && (
            <div className="widget-module-stack">
              <label className="widget-label" htmlFor="widget-translate-target">{t('widget.translationTarget')}</label>
              <select
                id="widget-translate-target"
                className="widget-select"
                value={translatorTarget}
                onChange={(e) => setTranslatorTarget(e.target.value)}
              >
                <option value="en">English</option>
                <option value="es">Espanol</option>
                <option value="fr">Francais</option>
                <option value="de">Deutsch</option>
                <option value="pt">Portugues</option>
                <option value="ja">日本語</option>
                <option value="zh">中文</option>
              </select>
              <div className="widget-actions">
                <button className="widget-btn-record" onClick={() => { void handleTranslateClipboard(); }}>
                  <span className="material-symbols-outlined">content_paste</span> {t('widget.translateClipboard')}
                </button>
                <button className="widget-btn-ghost" onClick={() => { void handleTranslateFromInput(); }}>
                  {t('widget.translateNow')}
                </button>
              </div>
              <textarea
                className="widget-textarea"
                value={translatorInput}
                onChange={(e) => setTranslatorInput(e.target.value)}
                placeholder={t('widget.translateHint')}
              />
              {translatorOutput && <p className="widget-text">{translatorOutput}</p>}
              <p className="widget-hint">{t('widget.translateHint')}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'dictating') {
    return (
      <div className="widget-base">
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

  return (
    <div className="widget-base widget-base-idle">
      {!quickOpen ? (
        <div
          className="notch-idle"
          onMouseEnter={openQuickPill}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      ) : (
        <div className="notch-pill open" onMouseEnter={cancelQuickClose} onMouseLeave={queueQuickClose}>
          <div
            className="notch-grip"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
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
            onClick={() => switchModule('translator')}
            title={t('widget.translateClipboard')}
          >
            <span className="material-symbols-outlined">translate</span>
          </button>
          <button className="hover-btn" onClick={() => expand()} title={t('widget.minimize')}>
            <span className="material-symbols-outlined">open_in_full</span>
          </button>
        </div>
      )}
    </div>
  );
}
