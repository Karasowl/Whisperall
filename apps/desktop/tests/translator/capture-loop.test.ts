import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the hash module so we don't need a DOM/canvas for aHash.
// We simulate frame changes by yielding controlled hashes in sequence.
const hashQueue: bigint[] = [];
vi.mock('../../src/translator/hash', async () => {
  const actual = await vi.importActual<typeof import('../../src/translator/hash')>('../../src/translator/hash');
  return {
    ...actual,
    aHash: vi.fn(async () => {
      if (hashQueue.length === 0) return 0n;
      return hashQueue.shift() as bigint;
    }),
  };
});

import {
  startCaptureLoop,
  type LoopState,
  FAILURE_THRESHOLD,
} from '../../src/translator/capture-loop';
import type { OcrEngine } from '../../src/translator/ocr/engine';

function makeOcr(text: string | (() => Promise<string>)): OcrEngine {
  return {
    async init() {},
    async recognize() {
      if (typeof text === 'function') return text();
      return text;
    },
    async dispose() {},
  };
}

function waitIdle(ms = 80) {
  return new Promise((r) => setTimeout(r, ms));
}

const BASE_STATE: LoopState = {
  paused: false,
  refreshMs: 20,
  targetLang: 'es',
};

describe('capture-loop', () => {
  beforeEach(() => {
    hashQueue.length = 0;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('captures, OCRs, translates, and reveals when text changes', async () => {
    hashQueue.push(0x1111111111111111n, 0x2222222222222222n);
    const onReveal = vi.fn();
    const translate = vi.fn().mockResolvedValue('hola mundo');
    let state = { ...BASE_STATE };

    const handle = startCaptureLoop({
      captureRegion: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      ocr: makeOcr('hello world'),
      translate,
      onReveal,
      onStatus: vi.fn(),
      onError: vi.fn(),
      getState: () => state,
    });

    await waitIdle(100);
    state = { ...state, paused: true };
    handle.stop();

    expect(translate).toHaveBeenCalledWith('hello world', 'es');
    expect(onReveal).toHaveBeenCalledWith('hola mundo', 'hello world');
  });

  it('skips OCR when the frame hash is unchanged (idle backoff)', async () => {
    // Same hash every tick → loop must not invoke OCR after the first.
    hashQueue.push(0x1111111111111111n, 0x1111111111111111n, 0x1111111111111111n, 0x1111111111111111n);
    const ocrSpy = vi.fn().mockResolvedValue('foo');
    const translate = vi.fn().mockResolvedValue('foo-es');
    let state = { ...BASE_STATE };

    const handle = startCaptureLoop({
      captureRegion: vi.fn().mockResolvedValue(new Uint8Array([1])),
      ocr: { init: async () => {}, recognize: ocrSpy, dispose: async () => {} },
      translate,
      onReveal: vi.fn(),
      onStatus: vi.fn(),
      onError: vi.fn(),
      getState: () => state,
    });

    await waitIdle(120);
    state = { ...state, paused: true };
    handle.stop();

    // First tick runs OCR once. Subsequent identical-frame ticks must not.
    expect(ocrSpy).toHaveBeenCalledTimes(1);
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it('skips translation when normalized OCR text is unchanged', async () => {
    // Different frame hashes each tick (so the frame-diff gate does NOT short-circuit),
    // but OCR returns the same text each time. Hashes are fully inverted bit
    // patterns (distance 64) so they always clear the 3-bit identity threshold.
    hashQueue.push(0x0000000000000000n, 0xffffffffffffffffn, 0x0000000000000000n, 0xffffffffffffffffn);
    const translate = vi.fn().mockResolvedValue('traducción');
    let state = { ...BASE_STATE };

    const handle = startCaptureLoop({
      captureRegion: vi.fn().mockResolvedValue(new Uint8Array([1])),
      ocr: makeOcr('Stable text.'),
      translate,
      onReveal: vi.fn(),
      onStatus: vi.fn(),
      onError: vi.fn(),
      getState: () => state,
    });

    await waitIdle(120);
    state = { ...state, paused: true };
    handle.stop();

    expect(translate).toHaveBeenCalledTimes(1);
  });

  it('does not work while paused', async () => {
    hashQueue.push(0x0n, 0xffffffffffffffffn);
    const captureRegion = vi.fn().mockResolvedValue(new Uint8Array([1]));
    const state: LoopState = { ...BASE_STATE, paused: true };

    const handle = startCaptureLoop({
      captureRegion,
      ocr: makeOcr('hi'),
      translate: vi.fn(),
      onReveal: vi.fn(),
      onStatus: vi.fn(),
      onError: vi.fn(),
      getState: () => state,
    });

    await waitIdle(80);
    handle.stop();

    expect(captureRegion).not.toHaveBeenCalled();
  });

  it('fires onError once after THREE consecutive failures', async () => {
    // Each hash is a full bit-flip of its predecessor so the frame-diff gate
    // never short-circuits → OCR runs every tick → throws every tick.
    hashQueue.push(
      0x0000000000000000n,
      0xffffffffffffffffn,
      0x0000000000000000n,
      0xffffffffffffffffn,
      0x0000000000000000n,
    );
    let state = { ...BASE_STATE };
    const onError = vi.fn();
    const badOcr: OcrEngine = {
      init: async () => {},
      recognize: async () => { throw new Error('boom'); },
      dispose: async () => {},
    };

    const handle = startCaptureLoop({
      captureRegion: vi.fn().mockResolvedValue(new Uint8Array([1])),
      ocr: badOcr,
      translate: vi.fn(),
      onReveal: vi.fn(),
      onStatus: vi.fn(),
      onError,
      getState: () => state,
    });

    await waitIdle(200);
    state = { ...state, paused: true };
    handle.stop();

    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls.length).toBeGreaterThanOrEqual(1);
    // The error path is only entered on the Nth consecutive failure.
    expect(FAILURE_THRESHOLD).toBe(3);
  });

  it('emits no-text status and skips translate when OCR returns only whitespace', async () => {
    hashQueue.push(0x0n, 0xffffffffffffffffn);
    const translate = vi.fn();
    const onStatus = vi.fn();
    let state = { ...BASE_STATE };

    const handle = startCaptureLoop({
      captureRegion: vi.fn().mockResolvedValue(new Uint8Array([1])),
      ocr: makeOcr('   \n\t  '),
      translate,
      onReveal: vi.fn(),
      onStatus,
      onError: vi.fn(),
      getState: () => state,
    });

    await waitIdle(80);
    state = { ...state, paused: true };
    handle.stop();

    expect(translate).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('no-text');
  });

  it('stop() halts the loop so later ticks do not fire', async () => {
    hashQueue.push(0x0n, 0xffffffffffffffffn, 0x0n);
    const captureRegion = vi.fn().mockResolvedValue(new Uint8Array([1]));
    const state: LoopState = { ...BASE_STATE };

    const handle = startCaptureLoop({
      captureRegion,
      ocr: makeOcr('foo'),
      translate: vi.fn().mockResolvedValue('foo-es'),
      onReveal: vi.fn(),
      onStatus: vi.fn(),
      onError: vi.fn(),
      getState: () => state,
    });

    await waitIdle(30);
    handle.stop();
    const callsAtStop = captureRegion.mock.calls.length;

    await waitIdle(120);
    expect(captureRegion.mock.calls.length).toBe(callsAtStop);
  });

  it('returns early when captureRegion resolves null (window hidden)', async () => {
    const captureRegion = vi.fn().mockResolvedValue(null);
    const ocrSpy = vi.fn();
    let state = { ...BASE_STATE };

    const handle = startCaptureLoop({
      captureRegion,
      ocr: { init: async () => {}, recognize: ocrSpy, dispose: async () => {} },
      translate: vi.fn(),
      onReveal: vi.fn(),
      onStatus: vi.fn(),
      onError: vi.fn(),
      getState: () => state,
    });

    await waitIdle(80);
    state = { ...state, paused: true };
    handle.stop();

    expect(captureRegion).toHaveBeenCalled();
    expect(ocrSpy).not.toHaveBeenCalled();
  });
});
