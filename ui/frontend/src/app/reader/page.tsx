'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clipboard, Play, Headphones } from 'lucide-react';
import {
  readerSpeak,
  getAudioUrl,
  ServiceProviderInfo,
  getProviderSelection,
  setProvider,
  getTTSProvider,
  TTSProviderInfo,
} from '@/lib/api';
import { SelectMenu } from '@/components/SelectMenu';
import { UnifiedProviderSelector } from '@/components/UnifiedProviderSelector';
import { PresetVoiceSelector } from '@/components/PresetVoiceSelector';
import { AdvancedSettings, getDefaultParamValues } from '@/components/AdvancedSettings';
import { Toggle } from '@/components/Toggle';
import {
  ModuleShell,
  ExecutionModeSwitch,
  ActionBar,
  AudioOutputPanel,
} from '@/components/module';
import { useToast } from '@/components/Toast';

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
  const toast = useToast();
  
  // Text input
  const [text, setText] = useState('');

  // Language
  const [language, setLanguage] = useState('en');

  // Behavior toggles
  const [autoRead, setAutoRead] = useState(false);
  const [skipUrls, setSkipUrls] = useState(true);

  // Loading/Result state
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

  // === HANDLERS ===

  const handleSpeak = useCallback(
    async (overrideText?: string) => {
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
        const errorMsg = err.response?.data?.detail || err.message || 'Failed to synthesize audio';
        setError(errorMsg);
        toast.error('Synthesis failed', errorMsg);
      } finally {
        setIsLoading(false);
      }
    },
    [advancedSettings, device, fastMode, language, presetVoiceId, skipUrls, text]
  );

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
      const errorMsg = err.message || 'Clipboard access failed';
      setError(errorMsg);
      toast.error('Clipboard error', errorMsg);
    }
  }, [handleSpeak, toast]);

  // === EFFECTS ===

  // Auto-read clipboard polling
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

  // Hotkey handler
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

  // Language options
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

  // Reset language when model changes
  useEffect(() => {
    if (provider === 'chatterbox' && model !== 'multilingual' && language !== 'en') {
      setLanguage('en');
    }
  }, [provider, model, language]);

  // Ensure selected language is valid
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
        // Load persisted language
        if (selection.config?.language) {
          setLanguage(selection.config.language);
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
      setAdvancedSettings((prev) => ({
        speed: prev.speed ?? 1.0,
        ...defaults,
      }));
    }
  }, [ttsProviderInfo?.id]);

  // Persist provider selection (including language)
  useEffect(() => {
    if (!didLoadRef.current) return;
    if (!provider) return;
    const nextConfig = {
      ...providerConfig,
      model,
      preset_voice_id: presetVoiceId || undefined,
      language,  // Persist selected language
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
  }, [provider, model, presetVoiceId, language]);

  // === COMPUTED ===

  const isLocalProvider = providerInfo?.type === 'local';
  const showVoiceSelector =
    ttsProviderInfo?.voice_cloning === 'none' ||
    (ttsProviderInfo?.preset_voices?.length ?? 0) > 0 ||
    [
      'openai-tts',
      'elevenlabs',
      'fishaudio',
      'cartesia',
      'playht',
      'siliconflow',
      'minimax',
      'zyphra',
      'narilabs',
      'kokoro',
      'dia',
    ].includes(provider);

  const modelImpliesLang = /spanish|espanol|es[-_]|[-_]es/i.test(model);
  const showLanguageSelector = languageOptions.length > 1 && !modelImpliesLang;

  // === RENDER ===

  return (
    <ModuleShell
      title="Real-time Reader"
      description="Read clipboard text or paste content and generate audio instantly."
      icon={Headphones}
      layout="default"
      settingsCollapsible
      settingsPersistKey="reader-show-settings"
      settingsTitle="Reader Controls"
      // Execution controls in header (only for local providers)
      executionControls={
        isLocalProvider && (
          <ExecutionModeSwitch
            mode={device}
            onModeChange={setDevice}
            fastMode={fastMode}
            onFastModeChange={setFastMode}
            showFastMode
          />
        )
      }
      // Engine/Provider selector
      engineSelector={
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
      }
      // Settings panel content
      settings={
        <>
          {/* Voice selector */}
          {showVoiceSelector && (
            <PresetVoiceSelector
              providerId={provider}
              selected={presetVoiceId}
              onSelect={setPresetVoiceId}
              language={language}
            />
          )}

          {/* Language selector */}
          {showLanguageSelector && (
            <SelectMenu
              label="Language"
              value={language}
              options={languageOptions}
              onChange={setLanguage}
              disabled={provider === 'chatterbox' && model !== 'multilingual'}
            />
          )}

          {/* Advanced Settings */}
          <AdvancedSettings
            settings={advancedSettings}
            onChange={(key, value) => setAdvancedSettings((prev) => ({ ...prev, [key]: value }))}
            extraParams={ttsProviderInfo?.extra_params}
            dynamicOnly={provider !== 'chatterbox'}
          />

          {/* Behavior toggles */}
          <div className="py-2 space-y-4">
            <Toggle
              label="Auto-read clipboard"
              enabled={autoRead}
              onChange={setAutoRead}
              className="justify-between flex-row-reverse w-full gap-0"
            />
            <Toggle
              label="Skip URLs"
              enabled={skipUrls}
              onChange={setSkipUrls}
              className="justify-between flex-row-reverse w-full gap-0"
            />
          </div>
        </>
      }
      // Main content (text input)
      main={
        <div className="glass-card p-6 space-y-4 h-full flex flex-col">
          <label className="label">Text to Read</label>
          <textarea
            className="input textarea flex-1 min-h-[400px] resize-none font-mono text-base leading-relaxed focus:ring-0 border-transparent bg-transparent"
            placeholder="Paste text here or use Read Clipboard"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      }
      // Output
      output={
        result && (
          <AudioOutputPanel
            audioUrl={result.url}
            filename={result.filename}
            metadata={{
              provider: providerInfo?.name,
              model: model,
              voice: ttsProviderInfo?.preset_voices?.find((v: any) => v.id === presetVoiceId)?.name,
            }}
          />
        )
      }
      // Action buttons
      actions={
        <ActionBar
          primary={{
            label: 'Read Text',
            icon: Play,
            onClick: () => handleSpeak(),
            disabled: !text.trim(),
          }}
          secondary={{
            label: 'Read Clipboard',
            icon: Clipboard,
            onClick: readClipboard,
          }}
          loading={isLoading}
          loadingText="Generating audio..."
        />
      }
      // Error handling
      error={error}
      onErrorDismiss={() => setError(null)}
    />
  );
}
