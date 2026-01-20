'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clipboard, Loader2, Play } from 'lucide-react';
import { readerSpeak, getAudioUrl, ServiceProviderInfo, getProviderSelection, setProvider, getTTSProvider, TTSProviderInfo } from '@/lib/api';
import { AudioPlayer } from '@/components/AudioPlayer';
import { SelectMenu } from '@/components/SelectMenu';
import { DeviceToggle } from '@/components/DeviceToggle';
import { UnifiedProviderSelector } from '@/components/UnifiedProviderSelector';
import { PresetVoiceSelector } from '@/components/PresetVoiceSelector';
import { AdvancedSettings, getDefaultParamValues } from '@/components/AdvancedSettings';

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  'en-us': 'English (US)',
  'en-gb': 'English (UK)',
  hi: 'Hindi',
};

export default function ReaderPage() {
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('en');
  const [autoRead, setAutoRead] = useState(false);
  const [skipUrls, setSkipUrls] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ url: string; filename: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Device settings
  const [device, setDevice] = useState<'auto' | 'cuda' | 'cpu'>('auto');
  const [fastMode, setFastMode] = useState(false);

  // Provider settings
  const [provider, setProviderState] = useState('chatterbox');
  const [providerInfo, setProviderInfo] = useState<ServiceProviderInfo | null>(null);
  const [ttsProviderInfo, setTtsProviderInfo] = useState<TTSProviderInfo | null>(null);
  const [providerConfig, setProviderConfig] = useState<Record<string, any>>({});
  const [model, setModel] = useState('multilingual');
  const [presetVoiceId, setPresetVoiceId] = useState<string | null>(null);
  const [advancedSettings, setAdvancedSettings] = useState<Record<string, number | string | boolean>>({
    speed: 1.0,
  });
  const didLoadRef = useRef(false);

  const lastClipboardRef = useRef('');

  const handleSpeak = useCallback(async (overrideText?: string) => {
    const input = (overrideText ?? text).trim();
    if (!input) return;
    if (skipUrls && /https?:\/\//i.test(input)) {
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const res = await readerSpeak({
        text: input,
        language,
        voice: presetVoiceId || undefined,
        speed: (advancedSettings.speed as number) ?? 1.0,
        device: device !== 'auto' ? device : undefined,
        fast_mode: fastMode,
        ...advancedSettings,
      });
      setResult({
        url: getAudioUrl(res.output_url),
        filename: res.filename,
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to synthesize audio');
    } finally {
      setIsLoading(false);
    }
  }, [advancedSettings, device, fastMode, language, presetVoiceId, skipUrls, text]);

  const readClipboard = useCallback(async () => {
    try {
      const clip = window.electronAPI?.readClipboard
        ? await window.electronAPI.readClipboard()
        : await navigator.clipboard.readText();
      if (clip) {
        setText(clip);
        await handleSpeak(clip);
      }
    } catch (err: any) {
      setError(err.message || 'Clipboard access failed');
    }
  }, [handleSpeak]);

  useEffect(() => {
    if (!autoRead) return;
    const interval = setInterval(async () => {
      try {
        const clip = window.electronAPI?.readClipboard
          ? await window.electronAPI.readClipboard()
          : await navigator.clipboard.readText();
        if (!clip || clip === lastClipboardRef.current) {
          return;
        }
        lastClipboardRef.current = clip;
        setText(clip);
        await handleSpeak(clip);
      } catch {
        // Ignore clipboard polling errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [autoRead, handleSpeak]);

  useEffect(() => {
    const handler = (event: Event) => {
      const action = (event as CustomEvent).detail;
      if (action === 'read-clipboard') {
        readClipboard();
      }
    };
    window.addEventListener('hotkey-action', handler as EventListener);
    return () => window.removeEventListener('hotkey-action', handler as EventListener);
  }, [readClipboard]);

  const languageOptions = useMemo(() => {
    const fallback = ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko'];
    const source = ttsProviderInfo?.supported_languages?.length
      ? ttsProviderInfo.supported_languages
      : fallback;
    return source.map((code) => ({
      value: code,
      label: LANGUAGE_LABELS[code] || code.toUpperCase(),
    }));
  }, [ttsProviderInfo?.supported_languages]);

  useEffect(() => {
    if (provider === 'chatterbox' && model !== 'multilingual' && language !== 'en') {
      setLanguage('en');
    }
  }, [provider, model, language]);

  useEffect(() => {
    const values = languageOptions.map((option) => option.value);
    if (values.length && !values.includes(language)) {
      setLanguage(values[0]);
    }
  }, [languageOptions, language]);

  // Load provider selection from settings
  useEffect(() => {
    async function loadProviderSelection() {
      try {
        const selection = await getProviderSelection('tts');
        setProviderState(selection.selected || 'chatterbox');
        setProviderConfig(selection.config || {});
        if (selection.config?.model) {
          setModel(selection.config.model);
        }
        if (selection.config?.preset_voice_id) {
          setPresetVoiceId(selection.config.preset_voice_id);
        }
      } catch {
        // Keep defaults if settings are missing.
      } finally {
        didLoadRef.current = true;
      }
    }
    loadProviderSelection();
  }, []);

  // Update advanced settings when provider changes
  useEffect(() => {
    if (ttsProviderInfo?.extra_params) {
      const defaults = getDefaultParamValues(ttsProviderInfo.extra_params);
      setAdvancedSettings(prev => ({
        speed: prev.speed ?? 1.0,
        ...defaults,
      }));
    }
  }, [ttsProviderInfo?.id]);

  // Persist provider selection
  useEffect(() => {
    if (!didLoadRef.current) return;
    if (!provider) return;
    const nextConfig = {
      ...providerConfig,
      model,
      preset_voice_id: presetVoiceId || undefined,
    };
    setProviderConfig(nextConfig);
    setProvider('tts', provider, nextConfig).catch(() => {});

    async function loadTtsProviderInfo() {
      try {
        const info = await getTTSProvider(provider);
        setTtsProviderInfo(info);
        if (info.models?.length) {
          const modelIds = info.models.map((m: any) => (typeof m === 'string' ? m : m.id));
          if (!model || !modelIds.includes(model)) {
            setModel(info.default_model || modelIds[0]);
          }
        }
        if (presetVoiceId && info.preset_voices?.length) {
          const voiceIds = info.preset_voices.map((v: any) => v.id);
          if (!voiceIds.includes(presetVoiceId)) {
            setPresetVoiceId(null);
          }
        }
      } catch {
        setTtsProviderInfo(null);
      }
    }
    loadTtsProviderInfo();
  }, [provider, model, presetVoiceId]);

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-4xl font-bold text-gradient">Real-time Reader</h1>
          <DeviceToggle
            value={device}
            onChange={setDevice}
            showFastMode
            fastMode={fastMode}
            onFastModeChange={setFastMode}
          />
        </div>
        <p className="text-slate-400">
          Read clipboard text or paste content and generate audio instantly.
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
            <h2 className="text-lg font-semibold text-slate-100">Reader Controls</h2>

            <UnifiedProviderSelector
              service="tts"
              selected={provider}
              onSelect={setProviderState}
              selectedModel={model}
              onModelChange={setModel}
              onProviderInfoChange={(info) => {
                setProviderInfo(info as ServiceProviderInfo | null);
                setTtsProviderInfo(info as TTSProviderInfo | null);
              }}
              variant="dropdown"
              showModelSelector
              label="TTS Engine"
            />

            {/* Show PresetVoiceSelector for providers with preset voices */}
            {(ttsProviderInfo?.voice_cloning === 'none' ||
              (ttsProviderInfo?.preset_voices?.length ?? 0) > 0 ||
              ['openai-tts', 'elevenlabs', 'fishaudio', 'cartesia', 'playht', 'siliconflow', 'minimax', 'zyphra', 'narilabs', 'kokoro', 'dia'].includes(provider)
            ) && (
              <PresetVoiceSelector
                providerId={provider}
                selected={presetVoiceId}
                onSelect={setPresetVoiceId}
                language={language}
              />
            )}

            {/* Language selector - hidden for single-language providers or language-specific models */}
            {(() => {
              const modelImpliesLang = /spanish|espanol|es[-_]|[-_]es/i.test(model);
              const hideLanguageSelector = languageOptions.length <= 1 || modelImpliesLang;
              if (hideLanguageSelector) return null;
              return (
                <SelectMenu
                  label="Language"
                  value={language}
                  options={languageOptions}
                  onChange={setLanguage}
                  disabled={provider === 'chatterbox' && model !== 'multilingual'}
                />
              );
            })()}

            {/* Advanced Settings with dynamic params */}
            <AdvancedSettings
              settings={advancedSettings}
              onChange={(key, value) => setAdvancedSettings(prev => ({ ...prev, [key]: value }))}
              extraParams={ttsProviderInfo?.extra_params}
              dynamicOnly={provider !== 'chatterbox'}
            />

            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-slate-400">Auto-read clipboard</span>
              <button
                onClick={() => setAutoRead(!autoRead)}
                className={`w-12 h-7 rounded-full transition-colors relative ${autoRead ? 'bg-emerald-500' : 'bg-white/10'}`}
              >
                <span
                  className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${autoRead ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Skip URLs</span>
              <button
                onClick={() => setSkipUrls(!skipUrls)}
                className={`w-12 h-7 rounded-full transition-colors relative ${skipUrls ? 'bg-emerald-500' : 'bg-white/10'}`}
              >
                <span
                  className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${skipUrls ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </div>

            <div className="flex flex-col gap-2 mt-4">
              <button onClick={() => handleSpeak()} className="btn btn-primary">
                <Play className="w-4 h-4" />
                Read Text
              </button>
              <button onClick={readClipboard} className="btn btn-secondary">
                <Clipboard className="w-4 h-4" />
                Read Clipboard
              </button>
            </div>

            {isLoading && (
              <div className="flex items-center gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating audio...
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-6 space-y-4">
            <label className="label">Text to Read</label>
            <textarea
              className="input textarea min-h-[220px]"
              placeholder="Paste text here or use Read Clipboard"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {result && (
            <div className="glass-card p-6">
              <AudioPlayer src={result.url} filename={result.filename} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
