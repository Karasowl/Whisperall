'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Volume2,
  Loader2,
  AlertCircle,
  Download,
  Play,
  Pause,
  Upload,
  Video,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
  X,
} from 'lucide-react';
import { ProgressBar } from '@/components/ProgressBar';
import {
  getSFXProviders,
  uploadVideoForSFX,
  generateSFX,
  getSFXJobStatus,
  getSFXAudioDownloadUrl,
  getSFXVideoDownloadUrl,
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
  const [isDragging, setIsDragging] = useState(false);

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

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load providers
  useEffect(() => {
    async function loadProviders() {
      try {
        const data = await getSFXProviders();
        setProviders(data);
        if (data.length > 0) {
          setSelectedProvider(data[0].id);
          setSelectedModel(data[0].default_model);
        }
      } catch (err: any) {
        console.error('Failed to load SFX providers:', err);
      }
    }
    loadProviders();
  }, []);

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
    // Validate file type
    if (!file.type.startsWith('video/')) {
      setUploadError('Please select a video file');
      return;
    }

    // Validate file size (max 500MB)
    if (file.size > 500 * 1024 * 1024) {
      setUploadError('File too large. Maximum size is 500MB');
      return;
    }

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

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleClearVideo = () => {
    setVideoFile(null);
    setVideoPath('');
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setVideoPreviewUrl('');
    setCurrentJob(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

      // Start polling
      const initialStatus = await getSFXJobStatus(job_id);
      setCurrentJob(initialStatus);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to start generation');
      setIsGenerating(false);
    }
  };

  const handlePlayPause = () => {
    const mediaElement = currentJob?.output_video_path ? videoRef.current : audioRef.current;
    if (!mediaElement) return;

    if (isPlaying) {
      mediaElement.pause();
    } else {
      mediaElement.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleDownloadAudio = () => {
    if (!currentJob?.id) return;
    window.open(getSFXAudioDownloadUrl(currentJob.id), '_blank');
  };

  const handleDownloadVideo = () => {
    if (!currentJob?.id) return;
    window.open(getSFXVideoDownloadUrl(currentJob.id), '_blank');
  };

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-gradient tracking-tight">Sound Effects Generator</h1>
        <p className="text-foreground-secondary text-lg">
          Generate synchronized audio and sound effects from video using AI
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
          {/* Provider Selection */}
          <div className="card p-6 space-y-4">
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
                    setSelectedModel(provider.default_model);
                  }}
                  disabled={!provider.ready}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    selectedProvider === provider.id
                      ? 'border-accent-primary bg-accent-primary/10'
                      : 'border-border hover:border-border-hover bg-surface-1'
                  } ${!provider.ready ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">{provider.name}</span>
                    <span className="text-xs px-2 py-1 rounded-full bg-surface-2">
                      {provider.vram_gb}GB VRAM
                    </span>
                  </div>
                  <p className="text-sm text-foreground-muted">{provider.description}</p>
                  {!provider.ready && (
                    <p className="text-xs text-warning mt-2">Not installed - pip install mmaudio</p>
                  )}
                </button>
              ))}
            </div>

            {/* Model variant selector */}
            {currentProviderInfo && currentProviderInfo.models.length > 1 && (
              <div className="mt-4">
                <label className="label text-sm mb-2">Model Size</label>
                <div className="flex gap-2 flex-wrap">
                  {currentProviderInfo.models.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => setSelectedModel(model.id)}
                      className={`px-4 py-2 rounded-lg text-sm transition-all ${
                        selectedModel === model.id
                          ? 'bg-accent-primary text-black'
                          : 'bg-surface-2 hover:bg-surface-3'
                      }`}
                    >
                      {model.name} ({model.vram_gb}GB)
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Video Upload */}
          <div className="card p-6 space-y-4">
            <label className="label flex items-center gap-2">
              <Video className="w-4 h-4" />
              Input Video
            </label>

            {!videoFile ? (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                  isDragging
                    ? 'border-accent-primary bg-accent-primary/10'
                    : 'border-border hover:border-border-hover'
                }`}
              >
                <Upload className="w-12 h-12 mx-auto text-foreground-muted mb-4" />
                <p className="text-foreground-secondary mb-2">
                  Drag and drop your video here, or
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-secondary"
                >
                  Select File
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <p className="text-xs text-foreground-muted mt-4">
                  Supports MP4, WebM, MOV (max 500MB)
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative rounded-xl overflow-hidden bg-black">
                  <video
                    src={videoPreviewUrl}
                    className="w-full max-h-[300px] object-contain"
                    controls
                  />
                  <button
                    onClick={handleClearVideo}
                    className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-full"
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

                {uploadError && (
                  <p className="text-sm text-error">{uploadError}</p>
                )}
              </div>
            )}
          </div>

          {/* Prompt */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <label className="label">Prompt (Optional)</label>
              {currentProviderInfo?.supports_prompt && (
                <span className="text-xs text-foreground-muted">
                  Describe the sounds you want to generate
                </span>
              )}
            </div>

            <div className="flex gap-2 flex-wrap mb-2">
              {PROMPT_EXAMPLES.slice(0, 4).map((example) => (
                <button
                  key={example}
                  onClick={() => setPrompt(example)}
                  className="text-xs px-3 py-1 rounded-full bg-surface-2 hover:bg-surface-3"
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

          {/* Output Options */}
          <div className="card p-6 space-y-4">
            <label className="label">Output Options</label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={mergeWithVideo}
                onChange={(e) => setMergeWithVideo(e.target.checked)}
                className="w-5 h-5 rounded accent-accent-primary"
              />
              <div>
                <span className="font-medium">Merge audio with video</span>
                <p className="text-sm text-foreground-muted">
                  Create a new video file with the generated audio
                </p>
              </div>
            </label>

            {mergeWithVideo && (
              <div className="ml-8 space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mixOriginal}
                    onChange={(e) => setMixOriginal(e.target.checked)}
                    className="w-5 h-5 rounded accent-accent-primary"
                  />
                  <div>
                    <span className="font-medium">Mix with original audio</span>
                    <p className="text-sm text-foreground-muted">
                      Blend generated SFX with the original video audio
                    </p>
                  </div>
                </label>

                {mixOriginal && (
                  <div className="ml-8">
                    <label className="label text-sm mb-2">
                      Original Audio Volume: {Math.round(originalVolume * 100)}%
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={originalVolume}
                      onChange={(e) => setOriginalVolume(Number(e.target.value))}
                      className="w-full accent-accent-primary"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Advanced Settings */}
          <div className="card p-6">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full"
            >
              <span className="label">Advanced Settings</span>
              {showAdvanced ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="label text-sm mb-2">Seed (-1 for random)</label>
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(Number(e.target.value))}
                    min={-1}
                    className="input w-full"
                  />
                </div>

                <div>
                  <label className="label text-sm mb-2">Inference Steps: {numSteps}</label>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={numSteps}
                    onChange={(e) => setNumSteps(Number(e.target.value))}
                    className="w-full accent-accent-primary"
                  />
                </div>

                <div>
                  <label className="label text-sm mb-2">
                    Guidance Scale: {guidanceScale.toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={0.5}
                    value={guidanceScale}
                    onChange={(e) => setGuidanceScale(Number(e.target.value))}
                    className="w-full accent-accent-primary"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Progress */}
          {isGenerating && currentJob && (
            <div className="card p-6">
              <ProgressBar
                progress={currentJob.progress * 100}
                status={`Generating sound effects... ${Math.round(currentJob.progress * 100)}%`}
                details={currentJob.status}
              />
            </div>
          )}

          {/* Result */}
          {currentJob?.status === 'completed' && (
            <div className="card p-6 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Generated Sound Effects</h3>
                <span className="badge badge-success">Completed</span>
              </div>

              {currentJob.output_video_path ? (
                <div className="rounded-xl overflow-hidden bg-black">
                  <video
                    ref={videoRef}
                    src={getSFXVideoDownloadUrl(currentJob.id)}
                    className="w-full max-h-[400px] object-contain"
                    controls
                    onEnded={() => setIsPlaying(false)}
                  />
                </div>
              ) : (
                <audio
                  ref={audioRef}
                  src={getSFXAudioDownloadUrl(currentJob.id)}
                  onEnded={() => setIsPlaying(false)}
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

        {/* Right column - Generate button and info */}
        <div className="space-y-6">
          <div className="card p-6 sticky top-24 space-y-4">
            <div className="text-center">
              <Volume2 className="w-16 h-16 mx-auto text-accent-primary mb-4" />
              <h3 className="text-lg font-semibold mb-2">Video to Audio</h3>
              <p className="text-sm text-foreground-muted">
                AI analyzes your video and generates synchronized sound effects that match the
                visual content.
              </p>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !videoPath || isUploading}
              className="btn btn-primary w-full py-4 text-base animate-pulse-glow"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : isUploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 fill-current" />
                  Generate SFX
                </>
              )}
            </button>

            {currentProviderInfo && (
              <div className="bg-surface-1 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground-muted">Engine</span>
                  <span>{currentProviderInfo.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-muted">Max Video</span>
                  <span>{Math.floor(currentProviderInfo.max_video_duration_seconds / 60)} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-muted">VRAM Required</span>
                  <span>{currentProviderInfo.vram_gb}GB</span>
                </div>
              </div>
            )}

            <div className="bg-surface-1 rounded-lg p-4">
              <div className="flex items-start gap-2 text-sm text-foreground-muted">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground mb-1">Tips</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Works best with clear visual actions</li>
                    <li>Add a prompt to guide specific sounds</li>
                    <li>Enable mixing to keep original dialogue</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
