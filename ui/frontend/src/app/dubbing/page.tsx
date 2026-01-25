'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Languages,
  Download,
  X,
  Video,
  Play,
  ChevronDown,
  ChevronUp,
  Cloud,
  Check,
  AlertTriangle,
  Globe,
} from 'lucide-react';
import {
  getDubbingProviders,
  getDubbingLanguages,
  uploadDubbingFile,
  startDubbing,
  getDubbingJob,
  getDubbingDownloadUrl,
  getProviderSelection,
  setProvider,
  DubbingProvider,
  DubbingLanguages,
  DubbingJob,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
  ModuleShell,
  Dropzone,
  ActionBar,
  SidebarPanel,
} from '@/components/module';
import { Toggle } from '@/components/Toggle';

export default function DubbingPage() {
  // Provider state
  const [providers, setProviders] = useState<DubbingProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('elevenlabs');
  const [loadingProviders, setLoadingProviders] = useState(true);

  // Languages
  const [languages, setLanguages] = useState<DubbingLanguages>({});
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('es');

  // Upload state
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPath, setMediaPath] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isVideo, setIsVideo] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Options
  const [projectName, setProjectName] = useState('');
  const [numSpeakers, setNumSpeakers] = useState(0);
  const [dropBackgroundAudio, setDropBackgroundAudio] = useState(false);
  const [useProfanityFilter, setUseProfanityFilter] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Job state
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentJob, setCurrentJob] = useState<DubbingJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const didLoadProviderRef = useRef(false);

  // Load providers and saved selection on mount
  useEffect(() => {
    async function loadProvidersAndSelection() {
      try {
        const [providerList, selection] = await Promise.all([
          getDubbingProviders(),
          getProviderSelection('dubbing').catch(() => null),
        ]);
        setProviders(providerList);

        // Use saved selection if available
        if (selection?.selected) {
          setSelectedProvider(selection.selected);
          if (selection.config?.source_language) {
            setSourceLanguage(selection.config.source_language);
          }
          if (selection.config?.target_language) {
            setTargetLanguage(selection.config.target_language);
          }
        } else {
          // Select first ready provider by default
          const readyProvider = providerList.find(p => p.ready);
          if (readyProvider) {
            setSelectedProvider(readyProvider.id);
          }
        }
      } catch (err) {
        console.error('Failed to load dubbing providers:', err);
      } finally {
        setLoadingProviders(false);
        didLoadProviderRef.current = true;
      }
    }
    loadProvidersAndSelection();
  }, []);

  // Persist provider selection
  useEffect(() => {
    if (!didLoadProviderRef.current) return;
    setProvider('dubbing', selectedProvider, {
      source_language: sourceLanguage,
      target_language: targetLanguage,
    }).catch((err) => {
      console.error('Failed to save dubbing provider selection:', err);
    });
  }, [selectedProvider, sourceLanguage, targetLanguage]);

  // Load languages
  useEffect(() => {
    async function loadLanguages() {
      try {
        const data = await getDubbingLanguages();
        setLanguages(data);
      } catch (err: any) {
        console.error('Failed to load languages:', err);
      }
    }
    loadLanguages();
  }, []);

  // Poll job status
  useEffect(() => {
    if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const status = await getDubbingJob(currentJob.id);
        setCurrentJob(status);

        if (status.status === 'completed' || status.status === 'failed') {
          setIsProcessing(false);
          if (status.status === 'failed') {
            setError(status.error || 'Dubbing failed');
          }
        }
      } catch (err) {
        console.error('Failed to get job status:', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [currentJob?.id, currentJob?.status]);

  const handleFileSelect = useCallback(async (file: File) => {
    const isVideoFile = file.type.startsWith('video/');
    const isAudioFile = file.type.startsWith('audio/');

    if (!isVideoFile && !isAudioFile) {
      setError('Please select a video or audio file');
      return;
    }

    if (file.size > 1024 * 1024 * 1024) {
      setError('File too large. Maximum size is 1GB');
      return;
    }

    setMediaFile(file);
    setIsVideo(isVideoFile);
    setError(null);
    setCurrentJob(null);

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    setIsUploading(true);
    try {
      const { input_path } = await uploadDubbingFile(file);
      setMediaPath(input_path);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Upload failed');
      setMediaFile(null);
      setPreviewUrl('');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleClearMedia = () => {
    setMediaFile(null);
    setMediaPath('');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setCurrentJob(null);
  };

  const handleStartDubbing = async () => {
    if (!mediaPath) {
      setError('Please upload a video or audio file first');
      return;
    }

    if (!targetLanguage) {
      setError('Please select a target language');
      return;
    }

    const provider = providers.find(p => p.id === selectedProvider);
    if (!provider?.ready) {
      setError('Selected provider is not ready. Please check the API key configuration.');
      return;
    }

    setError(null);
    setIsProcessing(true);
    setCurrentJob(null);

    try {
      const { job_id } = await startDubbing({
        input_path: mediaPath,
        target_language: targetLanguage,
        source_language: sourceLanguage === 'auto' ? undefined : sourceLanguage,
        name: projectName || undefined,
        num_speakers: numSpeakers > 0 ? numSpeakers : undefined,
        watermark: true,
        drop_background_audio: dropBackgroundAudio,
        use_profanity_filter: useProfanityFilter,
      });

      const initialStatus = await getDubbingJob(job_id);
      setCurrentJob(initialStatus);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to start dubbing');
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!currentJob?.id) return;
    window.open(getDubbingDownloadUrl(currentJob.id), '_blank');
  };

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Preparing...';
      case 'uploading':
        return 'Uploading to ElevenLabs...';
      case 'dubbing':
        return 'AI is dubbing your content...';
      case 'completed':
        return 'Dubbing complete!';
      case 'failed':
        return 'Dubbing failed';
      default:
        return status;
    }
  };

  const languageEntries = Object.entries(languages);
  const currentProvider = providers.find(p => p.id === selectedProvider);
  const isReady = !!mediaPath && !!targetLanguage && !isUploading && !!currentProvider?.ready;

  return (
    <ModuleShell
      title="Auto Dubbing"
      description="Automatically translate and dub videos to different languages using AI"
      icon={Globe}
      layout="default"
      settingsPosition="right"
      settingsTitle="Dubbing Settings"
      // Progress state
      progress={
        isProcessing && currentJob
          ? {
              value: currentJob.progress * 100,
              status: getStatusMessage(currentJob.status),
              details: currentJob.expected_duration_sec
                ? `Expected duration: ${Math.round(currentJob.expected_duration_sec)}s`
                : 'Dubbing can take several minutes',
            }
          : null
      }
      // Settings panel (right side)
      settings={
        <>
          {/* Language Selection */}
          <div className="space-y-3">
            <label className="label text-sm">Source Language</label>
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
              className="input w-full"
            >
              <option value="auto">Auto Detect</option>
              {languageEntries.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <label className="label text-sm">Target Language</label>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="input w-full"
            >
              {languageEntries.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Advanced Options */}
          <div className="pt-2 border-t border-border">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full py-2"
            >
              <span className="text-sm font-medium">Advanced Options</span>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvanced && (
              <div className="mt-2 space-y-4">
                <div>
                  <label className="label text-sm mb-2">Project Name</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="My Dubbed Video"
                    className="input w-full"
                  />
                </div>

                <div>
                  <label className="label text-sm mb-2">Speakers (0 = auto)</label>
                  <input
                    type="number"
                    value={numSpeakers}
                    onChange={(e) => setNumSpeakers(Number(e.target.value))}
                    min={0}
                    max={10}
                    className="input w-24"
                  />
                </div>

                <Toggle
                  enabled={dropBackgroundAudio}
                  onChange={setDropBackgroundAudio}
                  label="Drop background audio"
                />

                <Toggle
                  enabled={useProfanityFilter}
                  onChange={setUseProfanityFilter}
                  label="Profanity filter"
                />
              </div>
            )}
          </div>

          {/* Provider Info */}
          {currentProvider && (
            <div className="p-3 rounded-lg bg-surface-1 border border-border space-y-2">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-accent-primary" />
                <span className="font-medium text-sm">{currentProvider.name}</span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-foreground-muted">
                {currentProvider.quota_minutes && (
                  <span>{currentProvider.quota_minutes} min/month</span>
                )}
                {currentProvider.supported_languages && (
                  <span>{currentProvider.supported_languages}+ languages</span>
                )}
              </div>
            </div>
          )}
        </>
      }
      // Action button
      actions={
        <ActionBar
          primary={{
            label: 'Start Dubbing',
            icon: Languages,
            onClick: handleStartDubbing,
            disabled: !isReady,
          }}
          loading={isProcessing || isUploading}
          loadingText={isUploading ? 'Uploading...' : 'Dubbing...'}
          pulse={isReady && !isProcessing}
        />
      }
      // Main content
      main={
        <div className="space-y-6">
          {/* Provider Selection */}
          <div className="glass-card p-6 space-y-4">
            <label className="label flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Select Provider
            </label>

            {loadingProviders ? (
              <div className="flex items-center gap-2 text-foreground-muted">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Loading providers...
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => provider.ready && setSelectedProvider(provider.id)}
                    disabled={!provider.ready}
                    className={cn(
                      'p-4 rounded-xl border-2 text-left transition-all',
                      selectedProvider === provider.id
                        ? 'border-accent-primary bg-accent-primary/10'
                        : provider.ready
                        ? 'border-border hover:border-border-hover'
                        : 'border-border/50 opacity-60 cursor-not-allowed'
                    )}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Cloud className="w-5 h-5 text-accent-primary" />
                        <span className="font-medium">{provider.name}</span>
                      </div>
                      {provider.ready ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-warning" />
                      )}
                    </div>
                    <p className="text-xs text-foreground-muted mb-2">{provider.description}</p>

                    <div className="flex flex-wrap gap-1 mb-2">
                      {provider.features.map((feature, i) => (
                        <span key={i} className="badge badge-primary text-xs">
                          {feature}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-foreground-muted">
                      {provider.quota_minutes && (
                        <span>{provider.quota_minutes} min/month</span>
                      )}
                      {provider.supported_languages && (
                        <span>{provider.supported_languages}+ languages</span>
                      )}
                      {provider.watermark_in_starter && (
                        <span className="text-warning">Watermark in Starter</span>
                      )}
                    </div>

                    {!provider.ready && provider.requires_api_key && (
                      <Link href="/settings" className="text-xs text-accent-primary hover:underline mt-2 block">
                        Configure API key
                      </Link>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Media Upload */}
          {!mediaFile ? (
            <Dropzone
              onFile={handleFileSelect}
              accept="video/*,audio/*"
              maxSize={1024 * 1024 * 1024}
              icon={Video}
              title="Drag and drop your video or audio here"
              subtitle="Supports MP4, MOV, WebM, MP3, WAV (max 1GB)"
            />
          ) : (
            <div className="glass-card p-6 space-y-4">
              {isVideo ? (
                <div className="relative rounded-xl overflow-hidden bg-black">
                  <video
                    src={previewUrl}
                    className="w-full max-h-[300px] object-contain"
                    controls
                  />
                  <button
                    onClick={handleClearMedia}
                    className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-full"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-surface-1 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <Play className="w-5 h-5 text-accent-primary" />
                      <div>
                        <p className="font-medium truncate max-w-[250px]">{mediaFile.name}</p>
                        <p className="text-sm text-foreground-muted">
                          {(mediaFile.size / (1024 * 1024)).toFixed(1)} MB
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleClearMedia}
                      className="btn btn-secondary btn-sm"
                    >
                      Remove
                    </button>
                  </div>
                  <audio src={previewUrl} controls className="w-full" />
                </div>
              )}

              {isUploading && (
                <div className="flex items-center gap-2 text-sm text-foreground-muted">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Uploading...
                </div>
              )}
            </div>
          )}

          {/* Result */}
          {currentJob?.status === 'completed' && (
            <div className="glass-card p-6 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Dubbed Content</h3>
                <span className="badge badge-success">Completed</span>
              </div>

              <div className="bg-surface-1 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground-muted">Source</span>
                  <span>{languages[currentJob.source_language] || currentJob.source_language}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-muted">Target</span>
                  <span>{languages[currentJob.target_language] || currentJob.target_language}</span>
                </div>
              </div>

              {isVideo ? (
                <video
                  src={getDubbingDownloadUrl(currentJob.id)}
                  className="w-full rounded-xl"
                  controls
                />
              ) : (
                <audio
                  src={getDubbingDownloadUrl(currentJob.id)}
                  controls
                  className="w-full"
                />
              )}

              <button onClick={handleDownload} className="btn btn-primary">
                <Download className="w-4 h-4" />
                Download Dubbed {isVideo ? 'Video' : 'Audio'}
              </button>

              <p className="text-xs text-foreground-muted">
                Note: Starter plan includes watermark on dubbed content.
              </p>
            </div>
          )}
        </div>
      }
      // Sidebar with tips
      sidebar={
        <SidebarPanel
          title="AI-Powered Dubbing"
          description="Automatically translate and re-voice your content in 32+ languages while preserving emotion and timing."
          icon={Globe}
          tips={[
            'AI transcribes and translates the content',
            'Clones each speaker\'s voice characteristics',
            'Re-voices in target language with matching emotion',
            'Syncs timing with original video',
          ]}
          metadata={
            currentProvider
              ? [
                  { label: 'Provider', value: currentProvider.name },
                  { label: 'Direction', value: `${sourceLanguage === 'auto' ? 'Auto' : languages[sourceLanguage] || sourceLanguage} → ${languages[targetLanguage] || targetLanguage}` },
                  ...(currentProvider.quota_minutes
                    ? [{ label: 'Quota', value: `${currentProvider.quota_minutes} min/month` }]
                    : []),
                ]
              : undefined
          }
          warning={
            currentProvider?.watermark_in_starter
              ? 'Starter plan: 6 min/month with watermark'
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
