import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runDebateCycle } from '../../src/lib/debate-ai';
import { createDebateState } from '../../src/lib/debate-storage';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function openAiOk(text: string) {
  return {
    ok: true,
    json: async () => ({
      output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
    }),
  };
}

function claudeOk(text: string) {
  return {
    ok: true,
    json: async () => ({
      content: [{ type: 'text', text }],
    }),
  };
}

describe('debate-ai', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails when provider mode requires missing keys', async () => {
    const state = createDebateState('note-1');
    await expect(runDebateCycle({
      noteTitle: 'Draft',
      context: { source: 'full', focus: 'hello', before: '', after: '', fullLength: 5 },
      providerMode: 'both',
      subagents: state.subagents,
      rounds: 1,
      openaiKey: 'sk-openai',
      claudeKey: '',
    })).rejects.toThrow('Both OpenAI and Claude API keys are required');
  });

  it('runs in openai mode', async () => {
    const state = createDebateState('note-2');
    mockFetch
      .mockResolvedValueOnce(openAiOk('Subagent says improve heading structure'))
      .mockResolvedValueOnce(openAiOk('Principal says rewrite intro and add checklist'));
    const result = await runDebateCycle({
      noteTitle: 'Draft',
      context: { source: 'selection', focus: 'Some selected text', before: 'before', after: 'after', fullLength: 1000 },
      providerMode: 'openai',
      subagents: [state.subagents[0]],
      rounds: 1,
      openaiKey: 'sk-openai',
      claudeKey: '',
    });
    expect(result.providers).toEqual(['openai']);
    expect(result.internalTurns.length).toBe(1);
    expect(result.principalTurns.length).toBe(1);
    expect(result.curated).toContain('Principal');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('runs in combined mode and returns curated output', async () => {
    const state = createDebateState('note-3');
    mockFetch
      .mockResolvedValueOnce(openAiOk('OpenAI subagent output'))
      .mockResolvedValueOnce(claudeOk('Claude subagent output'))
      .mockResolvedValueOnce(openAiOk('OpenAI principal output'))
      .mockResolvedValueOnce(claudeOk('Claude principal output'))
      .mockResolvedValueOnce(openAiOk('Merged curated answer'));
    const result = await runDebateCycle({
      noteTitle: 'Draft',
      context: { source: 'viewport', focus: 'Visible text', before: 'left', after: 'right', fullLength: 1500 },
      providerMode: 'both',
      subagents: state.subagents.slice(0, 2),
      rounds: 1,
      openaiKey: 'sk-openai',
      claudeKey: 'sk-ant',
      priorMemory: 'Older summary',
      userPrompt: 'Focus on clarity',
    });
    expect(result.providers).toEqual(['openai', 'claude']);
    expect(result.internalTurns.length).toBe(2);
    expect(result.principalTurns.length).toBe(2);
    expect(result.curated).toBe('Merged curated answer');
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it('uses web search tool when subagent requests it', async () => {
    const state = createDebateState('note-4');
    const webSearch = vi.fn().mockResolvedValue([
      { title: 'Whisper roadmap', url: 'https://example.com/roadmap', snippet: 'Roadmap details', source: 'duckduckgo-related' },
    ]);
    mockFetch
      .mockResolvedValueOnce(openAiOk('{"tool":"web_search","query":"voice ai roadmap"}'))
      .mockResolvedValueOnce(openAiOk('Use the roadmap milestones to structure a timeline section.'))
      .mockResolvedValueOnce(openAiOk('Principal: add quarterly milestones and ownership.'));

    const result = await runDebateCycle({
      noteTitle: 'Roadmap',
      context: { source: 'viewport', focus: 'Draft roadmap notes', before: '', after: '', fullLength: 300 },
      providerMode: 'openai',
      subagents: [state.subagents[0]],
      rounds: 1,
      openaiKey: 'sk-openai',
      claudeKey: '',
      tools: {
        webSearch,
        maxToolCalls: 2,
      },
    });

    expect(webSearch).toHaveBeenCalledWith('voice ai roadmap');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.query).toBe('voice ai roadmap');
    expect(result.internalTurns[0]?.text).toContain('timeline section');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
