import { describe, it, expect, beforeEach, vi } from 'vitest';

// Build a mock BrowserWindow instance with just the surface translator-window.ts
// touches. We return the same instance from every `new BrowserWindow()` call so
// the test can inspect mutations.
function makeMockWin() {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  let bounds = { x: 100, y: 100, width: 420, height: 180 };
  let visible = false;
  let destroyed = false;
  return {
    setContentProtection: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    setBounds: vi.fn((b: typeof bounds) => { bounds = { ...bounds, ...b }; }),
    getBounds: () => bounds,
    moveTop: vi.fn(),
    setOpacity: vi.fn(),
    getOpacity: vi.fn(() => 1),
    show: vi.fn(() => { visible = true; }),
    hide: vi.fn(() => { visible = false; }),
    isVisible: () => visible,
    isDestroyed: () => destroyed,
    destroy: () => { destroyed = true; },
    on: vi.fn((evt: string, cb: (...args: unknown[]) => void) => {
      (listeners[evt] ??= []).push(cb);
    }),
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    webContents: {
      isLoading: () => false,
      on: vi.fn(),
      once: vi.fn(),
      send: vi.fn(),
      loadURL: vi.fn(),
    },
    emit: (evt: string, ...args: unknown[]) => {
      (listeners[evt] ?? []).forEach((cb) => cb(...args));
    },
  };
}

const mockScreen = {
  getAllDisplays: vi.fn(() => [
    { workArea: { x: 0, y: 0, width: 1920, height: 1080 }, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, id: 1, scaleFactor: 1 },
  ]),
  getDisplayNearestPoint: vi.fn(() => ({
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    id: 1,
    scaleFactor: 1,
  })),
  getCursorScreenPoint: vi.fn(() => ({ x: 960, y: 540 })),
  getDisplayMatching: vi.fn(() => ({
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    id: 1,
    scaleFactor: 1,
  })),
};

const mockApp = {
  isPackaged: false,
  getPath: vi.fn(() => '/tmp/test'),
};

let currentWin: ReturnType<typeof makeMockWin>;
const BrowserWindowMock = vi.fn().mockImplementation(() => {
  currentWin = makeMockWin();
  return currentWin;
});

vi.mock('electron', () => ({
  app: mockApp,
  BrowserWindow: BrowserWindowMock,
  screen: mockScreen,
  desktopCapturer: { getSources: vi.fn().mockResolvedValue([]) },
  nativeImage: { createFromPath: vi.fn() },
}));

describe('translator-window', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('calls setContentProtection(true) immediately after window creation', async () => {
    const mod = await import('../../electron/modules/translator-window.js');
    mod.preCreateTranslator();
    expect(BrowserWindowMock).toHaveBeenCalledTimes(1);
    expect(currentWin.setContentProtection).toHaveBeenCalledWith(true);
  });

  it('creates the window with a stable opaque dark surface', async () => {
    const mod = await import('../../electron/modules/translator-window.js');
    mod.preCreateTranslator();
    const opts = BrowserWindowMock.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.transparent).toBe(false);
    expect(opts.frame).toBe(false);
    // Resizable MUST stay false — resizing is handled by our IPC handles.
    expect(opts.resizable).toBe(false);
    expect(opts.alwaysOnTop).toBe(true);
    expect(opts.skipTaskbar).toBe(true);
    expect(opts.backgroundColor).toBe('#101922');
    expect(opts.backgroundMaterial).toBeUndefined();
  });

  it('toggleTranslator shows an invisible window and hides a visible one', async () => {
    const mod = await import('../../electron/modules/translator-window.js');
    mod.preCreateTranslator();
    expect(currentWin.isVisible()).toBe(false);

    mod.toggleTranslator();
    expect(currentWin.show).toHaveBeenCalled();
    expect(currentWin.isVisible()).toBe(true);

    mod.toggleTranslator();
    expect(currentWin.hide).toHaveBeenCalled();
    expect(currentWin.isVisible()).toBe(false);
  });

  it('resize-delta math: SE anchor grows width and height by (dx, dy)', async () => {
    const mod = await import('../../electron/modules/translator-window.js');
    mod.preCreateTranslator();
    mod.showTranslator();
    const before = currentWin.getBounds();

    mod.startTranslatorResize(500, 500, 'se');
    mod.moveTranslatorResize(560, 540);

    const after = currentWin.getBounds();
    expect(after.width).toBe(before.width + 60);
    expect(after.height).toBe(before.height + 40);
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  it('resize-delta math: NW anchor moves origin and shrinks dimensions', async () => {
    const mod = await import('../../electron/modules/translator-window.js');
    mod.preCreateTranslator();
    mod.showTranslator();
    const before = currentWin.getBounds();

    mod.startTranslatorResize(500, 500, 'nw');
    mod.moveTranslatorResize(520, 530); // dx=+20, dy=+30 → shrink

    const after = currentWin.getBounds();
    expect(after.width).toBe(before.width - 20);
    expect(after.height).toBe(before.height - 30);
    expect(after.x).toBe(before.x + 20);
    expect(after.y).toBe(before.y + 30);
  });

  it('resize enforces minimum dimensions', async () => {
    const mod = await import('../../electron/modules/translator-window.js');
    mod.preCreateTranslator();
    mod.showTranslator();

    mod.startTranslatorResize(500, 500, 'se');
    // Huge negative delta: attempts to shrink well below minimum.
    mod.moveTranslatorResize(-10_000, -10_000);
    const after = currentWin.getBounds();
    expect(after.width).toBeGreaterThanOrEqual(240);
    expect(after.height).toBeGreaterThanOrEqual(120);
  });

  it('showTranslator recovers from an oversized persisted window', async () => {
    const mod = await import('../../electron/modules/translator-window.js');
    mod.preCreateTranslator();
    currentWin.setBounds({ x: 0, y: 0, width: 3000, height: 2000 });

    mod.showTranslator();

    const after = currentWin.getBounds();
    expect(after.width).toBe(420);
    expect(after.height).toBe(180);
  });

  it('drag offsets track the initial cursor position relative to bounds', async () => {
    const mod = await import('../../electron/modules/translator-window.js');
    mod.preCreateTranslator();
    mod.showTranslator();
    const before = currentWin.getBounds();

    mod.startTranslatorDrag(before.x + 20, before.y + 30);
    mod.moveTranslatorDrag(before.x + 120, before.y + 80);

    const after = currentWin.getBounds();
    // new origin = (cursor - offset) → shifted by (100, 50).
    expect(after.x).toBe(before.x + 100);
    expect(after.y).toBe(before.y + 50);
  });
});
