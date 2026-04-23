/**
 * aHash (average hash) for frame diffing.
 *
 * Given a PNG captured from desktopCapturer, we reduce it to an 8x8 grayscale
 * grid and produce a 64-bit fingerprint where each bit is 1 iff that pixel is
 * brighter than the average. Two frames are considered "the same" when their
 * Hamming distance is small (<=3 is plenty for OCR change detection).
 *
 * Implemented purely with HTMLCanvasElement so it runs in the renderer
 * without native deps or extra workers. ~0.2ms on a 400x200 source.
 */

export type AHash = bigint;

async function loadImageFromPng(png: Uint8Array | ArrayBuffer): Promise<HTMLImageElement> {
  const blob = new Blob([png as BlobPart], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('aHash: failed to decode PNG'));
      img.src = url;
    });
    return img;
  } finally {
    // Revoke is safe after onload fires; decoded image is cached by the browser.
    URL.revokeObjectURL(url);
  }
}

export async function aHash(png: Uint8Array | ArrayBuffer): Promise<AHash> {
  const img = await loadImageFromPng(png);
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('aHash: 2d context unavailable');
  ctx.drawImage(img, 0, 0, 8, 8);
  const { data } = ctx.getImageData(0, 0, 8, 8);

  const gray: number[] = new Array(64);
  let sum = 0;
  for (let i = 0; i < 64; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    // Rec. 601 luma; fine for text contrast detection.
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = y;
    sum += y;
  }
  const avg = sum / 64;
  let bits = 0n;
  for (let i = 0; i < 64; i++) {
    if (gray[i] > avg) bits |= 1n << BigInt(i);
  }
  return bits;
}

export function hammingDistance(a: AHash, b: AHash): number {
  let x = a ^ b;
  let count = 0;
  while (x) {
    x &= x - 1n;
    count++;
  }
  return count;
}

/**
 * Normalize OCR output so noisy whitespace and punctuation don't trigger
 * false-positive "text changed" events in the loop. Lowercase + collapse
 * whitespace + trim. We keep punctuation because it can meaningfully change
 * meaning ("let's eat, grandma").
 */
export function normalizeOcrText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}
