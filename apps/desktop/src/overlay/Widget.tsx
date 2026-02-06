import { useEffect, useRef, useCallback } from 'react';
import { useWidgetStore, PILL_SIZE, EXPANDED_SIZE } from './widget-store';
import { electron } from '../lib/electron';
import { getMicStream, stopMicStream, createRecorder } from '../lib/audio';
import { api } from '../lib/api';

let recorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

export function Widget() {
  const {
    mode, dictateStatus, text, error, dragging,
    expand, collapse, startDictation, stopDictation,
    setDone, setError, setDragging, resetDictation,
  } = useWidgetStore();

  const dragRef = useRef<{ startX: number; startY: number } | null>(null);

  // Resize overlay window when mode changes
  useEffect(() => {
    const size = mode === 'pill' ? PILL_SIZE : EXPANDED_SIZE;
    electron?.resizeOverlay(size);
  }, [mode]);

  // Listen for hotkey events from main process
  useEffect(() => {
    return electron?.onHotkey((action) => {
      if (action === 'dictate-toggle') {
        const status = useWidgetStore.getState().dictateStatus;
        if (status === 'recording') {
          handleStop();
        } else {
          handleStart();
        }
      } else if (action === 'dictate-start') {
        handleStart();
      } else if (action === 'dictate-stop') {
        handleStop();
      }
    });
  }, []);

  // Listen for overlay visibility
  useEffect(() => {
    return electron?.onOverlayVisible((visible) => {
      if (visible && mode === 'pill') expand();
    });
  }, [mode, expand]);

  const handleStart = useCallback(async () => {
    startDictation();
    try {
      audioChunks = [];
      const stream = await getMicStream();
      recorder = createRecorder(stream, (chunk) => audioChunks.push(chunk), 30_000);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [startDictation, setError]);

  const handleStop = useCallback(() => {
    if (!recorder || recorder.state === 'inactive') return;
    stopDictation();
    recorder.onstop = async () => {
      stopMicStream();
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      try {
        const res = await api.dictate.send({ audio: blob });
        setDone(res.text);
        electron?.setDictationText(res.text);
      } catch (err) {
        setError((err as Error).message);
      }
    };
    recorder.stop();
    recorder = null;
  }, [stopDictation, setDone, setError]);

  const handlePaste = () => {
    if (text) electron?.pasteText(text);
  };

  const handleDismiss = () => {
    resetDictation();
    collapse();
    electron?.hideOverlay();
  };

  // ── Drag handling ──
  const onPointerDown = (e: React.PointerEvent) => {
    if (mode === 'expanded') return;
    dragRef.current = { startX: e.clientX, startY: e.clientY };
    setDragging(true);
    electron?.setOverlayIgnoreMouse(false);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    // Move is relative; accumulate via screenX/screenY
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      electron?.resizeOverlay(PILL_SIZE); // keep pill size during drag
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
    setDragging(false);
    electron?.setOverlayIgnoreMouse(true);
  };

  // ── Mouse enter/leave for click-through ──
  const onMouseEnter = () => {
    electron?.setOverlayIgnoreMouse(false);
  };

  const onMouseLeave = () => {
    if (!dragging) electron?.setOverlayIgnoreMouse(true);
  };

  if (mode === 'pill') {
    return (
      <div
        className="widget-pill"
        data-dragging={dragging}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={() => expand()}
      >
        <div className="pill-surface" />
      </div>
    );
  }

  return (
    <div
      className="widget-expanded"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="widget-header">
        <span className="widget-title">Whisperall</span>
        <button className="widget-btn-icon" onClick={handleDismiss} title="Minimize">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="widget-body">
        {dictateStatus === 'idle' && (
          <button className="widget-btn-record" onClick={handleStart}>
            <span className="material-symbols-outlined">mic</span>
            Dictate
          </button>
        )}

        {dictateStatus === 'recording' && (
          <div className="widget-recording">
            <div className="recording-indicator" />
            <span>Recording...</span>
            <button className="widget-btn-stop" onClick={handleStop}>
              <span className="material-symbols-outlined">stop</span>
            </button>
          </div>
        )}

        {dictateStatus === 'processing' && (
          <div className="widget-status">Processing...</div>
        )}

        {dictateStatus === 'done' && text && (
          <div className="widget-result">
            <p className="widget-text">{text}</p>
            <div className="widget-actions">
              <button className="widget-btn-primary" onClick={handlePaste}>
                <span className="material-symbols-outlined">content_paste</span>
                Paste
              </button>
              <button className="widget-btn-ghost" onClick={resetDictation}>
                Again
              </button>
            </div>
          </div>
        )}

        {dictateStatus === 'error' && (
          <div className="widget-error">
            <span>{error}</span>
            <button className="widget-btn-ghost" onClick={resetDictation}>Retry</button>
          </div>
        )}
      </div>
    </div>
  );
}
