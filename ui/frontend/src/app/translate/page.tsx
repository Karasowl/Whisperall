'use client';

import { useState } from 'react';
import { ArrowRightLeft, Copy, Loader2 } from 'lucide-react';
import { translateText } from '@/lib/api';
import { SelectMenu } from '@/components/SelectMenu';

const languageOptions = [
  { value: 'auto', label: 'Auto' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
];

const providerOptions = [
  { value: '', label: 'Use default provider' },
  { value: 'argos', label: 'Argos (Local)' },
  { value: 'deepl', label: 'DeepL' },
  { value: 'google', label: 'Google Translate' },
];

export default function TranslatePage() {
  const [source, setSource] = useState('auto');
  const [target, setTarget] = useState('en');
  const [provider, setProvider] = useState('');
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <p className="text-foreground-muted">
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
            <h2 className="text-lg font-semibold text-foreground">Translation Settings</h2>

            <SelectMenu
              label="Source"
              value={source}
              options={languageOptions}
              onChange={setSource}
            />

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

            <SelectMenu
              label="Provider"
              value={provider}
              options={providerOptions}
              onChange={setProvider}
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
