import { desktopCapturer, screen, nativeImage } from 'electron';
import { getTranslatorWindow } from './translator-window.js';

/**
 * Capture the screen region under the translator window as a PNG buffer.
 *
 * Self-exclusion strategy:
 * translator-window.ts calls `setContentProtection(true)`, which maps to
 * WDA_EXCLUDEFROMCAPTURE on supported Windows builds. That keeps the visible
 * widget out of desktopCapturer without the user-facing opacity flicker caused
 * by the previous "setOpacity(0) for one frame" fallback.
 *
 * Steps:
 * 1. Pick the display the window sits on.
 * 2. Grab a full-res thumbnail of that display.
 * 3. Translate window bounds → display-local pixels (DPI + multi-monitor).
 * 4. Crop via nativeImage, return PNG bytes as base64.
 */
/** Wrap a promise with a hard timeout so the opacity-restore `finally` in
 *  captureTranslatorRegion always runs even if desktopCapturer hangs. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export async function captureTranslatorRegion(): Promise<{ pngBase64: string; width: number; height: number } | null> {
  const win = getTranslatorWindow();
  if (!win || !win.isVisible()) return null;

  const winBounds = win.getBounds();

  const display = screen.getDisplayMatching(winBounds);
  const scale = display.scaleFactor || 1;

  const thumbSize = {
    width: Math.round(display.bounds.width * scale),
    height: Math.round(display.bounds.height * scale),
  };

  const sources = await withTimeout(
    desktopCapturer.getSources({ types: ['screen'], thumbnailSize: thumbSize }),
    5000,
    'desktopCapturer.getSources',
  );

  // display.id is a number; source.display_id is a stringified number on
  // Electron >= 17. Match on either shape.
  const displayIdStr = String(display.id);
  const source =
    sources.find((s) => s.display_id === displayIdStr) ??
    sources.find((s) => s.id.includes(`screen:${display.id}`)) ??
    sources[0];
  if (!source) return null;

  const full = source.thumbnail;
  if (full.isEmpty()) return null;

  // Compute crop rect in display-local pixel space.
  const localX = Math.max(0, Math.round((winBounds.x - display.bounds.x) * scale));
  const localY = Math.max(0, Math.round((winBounds.y - display.bounds.y) * scale));
  const localW = Math.min(
    Math.round(winBounds.width * scale),
    thumbSize.width - localX,
  );
  const localH = Math.min(
    Math.round(winBounds.height * scale),
    thumbSize.height - localY,
  );
  if (localW <= 0 || localH <= 0) return null;

  const cropped = full.crop({ x: localX, y: localY, width: localW, height: localH });
  if (cropped.isEmpty()) return null;

  const png = cropped.toPNG();
  return {
    pngBase64: png.toString('base64'),
    width: localW,
    height: localH,
  };
}

// Re-export nativeImage for tests that want to sanity-check buffer handling.
export const __nativeImageForTests = nativeImage;
