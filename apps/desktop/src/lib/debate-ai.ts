import type { DebateContext } from './debate-context';
import { DEFAULT_OPENAI_MODEL, DEFAULT_CLAUDE_MODEL, type DebateProvider, type DebateProviderMode, type DebateSubagent } from './debate-storage';

type ProviderKeys = {
  openaiKey: string;
  claudeKey: string;
  openaiAccountId?: string;
};

export type DebateTurn = {
  speaker: string;
  provider: DebateProvider;
  model: string;
  text: string;
  kind: 'subagent' | 'principal';
};

export type DebateWebResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
};

export type DebateToolCall = {
  subagent: string;
  provider: DebateProvider;
  tool: 'web_search';
  query: string;
  results: DebateWebResult[];
};

export type DebateCycleParams = ProviderKeys & {
  noteTitle: string;
  context: DebateContext;
  providerMode: DebateProviderMode;
  subagents: DebateSubagent[];
  rounds: number;
  openaiModel?: string;
  claudeModel?: string;
  priorMemory?: string;
  userPrompt?: string;
  tools?: {
    webSearch?: (query: string) => Promise<DebateWebResult[]>;
    maxToolCalls?: number;
  };
  claudeProxy?: (system: string, userPrompt: string) => Promise<string>;
  codexProxy?: (system: string, userPrompt: string) => Promise<string>;
};

export type DebateCycleResult = {
  internalTurns: DebateTurn[];
  principalTurns: DebateTurn[];
  curated: string;
  providers: DebateProvider[];
  toolCalls: DebateToolCall[];
};

// Defaults imported from debate-storage.ts

function clip(input: string, max: number): string {
  const text = input.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}...`;
}

/** Parse text from OpenAI Responses API output */
function parseResponsesApiText(body: unknown): string {
  const obj = body as { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>; output_text?: string };
  // Shortcut: SDK-style output_text field
  if (typeof obj.output_text === 'string' && obj.output_text.trim()) return obj.output_text.trim();
  // Walk output items
  if (!Array.isArray(obj.output)) return '';
  const texts: string[] = [];
  for (const item of obj.output) {
    if (item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const block of item.content) {
      if (block.type === 'output_text' && block.text) texts.push(block.text);
    }
  }
  return texts.join('\n').trim();
}

function extractApiError(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const root = body as { error?: { message?: unknown }; message?: unknown; detail?: unknown };
    if (typeof root.error?.message === 'string' && root.error.message.trim()) return root.error.message.trim();
    if (typeof root.message === 'string' && root.message.trim()) return root.message.trim();
    if (typeof root.detail === 'string' && root.detail.trim()) return root.detail.trim();
  }
  return `HTTP ${status}`;
}

function getAvailableProviders(mode: DebateProviderMode, keys: ProviderKeys): DebateProvider[] {
  const hasOpenAi = !!keys.openaiKey.trim();
  const hasClaude = !!keys.claudeKey.trim();
  if (mode === 'openai') {
    if (!hasOpenAi) throw new Error('OpenAI API key is required for OpenAI mode.');
    return ['openai'];
  }
  if (mode === 'claude') {
    if (!hasClaude) throw new Error('Claude API key is required for Claude mode.');
    return ['claude'];
  }
  if (!hasOpenAi || !hasClaude) {
    throw new Error('Both OpenAI and Claude API keys are required for combined mode.');
  }
  return ['openai', 'claude'];
}

async function callOpenAi(apiKey: string, system: string, userPrompt: string, accountId?: string, model?: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
      'User-Agent': 'codex_cli_rs/0.104.0',
      originator: 'codex_cli_rs',
    };
    if (accountId?.trim()) headers['Chatgpt-Account-Id'] = accountId.trim();
    // Use Responses API + originator — required for ChatGPT subscription tokens
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model || DEFAULT_OPENAI_MODEL,
        temperature: 0.4,
        max_output_tokens: 700,
        instructions: system,
        input: userPrompt,
      }),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(extractApiError(body, res.status));
    const text = parseResponsesApiText(body);
    if (!text) throw new Error('OpenAI returned an empty response.');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function callClaude(apiKey: string, system: string, userPrompt: string, model?: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
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
        model: model || DEFAULT_CLAUDE_MODEL,
        max_tokens: 700,
        temperature: 0.4,
        system,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(extractApiError(body, res.status));
    const content = (body as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
    const text = content.filter((item) => item.type === 'text' && item.text).map((item) => item.text).join('\n').trim();
    if (!text) throw new Error('Claude returned an empty response.');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

type CallOpts = { model?: string; claudeProxy?: (s: string, u: string) => Promise<string>; codexProxy?: (s: string, u: string) => Promise<string> };

async function callProvider(provider: DebateProvider, keys: ProviderKeys, system: string, prompt: string, opts?: CallOpts): Promise<string> {
  if (provider === 'openai') {
    if (opts?.codexProxy) return opts.codexProxy(system, prompt);
    return callOpenAi(keys.openaiKey, system, prompt, keys.openaiAccountId, opts?.model);
  }
  if (opts?.claudeProxy) return opts.claudeProxy(system, prompt);
  return callClaude(keys.claudeKey, system, prompt, opts?.model);
}

function pickProvider(subagent: DebateSubagent, available: DebateProvider[], index: number): DebateProvider {
  if (subagent.provider === 'openai' && available.includes('openai')) return 'openai';
  if (subagent.provider === 'claude' && available.includes('claude')) return 'claude';
  return available[index % available.length];
}

function contextSummary(context: DebateContext): string {
  return [
    `Scope: ${context.source}`,
    `Focus:\n${clip(context.focus, 2500) || '(empty)'}`,
    context.before ? `Before:\n${clip(context.before, 1200)}` : '',
    context.after ? `After:\n${clip(context.after, 1200)}` : '',
    `Total note size: ${context.fullLength} chars`,
  ].filter(Boolean).join('\n\n');
}

function internalTranscript(turns: DebateTurn[]): string {
  if (turns.length === 0) return '(no previous turns)';
  return turns.slice(-12).map((turn) => `[${turn.provider}] ${turn.speaker}: ${clip(turn.text, 280)}`).join('\n');
}

function toolResultsSummary(results: DebateWebResult[]): string {
  if (!results.length) return 'No results.';
  return results
    .slice(0, 6)
    .map((res, idx) => `${idx + 1}. ${clip(res.title, 120)}\nURL: ${res.url}\nSnippet: ${clip(res.snippet, 220)}`)
    .join('\n\n');
}

function parseToolRequest(text: string): { query: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const candidates: string[] = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { tool?: unknown; action?: unknown; query?: unknown };
      const toolName = typeof parsed.tool === 'string' ? parsed.tool : typeof parsed.action === 'string' ? parsed.action : '';
      const query = typeof parsed.query === 'string' ? parsed.query.trim() : '';
      if (!query) continue;
      if (toolName === 'web_search' || toolName === 'search_web' || toolName === 'search') {
        return { query: clip(query, 200) };
      }
    } catch {
      // ignore malformed json
    }
  }
  return null;
}

export function providerLabel(provider: DebateProvider): string {
  return provider === 'openai' ? 'OpenAI Principal' : 'Claude Principal';
}

export async function runDebateCycle(params: DebateCycleParams): Promise<DebateCycleResult> {
  const providers = getAvailableProviders(params.providerMode, { openaiKey: params.openaiKey, claudeKey: params.claudeKey });
  const subagents = params.subagents.filter((sub) => sub.enabled && sub.name.trim() && sub.prompt.trim());
  const fallbackSubagent: DebateSubagent = {
    id: 'fallback',
    name: 'General Reviewer',
    prompt: 'Provide practical improvements and identify one risk.',
    provider: 'auto',
    critical: false,
    enabled: true,
  };
  const workingSubagents = subagents.length > 0
    ? subagents
    : [fallbackSubagent];
  const rounds = Math.max(1, Math.min(6, Math.round(params.rounds || 1)));
  const context = contextSummary(params.context);
  const internalTurns: DebateTurn[] = [];
  const toolCalls: DebateToolCall[] = [];
  const toolBudget = Math.max(0, Math.min(12, Math.round(params.tools?.maxToolCalls ?? 3)));
  const oaiModel = params.openaiModel || DEFAULT_OPENAI_MODEL;
  const clModel = params.claudeModel || DEFAULT_CLAUDE_MODEL;
  const modelFor = (p: DebateProvider) => p === 'openai' ? oaiModel : clModel;

  const baseRules = [
    'IMPORTANT: Always respond in the same language as the note content.',
    'IMPORTANT: Respect the author\'s voice, intent, and viewpoint. Your job is to help them express their ideas MORE clearly and persuasively, NOT to challenge or change their position.',
  ].join('\n');

  for (let round = 0; round < rounds; round += 1) {
    for (let i = 0; i < workingSubagents.length; i += 1) {
      const sub = workingSubagents[i];
      const provider = pickProvider(sub, providers, round + i);
      const opts: CallOpts = { model: modelFor(provider), claudeProxy: params.claudeProxy, codexProxy: params.codexProxy };
      const system = [
        `You are ${sub.name}, a writing assistant helping improve a note.`,
        sub.critical
          ? 'Your style is rigorous: find weak spots in the argument\'s logic or rhetoric so the author can strengthen them. Do NOT argue against the author\'s position.'
          : 'Your style is constructive: propose clearer structure, stronger phrasing, and better flow.',
        `Primary mission: ${sub.prompt}`,
        'Tool option: if web search is strictly needed, return ONLY JSON: {"tool":"web_search","query":"..."}',
        'If no tool is needed, respond directly with your recommendation.',
        'Keep output short, concrete, and actionable. Max 110 words.',
        baseRules,
      ].join('\n');
      const prompt = [
        `Note title: ${params.noteTitle || 'Untitled'}`,
        params.userPrompt?.trim() ? `User instruction: ${params.userPrompt.trim()}` : '',
        params.priorMemory?.trim() ? `Chat memory:\n${clip(params.priorMemory, 2600)}` : '',
        `Debate history:\n${internalTranscript(internalTurns)}`,
        `Round ${round + 1}/${rounds}.`,
        context,
      ].filter(Boolean).join('\n\n');
      let text = await callProvider(provider, params, system, prompt, opts);
      const toolReq = parseToolRequest(text);
      if (
        toolReq
        && params.tools?.webSearch
        && toolCalls.length < toolBudget
      ) {
        const results = await params.tools.webSearch(toolReq.query).catch(() => []);
        toolCalls.push({
          subagent: sub.name,
          provider,
          tool: 'web_search',
          query: toolReq.query,
          results,
        });
        const followSystem = [
          `You are ${sub.name}.`,
          'You requested a tool. Use the returned results and produce a concrete recommendation now.',
          'Do not request another tool in this reply.',
          'Keep output short, concrete, and actionable. Max 120 words.',
          baseRules,
        ].join('\n');
        const followPrompt = [
          `Tool results for query "${toolReq.query}":`,
          toolResultsSummary(results),
          '',
          `Context:\n${context}`,
          `Debate history:\n${internalTranscript(internalTurns)}`,
        ].join('\n');
        text = await callProvider(provider, params, followSystem, followPrompt, opts);
      }
      internalTurns.push({ speaker: sub.name, provider, model: modelFor(provider), text, kind: 'subagent' });
    }
  }

  const principalTurns: DebateTurn[] = [];
  for (const provider of providers) {
    const opts: CallOpts = { model: modelFor(provider), claudeProxy: params.claudeProxy, codexProxy: params.codexProxy };
    const system = [
      `You are ${providerLabel(provider)}, a writing assistant.`,
      'You receive internal review notes. Deliver one concise recommendation to help the author improve their note.',
      'Respect the author\'s voice and intent. Help them say what THEY want to say, better.',
      'Structure output as: 1) Best improvement, 2) Why it strengthens the note, 3) Suggested edit.',
      'Optional: include one JSON code block with an edit command.',
      'If action is insert or append, include target placement so the UI knows where to apply it.',
      'Format: {"action":"insert|replace_selection|append","text":"...","target":{"position":"start|end|before_match|after_match","match":"exact short snippet already present in the note when needed"}}',
      'The suggested text MUST preserve the author\'s original meaning and tone.',
      baseRules,
    ].join('\n');
    const prompt = [
      `Note title: ${params.noteTitle || 'Untitled'}`,
      params.userPrompt?.trim() ? `User instruction: ${params.userPrompt.trim()}` : '',
      `Context:\n${context}`,
      `Internal debate:\n${internalTranscript(internalTurns)}`,
    ].join('\n\n');
    const text = await callProvider(provider, params, system, prompt, opts);
    principalTurns.push({ speaker: providerLabel(provider), provider, model: modelFor(provider), text, kind: 'principal' });
  }

  let curated = principalTurns[0]?.text ?? '';
  if (principalTurns.length > 1) {
    try {
      const system = `You are a curator. Merge both suggestions into one coherent final answer. Preserve the author's voice and intent. If you include a JSON edit command, keep a single final command and preserve any target placement fields. ${baseRules}`;
      const prompt = [
        'Principal output A:',
        principalTurns[0].text,
        '',
        'Principal output B:',
        principalTurns[1].text,
        '',
        'Return one final answer only.',
      ].join('\n');
      curated = await callProvider(providers[0], params, system, prompt, { model: modelFor(providers[0]), claudeProxy: params.claudeProxy, codexProxy: params.codexProxy });
    } catch {
      curated = `${principalTurns[0].text}\n\n${principalTurns[1].text}`;
    }
  }

  return {
    internalTurns,
    principalTurns,
    curated: clip(curated, 8000),
    providers,
    toolCalls,
  };
}
