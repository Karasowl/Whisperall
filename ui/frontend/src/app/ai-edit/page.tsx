'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Copy, Check, Wand2 } from 'lucide-react';
import { aiEdit, ServiceProviderInfo, getProviderSelection, setProvider } from '@/lib/api';
import { SelectMenu } from '@/components/SelectMenu';
import { UnifiedProviderSelector } from '@/components/UnifiedProviderSelector';
import {
  ModuleShell,
  ActionBar,
  SidebarPanel,
} from '@/components/module';

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
  const [copied, setCopied] = useState(false);
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isReady = text.trim().length > 0 && effectiveCommand.trim().length > 0;

  return (
    <ModuleShell
      title="AI Text Editing"
      description="Rewrite, summarize, translate, and clean up text with AI commands."
      icon={Wand2}
      layout="split"
      settingsPosition="left"
      settingsTitle="Command Settings"
      // Engine selector
      engineSelector={
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
      }
      // Settings panel (left side)
      settings={
        <>
          <SelectMenu
            label="Command Preset"
            value={command}
            options={commandOptions}
            onChange={setCommand}
          />

          {command === 'Custom command' && (
            <div className="space-y-1.5">
              <label className="label">Custom Command</label>
              <input
                className="input"
                placeholder="Describe what to do with the text"
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
              />
            </div>
          )}
        </>
      }
      // Action button
      actions={
        <ActionBar
          primary={{
            label: 'Apply Command',
            icon: Sparkles,
            onClick: handleEdit,
            disabled: !isReady,
          }}
          loading={isLoading}
          loadingText="Editing..."
          pulse={isReady && !isLoading}
        />
      }
      // Main content - text areas
      main={
        <div className="space-y-6 h-full flex flex-col">
          {/* Original Text */}
          <div className="glass-card p-6 space-y-4 flex-1 flex flex-col">
            <label className="label">Original Text</label>
            <textarea
              className="input textarea flex-1 min-h-[200px] resize-none"
              placeholder="Paste or type text to edit"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="text-xs text-foreground-muted text-right">
              {text.length.toLocaleString()} characters
            </div>
          </div>

          {/* AI Output */}
          <div className="glass-card p-6 space-y-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between">
              <label className="label">AI Output</label>
              <button
                onClick={copyToClipboard}
                disabled={!result}
                className={`p-2 rounded-lg transition-colors ${
                  copied
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : 'text-foreground-muted hover:text-foreground hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
                title={copied ? 'Copied!' : 'Copy to clipboard'}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <textarea
              className="input textarea flex-1 min-h-[200px] resize-none"
              placeholder="Edited text will appear here"
              value={result}
              onChange={(e) => setResult(e.target.value)}
            />
            {result && (
              <div className="text-xs text-foreground-muted text-right">
                {result.length.toLocaleString()} characters
              </div>
            )}
          </div>
        </div>
      }
      // Sidebar with tips
      sidebar={
        <SidebarPanel
          title="Text Transformation"
          description="Use AI to transform your text with preset commands or custom instructions."
          icon={Wand2}
          tips={[
            'Use preset commands for quick transformations',
            'Custom commands allow any text instruction',
            'Output is editable if you need adjustments',
            'Copy result directly to clipboard',
          ]}
          metadata={
            providerInfo
              ? [
                  { label: 'Provider', value: providerInfo.name },
                  { label: 'Model', value: providerModel || providerInfo.default_model || 'Default' },
                ]
              : undefined
          }
        />
      }
      // Error handling
      error={error}
      onErrorDismiss={() => setError(null)}
    />
  );
}
