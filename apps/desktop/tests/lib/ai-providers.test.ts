import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testClaudeKey, testCodexKey } from '../../src/lib/ai-providers';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('testClaudeKey', () => {
  it('returns error for empty key', async () => {
    const result = await testClaudeKey('');
    expect(result).toEqual({ ok: false, error: 'API key is empty' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns ok on 200 response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const result = await testClaudeKey('sk-ant-valid');
    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'sk-ant-valid' }),
      }),
    );
  });

  it('returns error message from API on failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: 'Invalid API key' } }),
    });
    const result = await testClaudeKey('sk-ant-bad');
    expect(result).toEqual({ ok: false, error: 'Invalid API key' });
  });

  it('returns HTTP status when body has no error message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });
    const result = await testClaudeKey('sk-ant-bad');
    expect(result).toEqual({ ok: false, error: 'HTTP 500' });
  });

  it('handles network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));
    const result = await testClaudeKey('sk-ant-valid');
    expect(result).toEqual({ ok: false, error: 'Failed to fetch' });
  });
});

describe('testCodexKey', () => {
  it('returns error for empty key', async () => {
    const result = await testCodexKey('  ');
    expect(result).toEqual({ ok: false, error: 'API key is empty' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns ok on 200 response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const result = await testCodexKey('sk-valid');
    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-valid' }),
      }),
    );
  });

  it('returns error message from API on failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: 'Incorrect API key provided' } }),
    });
    const result = await testCodexKey('sk-bad');
    expect(result).toEqual({ ok: false, error: 'Incorrect API key provided' });
  });

  it('handles network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await testCodexKey('sk-valid');
    expect(result).toEqual({ ok: false, error: 'Network error' });
  });
});
