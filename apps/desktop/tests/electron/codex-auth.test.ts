import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';

// Track onBeforeRequest callback so tests can simulate redirects
let capturedRedirectHandler: ((details: { url: string }, cb: (opts: { cancel: boolean }) => void) => void) | null = null;
let capturedCloseHandler: (() => void) | null = null;

const mockWebContents = {
  session: {
    webRequest: {
      onBeforeRequest: vi.fn((_filter: unknown, handler: typeof capturedRedirectHandler) => {
        capturedRedirectHandler = handler;
      }),
    },
  },
};

const mockWindowInstance = {
  webContents: mockWebContents,
  on: vi.fn((event: string, handler: () => void) => {
    if (event === 'closed') capturedCloseHandler = handler;
  }),
  loadURL: vi.fn(),
  close: vi.fn(),
  isDestroyed: vi.fn().mockReturnValue(false),
};

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/tmp/test') },
  BrowserWindow: vi.fn(() => mockWindowInstance),
}));

// Mock fs — path-aware: auth-storage.json vs ~/.codex/auth.json
const mockStorage: Record<string, string> = {};
const mockCodexCli: Record<string, unknown> = {};
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(async (filePath: string) => {
      if (filePath.includes('.codex') && filePath.includes('auth.json')) {
        if (Object.keys(mockCodexCli).length === 0) throw new Error('ENOENT');
        return JSON.stringify(mockCodexCli);
      }
      return JSON.stringify(mockStorage);
    }),
    writeFile: vi.fn(async (_p: string, data: string) => {
      const parsed = JSON.parse(data);
      Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
      Object.assign(mockStorage, parsed);
    }),
    mkdir: vi.fn(async () => undefined),
  },
}));

// Configurable spawn behavior per command pattern
let spawnBehavior: Record<string, { exitCode: number; stdout?: string }> = {};

function makeProc(stdout: string, exitCode: number) {
  const emitter = new EventEmitter();
  const stdoutEmitter = new EventEmitter();
  const stdinSink = new Writable({ write(_c, _e, cb) { cb(); } });
  Object.assign(emitter, { stdout: stdoutEmitter, stderr: new EventEmitter(), stdin: stdinSink, kill: vi.fn() });
  setTimeout(() => {
    if (stdout) stdoutEmitter.emit('data', Buffer.from(stdout));
    emitter.emit('close', exitCode);
  }, 0);
  return emitter;
}

vi.mock('node:child_process', () => ({
  spawn: vi.fn((_cmd: string, args: string[]) => {
    const allParts = [_cmd, ...args].join(' ');
    // Match command patterns
    if (allParts.includes('exec')) {
      const behavior = spawnBehavior['exec'] ?? { exitCode: 1 };
      return makeProc(behavior.stdout ?? '', behavior.exitCode);
    }
    if (allParts.includes('--version')) {
      const behavior = spawnBehavior['version'] ?? { exitCode: 1 };
      return makeProc('', behavior.exitCode);
    }
    if (allParts.includes('login')) {
      const behavior = spawnBehavior['login'] ?? { exitCode: 1 };
      return makeProc('', behavior.exitCode);
    }
    return makeProc('', 1);
  }),
}));

const CODEX_EXEC_PONG = [
  '{"type":"turn.started"}',
  '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"pong"}}',
  '{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":5}}',
].join('\n');

/** Wait for async preamble (CLI check + spawn) to complete */
const flushPreamble = () => new Promise((r) => setTimeout(r, 20));

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

describe('codex-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    Object.keys(mockCodexCli).forEach((k) => delete mockCodexCli[k]);
    spawnBehavior = {}; // Default: all spawns fail
    capturedRedirectHandler = null;
    capturedCloseHandler = null;
  });

  // --- Status & disconnect ---

  it('getCodexAuthStatus returns disconnected when no token', async () => {
    const { getCodexAuthStatus } = await import('../../electron/modules/codex-auth.js');
    const status = await getCodexAuthStatus();
    expect(status).toEqual({ connected: false, email: '' });
  });

  it('getCodexAuthStatus returns connected when api_key exists', async () => {
    mockStorage.codex_api_key = 'sk-test-token';
    mockStorage.codex_email = 'user@test.com';
    const { getCodexAuthStatus } = await import('../../electron/modules/codex-auth.js');
    const status = await getCodexAuthStatus();
    expect(status).toEqual({ connected: true, email: 'user@test.com' });
  });

  it('getCodexAuthStatus returns connected when Codex CLI has credentials', async () => {
    Object.assign(mockCodexCli, { tokens: { access_token: 'cli-token', account_id: 'acc-cli' } });
    const { getCodexAuthStatus } = await import('../../electron/modules/codex-auth.js');
    const status = await getCodexAuthStatus();
    expect(status).toEqual({ connected: true, email: '' });
  });

  it('disconnectCodex removes all codex_ keys', async () => {
    mockStorage.codex_access_token = 'tok';
    mockStorage.codex_refresh_token = 'ref';
    mockStorage.codex_email = 'a@b.com';
    mockStorage.other_key = 'keep';
    const { disconnectCodex } = await import('../../electron/modules/codex-auth.js');
    await disconnectCodex();
    expect(mockStorage.other_key).toBe('keep');
    expect(mockStorage.codex_access_token).toBeUndefined();
  });

  // --- testCodexConnection ---

  it('testCodexConnection succeeds with API key via REST', async () => {
    mockStorage.codex_api_key = 'sk-real-key';
    const previousFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true }) as unknown as typeof fetch;
    try {
      const { testCodexConnection } = await import('../../electron/modules/codex-auth.js');
      const result = await testCodexConnection();
      expect(result.ok).toBe(true);
    } finally {
      global.fetch = previousFetch;
    }
  });

  it('testCodexConnection falls back to codex exec when no API key', async () => {
    spawnBehavior['version'] = { exitCode: 0 };
    spawnBehavior['exec'] = { exitCode: 0, stdout: CODEX_EXEC_PONG };
    const { testCodexConnection } = await import('../../electron/modules/codex-auth.js');
    const result = await testCodexConnection();
    expect(result.ok).toBe(true);
    expect(mockStorage.codex_chat_mode).toBe('cli');
  });

  it('testCodexConnection returns error when nothing works', async () => {
    // No API key, no CLI, exec fails
    const { testCodexConnection } = await import('../../electron/modules/codex-auth.js');
    const result = await testCodexConnection();
    expect(result.ok).toBe(false);
  });

  // --- codexChat ---

  it('codexChat uses REST when API key available', async () => {
    mockStorage.codex_api_key = 'sk-real-key';
    const previousFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ output_text: 'REST response' }),
    }) as unknown as typeof fetch;
    try {
      const { codexChat } = await import('../../electron/modules/codex-auth.js');
      const text = await codexChat('system', 'hello');
      expect(text).toBe('REST response');
    } finally {
      global.fetch = previousFetch;
    }
  });

  it('codexChat uses codex exec when no API key', async () => {
    spawnBehavior['version'] = { exitCode: 0 };
    spawnBehavior['exec'] = { exitCode: 0, stdout: [
      '{"type":"item.completed","item":{"type":"agent_message","text":"CLI response"}}',
      '{"type":"turn.completed","usage":{}}',
    ].join('\n') };
    const { codexChat } = await import('../../electron/modules/codex-auth.js');
    const text = await codexChat('system', 'hello');
    expect(text).toBe('CLI response');
  });

  // --- codexCanInfer ---

  it('codexCanInfer returns true when API key exists', async () => {
    mockStorage.codex_api_key = 'sk-key';
    const { codexCanInfer } = await import('../../electron/modules/codex-auth.js');
    expect(await codexCanInfer()).toBe(true);
  });

  it('codexCanInfer returns true when CLI is installed', async () => {
    spawnBehavior['version'] = { exitCode: 0 };
    const { codexCanInfer } = await import('../../electron/modules/codex-auth.js');
    expect(await codexCanInfer()).toBe(true);
  });

  it('codexCanInfer returns false when nothing available', async () => {
    const { codexCanInfer } = await import('../../electron/modules/codex-auth.js');
    expect(await codexCanInfer()).toBe(false);
  });

  // --- OAuth window flow ---

  it('startCodexAuth opens BrowserWindow with correct auth URL', async () => {
    const { BrowserWindow } = await import('electron');
    const { startCodexAuth, cancelCodexAuth } = await import('../../electron/modules/codex-auth.js');

    const authPromise = startCodexAuth();
    await flushPreamble();

    expect(BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
      width: 500, height: 700, title: 'Sign in with OpenAI',
    }));
    expect(mockWindowInstance.loadURL).toHaveBeenCalledWith(expect.stringContaining('auth.openai.com/oauth/authorize'));
    expect(mockWindowInstance.loadURL).toHaveBeenCalledWith(expect.stringContaining('originator=codex_cli_rs'));

    cancelCodexAuth();
    await expect(authPromise).rejects.toThrow('Cancelled');
  });

  it('startCodexAuth resolves error when window is closed', async () => {
    const { startCodexAuth } = await import('../../electron/modules/codex-auth.js');
    const authPromise = startCodexAuth();
    await flushPreamble();
    capturedCloseHandler!();
    const result = await authPromise;
    expect(result).toEqual({ ok: false, error: 'Authentication window closed' });
  });

  it('startCodexAuth handles OAuth error in callback', async () => {
    const { startCodexAuth } = await import('../../electron/modules/codex-auth.js');
    const authPromise = startCodexAuth();
    await flushPreamble();
    capturedRedirectHandler!(
      { url: 'http://localhost:1455/auth/callback?error=access_denied&error_description=User+denied+access' },
      vi.fn(),
    );
    const result = await authPromise;
    expect(result).toEqual({ ok: false, error: 'OpenAI OAuth failed: access_denied: User denied access' });
  });

  it('startCodexAuth succeeds even when API key exchange fails', async () => {
    const previousFetch = global.fetch;
    const idToken = makeJwt({ email: 'user@test.com', 'https://api.openai.com/auth': { chatgpt_account_id: 'acc_123' } });
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'oauth-at', refresh_token: 'oauth-rt', id_token: idToken, expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'missing org' });
    global.fetch = mockFetch as unknown as typeof fetch;
    try {
      const { startCodexAuth } = await import('../../electron/modules/codex-auth.js');
      const authPromise = startCodexAuth();
      await flushPreamble();
      const authUrl = String(mockWindowInstance.loadURL.mock.calls.at(-1)?.[0] ?? '');
      const state = new URL(authUrl).searchParams.get('state');
      capturedRedirectHandler!({ url: `http://localhost:1455/auth/callback?code=abc&state=${state}` }, vi.fn());
      const result = await authPromise;
      expect(result).toEqual({ ok: true, email: 'user@test.com' });
      expect(mockStorage.codex_api_key).toBeUndefined();
    } finally {
      global.fetch = previousFetch;
    }
  });

  // --- Path A: auto-connect from CLI via codex exec ---

  it('startCodexAuth auto-connects from CLI without opening a window', async () => {
    const cliToken = makeJwt({ 'https://api.openai.com/profile': { email: 'cli@test.com' } });
    Object.assign(mockCodexCli, { tokens: { access_token: cliToken, account_id: 'acc-cli' } });
    spawnBehavior['version'] = { exitCode: 0 };
    spawnBehavior['exec'] = { exitCode: 0, stdout: CODEX_EXEC_PONG };
    const { BrowserWindow } = await import('electron');
    const { startCodexAuth } = await import('../../electron/modules/codex-auth.js');
    const result = await startCodexAuth();
    expect(result).toEqual({ ok: true, email: 'cli@test.com' });
    expect(BrowserWindow).not.toHaveBeenCalled();
    expect(mockStorage.codex_chat_mode).toBe('cli');
  });

  // --- Path B: spawn codex login then auto-connect ---

  it('startCodexAuth spawns codex login then auto-connects', async () => {
    const cliToken = makeJwt({ 'https://api.openai.com/profile': { email: 'spawned@test.com' } });
    Object.assign(mockCodexCli, { tokens: { access_token: cliToken, account_id: 'acc-spawn' } });
    // First tryCliCredentials: exec fails (not logged in yet)
    // After spawn login succeeds: exec works
    let execCallCount = 0;
    spawnBehavior['login'] = { exitCode: 0 };
    const origBehavior = spawnBehavior;
    vi.mocked((await import('node:child_process')).spawn).mockImplementation((_cmd: string, args: string[]) => {
      const allParts = [_cmd, ...(args as string[])].join(' ');
      if (allParts.includes('--version')) return makeProc('', 0) as never; // resolveCodexBin
      if (allParts.includes('exec')) {
        execCallCount++;
        if (execCallCount === 1) return makeProc('', 1) as never; // First: fail
        return makeProc(CODEX_EXEC_PONG, 0) as never; // After login: succeed
      }
      if (allParts.includes('login')) return makeProc('', origBehavior['login']?.exitCode ?? 1) as never;
      return makeProc('', 1) as never;
    });
    const { startCodexAuth } = await import('../../electron/modules/codex-auth.js');
    const result = await startCodexAuth();
    expect(result).toEqual({ ok: true, email: 'spawned@test.com' });
    expect(mockStorage.codex_chat_mode).toBe('cli');
  });
});
