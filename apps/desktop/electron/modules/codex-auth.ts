import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import { readAuthStorage, writeAuthStorage } from './auth-storage.js';

const AUTH_URL = 'https://auth.openai.com/oauth/authorize';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const REDIRECT_URI = 'http://localhost:1455/auth/callback';
const SCOPES = 'openid profile email offline_access';
const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';
const ID_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:id_token';
const REQUESTED_TOKEN = 'openai-api-key';
const ORIGINATOR = 'codex_cli_rs';
const CODEX_USER_AGENT = `codex_cli_rs/0.104.0 (${process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'Mac OS' : 'Linux'}; ${process.arch})`;

// --- PKCE helpers ---

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateVerifier(): string {
  return base64url(crypto.randomBytes(96));
}

function generateChallenge(verifier: string): string {
  return base64url(crypto.createHash('sha256').update(verifier).digest());
}

function parseJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length !== 3) return {};
  const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
  try { return JSON.parse(payload); } catch { return {}; }
}

function extractString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

// --- State ---

let pendingWindow: BrowserWindow | null = null;
let pendingReject: ((err: Error) => void) | null = null;

// --- Public API ---

export type CodexAuthResult = { ok: true; email: string } | { ok: false; error: string };
export type CodexAuthStatus = { connected: boolean; email: string };
export type CodexTestResult = { ok: true; latency: number } | { ok: false; error: string };
export type CodexChatMode = 'api' | 'cli';

export async function startCodexAuth(): Promise<CodexAuthResult> {
  // Path A: Auto-connect from existing Codex CLI credentials (~/.codex/auth.json)
  const cliResult = await tryCliCredentials();
  if (cliResult) return cliResult;

  // Path B: Spawn `codex login` so the CLI handles auth with proper scopes
  const spawnOk = await spawnCodexLogin();
  if (spawnOk) {
    const afterSpawn = await tryCliCredentials();
    if (afterSpawn) return afterSpawn;
  }

  // Path C: Fall back to our OAuth window (works for API-paying customers)
  return startOAuthWindow();
}

async function startOAuthWindow(): Promise<CodexAuthResult> {
  cancelCodexAuth();

  const verifier = generateVerifier();
  const challenge = generateChallenge(verifier);
  const state = base64url(crypto.randomBytes(32));
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    originator: ORIGINATOR,
  });
  const authorizeUrl = `${AUTH_URL}?${params.toString()}`;

  return new Promise<CodexAuthResult>((resolve, reject) => {
    pendingReject = reject;
    let resolved = false;
    let inFlight = false;

    const authWindow = new BrowserWindow({
      width: 500,
      height: 700,
      title: 'Sign in with OpenAI',
      webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'openai-auth' },
    });
    pendingWindow = authWindow;

    authWindow.webContents.session.webRequest.onBeforeRequest(
      { urls: ['http://localhost:1455/auth/callback*'] },
      async (details, callback) => {
        callback({ cancel: true });
        if (resolved || inFlight) return;

        const url = new URL(details.url);
        const cbParams = parseCallbackParams(url);
        const code = cbParams.get('code');
        const returnedState = cbParams.get('state');
        const oauthError = cbParams.get('error');
        const oauthErrorDescription = cbParams.get('error_description');

        if (!code && oauthError) {
          resolved = true;
          cleanup();
          const errMsg = oauthErrorDescription ? `${oauthError}: ${oauthErrorDescription}` : oauthError;
          resolve({ ok: false, error: `OpenAI OAuth failed: ${errMsg}` });
          return;
        }

        if (!code) return; // Ignore noise (favicon, etc)

        if (returnedState !== state) {
          resolved = true;
          cleanup();
          resolve({ ok: false, error: 'Invalid callback (state mismatch)' });
          return;
        }

        inFlight = true;
        try {
          // Step 1: Exchange authorization code for tokens (always works if OAuth succeeded)
          const tokens = await exchangeCode(code, verifier);
          const idPayload = parseJwtPayload(tokens.id_token);
          const authClaim = asRecord(idPayload['https://api.openai.com/auth']) ?? {};
          const accountId = extractString(authClaim.chatgpt_account_id);
          const email = extractString(idPayload.email) || '';

          // Step 2: TRY to exchange id_token for API key (may fail for ChatGPT-only subscribers)
          let apiKey = '';
          try {
            apiKey = await exchangeForApiKey(tokens.id_token);
          } catch {
            // Intentionally ignored — access_token works as Bearer for ChatGPT subscribers
          }

          // Step 3: Persist everything
          const storage = await readAuthStorage();
          storage.codex_access_token = tokens.access_token;
          storage.codex_refresh_token = tokens.refresh_token;
          storage.codex_id_token = tokens.id_token;
          storage.codex_expires_at = String(Date.now() + tokens.expires_in * 1000);
          storage.codex_email = email;
          storage.codex_account_id = accountId;
          if (apiKey) storage.codex_api_key = apiKey;
          await writeAuthStorage(storage);

          resolved = true;
          cleanup();
          resolve({ ok: true, email });
        } catch (err) {
          resolved = true;
          cleanup();
          resolve({ ok: false, error: (err as Error).message || 'Token exchange failed' });
        } finally {
          if (!resolved) inFlight = false;
        }
      },
    );

    authWindow.on('closed', () => {
      pendingWindow = null;
      if (!resolved) {
        resolved = true;
        resolve({ ok: false, error: 'Authentication window closed' });
      }
    });

    authWindow.loadURL(authorizeUrl);
  });
}

function parseCallbackParams(url: URL): URLSearchParams {
  const merged = new URLSearchParams(url.searchParams);
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    for (const [key, value] of hashParams.entries()) {
      if (!merged.has(key)) merged.set(key, value);
    }
  }
  return merged;
}

export function cancelCodexAuth(): void {
  if (pendingReject) {
    pendingReject(new Error('Cancelled'));
    pendingReject = null;
  }
  cleanup();
}

export async function getCodexAuthStatus(): Promise<CodexAuthStatus> {
  const storage = await readAuthStorage();
  const token = storage.codex_api_key || storage.codex_access_token;
  if (token) return { connected: true, email: storage.codex_email || '' };
  // Fallback: check if Codex CLI is logged in
  const cli = await readCodexCliToken();
  if (cli) return { connected: true, email: '' };
  return { connected: false, email: '' };
}

export async function disconnectCodex(): Promise<void> {
  const storage = await readAuthStorage();
  const codexKeys = Object.keys(storage).filter((k) => k.startsWith('codex_'));
  for (const key of codexKeys) delete storage[key];
  await writeAuthStorage(storage);
}

/**
 * Test the OpenAI connection. Tries:
 * 1. Stored API key (direct REST)
 * 2. Codex CLI exec (ChatGPT Plus — only works through the CLI binary)
 */
export async function testCodexConnection(): Promise<CodexTestResult> {
  const storage = await readAuthStorage();

  // Path 1: If we have a real API key, try REST API directly
  if (storage.codex_api_key) {
    const result = await tryCodexApiCall(storage.codex_api_key);
    if (result.ok) return result;
  }

  // Path 2: Codex CLI exec — works for ChatGPT Plus subscribers
  const cliResult = await tryCodexExec();
  if (cliResult.ok) {
    // Mark connection mode for the renderer
    storage.codex_chat_mode = 'cli';
    if (!storage.codex_email) {
      const cli = await readCodexCliToken();
      if (cli) {
        const profile = asRecord(parseJwtPayload(cli.accessToken)['https://api.openai.com/profile']);
        storage.codex_email = extractString(profile?.email);
      }
    }
    await writeAuthStorage(storage);
  }
  return cliResult;
}

/** Check if Codex can make inference calls (API key or CLI installed). */
export async function codexCanInfer(): Promise<boolean> {
  const storage = await readAuthStorage();
  if (storage.codex_api_key) return true;
  return isCodexCliAvailable();
}

/**
 * Proxy a chat completion through Codex CLI exec (main process only).
 * This is the ONLY way to use ChatGPT Plus subscription credits for inference —
 * the REST API rejects ChatGPT OAuth tokens with "Missing scopes".
 */
export async function codexChat(
  system: string,
  userPrompt: string,
  maxTokens = 700,
): Promise<string> {
  const storage = await readAuthStorage();

  // If we have a real API key, use REST API directly (faster)
  if (storage.codex_api_key) {
    return codexRestChat(storage.codex_api_key, system, userPrompt, maxTokens);
  }

  // Otherwise use Codex CLI exec
  return codexExecChat(system, userPrompt);
}

// --- Internal ---

type CodexTokenResponse = {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
};

async function exchangeCode(code: string, verifier: string): Promise<CodexTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token exchange HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<CodexTokenResponse>;
}

/** Try to exchange id_token for an API key. Returns the key or throws. */
async function exchangeForApiKey(idToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: TOKEN_EXCHANGE_GRANT,
      client_id: CLIENT_ID,
      requested_token: REQUESTED_TOKEN,
      subject_token: idToken,
      subject_token_type: ID_TOKEN_TYPE,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API key exchange HTTP ${res.status}: ${text}`);
  }
  const body = await res.json() as { access_token?: string };
  const apiKey = typeof body.access_token === 'string' ? body.access_token.trim() : '';
  if (!apiKey) throw new Error('Empty API key');
  return apiKey;
}

async function refreshCodexToken(): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const storage = await readAuthStorage();
  const refreshToken = storage.codex_refresh_token;
  if (!refreshToken) return { ok: false, error: 'No refresh token' };

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }).toString(),
    });
    if (!res.ok) return { ok: false, error: `Refresh failed HTTP ${res.status}` };
    const data = await res.json() as { access_token: string; refresh_token?: string; id_token?: string; expires_in: number };
    storage.codex_access_token = data.access_token;
    if (data.refresh_token) storage.codex_refresh_token = data.refresh_token;
    if (data.id_token) storage.codex_id_token = data.id_token;
    storage.codex_expires_at = String(Date.now() + data.expires_in * 1000);
    await writeAuthStorage(storage);
    return { ok: true, token: data.access_token };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Refresh network error' };
  }
}

function cleanup(): void {
  if (pendingWindow && !pendingWindow.isDestroyed()) {
    pendingWindow.close();
  }
  pendingWindow = null;
  pendingReject = null;
}

/** Try auto-connecting from Codex CLI. Verifies with a real exec call. */
async function tryCliCredentials(): Promise<CodexAuthResult | null> {
  const cli = await readCodexCliToken();
  if (!cli) return null;
  // Verify the CLI actually works (ChatGPT Plus tokens fail REST, so use exec)
  const test = await tryCodexExec().catch(() => ({ ok: false as const, error: 'exec failed' }));
  if (!test.ok) return null;
  const storage = await readAuthStorage();
  storage.codex_chat_mode = 'cli';
  const profile = asRecord(parseJwtPayload(cli.accessToken)['https://api.openai.com/profile']);
  const email = extractString(profile?.email);
  storage.codex_email = email;
  await writeAuthStorage(storage);
  return { ok: true, email };
}

/** Spawn `codex login` so the real CLI handles auth with proper scopes. */
async function spawnCodexLogin(): Promise<boolean> {
  let binParts: string[];
  try { binParts = await resolveCodexBin(); } catch { return false; }
  const [bin, ...prefix] = binParts;

  return new Promise((resolve) => {
    const proc = spawn(bin, [...prefix, 'login'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { proc.kill(); resolve(false); }, 120_000);
    proc.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
    proc.on('error', () => { clearTimeout(timer); resolve(false); });
  });
}

/** Read Codex CLI's stored credentials from ~/.codex/auth.json */
async function readCodexCliToken(): Promise<{ accessToken: string; accountId: string } | null> {
  try {
    const authPath = path.join(os.homedir(), '.codex', 'auth.json');
    const raw = await fs.readFile(authPath, 'utf-8');
    const data = JSON.parse(raw) as {
      OPENAI_API_KEY?: string | null;
      tokens?: { access_token?: string; account_id?: string };
    };
    if (data.OPENAI_API_KEY) return { accessToken: data.OPENAI_API_KEY, accountId: '' };
    const token = data.tokens?.access_token;
    if (!token) return null;
    return { accessToken: token, accountId: data.tokens?.account_id || '' };
  } catch {
    return null;
  }
}

async function tryCodexApiCall(apiKey: string): Promise<CodexTestResult> {
  const start = Date.now();
  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': CODEX_USER_AGENT,
        originator: ORIGINATOR,
      },
      body: JSON.stringify({ model: 'gpt-4o-mini', instructions: 'Reply with one word.', input: 'ping', max_output_tokens: 8 }),
    });
    const latency = Date.now() - start;
    if (res.ok) return { ok: true, latency };
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    return { ok: false, error: body.error?.message || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Network error' };
  }
}

/** Test connection by spawning `codex exec` with a trivial prompt. */
async function tryCodexExec(): Promise<CodexTestResult> {
  const start = Date.now();
  try {
    const text = await codexExecChat('Reply with exactly the word pong.', 'ping');
    const latency = Date.now() - start;
    return text.toLowerCase().includes('pong') ? { ok: true, latency } : { ok: false, error: 'Unexpected response' };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Codex CLI not available' };
  }
}

/**
 * Resolve the codex binary — tries bare `codex` first, falls back to `npx @openai/codex`.
 * Returns [command, ...prefixArgs] array to use with spawn(cmd, [...prefixArgs, ...extraArgs]).
 */
async function resolveCodexBin(): Promise<string[]> {
  if (await spawnCheck('codex', ['--version'])) return ['codex'];
  if (await spawnCheck('npx', ['@openai/codex', '--version'])) return ['npx', '@openai/codex'];
  throw new Error('Codex CLI not available');
}

function spawnCheck(bin: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(bin, args, { shell: true, stdio: 'ignore' });
    const timer = setTimeout(() => { proc.kill(); resolve(false); }, 15_000);
    proc.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
    proc.on('error', () => { clearTimeout(timer); resolve(false); });
  });
}

/** Check if `codex` CLI is installed (without making an API call). */
async function isCodexCliAvailable(): Promise<boolean> {
  try { await resolveCodexBin(); return true; } catch { return false; }
}

/** Run a chat completion through `codex exec --json` (ChatGPT Plus credits). */
async function codexExecChat(system: string, userPrompt: string): Promise<string> {
  const prompt = `${system}\n\n---\n\n${userPrompt}`;
  const [bin, ...prefix] = await resolveCodexBin();

  return new Promise((resolve, reject) => {
    const proc = spawn(bin, [...prefix, 'exec', '--json', '--ephemeral', '-'], { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { proc.kill(); reject(new Error('Codex exec timeout')); }, 60_000);
    let stdout = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) { reject(new Error(`Codex exec failed (exit ${code})`)); return; }
      // Parse JSON lines for agent_message text
      const text = stdout.split('\n')
        .filter((line) => line.trim())
        .map((line) => { try { return JSON.parse(line); } catch { return null; } })
        .filter((msg): msg is { type: string; item?: { type?: string; text?: string } } => msg?.type === 'item.completed')
        .filter((msg) => msg.item?.type === 'agent_message')
        .map((msg) => msg.item?.text ?? '')
        .join('\n')
        .trim();
      if (!text) { reject(new Error('Codex returned empty response')); return; }
      resolve(text);
    });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

/** Direct REST API call (only works with real API keys, not ChatGPT Plus tokens). */
async function codexRestChat(apiKey: string, system: string, userPrompt: string, maxTokens: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': CODEX_USER_AGENT,
        originator: ORIGINATOR,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        instructions: system,
        input: userPrompt,
        max_output_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({})) as { output_text?: string; error?: { message?: string } };
    if (!res.ok) throw new Error(body.error?.message || `HTTP ${res.status}`);
    const text = body.output_text?.trim();
    if (!text) throw new Error('OpenAI returned empty response');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}
