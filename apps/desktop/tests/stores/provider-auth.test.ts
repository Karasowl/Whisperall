import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockCodexAuth = vi.hoisted(() => ({
  start: vi.fn(),
  cancel: vi.fn(),
  status: vi.fn(),
  disconnect: vi.fn(),
  test: vi.fn(),
}));

const mockClaudeAuth = vi.hoisted(() => ({
  start: vi.fn(),
  exchange: vi.fn(),
  status: vi.fn(),
  disconnect: vi.fn(),
  test: vi.fn(),
}));

vi.mock('../../src/lib/electron', () => ({
  electron: { codexAuth: mockCodexAuth, claudeAuth: mockClaudeAuth },
}));

vi.mock('../../src/lib/ai-providers', () => ({
  testClaudeKey: vi.fn(),
}));

import { useProviderAuthStore } from '../../src/stores/provider-auth';
import { testClaudeKey } from '../../src/lib/ai-providers';

describe('Provider auth store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProviderAuthStore.setState({
      codexState: 'disconnected',
      codexEmail: '',
      codexError: '',
      codexLatency: null,
      claudeState: 'disconnected',
      claudeEmail: '',
      claudeError: '',
      claudeLatency: null,
      claudeAuthMode: 'oauth',
    });
  });

  it('has correct defaults', () => {
    const s = useProviderAuthStore.getState();
    expect(s.codexState).toBe('disconnected');
    expect(s.claudeState).toBe('disconnected');
    expect(s.claudeAuthMode).toBe('oauth');
  });

  // --- Codex ---

  it('connectCodex transitions to connecting then connected with auto-test', async () => {
    mockCodexAuth.start.mockResolvedValue({ ok: true, email: 'user@openai.com' });
    mockCodexAuth.test.mockResolvedValue({ ok: true, latency: 30 });
    await useProviderAuthStore.getState().connectCodex();
    const s = useProviderAuthStore.getState();
    expect(s.codexState).toBe('connected');
    expect(s.codexEmail).toBe('user@openai.com');
    expect(mockCodexAuth.test).toHaveBeenCalled();
  });

  it('connectCodex handles error', async () => {
    mockCodexAuth.start.mockResolvedValue({ ok: false, error: 'denied' });
    await useProviderAuthStore.getState().connectCodex();
    expect(useProviderAuthStore.getState().codexState).toBe('error');
    expect(useProviderAuthStore.getState().codexError).toBe('denied');
  });

  it('cancelCodex resets state', () => {
    useProviderAuthStore.setState({ codexState: 'connecting' });
    useProviderAuthStore.getState().cancelCodex();
    expect(useProviderAuthStore.getState().codexState).toBe('disconnected');
    expect(mockCodexAuth.cancel).toHaveBeenCalled();
  });

  it('disconnectCodex clears all state', async () => {
    useProviderAuthStore.setState({ codexState: 'connected', codexEmail: 'a@b.com', codexLatency: 100 });
    await useProviderAuthStore.getState().disconnectCodex();
    const s = useProviderAuthStore.getState();
    expect(s.codexState).toBe('disconnected');
    expect(s.codexEmail).toBe('');
    expect(s.codexLatency).toBeNull();
    expect(mockCodexAuth.disconnect).toHaveBeenCalled();
  });

  it('testCodex updates latency on success', async () => {
    mockCodexAuth.test.mockResolvedValue({ ok: true, latency: 42 });
    await useProviderAuthStore.getState().testCodex();
    expect(useProviderAuthStore.getState().codexLatency).toBe(42);
    expect(useProviderAuthStore.getState().codexState).toBe('connected');
  });

  it('testCodex updates error on failure', async () => {
    mockCodexAuth.test.mockResolvedValue({ ok: false, error: 'timeout' });
    await useProviderAuthStore.getState().testCodex();
    expect(useProviderAuthStore.getState().codexState).toBe('error');
    expect(useProviderAuthStore.getState().codexError).toBe('timeout');
  });

  it('testCodex normalizes CLI errors to actionable guidance', async () => {
    mockCodexAuth.test.mockResolvedValue({ ok: false, error: 'Codex CLI not available' });
    await useProviderAuthStore.getState().testCodex();
    expect(useProviderAuthStore.getState().codexState).toBe('error');
    expect(useProviderAuthStore.getState().codexError).toContain('Codex CLI');
  });

  it('loadCodexStatus reads current state and auto-tests API access', async () => {
    mockCodexAuth.status.mockResolvedValue({ connected: true, email: 'hi@test.com' });
    mockCodexAuth.test.mockResolvedValue({ ok: true, latency: 50 });
    await useProviderAuthStore.getState().loadCodexStatus();
    expect(useProviderAuthStore.getState().codexState).toBe('connected');
    expect(useProviderAuthStore.getState().codexEmail).toBe('hi@test.com');
    expect(mockCodexAuth.test).toHaveBeenCalled();
  });

  it('loadCodexStatus marks error when CLI test fails', async () => {
    mockCodexAuth.status.mockResolvedValue({ connected: true, email: 'hi@test.com' });
    mockCodexAuth.test.mockResolvedValue({ ok: false, error: 'Codex exec failed (exit 1)' });
    await useProviderAuthStore.getState().loadCodexStatus();
    expect(useProviderAuthStore.getState().codexState).toBe('error');
    expect(useProviderAuthStore.getState().codexError).toBeTruthy();
  });

  it('testCodex explains missing model scopes with concrete next step', async () => {
    mockCodexAuth.test.mockResolvedValue({ ok: false, error: 'Missing scopes: model.request' });
    await useProviderAuthStore.getState().testCodex();
    expect(useProviderAuthStore.getState().codexState).toBe('error');
    expect(useProviderAuthStore.getState().codexError).toContain('npx @openai/codex login');
  });

  it('connectCodex explains organization setup requirement', async () => {
    mockCodexAuth.start.mockResolvedValue({ ok: false, error: 'OpenAI API key exchange failed (HTTP 401): Invalid ID token: missing organization_id' });
    await useProviderAuthStore.getState().connectCodex();
    expect(useProviderAuthStore.getState().codexState).toBe('error');
    expect(useProviderAuthStore.getState().codexError).toContain('org-setup');
  });
  // --- Claude OAuth ---

  it('startClaudeAuth sets connecting and opens browser', async () => {
    mockClaudeAuth.start.mockResolvedValue({ verifier: 'abc123' });
    await useProviderAuthStore.getState().startClaudeAuth();
    expect(useProviderAuthStore.getState().claudeState).toBe('connecting');
    expect(useProviderAuthStore.getState().claudeAuthMode).toBe('oauth');
    expect(mockClaudeAuth.start).toHaveBeenCalled();
  });

  it('exchangeClaudeCode sets connected on success', async () => {
    mockClaudeAuth.exchange.mockResolvedValue({ ok: true, email: 'user@anthropic.com' });
    await useProviderAuthStore.getState().exchangeClaudeCode('code123#state456');
    const s = useProviderAuthStore.getState();
    expect(s.claudeState).toBe('connected');
    expect(s.claudeEmail).toBe('user@anthropic.com');
  });

  it('exchangeClaudeCode sets error on failure', async () => {
    mockClaudeAuth.exchange.mockResolvedValue({ ok: false, error: 'invalid code' });
    await useProviderAuthStore.getState().exchangeClaudeCode('bad-code');
    expect(useProviderAuthStore.getState().claudeState).toBe('error');
    expect(useProviderAuthStore.getState().claudeError).toBe('invalid code');
  });

  it('disconnectClaude clears all state', async () => {
    useProviderAuthStore.setState({ claudeState: 'connected', claudeEmail: 'a@b.com', claudeLatency: 100 });
    await useProviderAuthStore.getState().disconnectClaude();
    const s = useProviderAuthStore.getState();
    expect(s.claudeState).toBe('disconnected');
    expect(s.claudeEmail).toBe('');
    expect(s.claudeLatency).toBeNull();
    expect(mockClaudeAuth.disconnect).toHaveBeenCalled();
  });

  it('testClaudeOAuth updates latency on success', async () => {
    mockClaudeAuth.test.mockResolvedValue({ ok: true, latency: 55 });
    await useProviderAuthStore.getState().testClaudeOAuth();
    expect(useProviderAuthStore.getState().claudeLatency).toBe(55);
    expect(useProviderAuthStore.getState().claudeState).toBe('connected');
  });

  it('testClaudeOAuth updates error on failure', async () => {
    mockClaudeAuth.test.mockResolvedValue({ ok: false, error: 'expired' });
    await useProviderAuthStore.getState().testClaudeOAuth();
    expect(useProviderAuthStore.getState().claudeState).toBe('error');
    expect(useProviderAuthStore.getState().claudeError).toBe('expired');
  });

  // --- Claude API key fallback ---

  it('testClaudeApiKey sets connected with latency on success', async () => {
    vi.mocked(testClaudeKey).mockResolvedValue({ ok: true });
    await useProviderAuthStore.getState().testClaudeApiKey('sk-ant-test');
    expect(useProviderAuthStore.getState().claudeState).toBe('connected');
    expect(useProviderAuthStore.getState().claudeLatency).toBeGreaterThanOrEqual(0);
    expect(useProviderAuthStore.getState().claudeAuthMode).toBe('apikey');
  });

  it('testClaudeApiKey sets error on failure', async () => {
    vi.mocked(testClaudeKey).mockResolvedValue({ ok: false, error: 'invalid key' });
    await useProviderAuthStore.getState().testClaudeApiKey('sk-bad');
    expect(useProviderAuthStore.getState().claudeState).toBe('error');
    expect(useProviderAuthStore.getState().claudeError).toBe('invalid key');
  });

  it('loadClaudeStatus reads current state', async () => {
    mockClaudeAuth.status.mockResolvedValue({ connected: true, email: 'hi@claude.ai' });
    await useProviderAuthStore.getState().loadClaudeStatus();
    expect(useProviderAuthStore.getState().claudeState).toBe('connected');
    expect(useProviderAuthStore.getState().claudeEmail).toBe('hi@claude.ai');
    expect(useProviderAuthStore.getState().claudeAuthMode).toBe('oauth');
  });

  it('resetClaude clears claude state', () => {
    useProviderAuthStore.setState({ claudeState: 'connected', claudeLatency: 50 });
    useProviderAuthStore.getState().resetClaude();
    expect(useProviderAuthStore.getState().claudeState).toBe('disconnected');
    expect(useProviderAuthStore.getState().claudeLatency).toBeNull();
  });
});

