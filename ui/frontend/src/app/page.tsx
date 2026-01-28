'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Sparkles, Zap, ChevronDown, Cpu, Bolt } from 'lucide-react';
import { StatusAlert } from '@/components/module';
import { AudioPlayer } from '@/components/AudioPlayer';
import { ProgressBar } from '@/components/ProgressBar';
import { TTSSettingsPanel } from '@/components/TTSSettingsPanel';
import { QuickStartChips } from '@/components/QuickStartChips';
import { UnifiedProviderSelector } from '@/components/UnifiedProviderSelector';
import { PresetVoiceSelector } from '@/components/PresetVoiceSelector';
import { VoiceSelector } from '@/components/VoiceSelector';
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
  TTSProviderInfo,
  TTSProviderUsage,
} from '@/lib/api';
import { cn } from '@/lib/utils';
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

const DEFAULT_SETTINGS: SettingsState = {
  temperature: 0.8,
  exaggeration: 0.5,
  cfg_weight: 0.5,
  top_p: 0.95,
  top_k: 1000,
  speed: 1.0,
  seed: 0,
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
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState('wav');

  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);

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
    if (providerInfo?.default_model) {
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

  const handleResetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    setFastMode(false);
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
      let voiceId = selectedVoiceId;

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

  // Get selected voice name for display
  const getSelectedVoiceName = () => {
    if (usesPresetVoice && selectedPresetVoiceId) {
      const preset = providerInfo?.preset_voices?.find(v => v.id === selectedPresetVoiceId);
      return preset?.name || selectedPresetVoiceId;
    }
    if (selectedVoiceId) {
      const voice = voices.find(v => v.id === selectedVoiceId);
      return voice?.name || 'Selected Voice';
    }
    return 'Select a voice';
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-0 animate-slide-up">
      {/* Main Content Area - Text Input */}
      <div className="flex-1 flex flex-col min-h-0 lg:border-r lg:border-glass-border">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-glass-border">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h1 className="text-2xl font-bold text-gradient">Text to Speech</h1>
            
            {/* Device selector - compact */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-foreground-muted">
                <Cpu className="w-3.5 h-3.5" />
                <select
                  value={device}
                  onChange={(e) => setDevice(e.target.value as 'auto' | 'cuda' | 'cpu')}
                  className="bg-transparent border-none text-xs cursor-pointer focus:outline-none"
                >
                  <option value="auto">Auto</option>
                  <option value="cuda">GPU</option>
                  <option value="cpu">CPU</option>
                </select>
              </div>
              
              <button
                onClick={() => setFastMode(!fastMode)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                  fastMode
                    ? "bg-accent-primary/20 text-accent-primary"
                    : "text-foreground-muted hover:text-foreground"
                )}
                title="Fast mode"
              >
                <Bolt className="w-3.5 h-3.5" />
                Fast
              </button>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="px-6 pt-4">
            <StatusAlert
              variant="error"
              message={error}
              dismissible
              onDismiss={() => setError(null)}
            />
          </div>
        )}

        {/* Text Area */}
        <div className="flex-1 p-6 flex flex-col min-h-0">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Start typing here or paste any text you want to turn into lifelike speech..."
              className="w-full h-full min-h-[300px] lg:min-h-0 bg-transparent border-none resize-none text-lg leading-relaxed placeholder:text-foreground-muted focus:outline-none custom-scrollbar"
            />
          </div>

          {/* Character count */}
          <div className="flex items-center justify-between pt-4 text-sm text-foreground-muted border-t border-glass-border/50">
            <span>{charCount} characters · {wordCount} words</span>
            <span className="text-xs">~{Math.ceil(wordCount / 150)} min audio</span>
          </div>
        </div>

        {/* Quick Start Chips - only show when text is empty */}
        {!text && (
          <div className="px-6 pb-6">
            <QuickStartChips onSelect={setText} />
          </div>
        )}

        {/* Progress & Result */}
        {(isLoading || result) && (
          <div className="px-6 pb-6 space-y-4">
            {isLoading && (
              <ProgressBar
                progress={progress}
                status="Generating audio..."
                details="Processing text chunks"
              />
            )}

            {result && (
              <div className="animate-fade-in">
                <AudioPlayer src={result.url} filename={result.filename} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Sidebar - Settings Panel */}
      <div className="w-full lg:w-[340px] xl:w-[380px] flex-shrink-0 flex flex-col bg-surface-base/50 lg:bg-transparent">
        {/* Provider & Voice Selection */}
        <div className="p-4 space-y-4 border-b border-glass-border">
          {/* Provider/Model Selector - Compact */}
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

          {/* Voice Selector - Compact Card */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Voice</label>
            
            {/* Voice Mode Toggle (if both modes available) */}
            {hasPresetVoices && hasVoiceCloning && (
              <div className="flex gap-1 p-1 bg-surface-1 rounded-lg mb-2">
                <button
                  onClick={() => {
                    setVoiceMode('preset');
                    setSelectedVoiceId(null);
                  }}
                  className={cn(
                    "flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                    voiceMode === 'preset'
                      ? "bg-background text-foreground shadow-sm"
                      : "text-foreground-muted hover:text-foreground"
                  )}
                >
                  Preset
                </button>
                <button
                  onClick={() => {
                    setVoiceMode('clone');
                    setSelectedPresetVoiceId(null);
                  }}
                  className={cn(
                    "flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                    voiceMode === 'clone'
                      ? "bg-background text-foreground shadow-sm"
                      : "text-foreground-muted hover:text-foreground"
                  )}
                >
                  Clone
                </button>
              </div>
            )}

            {/* Voice Selector Content */}
            {usesPresetVoice ? (
              <PresetVoiceSelector
                providerId={selectedProvider}
                selected={selectedPresetVoiceId}
                onSelect={(id) => {
                  setSelectedPresetVoiceId(id);
                  setSelectedVoiceId(null);
                }}
                language={selectedLanguage}
                compact
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
                compact
              />
            )}
          </div>

          {missingReferenceVoice && (
            <div className="text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
              F5-TTS needs a reference voice sample for cloning
            </div>
          )}
        </div>

        {/* Settings Panel with Tabs */}
        <div className="flex-1 min-h-0 flex flex-col">
          <TTSSettingsPanel
            settings={settings}
            onChange={handleSettingChange}
            providerInfo={providerInfo}
            fastMode={fastMode}
            onFastModeChange={setFastMode}
            onResetValues={handleResetSettings}
            modelSupportsExaggeration={currentModel?.supports_exaggeration ?? true}
            modelSupportsCfg={currentModel?.supports_cfg ?? true}
            className="flex-1"
          />
        </div>

        {/* Output Format & Generate Buttons - Sticky bottom */}
        <div className="p-4 border-t border-glass-border space-y-3 bg-surface-base/80 backdrop-blur-sm">
          {/* Output Format */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground-muted">Format:</span>
            <div className="flex gap-1">
              {['wav', 'mp3', 'flac'].map((format) => (
                <button
                  key={format}
                  onClick={() => setOutputFormat(format)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                    outputFormat === format
                      ? "bg-foreground text-background"
                      : "text-foreground-muted hover:text-foreground"
                  )}
                >
                  {format.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <button
            onClick={() => handleGenerate(false)}
            disabled={isLoading || !text.trim() || missingReferenceVoice}
            className="btn btn-primary w-full py-3"
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
            className="btn btn-secondary w-full py-2.5 text-sm"
          >
            {isPreviewLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Quick Preview
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
