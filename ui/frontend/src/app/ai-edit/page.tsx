'use client';

import { useState } from 'react';
import { Sparkles, Copy, Loader2 } from 'lucide-react';
import { aiEdit } from '@/lib/api';
import { SelectMenu } from '@/components/SelectMenu';

const commandOptions = [
  'Make this more formal',
  'Make this more casual',
  'Summarize in 3 bullet points',
  'Expand with more detail',
  'Fix grammar and spelling',
  'Convert to bullet list',
  'Translate to Spanish',
  'Custom command',
].map((option) => ({ value: option, label: option }));

const providerOptions = [
  { label: 'Use default provider', value: '' },
  { label: 'Ollama (Local)', value: 'ollama' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'Claude', value: 'claude' },
  { label: 'Gemini', value: 'gemini' },
];

export default function AIEditPage() {
  const [text, setText] = useState('');
  const [command, setCommand] = useState(commandOptions[0].value);
  const [customCommand, setCustomCommand] = useState('');
  const [provider, setProvider] = useState('');
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveCommand = command === 'Custom command' ? customCommand : command;

  const handleEdit = async () => {
    if (!text.trim() || !effectiveCommand.trim()) {
      setError('Provide text and a command');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await aiEdit({
        text,
        command: effectiveCommand,
        provider: provider || undefined,
      });
      setResult(res.text);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'AI edit failed');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
  };

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-gradient">AI Text Editing</h1>
        <p className="text-foreground-muted">
          Rewrite, summarize, translate, and clean up text with AI commands.
        </p>
      </div>

      {error && (
        <div className="glass-card p-4 border-red-500/30 bg-red-500/10 text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Command</h2>

            <SelectMenu
              label="Preset"
              value={command}
              options={commandOptions}
              onChange={setCommand}
            />

            {command === 'Custom command' && (
              <>
                <label className="label mt-4">Custom command</label>
                <input
                  className="input"
                  placeholder="Describe what to do with the text"
                  value={customCommand}
                  onChange={(e) => setCustomCommand(e.target.value)}
                />
              </>
            )}

            <SelectMenu
              label="Provider"
              value={provider}
              options={providerOptions}
              onChange={setProvider}
            />

            <button
              onClick={handleEdit}
              disabled={isLoading}
              className="btn btn-primary w-full mt-4"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Editing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Apply Command
                </>
              )}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-6 space-y-4">
            <label className="label">Original Text</label>
            <textarea
              className="input textarea min-h-[220px]"
              placeholder="Paste or type text to edit"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <label className="label">AI Output</label>
              <button
                onClick={copyToClipboard}
                disabled={!result}
                className="btn btn-secondary btn-icon"
                title="Copy output"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <textarea
              className="input textarea min-h-[220px]"
              placeholder="Edited text will appear here"
              value={result}
              onChange={(e) => setResult(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
