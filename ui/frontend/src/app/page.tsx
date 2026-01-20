'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Sparkles, Zap, AlertCircle } from 'lucide-react';
import { ModelSelector } from '@/components/ModelSelector';
import { LanguageSelector } from '@/components/LanguageSelector';
import { VoiceSelector } from '@/components/VoiceSelector';
import { AdvancedSettings } from '@/components/AdvancedSettings';
import { AudioPlayer } from '@/components/AudioPlayer';
import { ProgressBar } from '@/components/ProgressBar';
import { PresetSelector } from '@/components/PresetSelector';
import { TurboTagsEditor } from '@/components/TurboTagsEditor';
import { UnifiedProviderSelector } from '@/components/UnifiedProviderSelector';
import { PresetVoiceSelector } from '@/components/PresetVoiceSelector';
import {
  getModels,
  getLanguages,
  getVoices,
  generate,
  generatePreview,
  getAudioUrl,
  getTTSProviderUsage,
  Model,
  Language,
  Voice,
  Preset,
  TTSProviderInfo,
  TTSProviderUsage,
} from '@/lib/api';
import { DeviceToggle } from '@/components/DeviceToggle';
import { playActionSound } from '@/lib/actionSounds';

type SettingsState = {
  temperature: number;
  exaggeration: number;
  cfg_weight: number;
  top_p: number;
  top_k: number;
  speed: number;
  seed: number;
  [key: string]: number | string | boolean;
};

const PROVIDER_USAGE_CAPABLE = ['elevenlabs'];

export default function TTSPage() {
  // Data
  const [models, setModels] = useState<Model[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);

  // Form state
  const [text, setText] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('chatterbox');
  const [providerInfo, setProviderInfo] = useState<TTSProviderInfo | null>(null);
  const [selectedModel, setSelectedModel] = useState('multilingual');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [selectedPresetVoiceId, setSelectedPresetVoiceId] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<'preset' | 'clone'>('preset');
  const [providerUsage, setProviderUsage] = useState<TTSProviderUsage | null>(null);
  const [providerUsageError, setProviderUsageError] = useState<string | null>(null);
  const [providerUsageLoading, setProviderUsageLoading] = useState(false);
  const refreshProviderUsage = useCallback(
    async (cancelToken?: { cancelled: boolean }) => {
      if (!PROVIDER_USAGE_CAPABLE.includes(selectedProvider)) {
        setProviderUsage(null);
        setProviderUsageError(null);
        setProviderUsageLoading(false);
        return;
      }

      setProviderUsageLoading(true);
      setProviderUsageError(null);

      try {
        const response = await getTTSProviderUsage(selectedProvider);
        if (cancelToken?.cancelled) return;
        if (response.usage) {
          setProviderUsage(response);
        } else {
          setProviderUsage(null);
        }
      } catch (err: unknown) {
        if (cancelToken?.cancelled) return;
        const message =
          err && typeof err === 'object' && 'response' in err
            ? (err as any).response?.data?.detail || (err as any).message
            : err instanceof Error
              ? err.message
              : 'Failed to load usage info';
        setProviderUsageError(message || 'Failed to load usage info');
        setProviderUsage(null);
      } finally {
        if (!cancelToken?.cancelled) {
          setProviderUsageLoading(false);
        }
      }
    },
    [selectedProvider]
  );
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState('wav');

  const [settings, setSettings] = useState<SettingsState>({
    temperature: 0.8,
    exaggeration: 0.5,
    cfg_weight: 0.5,
    top_p: 0.95,
    top_k: 1000,
    speed: 1.0,
    seed: 0,
  });

  // Device settings
  const [device, setDevice] = useState<'auto' | 'cuda' | 'cpu'>('auto');
  const [fastMode, setFastMode] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; filename: string } | null>(null);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const [modelsData, languagesData, voicesResponse] = await Promise.all([
          getModels(),
          getLanguages(),
          getVoices(),
        ]);
        setModels(modelsData);
        setLanguages(languagesData);
        setVoices(voicesResponse.voices);
      } catch (err) {
        setError('Failed to connect to backend. Make sure the server is running.');
      }
    }
    loadData();
  }, []);

  // Update selected model when provider changes
  useEffect(() => {
    if (providerInfo) {
      setSelectedModel(providerInfo.default_model);
    }
  }, [providerInfo?.id]);

  useEffect(() => {
    if (!providerInfo) return;

    const hasPresetVoices = providerInfo.voice_cloning === 'none' ||
      (providerInfo.preset_voices?.length ?? 0) > 0 ||
      ['openai-tts', 'elevenlabs', 'fishaudio', 'cartesia', 'playht', 'siliconflow', 'minimax', 'zyphra', 'narilabs', 'kokoro', 'dia'].includes(selectedProvider);
    const hasVoiceCloning = providerInfo.voice_cloning !== 'none';

    if (!hasVoiceCloning) {
      setVoiceMode('preset');
      return;
    }
    if (!hasPresetVoices) {
      setVoiceMode('clone');
      return;
    }
    setVoiceMode('preset');
  }, [providerInfo?.id, selectedProvider]);

  useEffect(() => {
    if (!PROVIDER_USAGE_CAPABLE.includes(selectedProvider)) {
      setProviderUsage(null);
      setProviderUsageError(null);
      setProviderUsageLoading(false);
      return;
    }

    const cancelToken = { cancelled: false };
    void refreshProviderUsage(cancelToken);
    return () => {
      cancelToken.cancelled = true;
    };
  }, [selectedProvider, refreshProviderUsage]);

  const hasPresetVoices = providerInfo?.voice_cloning === 'none' ||
    (providerInfo?.preset_voices?.length ?? 0) > 0 ||
    ['openai-tts', 'elevenlabs', 'fishaudio', 'cartesia', 'playht', 'siliconflow', 'minimax', 'zyphra', 'narilabs', 'kokoro', 'dia'].includes(selectedProvider);
  const hasVoiceCloning = providerInfo?.voice_cloning ? providerInfo.voice_cloning !== 'none' : false;
  const usesPresetVoice = Boolean(hasPresetVoices && (!hasVoiceCloning || voiceMode === 'preset'));

  const currentModel = models.find((m) => m.id === selectedModel);
  const requiresReferenceVoice = selectedProvider === 'f5-tts';
  const hasVoiceReference = Boolean(selectedVoiceId);
  const missingReferenceVoice = requiresReferenceVoice && !hasVoiceReference;

  const handleSettingChange = (key: string, value: number | string | boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplyPreset = (preset: Preset) => {
    // Apply preset values
    setSelectedModel(preset.model);
    if (preset.language) {
      setSelectedLanguage(preset.language);
    }
    if (preset.voice_id) {
      setSelectedVoiceId(preset.voice_id);
    }
    setSettings((prev) => ({
      ...prev,
      temperature: preset.temperature,
      exaggeration: preset.exaggeration,
      cfg_weight: preset.cfg_weight,
      speed: preset.speed,
    }));
  };

  const handleGenerate = async (preview = false) => {
    if (!text.trim()) {
      setError('Please enter some text');
      return;
    }

    setError(null);
    setResult(null);

    if (selectedProvider === 'f5-tts' && !selectedVoiceId) {
      setError('F5-TTS requires a reference voice sample. Select a saved voice before generating.');
      return;
    }

    if (preview) {
      setIsPreviewLoading(true);
    } else {
      setIsLoading(true);
      setProgress(10);
    }

    try {
      // If user uploaded a file, we need to save it as a voice first
      let voiceId = selectedVoiceId;

      // TODO: Handle uploaded file - for now just use selected voice

      const extraParams = providerInfo?.extra_params
        ? Object.keys(providerInfo.extra_params).reduce<Record<string, unknown>>((acc, paramKey) => {
          const value = (settings as Record<string, unknown>)[paramKey];
          if (value !== undefined) {
            acc[paramKey] = value;
          }
          return acc;
        }, {})
        : undefined;

      const request = {
        text,
        provider: selectedProvider,
        model: selectedModel,
        language: selectedLanguage,
        voice_id: usesPresetVoice ? undefined : (voiceId || undefined),
        preset_voice_id: usesPresetVoice ? (selectedPresetVoiceId || undefined) : undefined,
        temperature: settings.temperature,
        exaggeration: settings.exaggeration,
        cfg_weight: fastMode ? 0 : settings.cfg_weight,
        top_p: settings.top_p,
        top_k: settings.top_k,
        speed: settings.speed,
        seed: settings.seed || undefined,
        output_format: outputFormat,
        device: device !== 'auto' ? device : undefined,
        fast_mode: fastMode,
        extra_params: extraParams && Object.keys(extraParams).length > 0 ? extraParams : undefined,
      };

      if (!preview) {
        playActionSound('start');
      }
      if (preview) {
        const res = await generatePreview(request);
        setResult({
          url: getAudioUrl(res.output_url),
          filename: res.filename,
        });
      } else {
        setProgress(30);
        const res = await generate(request);
        setProgress(100);
        setResult({
          url: getAudioUrl(res.output_url),
          filename: res.filename,
        });
        playActionSound('complete');
        if (PROVIDER_USAGE_CAPABLE.includes(selectedProvider)) {
          void refreshProviderUsage();
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Generation failed');
    } finally {
      setIsLoading(false);
      setIsPreviewLoading(false);
    }
  };

  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const formatNumber = (value?: number | null) =>
    value != null ? new Intl.NumberFormat().format(value) : '—';

  const formatDateFromUnix = (value?: number | null) => {
    if (!value) return '—';
    return new Date(value * 1000).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getCharacterLabel = (usage?: TTSProviderUsage['usage']) => {
    if (!usage) return '—';
    const { character_count, character_limit } = usage;
    if (typeof character_count === 'number' && typeof character_limit === 'number') {
      return `${formatNumber(character_count)} / ${formatNumber(character_limit)}`;
    }
    if (typeof character_count === 'number') {
      return formatNumber(character_count);
    }
    if (typeof character_limit === 'number') {
      return formatNumber(character_limit);
    }
    return '—';
  };

  const getVoiceSlotLabel = (usage?: TTSProviderUsage['usage']) => {
    if (!usage) return '—';
    const { voice_slots_used, voice_limit } = usage;
    if (typeof voice_slots_used === 'number' && typeof voice_limit === 'number') {
      return `${formatNumber(voice_slots_used)} / ${formatNumber(voice_limit)}`;
    }
    if (typeof voice_slots_used === 'number') {
      return formatNumber(voice_slots_used);
    }
    if (typeof voice_limit === 'number') {
      return formatNumber(voice_limit);
    }
    return '—';
  };

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-4xl font-bold text-gradient tracking-tight">Text to Speech</h1>
          <DeviceToggle
            value={device}
            onChange={setDevice}
            showFastMode
            fastMode={fastMode}
            onFastModeChange={setFastMode}
          />
        </div>
        <p className="text-foreground-secondary text-lg">
          Convert text to natural-sounding speech with voice cloning
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="card p-4 flex items-center gap-3 border-error/30 bg-error/10">
          <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
          <p className="text-error-300">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column - Main controls */}
        <div className="lg:col-span-2 space-y-6">
          {/* TTS Provider selector (unified: local + API) */}
          <div className="card p-6">
            <UnifiedProviderSelector
              service="tts"
              selected={selectedProvider}
              onSelect={setSelectedProvider}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              onProviderInfoChange={(info) => setProviderInfo(info as TTSProviderInfo | null)}
              variant="dropdown"
              showModelSelector
            />
            {PROVIDER_USAGE_CAPABLE.includes(selectedProvider) && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400">
                  <span>Provider Usage</span>
                  {providerUsageLoading && (
                    <span className="flex items-center gap-1 text-[10px]">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      <span>Refreshing</span>
                    </span>
                  )}
                </div>

                {providerUsage?.usage ? (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-3 text-white/90">
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-emerald-200">
                      <span>{providerUsage.provider.toUpperCase()}</span>
                      <span className="text-[10px] text-emerald-300">
                        {providerUsage.usage.currency?.toUpperCase() || '—'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-emerald-200">Tier</p>
                        <p className="font-semibold text-white">
                          {providerUsage.usage.tier || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-emerald-200">Status</p>
                        <p className="font-semibold text-white">
                          {providerUsage.usage.status || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-emerald-200">Characters</p>
                        <p className="font-semibold text-white">
                          {getCharacterLabel(providerUsage.usage)}
                        </p>
                        {providerUsage.usage.characters_remaining != null && (
                          <p className="text-[10px] text-emerald-200">
                            Remaining {formatNumber(providerUsage.usage.characters_remaining)}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-emerald-200">Next reset</p>
                        <p className="font-semibold text-white">
                          {formatDateFromUnix(providerUsage.usage.next_character_count_reset_unix)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-emerald-200">Voice slots</p>
                        <p className="font-semibold text-white">
                          {getVoiceSlotLabel(providerUsage.usage)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-emerald-200">Billing</p>
                        <p className="font-semibold text-white">
                          {providerUsage.usage.billing_period || '—'}
                        </p>
                        {providerUsage.usage.character_refresh_period && (
                          <p className="text-[10px] text-emerald-200">
                            {providerUsage.usage.character_refresh_period}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : providerUsageError ? (
                  <p className="text-xs text-amber-300">{providerUsageError}</p>
                ) : (
                  !providerUsageLoading && (
                    <p className="text-xs text-slate-400">
                      Usage details appear once ElevenLabs syncs your subscription.
                    </p>
                  )
                )}
              </div>
            )}
          </div>

          {/* Language selector - hidden for single-language providers or language-specific models */}
          {(() => {
            const supportedLangs = providerInfo?.supported_languages || [];
            const modelImpliesLang = /spanish|espanol|es[-_]|[-_]es/i.test(selectedModel);
            const hideLanguageSelector = supportedLangs.length <= 1 || modelImpliesLang;

            if (hideLanguageSelector) return null;

            return (
              <div className="card p-6 space-y-4">
                <LanguageSelector
                  languages={languages.filter(l => supportedLangs.includes(l.code))}
                  selected={selectedLanguage}
                  onSelect={setSelectedLanguage}
                  disabled={selectedProvider === 'chatterbox' && selectedModel !== 'multilingual'}
                />
              </div>
            );
          })()}

          {/* Preset selector */}
          <div className="card p-6">
            <PresetSelector
              currentSettings={{
                model: selectedModel,
                language: selectedLanguage,
                temperature: settings.temperature,
                exaggeration: settings.exaggeration,
                cfg_weight: settings.cfg_weight,
                speed: settings.speed,
                voice_id: selectedVoiceId || undefined,
              }}
              onApplyPreset={handleApplyPreset}
            />
          </div>

          {/* Text input */}
          <div className="card p-6 space-y-4">
            <label className="label">Text Input</label>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter the text you want to convert to speech..."
              rows={8}
              className="input textarea min-h-[200px]"
            />
            <div className="flex justify-between text-sm text-foreground-muted">
              <span>{charCount} characters, {wordCount} words</span>
              <span className="badge badge-primary">~{Math.ceil(wordCount / 150)} min audio</span>
            </div>
          </div>

          {/* Turbo Tags Editor */}
          {selectedModel === 'turbo' && (
            <div className="card p-6">
              <TurboTagsEditor
                text={text}
                onTextChange={setText}
                textareaRef={textareaRef}
              />
            </div>
          )}

          {/* Output format */}
          <div className="card p-6 space-y-4">
            <label className="label">Output Format</label>
            <div className="flex gap-3">
              {['wav', 'mp3', 'flac'].map((format) => (
                <button
                  key={format}
                  onClick={() => setOutputFormat(format)}
                  className={`px-6 py-3 rounded-lg font-medium transition-all ${outputFormat === format
                      ? 'btn-primary text-black' // Use the new btn-primary class which handles the gradient
                      : 'card hover:bg-surface-2 text-foreground-muted hover:text-foreground'
                    }`}
                >
                  {format.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced settings */}
          <div className="card p-6">
            <AdvancedSettings
              settings={settings}
              onChange={handleSettingChange}
              modelSupportsExaggeration={currentModel?.supports_exaggeration ?? true}
              modelSupportsCfg={currentModel?.supports_cfg ?? true}
              extraParams={providerInfo?.extra_params}
              dynamicOnly={selectedProvider !== 'chatterbox'}
            />
          </div>

          {/* Progress bar */}
          {isLoading && (
            <div className="card p-6">
              <ProgressBar
                progress={progress}
                status="Generating audio..."
                details="Processing text chunks"
              />
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="card p-6 animate-fade-in">
              <AudioPlayer src={result.url} filename={result.filename} />
            </div>
          )}
        </div>

        {/* Right column - Voice selection */}
        <div className="space-y-6">
          <div className="card p-6 sticky top-24">
            {/* Voice selection - show PresetVoiceSelector for providers with preset voices, VoiceSelector for cloning */}
            {(() => {
              // For API providers and providers with preset voices only
              if (hasPresetVoices && !hasVoiceCloning) {
                return (
                  <PresetVoiceSelector
                    providerId={selectedProvider}
                    selected={selectedPresetVoiceId}
                    onSelect={setSelectedPresetVoiceId}
                    language={selectedLanguage}
                  />
                );
              }

              // For providers that support both preset voices AND voice cloning
              if (hasPresetVoices && hasVoiceCloning) {
                return (
                  <div className="space-y-4">
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => {
                          setVoiceMode('preset');
                          setSelectedVoiceId(null);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${voiceMode === 'preset' ? 'bg-gradient-to-r from-emerald-400 to-amber-400 text-white' : 'glass glass-hover text-slate-400'}`}
                      >
                        Preset Voices
                      </button>
                      <button
                        onClick={() => {
                          setVoiceMode('clone');
                          setSelectedPresetVoiceId(null);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${voiceMode === 'clone' ? 'bg-gradient-to-r from-emerald-400 to-amber-400 text-white' : 'glass glass-hover text-slate-400'}`}
                      >
                        Clone Voice
                      </button>
                    </div>
                    {voiceMode === 'preset' ? (
                      <PresetVoiceSelector
                        providerId={selectedProvider}
                        selected={selectedPresetVoiceId}
                        onSelect={(id) => {
                          setSelectedPresetVoiceId(id);
                          setSelectedVoiceId(null);
                        }}
                        language={selectedLanguage}
                      />
                    ) : (
                      <VoiceSelector
                        voices={voices}
                        selectedVoiceId={selectedVoiceId}
                        onSelectVoice={(id) => {
                          setSelectedVoiceId(id);
                          setSelectedPresetVoiceId(null);
                        }}
                        onUploadVoice={setUploadedFile}
                        uploadedFile={uploadedFile}
                      />
                    )}
                  </div>
                );
              }

              // Default: only voice cloning
              return (
                <VoiceSelector
                  voices={voices}
                  selectedVoiceId={selectedVoiceId}
                  onSelectVoice={setSelectedVoiceId}
                  onUploadVoice={setUploadedFile}
                  uploadedFile={uploadedFile}
                />
              );
            })()}

            {missingReferenceVoice && (
              <div className="mt-3 text-xs text-amber-300">
                F5-TTS needs a saved reference voice sample for cloning; please select one above.
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-6 space-y-3">
              <button
                onClick={() => handleGenerate(false)}
                disabled={isLoading || !text.trim() || missingReferenceVoice}
                className="btn btn-primary w-full py-4 text-base animate-pulse-glow"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 fill-current" />
                    Generate Audio
                  </>
                )}
              </button>

              <button
                onClick={() => handleGenerate(true)}
                disabled={isPreviewLoading || isLoading || !text.trim() || missingReferenceVoice}
                className="btn btn-secondary w-full py-4 text-base"
              >
                {isPreviewLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading preview...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 fill-current" />
                    Quick Preview
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
