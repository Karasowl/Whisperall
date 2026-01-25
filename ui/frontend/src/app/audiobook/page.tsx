'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Upload, FileText, Download, Check, BookOpen, Pause, Play, X } from 'lucide-react';
import { SelectMenu } from '@/components/SelectMenu';
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
import {
  ModuleShell,
  ExecutionModeSwitch,
  ActionBar,
  SidebarPanel,
  Dropzone,
} from '@/components/module';

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
  const [documentFile, setDocumentFile] = useState<File | null>(null);

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
      setAdvancedSettings((prev) => ({
        ...prev,
        ...defaults,
        speed: prev.speed ?? 1.0,
      }));
    }
  }, [ttsProviderInfo?.id]);

  const handleFileDrop = useCallback(async (file: File) => {
    setDocumentFile(file);
    setIsParsing(true);
    setError(null);

    try {
      const result = await parseDocument(file);
      setChapters(result.chapters);
      setStats(result.stats);
      setSelectedChapters(new Set(result.chapters.map((c: Chapter) => c.number)));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to parse document');
      setDocumentFile(null);
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
        temperature: (advancedSettings.temperature as number) ?? 0.8,
        exaggeration: (advancedSettings.exaggeration as number) ?? 0.5,
        speed: (advancedSettings.speed as number) ?? 1.0,
        cfg_weight: fastMode ? 0 : ((advancedSettings.cfg_weight as number) ?? 0.5),
        device: device !== 'auto' ? device : undefined,
        fast_mode: fastMode,
        preset_voice_id: presetVoiceId || undefined,
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

  const handlePause = async () => {
    if (!jobId) return;
    await pauseBookJob(jobId);
    const status = await getJobStatus(jobId);
    setJobStatus(status);
  };

  const handleResume = async () => {
    if (!jobId) return;
    await resumeBookJob(jobId);
    const status = await getJobStatus(jobId);
    setJobStatus(status);
  };

  const handleCancel = async () => {
    if (!jobId) return;
    await cancelBookJob(jobId);
    const status = await getJobStatus(jobId);
    setJobStatus(status);
    setIsLoading(false);
  };

  const handleReset = () => {
    setChapters([]);
    setStats(null);
    setDocumentFile(null);
    setJobStatus(null);
    setJobId(null);
    setSelectedChapters(new Set());
  };

  const isLocalProvider = providerInfo?.type === 'local';
  const showVoiceSelector =
    ttsProviderInfo?.voice_cloning === 'none' ||
    (ttsProviderInfo?.preset_voices?.length ?? 0) > 0 ||
    ['openai-tts', 'elevenlabs', 'fishaudio', 'cartesia', 'playht', 'siliconflow', 'minimax', 'zyphra', 'narilabs', 'kokoro', 'dia'].includes(provider);
  const modelImpliesLang = /spanish|espanol|es[-_]|[-_]es/i.test(model);
  const showLanguageSelector = languageOptions.length > 1 && !modelImpliesLang;

  const isReady = chapters.length > 0 && selectedChapters.size > 0 && !isLoading;
  const isJobActive = jobStatus && (jobStatus.status === 'processing' || jobStatus.status === 'paused');

  return (
    <ModuleShell
      title="Audiobook Creator"
      description="Turn documents into narrated audio with chapter detection."
      icon={BookOpen}
      layout={chapters.length === 0 ? 'centered' : 'default'}
      settingsPosition="right"
      settingsTitle="Audio Settings"
      // Execution controls (for local providers)
      executionControls={
        isLocalProvider && chapters.length > 0 && (
          <ExecutionModeSwitch
            mode={device}
            onModeChange={setDevice}
            fastMode={fastMode}
            onFastModeChange={setFastMode}
            showFastMode
          />
        )
      }
      // Engine selector (when chapters are loaded)
      engineSelector={
        chapters.length > 0 && (
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
        )
      }
      // Progress indicator
      progress={
        isJobActive
          ? {
              value: jobStatus.progress,
              status:
                jobStatus.status === 'paused'
                  ? `Paused at chapter ${jobStatus.current_chapter} of ${jobStatus.total_chapters}`
                  : `Processing chapter ${jobStatus.current_chapter} of ${jobStatus.total_chapters}`,
            }
          : null
      }
      // Settings panel (when chapters are loaded)
      settings={
        chapters.length > 0 && (
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

            {/* Advanced settings */}
            <AdvancedSettings
              settings={advancedSettings}
              onChange={(key, value) => setAdvancedSettings((prev) => ({ ...prev, [key]: value }))}
              extraParams={ttsProviderInfo?.extra_params}
              dynamicOnly={provider !== 'chatterbox'}
            />
          </>
        )
      }
      // Action buttons
      actions={
        chapters.length > 0 && (
          <>
            {isJobActive ? (
              <div className="flex flex-col gap-2">
                {jobStatus.status === 'processing' ? (
                  <button onClick={handlePause} className="btn btn-primary w-full">
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                ) : (
                  <button onClick={handleResume} className="btn btn-primary w-full">
                    <Play className="w-4 h-4" />
                    Resume
                  </button>
                )}
                <button onClick={handleCancel} className="btn btn-ghost w-full">
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </div>
            ) : (
              <ActionBar
                primary={{
                  label: 'Generate Audiobook',
                  icon: BookOpen,
                  onClick: handleGenerate,
                  disabled: !isReady,
                }}
                secondary={{
                  label: 'Upload Different File',
                  icon: Upload,
                  onClick: handleReset,
                }}
                loading={isLoading}
                loadingText="Generating..."
                pulse={isReady}
              />
            )}
          </>
        )
      }
      // Main content
      main={
        <>
          {/* Upload view */}
          {chapters.length === 0 && (
            <Dropzone
              onFile={handleFileDrop}
              file={documentFile}
              onClear={() => setDocumentFile(null)}
              fileType="document"
              uploading={isParsing}
              title="Drag and drop a document"
              subtitle="Supports TXT, MD, and PDF files"
            />
          )}

          {/* Chapters view */}
          {chapters.length > 0 && !jobStatus?.status?.match(/completed|error|cancelled/) && (
            <div className="glass-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Chapters</h2>
                <div className="flex gap-3 text-sm">
                  <button
                    onClick={() => setSelectedChapters(new Set(chapters.map((c) => c.number)))}
                    className="text-accent-primary hover:underline"
                  >
                    Select all
                  </button>
                  <button
                    onClick={() => setSelectedChapters(new Set())}
                    className="text-foreground-muted hover:text-foreground"
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
                      'p-4 rounded-lg border-2 cursor-pointer transition-all',
                      selectedChapters.has(chapter.number)
                        ? 'border-accent-primary bg-accent-primary/5'
                        : 'border-glass-border hover:border-glass-border-hover bg-surface-1'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'w-5 h-5 rounded border flex items-center justify-center flex-shrink-0',
                          selectedChapters.has(chapter.number)
                            ? 'bg-accent-primary border-accent-primary'
                            : 'border-foreground-muted'
                        )}
                      >
                        {selectedChapters.has(chapter.number) && (
                          <Check className="w-3 h-3 text-black" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground">{chapter.title}</div>
                        <div className="text-sm text-foreground-muted mt-1 line-clamp-2">
                          {chapter.preview || chapter.content.slice(0, 150)}...
                        </div>
                        <div className="text-xs text-foreground-muted mt-2">
                          {chapter.content.split(/\s+/).length} words
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed view */}
          {jobStatus?.status === 'completed' && (
            <div className="glass-card p-6 space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 text-emerald-400">
                <Check className="w-5 h-5" />
                <h2 className="text-lg font-semibold">Audiobook Complete</h2>
              </div>
              <div className="space-y-3">
                {jobStatus.outputs.map((output) => (
                  <div
                    key={output.chapter}
                    className="p-4 rounded-lg bg-surface-1 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium text-foreground">{output.title}</div>
                      <div className="text-sm text-foreground-muted">{output.filename}</div>
                    </div>
                    <a href={getAudioUrl(output.url)} download className="btn btn-primary">
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                  </div>
                ))}
              </div>
              <button onClick={handleReset} className="btn btn-secondary w-full mt-4">
                Create Another Audiobook
              </button>
            </div>
          )}

          {/* Error view */}
          {jobStatus?.status === 'error' && (
            <div className="glass-card p-6 border-red-500/30 bg-red-500/10 text-red-300">
              <p className="font-medium">Generation failed</p>
              <p className="text-sm mt-1">{jobStatus.error}</p>
              <button onClick={handleReset} className="btn btn-secondary mt-4">
                Try Again
              </button>
            </div>
          )}

          {/* Cancelled view */}
          {jobStatus?.status === 'cancelled' && (
            <div className="glass-card p-6 border-amber-500/30 bg-amber-500/10 text-amber-200">
              <p>Audiobook generation cancelled.</p>
              <button onClick={handleReset} className="btn btn-secondary mt-4">
                Start Over
              </button>
            </div>
          )}
        </>
      }
      // Sidebar with stats and tips
      sidebar={
        chapters.length > 0 && (
          <SidebarPanel
            title="Document Stats"
            description="Summary of your uploaded document."
            icon={FileText}
            metadata={
              stats
                ? [
                    { label: 'Chapters', value: `${stats.num_chapters}` },
                    { label: 'Total Words', value: stats.total_words.toLocaleString() },
                    { label: 'Est. Duration', value: `~${Math.round(stats.estimated_duration_minutes)} min` },
                    { label: 'Selected', value: `${selectedChapters.size} of ${chapters.length}` },
                  ]
                : undefined
            }
            tips={[
              'Select specific chapters to generate',
              'Use chapter detection for long documents',
              'Pause generation to continue later',
              'Download each chapter separately',
            ]}
          />
        )
      }
      // Error handling
      error={error}
      onErrorDismiss={() => setError(null)}
    />
  );
}
