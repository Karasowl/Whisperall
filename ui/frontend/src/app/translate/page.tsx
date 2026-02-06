'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Copy, Check, Languages } from 'lucide-react';
import { translateText, ServiceProviderInfo, getProviderSelection, setProvider } from '@/lib/api';
import { SelectMenu } from '@/components/SelectMenu';
import { UnifiedProviderSelector } from '@/components/UnifiedProviderSelector';
import { usePlan } from '@/components/PlanProvider';
import { useDevMode } from '@/components/DevModeProvider';
import {
  ModuleShell,
  ActionBar,
  SidebarPanel,
} from '@/components/module';

const languageOptions = [
  { value: 'auto', label: 'Auto' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
];

export default function TranslatePage() {
  const { hasPro } = usePlan();
  const { devMode } = useDevMode();
  const showEngineSelector = devMode;

  const [source, setSource] = useState('auto');
  const [target, setTarget] = useState('en');
  const [provider, setProviderState] = useState('argos');
  const [providerModel, setProviderModel] = useState('');
  const [providerConfig, setProviderConfig] = useState<Record<string, any>>({});
  const [providerInfo, setProviderInfo] = useState<ServiceProviderInfo | null>(null);
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const didLoadRef = useRef(false);
  const supportsAutoDetect = providerInfo?.supports_auto_detect !== false;
  const sourceOptions = supportsAutoDetect
    ? languageOptions
    : languageOptions.filter((option) => option.value !== 'auto');

  useEffect(() => {
    async function loadProviderSelection() {
      try {
        const selection = await getProviderSelection('translation');
        setProviderState(selection.selected || 'argos');
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
    if (supportsAutoDetect || source !== 'auto') return;
    const fallback = providerConfig.source_lang && providerConfig.source_lang !== 'auto'
      ? providerConfig.source_lang
      : 'en';
    setSource(fallback);
  }, [supportsAutoDetect, source, providerConfig.source_lang]);

  useEffect(() => {
    if (provider !== 'argos') return;
    if (source === 'auto' || !target) return;
    const nextModel = `argos-${source}-${target}`;
    if (providerModel !== nextModel) {
      setProviderModel(nextModel);
    }
  }, [provider, source, target, providerModel]);

  useEffect(() => {
    if (!didLoadRef.current) return;
    if (!provider) return;
    const config = {
      ...providerConfig,
      model: providerModel || providerInfo?.default_model,
    };
    setProviderConfig(config);
    setProvider('translation', provider, config).catch(() => {});
  }, [provider, providerModel]);

  const handleTranslate = async () => {
    if (!text.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await translateText({
        text,
        source_lang: source,
        target_lang: target,
        provider: provider || undefined,
      });
      setResult(res.text);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Translation failed');
    } finally {
      setIsLoading(false);
    }
  };

  const swapLanguages = () => {
    if (source === 'auto') return;
    const temp = source;
    setSource(target);
    setTarget(temp);
  };

  const copyToClipboard = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isReady = text.trim().length > 0;

  return (
    <ModuleShell
      title="Translation"
      description="Translate text locally with Argos or with cloud providers."
      icon={Languages}
      layout="split"
      settingsPosition="left"
      settingsTitle="Translation Settings"
      // Engine selector
      engineSelector={
        showEngineSelector ? (
          <UnifiedProviderSelector
            service="translation"
            selected={provider}
            onSelect={setProviderState}
            selectedModel={providerModel}
            onModelChange={setProviderModel}
            onProviderInfoChange={(info) => setProviderInfo(info as ServiceProviderInfo | null)}
            variant="dropdown"
            showModelSelector
            label="Translation Engine"
          />
        ) : undefined
      }
      // Settings panel (left side)
      settings={
        <>
          <SelectMenu
            label="Source Language"
            value={source}
            options={sourceOptions}
            onChange={setSource}
          />
          {!supportsAutoDetect && (
            <p className="text-xs text-foreground-muted -mt-2">
              Auto-detect is not supported by this provider.
            </p>
          )}

          <SelectMenu
            label="Target Language"
            value={target}
            options={languageOptions.filter((opt) => opt.value !== 'auto')}
            onChange={setTarget}
          />

          <button
            onClick={swapLanguages}
            disabled={source === 'auto'}
            className="btn btn-secondary w-full"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Swap Languages
          </button>
        </>
      }
      // Action button
      actions={
        <ActionBar
          primary={{
            label: 'Translate',
            icon: Languages,
            onClick: handleTranslate,
            disabled: !isReady,
          }}
          loading={isLoading}
          loadingText="Translating..."
          pulse={isReady && !isLoading}
        />
      }
      // Main content - text areas
      main={
        <div className="space-y-6 h-full flex flex-col">
          {/* Source Text */}
          <div className="glass-card p-6 space-y-4 flex-1 flex flex-col">
            <label className="label">Source Text</label>
            <textarea
              className="input textarea flex-1 min-h-[200px] resize-none"
              placeholder="Paste or type text to translate"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="text-xs text-foreground-muted text-right">
              {text.length.toLocaleString()} characters
            </div>
          </div>

          {/* Translation Output */}
          <div className="glass-card p-6 space-y-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between">
              <label className="label">Translation</label>
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
              placeholder="Translation output"
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
          title="Translation"
          description="Translate text between languages using local or cloud-based translation engines."
          icon={Languages}
          tips={[
            'Argos runs locally with no usage limits',
            'Cloud providers may offer better quality',
            'Use swap to quickly reverse direction',
            'Output is editable if you need adjustments',
          ]}
          metadata={
            showEngineSelector && providerInfo
              ? [
                  { label: 'Provider', value: providerInfo.name },
                  { label: 'Quality', value: providerModel || providerInfo.default_model || 'Default' },
                  { label: 'Direction', value: `${source === 'auto' ? 'Auto' : source.toUpperCase()} → ${target.toUpperCase()}` },
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
