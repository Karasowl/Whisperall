'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Copy, Loader2 } from 'lucide-react';
import { aiEdit, ServiceProviderInfo, getProviderSelection, setProvider } from '@/lib/api';
import { SelectMenu } from '@/components/SelectMenu';
import { UnifiedProviderSelector } from '@/components/UnifiedProviderSelector';

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

export default function AIEditPage() {
  const [text, setText] = useState('');
  const [command, setCommand] = useState(commandOptions[0].value);
  const [customCommand, setCustomCommand] = useState('');
  const [provider, setProviderState] = useState('ollama');
  const [providerModel, setProviderModel] = useState('');
  const [providerConfig, setProviderConfig] = useState<Record<string, any>>({});
  const [providerInfo, setProviderInfo] = useState<ServiceProviderInfo | null>(null);
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didLoadRef = useRef(false);

  const effectiveCommand = command === 'Custom command' ? customCommand : command;

  useEffect(() => {
    async function loadProviderSelection() {
      try {
        const selection = await getProviderSelection('ai_edit');
        setProviderState(selection.selected || 'ollama');
        setProviderConfig(selection.config || {});
        setProviderModel(selection.config?.model || '');
      } catch {
        // Keep defaults if settings are missing.
      } finally {
        didLoadRef.current = true;
      }
    }
    loadProviderSelection();
  }, []);

  useEffect(() => {
    if (!providerInfo) return;
    const models = providerInfo.models || [];
    if (!models.length) return;
    const modelIds = models.map((model) => model.id);
    const fallback = providerInfo.default_model || modelIds[0];
    if (!providerModel || !modelIds.includes(providerModel)) {
      setProviderModel(providerConfig.model || fallback);
    }
  }, [providerInfo, providerModel, providerConfig.model]);

  useEffect(() => {
    if (!didLoadRef.current) return;
    if (!provider) return;
    const config = {
      ...providerConfig,
      model: providerModel || providerInfo?.default_model,
    };
    setProviderConfig(config);
    setProvider('ai_edit', provider, config).catch(() => {});
  }, [provider, providerModel]);

  const updateProvider = (nextProvider: string) => {
    setProviderState(nextProvider);
  };

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
        <p className="text-slate-400">
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
            <h2 className="text-lg font-semibold text-slate-100">Command</h2>

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

            <UnifiedProviderSelector
              service="ai_edit"
              selected={provider}
              onSelect={updateProvider}
              selectedModel={providerModel}
              onModelChange={setProviderModel}
              onProviderInfoChange={(info) => setProviderInfo(info as ServiceProviderInfo | null)}
              variant="dropdown"
              showModelSelector
              label="AI Provider"
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
