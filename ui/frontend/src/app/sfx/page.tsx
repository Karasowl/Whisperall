'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Volume2,
  Loader2,
  Download,
  Video,
  ChevronDown,
  ChevronUp,
  Sparkles,
  X,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ModuleShell,
  Dropzone,
  ActionBar,
  SidebarPanel,
  ExecutionModeSwitch,
  type ExecutionMode,
} from '@/components/module';
import { PlanGate } from '@/components/PlanGate';
import { Slider } from '@/components/Slider';
import { Toggle } from '@/components/Toggle';
import {
  getSFXProviders,
  uploadVideoForSFX,
  generateSFX,
  getSFXJobStatus,
  getSFXAudioDownloadUrl,
  getSFXVideoDownloadUrl,
  getProviderSelection,
  setProvider,
  SFXProviderInfo,
  SFXJob,
} from '@/lib/api';

const PROMPT_EXAMPLES = [
  'Footsteps on wooden floor',
  'Door creaking and closing',
  'Glass breaking',
  'Thunder and rain',
  'Car engine starting',
  'Birds chirping in forest',
  'Ocean waves on beach',
  'Fire crackling',
];

export default function SFXPage() {
  return (
    <PlanGate
      requiredPlan="pro"
      title="Sound Effects"
      description="Generate sound effects (optionally synced to video)."
      icon={Volume2}
      feature="Sound Effects"
    >
      <SFXProPage />
    </PlanGate>
  );
}

function SFXProPage() {
  // Providers
  const [providers, setProviders] = useState<SFXProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('mmaudio');
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Upload state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPath, setVideoPath] = useState<string>('');
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Form
  const [prompt, setPrompt] = useState('');
  const [mergeWithVideo, setMergeWithVideo] = useState(true);
  const [mixOriginal, setMixOriginal] = useState(false);
  const [originalVolume, setOriginalVolume] = useState(0.3);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [seed, setSeed] = useState(-1);
  const [numSteps, setNumSteps] = useState(25);
  const [guidanceScale, setGuidanceScale] = useState(4.5);

  // Job state
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentJob, setCurrentJob] = useState<SFXJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Device state (for local providers)
  const [device, setDevice] = useState<ExecutionMode>('auto');

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const didLoadProviderRef = useRef(false);

  // Load providers and saved selection
  useEffect(() => {
    async function loadProvidersAndSelection() {
      try {
        const [data, selection] = await Promise.all([
          getSFXProviders(),
          getProviderSelection('sfx').catch(() => null),
        ]);
        setProviders(data);

        if (selection?.selected) {
          setSelectedProvider(selection.selected);
          if (selection.config?.model) {
            setSelectedModel(selection.config.model);
          } else {
            const provider = data.find((p) => p.id === selection.selected);
            if (provider && provider.default_model) {
              setSelectedModel(provider.default_model);
            }
          }
        } else if (data.length > 0) {
          setSelectedProvider(data[0].id);
          if (data[0].default_model) {
            setSelectedModel(data[0].default_model);
          }
        }
      } catch (err: any) {
        console.error('Failed to load SFX providers:', err);
      } finally {
        didLoadProviderRef.current = true;
      }
    }
    loadProvidersAndSelection();
  }, []);

  // Persist provider selection
  useEffect(() => {
    if (!didLoadProviderRef.current) return;
    setProvider('sfx', selectedProvider, { model: selectedModel }).catch((err) => {
      console.error('Failed to save SFX provider selection:', err);
    });
  }, [selectedProvider, selectedModel]);

  // Poll job status
  useEffect(() => {
    if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const status = await getSFXJobStatus(currentJob.id);
        setCurrentJob(status);

        if (status.status === 'completed' || status.status === 'failed') {
          setIsGenerating(false);
          if (status.status === 'failed') {
            setError(status.error || 'Generation failed');
          }
        }
      } catch (err) {
        console.error('Failed to get job status:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentJob?.id, currentJob?.status]);

  const currentProviderInfo = providers.find((p) => p.id === selectedProvider);

  const handleFileSelect = useCallback(async (file: File) => {
    setVideoFile(file);
    setUploadError(null);
    setError(null);

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setVideoPreviewUrl(previewUrl);

    // Upload to server
    setIsUploading(true);
    try {
      const { video_path } = await uploadVideoForSFX(file);
      setVideoPath(video_path);
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || err.message || 'Upload failed');
      setVideoFile(null);
      setVideoPreviewUrl('');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleClearVideo = () => {
    setVideoFile(null);
    setVideoPath('');
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setVideoPreviewUrl('');
    setCurrentJob(null);
    setUploadError(null);
  };

  const handleGenerate = async () => {
    if (!videoPath) {
      setError('Please upload a video first');
      return;
    }

    setError(null);
    setIsGenerating(true);
    setCurrentJob(null);

    try {
      const { job_id } = await generateSFX({
        video_path: videoPath,
        prompt: prompt || undefined,
        provider: selectedProvider,
        model: selectedModel || undefined,
        merge_with_video: mergeWithVideo,
        mix_original: mixOriginal,
        original_volume: originalVolume,
        seed: seed >= 0 ? seed : undefined,
        num_inference_steps: numSteps,
        guidance_scale: guidanceScale,
      });

      const initialStatus = await getSFXJobStatus(job_id);
      setCurrentJob(initialStatus);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to start generation');
      setIsGenerating(false);
    }
  };

  const handleDownloadAudio = () => {
    if (!currentJob?.id) return;
    window.open(getSFXAudioDownloadUrl(currentJob.id), '_blank');
  };

  const handleDownloadVideo = () => {
    if (!currentJob?.id) return;
    window.open(getSFXVideoDownloadUrl(currentJob.id), '_blank');
  };

  const isReady = !!videoPath && !isUploading && !isGenerating;

  return (
    <ModuleShell
      title="Sound Effects Generator"
      description="Generate synchronized audio and sound effects from video using AI"
      icon={Volume2}
      layout="default"
      settingsPosition="right"
      settingsTitle="Output Settings"
      // Execution controls (only for local providers)
      executionControls={
        currentProviderInfo?.type === 'local' && (
          <ExecutionModeSwitch
            mode={device}
            onModeChange={setDevice}
            showFastMode={currentProviderInfo?.supports_fast_mode ?? false}
          />
        )
      }
      // Progress state
      progress={
        isGenerating && currentJob
          ? {
            value: currentJob.progress * 100,
            status: 'Generating sound effects...',
            details: currentJob.status,
          }
          : null
      }
      // Settings panel (right side)
      settings={
        <>
          {/* Output Options */}
          <div className="space-y-4">
            <Toggle
              label="Merge audio with video"
              enabled={mergeWithVideo}
              onChange={setMergeWithVideo}
            />
            <p className="text-xs text-foreground-muted -mt-2 ml-11">
              Create a new video file with the generated audio
            </p>

            {mergeWithVideo && (
              <div className="ml-4 pl-4 border-l border-glass-border space-y-4">
                <Toggle
                  label="Mix with original audio"
                  enabled={mixOriginal}
                  onChange={setMixOriginal}
                />

                {mixOriginal && (
                  <Slider
                    label="Original Volume"
                    value={originalVolume}
                    onChange={setOriginalVolume}
                    min={0}
                    max={1}
                    step={0.1}
                  />
                )}
              </div>
            )}
          </div>

          {/* Advanced Settings */}
          <div className="border-t border-glass-border pt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="text-sm font-medium text-foreground">Advanced Settings</span>
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4 text-foreground-muted" />
              ) : (
                <ChevronDown className="w-4 h-4 text-foreground-muted" />
              )}
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="label text-sm">Seed (-1 for random)</label>
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(Number(e.target.value))}
                    min={-1}
                    className="input w-full"
                  />
                </div>

                <Slider
                  label="Inference Steps"
                  value={numSteps}
                  onChange={setNumSteps}
                  min={10}
                  max={100}
                  step={5}
                />

                <Slider
                  label="Guidance Scale"
                  value={guidanceScale}
                  onChange={setGuidanceScale}
                  min={1}
                  max={10}
                  step={0.5}
                />
              </div>
            )}
          </div>
        </>
      }
      // Action button
      actions={
        <ActionBar
          primary={{
            label: isGenerating ? 'Generating...' : isUploading ? 'Uploading...' : 'Generate SFX',
            icon: Sparkles,
            onClick: handleGenerate,
            disabled: !isReady,
          }}
          loading={isGenerating || isUploading}
          loadingText={isUploading ? 'Uploading...' : 'Generating...'}
          pulse={isReady}
        />
      }
      // Main content
      main={
        <div className="space-y-6">
          {/* Provider Selection */}
          <div className="glass-card p-6 space-y-4">
            <label className="label flex items-center gap-2">
              <Volume2 className="w-4 h-4" />
              SFX Engine
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => {
                    setSelectedProvider(provider.id);
                    if (provider.default_model) {
                      setSelectedModel(provider.default_model);
                    }
                  }}
                  disabled={!provider.ready}
                  className={cn(
                    'p-4 rounded-xl border-2 text-left transition-all',
                    selectedProvider === provider.id
                      ? 'border-accent-primary bg-accent-primary/10'
                      : 'border-glass-border hover:border-glass-border-hover bg-surface-1',
                    !provider.ready && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold flex items-center gap-2">
                      {provider.name}
                      {selectedProvider === provider.id && (
                        <Check className="w-4 h-4 text-accent-primary" />
                      )}
                    </span>
                    <span className="text-xs px-2 py-1 rounded-full bg-surface-2">
                      {provider.vram_gb}GB VRAM
                    </span>
                  </div>
                  <p className="text-sm text-foreground-muted">{provider.description}</p>
                  {!provider.ready && (
                    <p className="text-xs text-amber-400 mt-2">Not installed - pip install mmaudio</p>
                  )}
                </button>
              ))}
            </div>

            {/* Model variant selector */}
            {currentProviderInfo && currentProviderInfo.models && currentProviderInfo.models.length > 1 && (
              <div className="mt-4 pt-4 border-t border-glass-border">
                <label className="label text-sm mb-2">Quality</label>
                <div className="flex gap-2 flex-wrap">
                  {currentProviderInfo.models.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => setSelectedModel(model.id)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-sm transition-all',
                        selectedModel === model.id
                          ? 'bg-accent-primary text-black font-medium'
                          : 'bg-surface-2 hover:bg-surface-3'
                      )}
                    >
                      {model.name} ({model.vram_gb}GB)
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Video Upload */}
          {!videoFile ? (
            <Dropzone
              onFile={handleFileSelect}
              file={videoFile}
              onClear={handleClearVideo}
              fileType="video"
              maxSize={500 * 1024 * 1024}
              uploading={isUploading}
              error={uploadError}
              title="Drag and drop your video here, or"
              subtitle="Supports MP4, WebM, MOV (max 500MB)"
            />
          ) : (
            <div className="glass-card p-6 space-y-4">
              <label className="label flex items-center gap-2">
                <Video className="w-4 h-4" />
                Input Video
              </label>

              <div className="relative rounded-xl overflow-hidden bg-black">
                <video
                  src={videoPreviewUrl}
                  className="w-full max-h-[300px] object-contain"
                  controls
                />
                <button
                  onClick={handleClearVideo}
                  className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground-muted">{videoFile.name}</span>
                <span className="text-foreground-muted">
                  {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                </span>
              </div>

              {isUploading && (
                <div className="flex items-center gap-2 text-sm text-foreground-muted">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </div>
              )}

              {uploadError && <p className="text-sm text-red-400">{uploadError}</p>}
            </div>
          )}

          {/* Prompt */}
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <label className="label">Prompt (Optional)</label>
              {currentProviderInfo?.supports_prompt && (
                <span className="text-xs text-foreground-muted">
                  Describe the sounds you want to generate
                </span>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              {PROMPT_EXAMPLES.slice(0, 4).map((example) => (
                <button
                  key={example}
                  onClick={() => setPrompt(example)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-full transition-colors',
                    prompt === example
                      ? 'bg-accent-primary text-black'
                      : 'bg-surface-2 hover:bg-surface-3'
                  )}
                >
                  {example}
                </button>
              ))}
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Leave empty to auto-generate based on video content, or describe specific sounds..."
              rows={3}
              className="input textarea"
            />
          </div>

          {/* Result */}
          {currentJob?.status === 'completed' && (
            <div className="glass-card p-6 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-accent-primary" />
                  <h3 className="text-lg font-semibold">Generated Sound Effects</h3>
                </div>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400">
                  Completed
                </span>
              </div>

              {currentJob.output_video_path ? (
                <div className="rounded-xl overflow-hidden bg-black">
                  <video
                    ref={videoRef}
                    src={getSFXVideoDownloadUrl(currentJob.id)}
                    className="w-full max-h-[400px] object-contain"
                    controls
                  />
                </div>
              ) : (
                <audio
                  ref={audioRef}
                  src={getSFXAudioDownloadUrl(currentJob.id)}
                  controls
                  className="w-full"
                />
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={handleDownloadAudio} className="btn btn-secondary">
                  <Download className="w-4 h-4" />
                  Download Audio
                </button>

                {currentJob.output_video_path && (
                  <button onClick={handleDownloadVideo} className="btn btn-primary">
                    <Download className="w-4 h-4" />
                    Download Video
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      }
      // Sidebar with tips and summary
      sidebar={
        <SidebarPanel
          title="Video to Audio"
          description="AI analyzes your video and generates synchronized sound effects that match the visual content."
          icon={Volume2}
          tips={[
            'Works best with clear visual actions',
            'Add a prompt to guide specific sounds',
            'Enable mixing to keep original dialogue',
            'Longer videos require more processing time',
          ]}
          metadata={
            currentProviderInfo
              ? [
                { label: 'Engine', value: currentProviderInfo.name },
                {
                  label: 'Max Video',
                  value: `${Math.floor((currentProviderInfo.max_video_duration_seconds ?? 0) / 60)} min`,
                },
                { label: 'VRAM Required', value: `${currentProviderInfo.vram_gb ?? 0}GB` },
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
