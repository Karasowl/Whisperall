'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Copy, Loader2 } from 'lucide-react';
import { translateText, ServiceProviderInfo, getProviderSelection, setProvider } from '@/lib/api';
import { SelectMenu } from '@/components/SelectMenu';
import { UnifiedProviderSelector } from '@/components/UnifiedProviderSelector';

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
  };

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-gradient">Translation</h1>
        <p className="text-slate-400">
          Translate text locally with Argos or with cloud providers.
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
            <h2 className="text-lg font-semibold text-slate-100">Translation Settings</h2>

            <SelectMenu
              label="Source"
              value={source}
              options={sourceOptions}
              onChange={setSource}
            />
            {!supportsAutoDetect && (
              <p className="text-xs text-slate-400">
                Auto-detect is not supported by this provider.
              </p>
            )}

            <SelectMenu
              label="Target"
              value={target}
              options={languageOptions.filter((opt) => opt.value !== 'auto')}
              onChange={setTarget}
            />

            <button onClick={swapLanguages} className="btn btn-secondary w-full">
              <ArrowRightLeft className="w-4 h-4" />
              Swap Languages
            </button>

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

            <button onClick={handleTranslate} className="btn btn-primary w-full mt-4" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Translating...
                </>
              ) : (
                'Translate'
              )}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-6 space-y-4">
            <label className="label">Source Text</label>
            <textarea
              className="input textarea min-h-[200px]"
              placeholder="Paste or type text to translate"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <label className="label">Translation</label>
              <button
                onClick={copyToClipboard}
                className="btn btn-secondary btn-icon"
                title="Copy translation"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <textarea
              className="input textarea min-h-[200px]"
              placeholder="Translation output"
              value={result}
              onChange={(e) => setResult(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
