'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  AudioWaveform,
  Download,
  Volume2,
  VolumeX,
  Cloud,
  HardDrive,
  Check,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import {
  uploadVoiceIsolatorAudio,
  startVoiceIsolation,
  getVoiceIsolatorJob,
  getVoiceIsolatorDownloadUrl,
  getVoiceIsolatorProviders,
  getProviderSelection,
  setProvider,
  VoiceIsolatorJob,
  VoiceIsolatorProvider,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
  ModuleShell,
  Dropzone,
  ActionBar,
  SidebarPanel,
  ExecutionModeSwitch,
  type ExecutionMode,
} from '@/components/module';

export default function VoiceIsolatorPage() {
  // Provider state
  const [providers, setProviders] = useState<VoiceIsolatorProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('elevenlabs');
  const [loadingProviders, setLoadingProviders] = useState(true);

  // Upload state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPath, setAudioPath] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  // Job state
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentJob, setCurrentJob] = useState<VoiceIsolatorJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Device state (for local providers)
  const [device, setDevice] = useState<ExecutionMode>('auto');

  // Refs
  const didLoadProviderRef = useRef(false);

  // Load providers and saved selection on mount
  useEffect(() => {
    async function loadProvidersAndSelection() {
      try {
        const [providerList, selection] = await Promise.all([
          getVoiceIsolatorProviders(),
          getProviderSelection('voice_isolator').catch(() => null),
        ]);
        setProviders(providerList);

        // Use saved selection if available
        if (selection?.selected) {
          setSelectedProvider(selection.selected);
        } else {
          // Select first ready provider by default
          const readyProvider = providerList.find(p => p.ready);
          if (readyProvider) {
            setSelectedProvider(readyProvider.id);
          }
        }
      } catch (err) {
        console.error('Failed to load voice isolator providers:', err);
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
    setProvider('voice_isolator', selectedProvider, {}).catch((err) => {
      console.error('Failed to save voice isolator provider selection:', err);
    });
  }, [selectedProvider]);

  // Poll job status
  useEffect(() => {
    if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const status = await getVoiceIsolatorJob(currentJob.id);
        setCurrentJob(status);

        if (status.status === 'completed' || status.status === 'failed') {
          setIsProcessing(false);
          if (status.status === 'failed') {
            setError(status.error || 'Voice isolation failed');
          }
        }
      } catch (err) {
        console.error('Failed to get job status:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentJob?.id, currentJob?.status]);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('audio/')) {
      setError('Please select an audio file');
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setError('File too large. Maximum size is 100MB');
      return;
    }

    setAudioFile(file);
    setError(null);
    setCurrentJob(null);

    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    setIsUploading(true);
    try {
      const { input_path } = await uploadVoiceIsolatorAudio(file);
      setAudioPath(input_path);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Upload failed');
      setAudioFile(null);
      setPreviewUrl('');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleClearAudio = () => {
    setAudioFile(null);
    setAudioPath('');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setCurrentJob(null);
  };

  const handleIsolate = async () => {
    if (!audioPath) {
      setError('Please upload an audio file first');
      return;
    }

    const provider = providers.find(p => p.id === selectedProvider);
    if (!provider?.ready) {
      setError('Selected provider is not ready. Please check the API key or install required dependencies.');
      return;
    }

    setError(null);
    setIsProcessing(true);
    setCurrentJob(null);

    try {
      const { job_id } = await startVoiceIsolation(audioPath, selectedProvider);
      const initialStatus = await getVoiceIsolatorJob(job_id);
      setCurrentJob(initialStatus);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to start isolation');
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!currentJob?.id) return;
    window.open(getVoiceIsolatorDownloadUrl(currentJob.id), '_blank');
  };

  const currentProvider = providers.find(p => p.id === selectedProvider);
  const isReady = !!audioPath && !isUploading && !!currentProvider?.ready;

  return (
    <ModuleShell
      title="Voice Isolator"
      description="Remove background noise, music, and ambient sounds to isolate clean vocals"
      icon={AudioWaveform}
      layout="default"
      settingsPosition="right"
      settingsTitle="Provider Settings"
      // Execution controls (only for local providers)
      executionControls={
        currentProvider?.type === 'local' && (
          <ExecutionModeSwitch
            mode={device}
            onModeChange={setDevice}
            showFastMode={currentProvider?.supports_fast_mode ?? false}
          />
        )
      }
      // Progress state
      progress={
        isProcessing && currentJob
          ? {
              value: currentJob.progress * 100,
              status: 'Isolating voice...',
              details: `Using ${currentProvider?.name || selectedProvider}`,
            }
          : null
      }
      // Settings panel (right side)
      settings={
        <>
          {/* Current Provider Info */}
          {currentProvider && (
            <div className="p-4 rounded-xl bg-surface-1 border border-border space-y-2">
              <div className="flex items-center gap-2">
                {currentProvider.type === 'api' ? (
                  <Cloud className="w-5 h-5 text-accent-primary" />
                ) : (
                  <HardDrive className="w-5 h-5 text-green-500" />
                )}
                <span className="font-medium">{currentProvider.name}</span>
              </div>
              <p className="text-xs text-foreground-muted">{currentProvider.description}</p>
              <div className="flex flex-wrap gap-1">
                {currentProvider.features.map((feature, i) => (
                  <span key={i} className="badge badge-primary text-xs">
                    {feature}
                  </span>
                ))}
              </div>
              {currentProvider.type === 'api' && currentProvider.quota_minutes && (
                <p className="text-xs text-foreground-muted">
                  {currentProvider.quota_minutes} min/month
                </p>
              )}
              {currentProvider.type === 'local' && currentProvider.vram_gb && (
                <p className="text-xs text-foreground-muted">
                  Requires {currentProvider.vram_gb}GB VRAM
                </p>
              )}
            </div>
          )}
        </>
      }
      // Action button
      actions={
        <ActionBar
          primary={{
            label: 'Isolate Voice',
            icon: Sparkles,
            onClick: handleIsolate,
            disabled: !isReady,
          }}
          loading={isProcessing || isUploading}
          loadingText={isUploading ? 'Uploading...' : 'Isolating...'}
          pulse={isReady && !isProcessing}
        />
      }
      // Main content
      main={
        <div className="space-y-6">
          {/* Provider Selection */}
          <div className="glass-card p-6 space-y-4">
            <label className="label flex items-center gap-2">
              <AudioWaveform className="w-4 h-4" />
              Select Provider
            </label>

            {loadingProviders ? (
              <div className="flex items-center gap-2 text-foreground-muted">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Loading providers...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                        {provider.type === 'api' ? (
                          <Cloud className="w-5 h-5 text-accent-primary" />
                        ) : (
                          <HardDrive className="w-5 h-5 text-green-500" />
                        )}
                        <span className="font-medium">{provider.name}</span>
                      </div>
                      {provider.ready ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-warning" />
                      )}
                    </div>
                    <p className="text-xs text-foreground-muted mb-2">{provider.description}</p>

                    {/* Features */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      {provider.features.map((feature, i) => (
                        <span key={i} className="badge badge-primary text-xs">
                          {feature}
                        </span>
                      ))}
                    </div>

                    {/* Quota/VRAM info */}
                    <div className="text-xs text-foreground-muted">
                      {provider.type === 'api' && provider.quota_minutes && (
                        <span>{provider.quota_minutes} min/month</span>
                      )}
                      {provider.type === 'local' && provider.vram_gb && (
                        <span>Requires {provider.vram_gb}GB VRAM</span>
                      )}
                    </div>

                    {!provider.ready && provider.requires_api_key && (
                      <Link href="/settings" className="text-xs text-accent-primary hover:underline mt-2 block">
                        Configure API key
                      </Link>
                    )}
                    {!provider.ready && provider.install_command && (
                      <code className="text-xs text-foreground-muted bg-surface-2 px-2 py-1 rounded mt-2 block">
                        {provider.install_command}
                      </code>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Audio Upload */}
          {!audioFile ? (
            <Dropzone
              onFile={handleFileSelect}
              accept="audio/*"
              maxSize={100 * 1024 * 1024}
              icon={VolumeX}
              title="Drag and drop your noisy audio here"
              subtitle="Supports MP3, WAV, M4A, FLAC (max 100MB)"
            />
          ) : (
            <div className="glass-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Volume2 className="w-5 h-5 text-accent-primary" />
                  <div>
                    <p className="font-medium truncate max-w-[250px]">{audioFile.name}</p>
                    <p className="text-sm text-foreground-muted">
                      {(audioFile.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClearAudio}
                  className="btn btn-secondary btn-sm"
                >
                  Remove
                </button>
              </div>

              <div>
                <label className="label text-sm mb-2">Original Audio</label>
                <audio src={previewUrl} controls className="w-full" />
              </div>

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
                <h3 className="text-lg font-semibold">Isolated Voice</h3>
                <span className="badge badge-success">Completed</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Original */}
                <div className="bg-surface-1 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <VolumeX className="w-4 h-4 text-foreground-muted" />
                    <span className="text-sm font-medium">Original (with noise)</span>
                  </div>
                  <audio src={previewUrl} controls className="w-full" />
                </div>

                {/* Isolated */}
                <div className="bg-accent-primary/10 border border-accent-primary/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AudioWaveform className="w-4 h-4 text-accent-primary" />
                    <span className="text-sm font-medium text-accent-primary">
                      Isolated Voice
                    </span>
                  </div>
                  <audio
                    src={getVoiceIsolatorDownloadUrl(currentJob.id)}
                    controls
                    className="w-full"
                  />
                </div>
              </div>

              <button onClick={handleDownload} className="btn btn-primary">
                <Download className="w-4 h-4" />
                Download Isolated Audio
              </button>
            </div>
          )}
        </div>
      }
      // Sidebar with tips
      sidebar={
        <SidebarPanel
          title="Audio Isolation"
          description="AI-powered noise removal that isolates speech from background noise, music, and ambient sounds."
          icon={AudioWaveform}
          tips={[
            'Clean up podcast recordings',
            'Remove background music from interviews',
            'Extract vocals for voice cloning',
            'Improve speech recognition accuracy',
          ]}
          metadata={
            currentProvider
              ? [
                  { label: 'Provider', value: currentProvider.name },
                  { label: 'Type', value: currentProvider.type === 'api' ? 'Cloud' : 'Local' },
                  ...(currentProvider.quota_minutes
                    ? [{ label: 'Quota', value: `${currentProvider.quota_minutes} min/month` }]
                    : []),
                ]
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
