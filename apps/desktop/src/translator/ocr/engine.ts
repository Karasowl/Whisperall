/**
 * OCR engine interface. Kept minimal so we can swap Tesseract.js (v1) for
 * Windows.Media.Ocr or a cloud fallback (M19) without touching the capture
 * loop.
 */
export interface OcrEngine {
  /** Warm up the engine (download/init the language pack if needed). */
  init(): Promise<void>;
  /** Run OCR on a PNG buffer and return the recognized text. */
  recognize(png: Uint8Array | ArrayBuffer): Promise<string>;
  /** Release worker/model resources. */
  dispose(): Promise<void>;
}

export type OcrEngineFactory = () => OcrEngine;
