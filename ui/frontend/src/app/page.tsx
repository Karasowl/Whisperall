'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Sparkles, Zap, AlertCircle } from 'lucide-react';
import { ModelSelector } from '@/components/ModelSelector';
import { LanguageSelector } from '@/components/LanguageSelector';
import { VoiceSelector } from '@/components/VoiceSelector';
import { AdvancedSettings } from '@/components/AdvancedSettings';
import { AudioPlayer } from '@/components/AudioPlayer';
import { ProgressBar } from '@/components/ProgressBar';
import { PresetSelector } from '@/components/PresetSelector';
import { TurboTagsEditor } from '@/components/TurboTagsEditor';
import {
  getModels,
  getLanguages,
  getVoices,
  generate,
  generatePreview,
  getAudioUrl,
  Model,
  Language,
  Voice,
  Preset,
} from '@/lib/api';

export default function TTSPage() {
  // Data
  const [models, setModels] = useState<Model[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);

  // Form state
  const [text, setText] = useState('');
  const [selectedModel, setSelectedModel] = useState('multilingual');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState('wav');

  const [settings, setSettings] = useState({
    temperature: 0.8,
    exaggeration: 0.5,
    cfg_weight: 0.5,
    top_p: 0.95,
    top_k: 1000,
    speed: 1.0,
    seed: 0,
  });

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

  const currentModel = models.find((m) => m.id === selectedModel);

  const handleSettingChange = (key: string, value: number) => {
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

      const request = {
        text,
        model: selectedModel,
        language: selectedLanguage,
        voice_id: voiceId || undefined,
        temperature: settings.temperature,
        exaggeration: settings.exaggeration,
        cfg_weight: settings.cfg_weight,
        top_p: settings.top_p,
        top_k: settings.top_k,
        speed: settings.speed,
        seed: settings.seed || undefined,
        output_format: outputFormat,
      };

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

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-gradient">Text to Speech</h1>
        <p className="text-foreground-muted">
          Convert text to natural-sounding speech with voice cloning
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="glass-card p-4 flex items-center gap-3 border-red-500/30 bg-red-500/10">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-300">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column - Main controls */}
        <div className="lg:col-span-2 space-y-6">
          {/* Model selector */}
          <div className="glass-card p-6 space-y-4">
            <ModelSelector
              models={models}
              selected={selectedModel}
              onSelect={setSelectedModel}
            />
          </div>

          {/* Language selector */}
          <div className="glass-card p-6 space-y-4">
            <LanguageSelector
              languages={languages}
              selected={selectedLanguage}
              onSelect={setSelectedLanguage}
              disabled={selectedModel !== 'multilingual'}
            />
          </div>

          {/* Preset selector */}
          <div className="glass-card p-6">
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
          <div className="glass-card p-6 space-y-4">
            <label className="label">Text Input</label>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter the text you want to convert to speech..."
              rows={8}
              className="input textarea"
            />
            <div className="flex justify-between text-sm text-foreground-muted">
              <span>{charCount} characters, {wordCount} words</span>
              <span className="badge badge-primary">~{Math.ceil(wordCount / 150)} min audio</span>
            </div>
          </div>

          {/* Turbo Tags Editor */}
          {selectedModel === 'turbo' && (
            <div className="glass-card p-6">
              <TurboTagsEditor
                text={text}
                onTextChange={setText}
                textareaRef={textareaRef}
              />
            </div>
          )}

          {/* Output format */}
          <div className="glass-card p-6 space-y-4">
            <label className="label">Output Format</label>
            <div className="flex gap-3">
              {['wav', 'mp3', 'flac'].map((format) => (
                <button
                  key={format}
                  onClick={() => setOutputFormat(format)}
                  className={`px-5 py-2.5 rounded-lg font-medium transition-all ${
                    outputFormat === format
                      ? 'bg-gradient-to-r from-emerald-400 to-amber-400 text-white shadow-lg shadow-emerald-400/25'
                      : 'glass glass-hover text-foreground-muted hover:text-foreground'
                  }`}
                >
                  {format.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced settings */}
          <div className="glass-card p-6">
            <AdvancedSettings
              settings={settings}
              onChange={handleSettingChange}
              modelSupportsExaggeration={currentModel?.supports_exaggeration ?? true}
              modelSupportsCfg={currentModel?.supports_cfg ?? true}
            />
          </div>

          {/* Progress bar */}
          {isLoading && (
            <div className="glass-card p-6">
              <ProgressBar
                progress={progress}
                status="Generating audio..."
                details="Processing text chunks"
              />
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="glass-card p-6 animate-fade-in">
              <AudioPlayer src={result.url} filename={result.filename} />
            </div>
          )}
        </div>

        {/* Right column - Voice selection */}
        <div className="space-y-6">
          <div className="glass-card p-6 sticky top-24">
            <VoiceSelector
              voices={voices}
              selectedVoiceId={selectedVoiceId}
              onSelectVoice={setSelectedVoiceId}
              onUploadVoice={setUploadedFile}
              uploadedFile={uploadedFile}
            />

            {/* Action buttons */}
            <div className="mt-6 space-y-3">
              <button
                onClick={() => handleGenerate(false)}
                disabled={isLoading || !text.trim()}
                className="btn btn-primary w-full py-4 text-base animate-pulse-glow"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate Audio
                  </>
                )}
              </button>

              <button
                onClick={() => handleGenerate(true)}
                disabled={isPreviewLoading || isLoading || !text.trim()}
                className="btn btn-secondary w-full py-4 text-base"
              >
                {isPreviewLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading preview...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
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
