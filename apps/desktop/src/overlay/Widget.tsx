import { useEffect, useCallback } from 'react';
import { useWidgetStore, OVERLAY_BASE_SIZE, EXPANDED_SIZE, SUBTITLE_SIZE } from './widget-store';
import type { WidgetModule } from './widget-store';
import { electron } from '../lib/electron';
import { getMicStream, stopMicStream, createRecorder } from '../lib/audio';
import { api } from '../lib/api';
import { playTTS, stopTTS, isTTSPlaying } from '../lib/tts';
import { useSettingsStore } from '../stores/settings';
import { requestPlanRefresh } from '../stores/plan';
import { t as i18nT } from '../lib/i18n';

let recorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

function useWT(): (key: string) => string {
  const locale = useSettingsStore((s) => s.uiLanguage);
  return (key: string) => i18nT(key, locale);
}

function Waveform({ processing }: { processing?: boolean }) {
  return (
    <div className={`waveform${processing ? ' processing' : ''}`}>
      {Array.from({ length: 10 }, (_, i) => <div key={i} className="waveform-bar" />)}
    </div>
  );
}

export function Widget() {
  const t = useWT();
  const {
    mode, activeModule, dictateStatus, text, translatedText, error,
    expand, collapse, hoverIn, hoverOut, switchModule, setTranslatedText,
    startDictation, stopDictation, setDone, setError, resetDictation,
  } = useWidgetStore();
  const hotkeyMode = useSettingsStore((s) => s.hotkeyMode);
  const audioDevice = useSettingsStore((s) => s.audioDevice);

  // Window size: pill/hover/dictating share one size, expanded/subtitles resize
  useEffect(() => {
    const isBase = mode === 'pill' || mode === 'hover' || mode === 'dictating';
    const size = isBase ? OVERLAY_BASE_SIZE : mode === 'subtitles' ? SUBTITLE_SIZE : EXPANDED_SIZE;
    electron?.resizeOverlay(size);
    // pill = click-through with forwarded mouse events; hover/dictating = interactive
    electron?.setOverlayIgnoreMouse(mode === 'pill');
  }, [mode]);

  // IPC listeners
  useEffect(() => {
    return electron?.onHotkey((action) => {
      if (action === 'dictate-toggle') {
        const s = useWidgetStore.getState().dictateStatus;
        if (s === 'recording') handleStop(); else handleStart();
      } else if (action === 'dictate-start') handleStart();
      else if (action === 'dictate-stop') handleStop();
      else if (action === 'read-clipboard') handleReadClipboard();
      else if (action === 'translate') handleTranslateClipboard();
    });
  }, []);

  useEffect(() => {
    return electron?.onOverlayVisible((visible) => {
      if (visible && mode === 'pill') hoverIn();
    });
  }, [mode, hoverIn]);

  useEffect(() => {
    return electron?.onOverlaySwitchModule((m) => switchModule(m as WidgetModule));
  }, [switchModule]);

  useEffect(() => {
    return electron?.onSubtitleText((txt) => setTranslatedText(txt));
  }, [setTranslatedText]);

  // ── Actions ──
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
        const res = await api.dictate.send({ audio: blob });
        requestPlanRefresh();
        setDone(res.text);
        electron?.setDictationText(res.text);
      } catch (err) { setError((err as Error).message); }
    };
    recorder.stop();
    recorder = null;
  }, [stopDictation, setDone, setError]);

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

  const handleReadClipboard = useCallback(async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) isTTSPlaying() ? stopTTS() : await playTTS(clip);
    } catch { /* clipboard access may fail */ }
  }, []);

  const handleTranslateClipboard = useCallback(async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip) return;
      const targetLang = useSettingsStore.getState().translateTo || 'es';
      const res = await api.translate.translate({ text: clip, target_language: targetLang });
      requestPlanRefresh();
      setTranslatedText(res.text);
    } catch { /* translation may fail */ }
  }, [setTranslatedText]);

  const handleDismiss = () => { resetDictation(); collapse(); electron?.hideOverlay(); };

  // ── Subtitles (own window size) ──
  if (mode === 'subtitles') {
    return (
      <div className="widget-subtitles">
        <button className="widget-btn-icon widget-subtitle-close" onClick={handleDismiss}>
          <span className="material-symbols-outlined">close</span>
        </button>
        <div className={`subtitle-line${translatedText ? '' : ' subtitle-placeholder'}`}>
          {translatedText || t('widget.subtitlesPlaceholder')}
        </div>
      </div>
    );
  }

  // ── Expanded (own window size) ──
  if (mode === 'expanded') {
    const TABS: { module: WidgetModule; icon: string }[] = [
      { module: 'dictate', icon: 'mic' },
      { module: 'reader', icon: 'volume_up' },
      { module: 'translator', icon: 'translate' },
      { module: 'subtitles', icon: 'subtitles' },
    ];
    return (
      <div className="widget-expanded">
        <div className="widget-header">
          <div className="widget-tabs">
            {TABS.map((tab) => (
              <button key={tab.module} className={`widget-tab ${activeModule === tab.module ? 'active' : ''}`}
                onClick={() => switchModule(tab.module)} title={tab.module}>
                <span className="material-symbols-outlined">{tab.icon}</span>
              </button>
            ))}
          </div>
          <button className="widget-btn-icon" onClick={handleDismiss} title={t('widget.minimize')}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="widget-body">
          {activeModule === 'dictate' && (
            <>
              {dictateStatus === 'idle' && (
                <button className="widget-btn-record" onClick={handleStart}>
                  <span className="material-symbols-outlined">mic</span> {t('widget.dictate')}
                </button>
              )}
              {dictateStatus === 'done' && text && (
                <div className="widget-result">
                  <p className="widget-text">{text}</p>
                  <div className="widget-actions">
                    <button className="widget-btn-primary" onClick={() => electron?.pasteText(text)}>
                      <span className="material-symbols-outlined">content_paste</span> {t('widget.paste')}
                    </button>
                    <button className="widget-btn-ghost" onClick={resetDictation}>{t('widget.again')}</button>
                  </div>
                </div>
              )}
              {dictateStatus === 'error' && (
                <div className="widget-error">
                  <span>{error}</span>
                  <button className="widget-btn-ghost" onClick={resetDictation}>{t('widget.retry')}</button>
                </div>
              )}
            </>
          )}
          {activeModule === 'reader' && (
            <button className="widget-btn-record" onClick={handleReadClipboard}>
              <span className="material-symbols-outlined">volume_up</span> {t('widget.readClipboard')}
            </button>
          )}
          {activeModule === 'translator' && (
            <div className="widget-result">
              <button className="widget-btn-record" onClick={handleTranslateClipboard}>
                <span className="material-symbols-outlined">translate</span> {t('widget.translateClipboard')}
              </button>
              {translatedText && <p className="widget-text">{translatedText}</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Base container (pill / hover / dictating) — same window size ──
  return (
    <div className="widget-base">
      {mode === 'pill' && (
        <div className="barrita" onMouseEnter={hoverIn}>
          {Array.from({ length: 8 }, (_, i) => <span key={i} className="barrita-dot" />)}
        </div>
      )}

      {mode === 'hover' && (
        <div className="hover-bar" onMouseLeave={hoverOut}>
          <button className="hover-btn primary" onClick={handleStart} title={t('widget.dictate')}>
            <span className="material-symbols-outlined">mic</span>
          </button>
          <button className="hover-btn" onClick={() => switchModule('reader')} title="TTS">
            <span className="material-symbols-outlined">volume_up</span>
          </button>
          <button className="hover-btn" onClick={() => switchModule('translator')} title="Translate">
            <span className="material-symbols-outlined">translate</span>
          </button>
          <button className="hover-btn" onClick={() => switchModule('subtitles')} title="Subtitles">
            <span className="material-symbols-outlined">subtitles</span>
          </button>
          <button className="hover-btn" onClick={() => expand()} title={t('widget.minimize')}>
            <span className="material-symbols-outlined">open_in_full</span>
          </button>
        </div>
      )}

      {mode === 'dictating' && (
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
      )}
    </div>
  );
}
