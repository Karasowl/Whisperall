import { useEffect, useRef } from 'react';
import { electron } from '../lib/electron';
import { useTranslatorStore } from '../stores/translator';
import { useSettingsStore } from '../stores/settings';
import { useNotificationsStore } from '../stores/notifications';
import { api } from '../lib/api';
import { ResizeHandles } from './ResizeHandles';
import { RevealSurface } from './RevealSurface';
import { startCaptureLoop, type LoopHandle, type LoopState } from './capture-loop';
import { getTesseractEngine } from './ocr/tesseract-engine';

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * M18b — translator overlay wires the capture→OCR→DeepL→reveal loop.
 * Loop runs only when visible + not dragging + not resizing.
 */
export function TranslatorOverlay(): JSX.Element {
  const setDragging = useTranslatorStore((s) => s.setDragging);
  const setVisible = useTranslatorStore((s) => s.setVisible);
  const setStatus = useTranslatorStore((s) => s.setStatus);
  const setOcrText = useTranslatorStore((s) => s.setOcrText);
  const setTranslation = useTranslatorStore((s) => s.setTranslation);
  const setErrorMessage = useTranslatorStore((s) => s.setErrorMessage);
  const visible = useTranslatorStore((s) => s.visible);
  const dragging = useTranslatorStore((s) => s.dragging);
  const resizing = useTranslatorStore((s) => s.resizing);
  const status = useTranslatorStore((s) => s.status);
  const lastTranslation = useTranslatorStore((s) => s.lastTranslation);
  const lastErrorMessage = useTranslatorStore((s) => s.lastErrorMessage);
  const dragActive = useRef(false);
  const loopRef = useRef<LoopHandle | null>(null);

  // --- Visibility channel from main ---
  useEffect(() => {
    const unsub = electron?.translator?.onVisible?.((v) => setVisible(v));
    return () => { unsub?.(); };
  }, [setVisible]);

  // --- Drag handlers (global mousemove/mouseup while dragActive) ---
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragActive.current) return;
      electron?.translator?.dragMove({ screenX: e.screenX, screenY: e.screenY });
    };
    const onUp = () => {
      if (!dragActive.current) return;
      dragActive.current = false;
      setDragging(false);
      electron?.translator?.dragEnd();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setDragging]);

  // --- Capture loop — starts when the window becomes visible, stops on hide. ---
  useEffect(() => {
    if (!visible) {
      loopRef.current?.stop();
      loopRef.current = null;
      return;
    }
    // Keep the loop reading fresh state via `getState` so updating
    // refreshMs / targetLang in settings is picked up without restart.
    const loop = startCaptureLoop({
      captureRegion: async () => {
        const result = await electron?.translator?.captureRegion();
        if (!result) return null;
        return base64ToBytes(result.pngBase64);
      },
      ocr: getTesseractEngine(),
      translate: async (text, targetLang) => {
        const res = await api.translate.translate({ text, target_language: targetLang });
        return res.text ?? '';
      },
      onReveal: (translated, raw) => {
        setOcrText(raw);
        setTranslation(translated);
      },
      onStatus: (next) => {
        // Zustand's setState is idempotent — no re-render if value unchanged.
        setStatus(next);
      },
      onError: (err) => {
        const msg = err instanceof Error ? err.message : String(err ?? 'Unknown error');
        const detail = err instanceof Error && err.stack ? err.stack : undefined;
        setErrorMessage(msg);
        // Log locally (this renderer has its own notifications store, mostly
        // for debugging via devtools).
        useNotificationsStore.getState().pushError(
          { message: `Traductor de pantalla: ${msg}`, context: 'screen-translator', source: 'renderer' },
          err,
        );
        // Forward to the main window so the user actually sees this in the
        // notifications bell (separate zustand store in a separate renderer).
        electron?.translator?.reportError({ message: `Traductor de pantalla: ${msg}`, detail });
      },
      getState: (): LoopState => {
        const st = useTranslatorStore.getState();
        const settings = useSettingsStore.getState().screenTranslator;
        return {
          paused: !st.visible || st.dragging || st.resizing,
          refreshMs: settings.refresh_ms,
          targetLang: settings.target_lang,
        };
      },
    });
    loopRef.current = loop;
    return () => {
      loop.stop();
      if (loopRef.current === loop) loopRef.current = null;
    };
  }, [visible, setStatus, setOcrText, setTranslation]);

  function onDragHandleDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragActive.current = true;
    setDragging(true);
    electron?.translator?.dragStart({ screenX: e.screenX, screenY: e.screenY });
  }

  function onClose() {
    electron?.translator?.hide();
  }

  const interacting = dragging || resizing;
  const statusLabel = labelForStatus(status);

  return (
    <div
      className={`translator-root${interacting ? ' is-interacting' : ''}`}
      data-testid="translator-root"
    >
      <ResizeHandles />
      <div className="translator-glass">
        <div className="translator-topbar">
          <div
            className="translator-drag"
            data-testid="translator-drag"
            onMouseDown={onDragHandleDown}
          >
            <span className="material-symbols-outlined">drag_indicator</span>
            Screen Translator
          </div>
          <span className="translator-status" data-status={status} data-testid="translator-status">
            {statusLabel}
          </span>
          <button
            className="translator-close"
            onClick={onClose}
            aria-label="Close translator"
            data-testid="translator-close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="translator-body" data-testid="translator-body">
          {status === 'error' ? (
            <div className="translator-error">
              <div className="translator-error-title">Screen translator failed</div>
              <div className="translator-error-detail">
                {lastErrorMessage || 'Unknown error — check the notifications bell in the main window.'}
              </div>
            </div>
          ) : lastTranslation ? (
            <RevealSurface text={lastTranslation} />
          ) : (
            <div className="translator-placeholder">
              {status === 'reading' || status === 'translating' || status === 'capturing'
                ? 'Looking for text in this area…'
                : 'Position the widget over text to translate.'}
            </div>
          )}
        </div>
      </div>
      <div className="translator-viewport-hint" aria-hidden="true" />
    </div>
  );
}

function labelForStatus(status: string): string {
  switch (status) {
    case 'capturing': return 'Capturing';
    case 'reading':   return 'Reading';
    case 'translating': return 'Translating';
    case 'no-text':   return 'No text';
    case 'error':     return 'Error';
    default:          return 'Ready';
  }
}
