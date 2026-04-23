import { aHash, hammingDistance, normalizeOcrText, type AHash } from './hash';
import type { OcrEngine } from './ocr/engine';

export type LoopDeps = {
  /** Capture a PNG of the region under the widget. Returns null when the window is hidden/minimised. */
  captureRegion: () => Promise<Uint8Array | null>;
  /** OCR engine instance (Tesseract.js in v1). */
  ocr: OcrEngine;
  /** Translate a string to `targetLang`. Returns the translated text. */
  translate: (text: string, targetLang: string) => Promise<string>;
  /** Emit translated text into the reveal surface. Called once per successful translation. */
  onReveal: (translatedText: string, rawText: string) => void;
  /** Read the latest user intent from the store/zustand on every tick. */
  getState: () => LoopState;
  /** Push a status pill label (idle / reading / translating / no-text / error). */
  onStatus: (status: LoopStatus) => void;
  /** Surface an error — called only after 3 consecutive failures to avoid spam. */
  onError: (err: unknown) => void;
};

export type LoopStatus = 'idle' | 'capturing' | 'reading' | 'translating' | 'no-text' | 'error';

export type LoopState = {
  /** Pause the loop entirely (widget hidden or user interacting). */
  paused: boolean;
  /** Refresh cadence in ms (500 / 750 / 1000 / 1500). */
  refreshMs: number;
  /** BCP-47 target language for DeepL (e.g. 'es'). */
  targetLang: string;
};

export type LoopHandle = {
  /** Stop all scheduled work and clear timers. */
  stop: () => void;
};

/** Max consecutive failures before we raise a visible notification. */
export const FAILURE_THRESHOLD = 3;
/** Backoff applied after the threshold fires. */
export const ERROR_BACKOFF_MS = 3000;
/** Upper bound for the idle backoff when the frame hasn't changed. */
export const IDLE_BACKOFF_CAP_MS = 1500;
/** aHash Hamming distance below which two frames are considered "identical". */
export const FRAME_IDENTICAL_THRESHOLD = 3;

/**
 * Screen-translator control loop.
 *
 * Tick cadence is adaptive:
 *   1. While visible + idle + not interacting, schedule at `refreshMs`.
 *   2. If the frame aHash didn't change since last tick, double the delay
 *      up to `IDLE_BACKOFF_CAP_MS` — nothing new to translate.
 *   3. If 3 consecutive ticks fail, raise a notification and back off to
 *      `ERROR_BACKOFF_MS` until the next success.
 *
 * No work runs while `paused` is true. Callers flip `paused` on drag/resize
 * and when the widget is hidden.
 */
export function startCaptureLoop(deps: LoopDeps): LoopHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let disposed = false;
  let lastFrameHash: AHash | null = null;
  let lastTextKey: string | null = null;
  let consecFailures = 0;

  const schedule = (ms: number) => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, ms);
  };

  async function tick(): Promise<void> {
    if (disposed) return;
    const state = deps.getState();
    if (state.paused) {
      schedule(state.refreshMs);
      return;
    }
    if (inFlight) {
      schedule(state.refreshMs);
      return;
    }
    inFlight = true;

    try {
      deps.onStatus('capturing');
      const png = await deps.captureRegion();
      if (!png) {
        // Window hidden or capture unavailable — back off silently.
        schedule(state.refreshMs);
        return;
      }

      const frameHash = await aHash(png);
      if (lastFrameHash !== null && hammingDistance(frameHash, lastFrameHash) <= FRAME_IDENTICAL_THRESHOLD) {
        // Pixels unchanged — nothing new on screen. Idle backoff.
        const nextDelay = Math.min(state.refreshMs * 2, IDLE_BACKOFF_CAP_MS);
        deps.onStatus('idle');
        schedule(nextDelay);
        return;
      }
      lastFrameHash = frameHash;

      deps.onStatus('reading');
      const rawText = await deps.ocr.recognize(png);
      const key = normalizeOcrText(rawText);
      if (!key) {
        deps.onStatus('no-text');
        schedule(state.refreshMs);
        return;
      }
      if (key === lastTextKey) {
        // Text unchanged (likely OCR noise produced minor variants that
        // normalize to the same string). Skip translation call.
        deps.onStatus('idle');
        schedule(state.refreshMs);
        return;
      }
      lastTextKey = key;

      deps.onStatus('translating');
      const translated = await deps.translate(rawText.trim(), state.targetLang);
      if (disposed) return;

      deps.onReveal(translated, rawText.trim());
      deps.onStatus('idle');
      consecFailures = 0;
      schedule(state.refreshMs);
    } catch (err) {
      consecFailures++;
      if (consecFailures >= FAILURE_THRESHOLD) {
        deps.onStatus('error');
        deps.onError(err);
        schedule(ERROR_BACKOFF_MS);
      } else {
        schedule(deps.getState().refreshMs);
      }
    } finally {
      inFlight = false;
    }
  }

  // Kick off immediately so the user sees activity as soon as the widget
  // opens. The tick itself decides whether to skip (paused / no frame).
  schedule(0);

  return {
    stop() {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
