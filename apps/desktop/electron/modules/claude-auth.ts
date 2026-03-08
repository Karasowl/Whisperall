import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { shell } from 'electron';
import { readAuthStorage, writeAuthStorage } from './auth-storage.js';

const AUTH_URL = 'https://claude.ai/oauth/authorize';
const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
const SCOPES = 'org:create_api_key user:profile user:inference';

// --- PKCE helpers ---

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateVerifier(): string {
  return base64url(crypto.randomBytes(32));
}

function generateChallenge(verifier: string): string {
  return base64url(crypto.createHash('sha256').update(verifier).digest());
}

// --- State ---

let pendingVerifier: string | null = null;

// --- Public API ---

export type ClaudeAuthResult = { ok: true; email: string } | { ok: false; error: string };
export type ClaudeAuthStatus = { connected: boolean; email: string };
export type ClaudeTestResult = { ok: true; latency: number } | { ok: false; error: string };

/** Step 1: Open browser for Claude OAuth. Returns the verifier for step 2. */
export function startClaudeAuth(): { verifier: string } {
  const verifier = generateVerifier();
  const challenge = generateChallenge(verifier);
  pendingVerifier = verifier;

  const params = new URLSearchParams({
    code: 'true',
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: verifier,
  });
  shell.openExternal(`${AUTH_URL}?${params.toString()}`);
  return { verifier };
}

/** Step 2: Exchange the code#state string the user copied from the browser. */
export async function exchangeClaudeCode(codeWithState: string): Promise<ClaudeAuthResult> {
  const parts = codeWithState.trim().split('#');
  const authCode = parts[0];
  const state = parts[1] || '';

  if (!authCode) return { ok: false, error: 'Empty authorization code' };

  const verifier = pendingVerifier || state;
  pendingVerifier = null;

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: authCode,
        state,
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `Token exchange failed (HTTP ${res.status}): ${text.slice(0, 200)}` };
    }
    const data = await res.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      user?: { email?: string };
    };

    const storage = await readAuthStorage();
    storage.claude_access_token = data.access_token;
    storage.claude_refresh_token = data.refresh_token;
    storage.claude_expires_at = String(Date.now() + data.expires_in * 1000);
    const email = data.user?.email || '';
    storage.claude_email = email;

    // Bootstrap: create a permanent API key from the OAuth token
    const keyResult = await createApiKeyFromOAuth(data.access_token);
    if (keyResult.ok) storage.claude_api_key = keyResult.apiKey;
    await writeAuthStorage(storage);

    return { ok: true, email };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Token exchange failed' };
  }
}

export async function getClaudeAuthStatus(): Promise<ClaudeAuthStatus> {
  const storage = await readAuthStorage();
  const token = storage.claude_access_token;
  if (!token) return { connected: false, email: '' };
  return { connected: true, email: storage.claude_email || '' };
}

export async function disconnectClaude(): Promise<void> {
  const storage = await readAuthStorage();
  const keys = Object.keys(storage).filter((k) => k.startsWith('claude_'));
  for (const key of keys) delete storage[key];
  await writeAuthStorage(storage);
}

export async function testClaudeConnection(): Promise<ClaudeTestResult> {
  const storage = await readAuthStorage();

  // Path A: we already have a bootstrapped API key — test with inference
  if (storage.claude_api_key) {
    return testWithApiKey(storage.claude_api_key);
  }

  // Path B: try to bootstrap an API key from the OAuth token
  const token = storage.claude_access_token;
  if (!token) return { ok: false, error: 'Not connected' };

  // Refresh OAuth token if expired
  const expiresAt = Number(storage.claude_expires_at || 0);
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    const refreshed = await refreshClaudeToken();
    if (!refreshed.ok) return { ok: false, error: refreshed.error };
  }

  const latest = await readAuthStorage();
  const keyResult = await createApiKeyFromOAuth(latest.claude_access_token);
  if (keyResult.ok) {
    latest.claude_api_key = keyResult.apiKey;
    await writeAuthStorage(latest);
    return testWithApiKey(keyResult.apiKey);
  }

  // Path C: API key creation blocked — validate via token refresh
  const start = Date.now();
  const refreshResult = await refreshClaudeToken();
  const latency = Date.now() - start;
  if (refreshResult.ok) return { ok: true, latency };
  // Token exists but can't refresh — check if still within expiry
  const currentExpiry = Number(latest.claude_expires_at || 0);
  if (Date.now() < currentExpiry) return { ok: true, latency: 0 };
  return { ok: false, error: 'Token expired and refresh failed' };
}

/** Read Claude Code's stored OAuth token (authorized for inference via Max subscription). */
async function readClaudeCodeToken(): Promise<string | null> {
  try {
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    const raw = await fs.readFile(credPath, 'utf-8');
    const data = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string; expiresAt?: number } };
    const oauth = data?.claudeAiOauth;
    if (!oauth?.accessToken) return null;
    if (oauth.expiresAt && Date.now() > oauth.expiresAt) return null;
    return oauth.accessToken;
  } catch {
    return null;
  }
}

/** Check if any Claude inference method is available (API key or Claude Code token). */
export async function claudeCanInfer(): Promise<boolean> {
  const storage = await readAuthStorage();
  if (storage.claude_api_key) return true;
  const ccToken = await readClaudeCodeToken();
  return !!ccToken;
}

/** Proxy a Claude chat completion from the main process (no CORS restrictions). */
export async function claudeChat(
  system: string,
  userPrompt: string,
  model = 'claude-haiku-4-5-20251001',
  maxTokens = 700,
  temperature = 0.4,
): Promise<string> {
  const storage = await readAuthStorage();
  const apiKey = storage.claude_api_key;

  // Fallback: use Claude Code's stored token (authorized for inference)
  const ccToken = !apiKey ? await readClaudeCodeToken() : null;
  const authKey = apiKey || ccToken;
  if (!authKey) throw new Error('No Claude API key available. Install Claude Code and sign in, or add an API key from console.anthropic.com.');

  const isOAuthToken = authKey.startsWith('sk-ant-oat');
  const headers: Record<string, string> = {
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  };
  if (isOAuthToken) {
    // OAuth tokens require Bearer auth + beta header (same as Claude Code)
    headers['Authorization'] = `Bearer ${authKey}`;
    headers['anthropic-beta'] = 'oauth-2025-04-20';
  } else {
    headers['x-api-key'] = authKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature, system, messages: [{ role: 'user', content: userPrompt }] }),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({})) as { error?: { message?: string }; content?: Array<{ type?: string; text?: string }> };
    if (!res.ok) throw new Error(body.error?.message || `HTTP ${res.status}`);
    const text = (body.content ?? []).filter((c) => c.type === 'text' && c.text).map((c) => c.text).join('\n').trim();
    if (!text) throw new Error('Claude returned an empty response');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

// --- Internal ---

async function testWithApiKey(apiKey: string): Promise<ClaudeTestResult> {
  const start = Date.now();
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    const latency = Date.now() - start;
    if (res.ok) return { ok: true, latency };
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    return { ok: false, error: body.error?.message || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Network error' };
  }
}

async function createApiKeyFromOAuth(oauthToken: string): Promise<{ ok: true; apiKey: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('https://api.anthropic.com/api/oauth/claude_cli/create_api_key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oauthToken}`,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `Create API key failed (HTTP ${res.status}): ${text.slice(0, 200)}` };
    }
    const data = await res.json() as { raw_key?: string };
    if (!data.raw_key) return { ok: false, error: 'No API key in response' };
    return { ok: true, apiKey: data.raw_key };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'API key creation failed' };
  }
}

async function refreshClaudeToken(): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const storage = await readAuthStorage();
  const refreshToken = storage.claude_refresh_token;
  if (!refreshToken) return { ok: false, error: 'No refresh token' };

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }),
    });
    if (!res.ok) return { ok: false, error: `Refresh failed HTTP ${res.status}` };
    const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
    storage.claude_access_token = data.access_token;
    if (data.refresh_token) storage.claude_refresh_token = data.refresh_token;
    storage.claude_expires_at = String(Date.now() + data.expires_in * 1000);
    await writeAuthStorage(storage);
    return { ok: true, token: data.access_token };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Refresh error' };
  }
}
