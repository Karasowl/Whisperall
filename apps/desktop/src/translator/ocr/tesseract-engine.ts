import type { OcrEngine } from './engine';

/**
 * Tesseract.js-backed OCR engine. Singleton worker, lazy-initialized.
 *
 * Plug-and-play design:
 * - Default language packs are `eng+spa` (the most likely pair for our user).
 * - Pack files are bundled into `resources/tessdata/` (populated by
 *   electron-builder via `extraResources` in M18c). At runtime we pass the
 *   `tessedit_ocr_engine_mode` only; Tesseract handles the rest.
 * - No "Download pack" UI surface: if the pack is missing, we fall back to
 *   Tesseract's CDN, which is the library default.
 */
export class TesseractEngine implements OcrEngine {
  private worker: unknown | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly langs: string;

  constructor(langs = 'eng+spa') {
    this.langs = langs;
  }

  async init(): Promise<void> {
    if (this.worker) return;
    if (!this.initPromise) {
      this.initPromise = this.doInit();
    }
    await this.initPromise;
  }

  private async doInit(): Promise<void> {
    // Lazy dynamic import so the 2MB+ tesseract.js bundle is not shipped into
    // the renderer's initial chunk when the translator overlay hasn't been
    // opened yet.
    const { createWorker } = await import('tesseract.js');
    this.worker = await createWorker(this.langs);
  }

  async recognize(png: Uint8Array | ArrayBuffer): Promise<string> {
    await this.init();
    const worker = this.worker as {
      recognize: (img: Blob) => Promise<{ data: { text: string } }>;
    };
    const blob = new Blob([png as BlobPart], { type: 'image/png' });
    const result = await worker.recognize(blob);
    return result.data.text ?? '';
  }

  async dispose(): Promise<void> {
    if (!this.worker) return;
    const worker = this.worker as { terminate: () => Promise<void> };
    await worker.terminate();
    this.worker = null;
    this.initPromise = null;
  }
}

let singleton: TesseractEngine | null = null;

export function getTesseractEngine(langs?: string): TesseractEngine {
  if (!singleton) singleton = new TesseractEngine(langs);
  return singleton;
}

/** Test helper — lets unit tests reset the singleton between runs. */
export function __resetTesseractEngineForTests(): void {
  singleton = null;
}
