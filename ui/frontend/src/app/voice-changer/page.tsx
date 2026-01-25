'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  Loader2,
  Download,
  Wand2,
  Volume2,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  Search,
} from 'lucide-react';
import {
  getVoiceChangerVoices,
  uploadVoiceChangerAudio,
  startVoiceChanger,
  getVoiceChangerJob,
  getVoiceChangerDownloadUrl,
  getProviderSelection,
  setProvider,
  VoiceChangerProvider,
  VoiceChangerVoice,
  VoiceChangerJob,
} from '@/lib/api';
import { UnifiedProviderSelector } from '@/components/UnifiedProviderSelector';
import { cn } from '@/lib/utils';
import {
  ModuleShell,
  Dropzone,
  ActionBar,
  SidebarPanel,
} from '@/components/module';
import { Slider } from '@/components/Slider';
import { Toggle } from '@/components/Toggle';

export default function VoiceChangerPage() {
  // Providers
  const [selectedProvider, setSelectedProvider] = useState<string>('elevenlabs');
  const [selectedModel, setSelectedModel] = useState<string>('eleven_english_sts_v2');
  const [currentProviderInfo, setCurrentProviderInfo] = useState<VoiceChangerProvider | null>(null);

  // Voices
  const [voices, setVoices] = useState<VoiceChangerVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [voiceSearch, setVoiceSearch] = useState('');
  const [loadingVoices, setLoadingVoices] = useState(false);

  // Upload state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPath, setAudioPath] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Settings
  const [stability, setStability] = useState(0.5);
  const [similarityBoost, setSimilarityBoost] = useState(0.75);
  const [style, setStyle] = useState(0);
  const [removeNoise, setRemoveNoise] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Job state
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentJob, setCurrentJob] = useState<VoiceChangerJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Audio playback
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const didLoadProviderRef = useRef(false);

  // Load saved provider selection
  useEffect(() => {
    async function loadProviderSelection() {
      try {
        const selection = await getProviderSelection('voice_changer');
        if (selection?.selected) {
          setSelectedProvider(selection.selected);
          if (selection.config?.model) {
            setSelectedModel(selection.config.model);
          }
          if (selection.config?.voice_id) {
            setSelectedVoice(selection.config.voice_id);
          }
        }
      } catch (err: any) {
        console.error('Failed to load voice changer provider selection:', err);
      } finally {
        didLoadProviderRef.current = true;
      }
    }
    loadProviderSelection();
  }, []);

  // Persist provider selection
  useEffect(() => {
    if (!didLoadProviderRef.current) return;
    setProvider('voice_changer', selectedProvider, {
      model: selectedModel,
      voice_id: selectedVoice,
    }).catch((err) => {
      console.error('Failed to save voice changer provider selection:', err);
    });
  }, [selectedProvider, selectedModel, selectedVoice]);

  // Load voices when provider changes
  useEffect(() => {
    async function loadVoices() {
      if (selectedProvider !== 'elevenlabs') return;

      setLoadingVoices(true);
      try {
        const data = await getVoiceChangerVoices();
        setVoices(data);
        if (data.length > 0 && !selectedVoice) {
          setSelectedVoice(data[0].voice_id);
        }
      } catch (err: any) {
        console.error('Failed to load voices:', err);
        setError('Failed to load voices. Check your ElevenLabs API key.');
      } finally {
        setLoadingVoices(false);
      }
    }
    loadVoices();
  }, [selectedProvider]);

  // Poll job status
  useEffect(() => {
    if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const status = await getVoiceChangerJob(currentJob.id);
        setCurrentJob(status);

        if (status.status === 'completed' || status.status === 'failed') {
          setIsProcessing(false);
          if (status.status === 'failed') {
            setError(status.error || 'Voice change failed');
          }
        }
      } catch (err) {
        console.error('Failed to get job status:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentJob?.id, currentJob?.status]);

  const filteredVoices = voices.filter((v) =>
    v.name.toLowerCase().includes(voiceSearch.toLowerCase())
  );

  const handleFileSelect = useCallback(async (file: File) => {
    setAudioFile(file);
    setUploadError(null);
    setError(null);
    setCurrentJob(null);

    setIsUploading(true);
    try {
      const { input_path } = await uploadVoiceChangerAudio(file);
      setAudioPath(input_path);
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || err.message || 'Upload failed');
      setAudioFile(null);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleClearAudio = () => {
    setAudioFile(null);
    setAudioPath('');
    setCurrentJob(null);
    setUploadError(null);
  };

  const handleConvert = async () => {
    if (!audioPath || !selectedVoice) {
      setError('Please upload audio and select a voice');
      return;
    }

    setError(null);
    setIsProcessing(true);
    setCurrentJob(null);

    try {
      const { job_id } = await startVoiceChanger({
        input_path: audioPath,
        voice_id: selectedVoice,
        model_id: selectedModel,
        stability,
        similarity_boost: similarityBoost,
        style,
        remove_background_noise: removeNoise,
      });

      const initialStatus = await getVoiceChangerJob(job_id);
      setCurrentJob(initialStatus);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to start conversion');
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!currentJob?.id) return;
    window.open(getVoiceChangerDownloadUrl(currentJob.id), '_blank');
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const selectedVoiceInfo = voices.find((v) => v.voice_id === selectedVoice);
  const isReady = !!audioPath && !!selectedVoice && !isUploading && !!currentProviderInfo?.ready;

  return (
    <ModuleShell
      title="Voice Changer"
      description="Transform any voice into a different voice using AI speech-to-speech technology"
      icon={Wand2}
      layout="default"
      settingsPosition="right"
      settingsTitle="Conversion Settings"
      // Progress state
      progress={
        isProcessing && currentJob
          ? {
            value: currentJob.progress * 100,
            status: 'Converting voice...',
            details: currentJob.status,
          }
          : null
      }
      // Settings panel (right side)
      settings={
        <>
          {/* Target Voice Selection */}
          <div className="space-y-3">
            <label className="label flex items-center gap-2">
              <Mic className="w-4 h-4" />
              Target Voice
            </label>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
              <input
                type="text"
                placeholder="Search voices..."
                value={voiceSearch}
                onChange={(e) => setVoiceSearch(e.target.value)}
                className="input w-full pl-9"
              />
            </div>

            {loadingVoices ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="ml-2 text-sm text-foreground-muted">Loading voices...</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                {filteredVoices.map((voice) => (
                  <button
                    key={voice.voice_id}
                    onClick={() => setSelectedVoice(voice.voice_id)}
                    className={cn(
                      'p-2.5 rounded-lg border text-left transition-all',
                      selectedVoice === voice.voice_id
                        ? 'border-accent-primary bg-accent-primary/10'
                        : 'border-glass-border hover:border-glass-border-hover bg-surface-1'
                    )}
                  >
                    <span className="font-medium text-sm block truncate">{voice.name}</span>
                    <span className="text-xs text-foreground-muted capitalize">
                      {voice.category}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {voices.length === 0 && !loadingVoices && currentProviderInfo?.ready && (
              <p className="text-center text-foreground-muted py-4 text-sm">
                No voices available. Check your ElevenLabs API key.
              </p>
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
                <Slider
                  label="Stability"
                  value={stability}
                  onChange={setStability}
                  min={0}
                  max={1}
                  step={0.05}
                  description="Higher = more consistent, Lower = more expressive"
                />

                <Slider
                  label="Similarity"
                  value={similarityBoost}
                  onChange={setSimilarityBoost}
                  min={0}
                  max={1}
                  step={0.05}
                  description="How closely to match the target voice"
                />

                <Slider
                  label="Style"
                  value={style}
                  onChange={setStyle}
                  min={0}
                  max={1}
                  step={0.05}
                />

                <Toggle
                  label="Remove background noise"
                  enabled={removeNoise}
                  onChange={setRemoveNoise}
                  className="pt-2"
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
            label: isProcessing ? 'Converting...' : isUploading ? 'Uploading...' : 'Transform Voice',
            icon: Wand2,
            onClick: handleConvert,
            disabled: !isReady || isProcessing,
          }}
          loading={isProcessing || isUploading}
          loadingText={isUploading ? 'Uploading...' : 'Converting...'}
          pulse={isReady && !isProcessing}
        />
      }
      // Main content
      main={
        <div className="space-y-6">
          {/* Provider Selection */}
          <UnifiedProviderSelector
            service="voice_changer"
            selected={selectedProvider}
            onSelect={setSelectedProvider}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            onProviderInfoChange={(info) => setCurrentProviderInfo(info as VoiceChangerProvider | null)}
            variant="cards"
            showModelSelector
            label="Voice Changer Engine"
          />

          {/* Audio Upload */}
          <Dropzone
            onFile={handleFileSelect}
            file={audioFile}
            onClear={handleClearAudio}
            fileType="audio"
            maxSize={50 * 1024 * 1024}
            uploading={isUploading}
            error={uploadError}
            title="Drag and drop your audio here, or"
            subtitle="Supports MP3, WAV, M4A (max 50MB)"
          />

          {/* Result */}
          {currentJob?.status === 'completed' && (
            <div className="glass-card p-6 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-accent-primary" />
                  <h3 className="text-lg font-semibold">Converted Audio</h3>
                </div>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400">
                  Completed
                </span>
              </div>

              <div className="bg-surface-1 rounded-lg p-4">
                <audio
                  ref={audioRef}
                  src={getVoiceChangerDownloadUrl(currentJob.id)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  className="hidden"
                />
                <div className="flex items-center gap-4">
                  <button
                    onClick={togglePlayback}
                    className="p-3 rounded-full bg-accent-primary text-black hover:bg-accent-primary/90 transition-colors"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  </button>
                  <div className="flex-1">
                    <p className="font-medium">Transformed audio</p>
                    <p className="text-sm text-foreground-muted">
                      Voice: {selectedVoiceInfo?.name || 'Unknown'}
                    </p>
                  </div>
                  <button
                    onClick={handleDownload}
                    className="btn btn-secondary"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      }
      // Sidebar with tips and summary
      sidebar={
        <SidebarPanel
          title="Voice Transformation"
          description="Upload any audio and transform the speaker's voice while preserving the content and emotion."
          icon={Wand2}
          tips={[
            'Clear audio without background noise works best',
            'Use the noise removal option for noisy recordings',
            'Emotion and pacing are preserved from original',
            'Longer audio files may take more time to process',
          ]}
          metadata={
            currentProviderInfo
              ? [
                { label: 'Provider', value: currentProviderInfo.name },
                {
                  label: 'Model',
                  value: currentProviderInfo.models.find((m) => m.id === selectedModel)?.name || selectedModel,
                },
                ...(currentProviderInfo.quota_minutes
                  ? [{ label: 'Quota', value: `${currentProviderInfo.quota_minutes} min/month` }]
                  : []),
                ...(selectedVoiceInfo
                  ? [{ label: 'Target Voice', value: selectedVoiceInfo.name }]
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
