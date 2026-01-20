'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Download, Loader2, Check } from 'lucide-react';
import { ProgressBar } from '@/components/ProgressBar';
import { SelectMenu } from '@/components/SelectMenu';
import { DeviceToggle } from '@/components/DeviceToggle';
import { UnifiedProviderSelector } from '@/components/UnifiedProviderSelector';
import { PresetVoiceSelector } from '@/components/PresetVoiceSelector';
import { AdvancedSettings, getDefaultParamValues } from '@/components/AdvancedSettings';
import { TTSProviderInfo, getTTSProvider } from '@/lib/api';
import {
  parseDocument,
  generateBook,
  getJobStatus,
  pauseBookJob,
  resumeBookJob,
  cancelBookJob,
  getAudioUrl,
  Chapter,
  JobStatus,
  ServiceProviderInfo,
  getProviderSelection,
  setProvider,
} from '@/lib/api';
import { cn } from '@/lib/utils';

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

export default function AudiobookPage() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [selectedChapters, setSelectedChapters] = useState<Set<number>>(new Set());

  const [model, setModel] = useState('multilingual');
  const [language, setLanguage] = useState('en');
  const [outputFormat, setOutputFormat] = useState('mp3');

  // Device settings
  const [device, setDevice] = useState<'auto' | 'cuda' | 'cpu'>('auto');
  const [fastMode, setFastMode] = useState(false);

  // Provider settings
  const [provider, setProviderState] = useState('chatterbox');
  const [providerInfo, setProviderInfo] = useState<ServiceProviderInfo | null>(null);
  const [ttsProviderInfo, setTtsProviderInfo] = useState<TTSProviderInfo | null>(null);
  const [presetVoiceId, setPresetVoiceId] = useState<string | null>(null);
  const [providerConfig, setProviderConfig] = useState<Record<string, any>>({});
  const [advancedSettings, setAdvancedSettings] = useState<Record<string, number | string | boolean>>({
    temperature: 0.8,
    exaggeration: 0.5,
    cfg_weight: 0.5,
    speed: 1.0,
  });
  const didLoadRef = useRef(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);

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

  // Update advanced settings when provider changes
  useEffect(() => {
    if (ttsProviderInfo?.extra_params) {
      const defaults = getDefaultParamValues(ttsProviderInfo.extra_params);
      setAdvancedSettings(prev => ({
        ...prev,
        ...defaults,
        speed: prev.speed ?? 1.0,  // Always preserve speed
      }));
    }
  }, [ttsProviderInfo?.id]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setIsParsing(true);
    setError(null);

    try {
      const result = await parseDocument(file);
      setChapters(result.chapters);
      setStats(result.stats);
      setSelectedChapters(new Set(result.chapters.map((c: Chapter) => c.number)));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to parse document');
    } finally {
      setIsParsing(false);
    }
  }, []);

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

  // Persist provider selection and load TTS provider info
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

    // Load TTS provider info for model options and voice selection
    async function loadTtsProviderInfo() {
      try {
        const info = await getTTSProvider(provider);
        setTtsProviderInfo(info);
        // Set default model if current selection is invalid
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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
  });

  const toggleChapter = (num: number) => {
    const newSelected = new Set(selectedChapters);
    if (newSelected.has(num)) {
      newSelected.delete(num);
    } else {
      newSelected.add(num);
    }
    setSelectedChapters(newSelected);
  };

  const handleGenerate = async () => {
    if (selectedChapters.size === 0) {
      setError('Select at least one chapter');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const selectedChapterData = chapters.filter((c) => selectedChapters.has(c.number));

      const result = await generateBook({
        chapters: selectedChapterData,
        provider,
        model,
        language,
        output_format: outputFormat,
        // Required fields with defaults
        temperature: advancedSettings.temperature as number ?? 0.8,
        exaggeration: advancedSettings.exaggeration as number ?? 0.5,
        speed: advancedSettings.speed as number ?? 1.0,
        // Override cfg_weight in fast mode
        cfg_weight: fastMode ? 0 : (advancedSettings.cfg_weight as number ?? 0.5),
        device: device !== 'auto' ? device : undefined,
        fast_mode: fastMode,
        preset_voice_id: presetVoiceId || undefined,
        // Pass any extra provider-specific params
        extra_params: advancedSettings,
      });

      setJobId(result.job_id);

      const pollInterval = setInterval(async () => {
        try {
          const status = await getJobStatus(result.job_id);
          setJobStatus(status);

          if (status.status === 'completed' || status.status === 'error' || status.status === 'cancelled') {
            clearInterval(pollInterval);
            setIsLoading(false);
          }
        } catch {
          clearInterval(pollInterval);
          setIsLoading(false);
        }
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Generation failed');
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-slide-up">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-3xl font-bold text-gradient">Audiobook Creator</h1>
          <DeviceToggle
            value={device}
            onChange={setDevice}
            showFastMode
            fastMode={fastMode}
            onFastModeChange={setFastMode}
          />
        </div>
        <p className="mt-2 text-slate-400">
          Turn documents into narrated audio with chapter detection.
        </p>
      </div>

      {error && (
        <div className="glass-card p-4 border-red-500/30 bg-red-500/10 text-red-300">
          {error}
        </div>
      )}

      {chapters.length === 0 && (
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
            isDragActive ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/10 hover:border-white/20'
          )}
        >
          <input {...getInputProps()} />
          {isParsing ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 text-slate-400 animate-spin" />
              <p className="text-slate-400">Parsing document...</p>
            </div>
          ) : (
            <>
              <Upload className="w-12 h-12 mx-auto text-slate-400" />
              <p className="mt-4 text-lg text-slate-400">
                {isDragActive ? 'Drop the file here' : 'Drag and drop a document'}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Supports TXT, MD, and PDF files
              </p>
            </>
          )}
        </div>
      )}

      {chapters.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-100">Chapters</h2>
              <div className="flex gap-3 text-sm">
                <button
                  onClick={() => setSelectedChapters(new Set(chapters.map((c) => c.number)))}
                  className="text-emerald-300 hover:text-emerald-200"
                >
                  Select all
                </button>
                <button
                  onClick={() => setSelectedChapters(new Set())}
                  className="text-slate-400 hover:text-slate-100"
                >
                  Deselect all
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
              {chapters.map((chapter) => (
                <div
                  key={chapter.number}
                  onClick={() => toggleChapter(chapter.number)}
                  className={cn(
                    'glass-card p-4 cursor-pointer transition-colors',
                    selectedChapters.has(chapter.number)
                      ? 'border-emerald-400/40'
                      : 'hover:border-white/20'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'w-5 h-5 rounded border flex items-center justify-center',
                        selectedChapters.has(chapter.number)
                          ? 'bg-emerald-400 border-emerald-400'
                          : 'border-white/20'
                      )}
                    >
                      {selectedChapters.has(chapter.number) && (
                        <Check className="w-3 h-3 text-black" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-100">{chapter.title}</div>
                      <div className="text-sm text-slate-400 mt-1 line-clamp-2">
                        {chapter.preview || chapter.content.slice(0, 150)}...
                      </div>
                      <div className="text-xs text-slate-400 mt-2">
                        {chapter.content.split(/\s+/).length} words
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            {stats && (
              <div className="glass-card p-4">
                <h3 className="font-medium text-slate-100">Document Stats</h3>
                <div className="mt-2 space-y-1 text-sm text-slate-400">
                  <p>{stats.num_chapters} chapters</p>
                  <p>{stats.total_words.toLocaleString()} words</p>
                  <p>~{Math.round(stats.estimated_duration_minutes)} min audio</p>
                </div>
              </div>
            )}

            <div className="glass-card p-4 space-y-4">
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

              {/* Language selector - hidden for single-language providers */}
              {languageOptions.length > 1 && !/spanish|espanol|es[-_]|[-_]es/i.test(model) && (
                <SelectMenu
                  label="Language"
                  value={language}
                  options={languageOptions}
                  onChange={setLanguage}
                  disabled={provider === 'chatterbox' && model !== 'multilingual'}
                />
              )}

              <SelectMenu
                label="Output Format"
                value={outputFormat}
                options={[
                  { value: 'mp3', label: 'MP3' },
                  { value: 'wav', label: 'WAV' },
                  { value: 'flac', label: 'FLAC' },
                ]}
                onChange={setOutputFormat}
              />

              {/* Advanced settings - dynamic based on provider */}
              <AdvancedSettings
                settings={advancedSettings}
                onChange={(key, value) => setAdvancedSettings(prev => ({ ...prev, [key]: value }))}
                extraParams={ttsProviderInfo?.extra_params}
                dynamicOnly={provider !== 'chatterbox'}
              />

              <button
                onClick={handleGenerate}
                disabled={isLoading || selectedChapters.size === 0}
                className="btn btn-primary w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5" />
                    Generate Audiobook
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  setChapters([]);
                  setStats(null);
                  setJobStatus(null);
                }}
                className="btn btn-secondary w-full"
              >
                Upload Different File
              </button>
            </div>
          </div>
        </div>
      )}

      {jobStatus && (jobStatus.status === 'processing' || jobStatus.status === 'paused') && (
        <div className="space-y-4">
          <ProgressBar
            progress={jobStatus.progress}
            status={
              jobStatus.status === 'paused'
                ? `Paused at chapter ${jobStatus.current_chapter} of ${jobStatus.total_chapters}`
                : `Processing chapter ${jobStatus.current_chapter} of ${jobStatus.total_chapters}`
            }
          />
          <div className="flex flex-wrap gap-3">
            {jobStatus.status === 'processing' ? (
              <button
                onClick={async () => {
                  if (!jobId) return;
                  await pauseBookJob(jobId);
                  const status = await getJobStatus(jobId);
                  setJobStatus(status);
                }}
                className="btn btn-secondary"
              >
                Pause
              </button>
            ) : (
              <button
                onClick={async () => {
                  if (!jobId) return;
                  await resumeBookJob(jobId);
                  const status = await getJobStatus(jobId);
                  setJobStatus(status);
                }}
                className="btn btn-primary"
              >
                Resume
              </button>
            )}
            <button
              onClick={async () => {
                if (!jobId) return;
                await cancelBookJob(jobId);
                const status = await getJobStatus(jobId);
                setJobStatus(status);
                setIsLoading(false);
              }}
              className="btn btn-danger"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {jobStatus && jobStatus.status === 'completed' && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-emerald-300">Audiobook complete</h2>
          <div className="space-y-2">
            {jobStatus.outputs.map((output) => (
              <div key={output.chapter} className="glass-card p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-100">{output.title}</div>
                  <div className="text-sm text-slate-400">{output.filename}</div>
                </div>
                <a
                  href={getAudioUrl(output.url)}
                  download
                  className="btn btn-primary"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {jobStatus && jobStatus.status === 'error' && (
        <div className="glass-card p-4 border-red-500/30 bg-red-500/10 text-red-300">
          Error: {jobStatus.error}
        </div>
      )}

      {jobStatus && jobStatus.status === 'cancelled' && (
        <div className="glass-card p-4 border-amber-500/30 bg-amber-500/10 text-amber-200">
          Audiobook generation cancelled.
        </div>
      )}
    </div>
  );
}
