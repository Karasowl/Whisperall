/** Test Anthropic (Claude) and OpenAI (Codex) API keys with a minimal request. */

export type TestResult = { ok: true } | { ok: false; error: string };

export async function testClaudeKey(apiKey: string): Promise<TestResult> {
  if (!apiKey.trim()) return { ok: false, error: 'API key is empty' };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({}));
    const msg = (body as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`;
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Network error' };
  }
}

export async function testCodexKey(apiKey: string): Promise<TestResult> {
  if (!apiKey.trim()) return { ok: false, error: 'API key is empty' };
  try {
    // Use Responses API + originator — required for ChatGPT subscription tokens
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'User-Agent': 'codex_cli_rs/0.104.0',
        originator: 'codex_cli_rs',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        instructions: 'Reply with one word.',
        input: 'ping',
        max_output_tokens: 8,
      }),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({}));
    const msg = (body as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`;
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Network error' };
  }
}
