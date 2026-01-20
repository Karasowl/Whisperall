'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Music,
  Loader2,
  AlertCircle,
  Download,
  Play,
  Pause,
  Clock,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
  Scissors,
  Mic2,
  Drum,
  Guitar,
  Piano,
} from 'lucide-react';
import { ProgressBar } from '@/components/ProgressBar';
import {
  getMusicProviders,
  generateMusic,
  getMusicJobStatus,
  getMusicDownloadUrl,
  getStemSeparationStatus,
  getStemModels,
  startStemSeparation,
  getStemSeparationJob,
  getStemDownloadUrl,
  MusicProviderInfo,
  MusicJob,
  StemModel,
  StemSeparationJob,
} from '@/lib/api';

// Example lyrics in LRC format
const EXAMPLE_LYRICS = `[00:00.00] Verse 1:
[00:05.00] Walking through the city lights
[00:10.00] Stars are shining way up high
[00:15.00] Every moment feels so right
[00:20.00] Tonight we're gonna fly

[00:25.00] Chorus:
[00:30.00] We're unstoppable, we're infinite
[00:35.00] Nothing's gonna bring us down
[00:40.00] We're unstoppable, we're limitless
[00:45.00] Turn it up, let's make some sound`;

const STYLE_PRESETS = [
  { label: 'Pop', value: 'upbeat pop with catchy melody and synths' },
  { label: 'Rock', value: 'energetic rock with electric guitars and drums' },
  { label: 'Electronic', value: 'electronic dance music with heavy bass' },
  { label: 'Acoustic', value: 'soft acoustic with guitar and warm vocals' },
  { label: 'Hip Hop', value: 'hip hop beat with 808s and trap elements' },
  { label: 'Jazz', value: 'smooth jazz with piano and saxophone' },
  { label: 'Latin', value: 'reggaeton latino con ritmo tropical' },
  { label: 'Custom', value: '' },
];

export default function MusicPage() {
  // Providers
  const [providers, setProviders] = useState<MusicProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('diffrhythm');
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Form
  const [lyrics, setLyrics] = useState(EXAMPLE_LYRICS);
  const [stylePrompt, setStylePrompt] = useState('upbeat pop with catchy melody and synths');
  const [selectedPreset, setSelectedPreset] = useState('Pop');
  const [duration, setDuration] = useState(180);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [seed, setSeed] = useState(-1);
  const [numSteps, setNumSteps] = useState(100);
  const [guidanceScale, setGuidanceScale] = useState(5.0);

  // Job state
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentJob, setCurrentJob] = useState<MusicJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Audio playback
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stem separation state
  const [stemAvailable, setStemAvailable] = useState(false);
  const [stemModels, setStemModels] = useState<StemModel[]>([]);
  const [selectedStemModel, setSelectedStemModel] = useState('htdemucs');
  const [isSeparating, setIsSeparating] = useState(false);
  const [stemJob, setStemJob] = useState<StemSeparationJob | null>(null);

  // Load providers and stem separation status
  useEffect(() => {
    async function loadProviders() {
      try {
        const data = await getMusicProviders();
        setProviders(data);
        if (data.length > 0) {
          setSelectedProvider(data[0].id);
          setSelectedModel(data[0].default_model);
        }
      } catch (err: any) {
        console.error('Failed to load music providers:', err);
      }
    }

    async function loadStemStatus() {
      try {
        const status = await getStemSeparationStatus();
        setStemAvailable(status.available);
        if (status.available) {
          const models = await getStemModels();
          setStemModels(models);
        }
      } catch (err: any) {
        console.error('Failed to load stem separation status:', err);
      }
    }

    loadProviders();
    loadStemStatus();
  }, []);

  // Poll job status
  useEffect(() => {
    if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const status = await getMusicJobStatus(currentJob.id);
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

  // Poll stem separation job status
  useEffect(() => {
    if (!stemJob || stemJob.status === 'completed' || stemJob.status === 'failed') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const status = await getStemSeparationJob(stemJob.id);
        setStemJob(status);

        if (status.status === 'completed' || status.status === 'failed') {
          setIsSeparating(false);
          if (status.status === 'failed') {
            setError(status.error || 'Stem separation failed');
          }
        }
      } catch (err) {
        console.error('Failed to get stem job status:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [stemJob?.id, stemJob?.status]);

  const currentProviderInfo = providers.find((p) => p.id === selectedProvider);

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    const presetData = STYLE_PRESETS.find((p) => p.label === preset);
    if (presetData && presetData.value) {
      setStylePrompt(presetData.value);
    }
  };

  const handleGenerate = async () => {
    if (!lyrics.trim()) {
      setError('Please enter lyrics');
      return;
    }

    setError(null);
    setIsGenerating(true);
    setCurrentJob(null);

    try {
      const { job_id } = await generateMusic({
        lyrics,
        style_prompt: stylePrompt,
        duration_seconds: duration,
        provider: selectedProvider,
        model: selectedModel || undefined,
        seed: seed >= 0 ? seed : undefined,
        num_inference_steps: numSteps,
        guidance_scale: guidanceScale,
      });

      // Start polling
      const initialStatus = await getMusicJobStatus(job_id);
      setCurrentJob(initialStatus);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to start generation');
      setIsGenerating(false);
    }
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleDownload = () => {
    if (!currentJob?.id) return;
    window.open(getMusicDownloadUrl(currentJob.id), '_blank');
  };

  const handleSeparateStems = async () => {
    if (!currentJob?.output_path) return;

    setError(null);
    setIsSeparating(true);
    setStemJob(null);

    try {
      const { job_id } = await startStemSeparation(currentJob.output_path, selectedStemModel);
      const initialStatus = await getStemSeparationJob(job_id);
      setStemJob(initialStatus);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to start stem separation');
      setIsSeparating(false);
    }
  };

  const getStemIcon = (stem: string) => {
    switch (stem) {
      case 'vocals':
        return <Mic2 className="w-4 h-4" />;
      case 'drums':
        return <Drum className="w-4 h-4" />;
      case 'bass':
        return <Music className="w-4 h-4" />;
      case 'guitar':
        return <Guitar className="w-4 h-4" />;
      case 'piano':
        return <Piano className="w-4 h-4" />;
      default:
        return <Music className="w-4 h-4" />;
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-gradient tracking-tight">Music Generator</h1>
        <p className="text-foreground-secondary text-lg">
          Create original songs with lyrics and instrumentals using AI
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
              <Music className="w-4 h-4" />
              Music Engine
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
                    <p className="text-xs text-warning mt-2">
                      Not installed - pip install diffrhythm
                    </p>
                  )}
                </button>
              ))}
            </div>

            {/* Model variant selector */}
            {currentProviderInfo && currentProviderInfo.models.length > 1 && (
              <div className="mt-4">
                <label className="label text-sm mb-2">Model Variant</label>
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
                      {model.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Style Presets */}
          <div className="card p-6 space-y-4">
            <label className="label">Style</label>

            <div className="flex gap-2 flex-wrap">
              {STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetChange(preset.label)}
                  className={`px-4 py-2 rounded-lg text-sm transition-all ${
                    selectedPreset === preset.label
                      ? 'bg-accent-primary text-black'
                      : 'bg-surface-2 hover:bg-surface-3'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <textarea
              value={stylePrompt}
              onChange={(e) => {
                setStylePrompt(e.target.value);
                setSelectedPreset('Custom');
              }}
              placeholder="Describe the style of music you want..."
              rows={2}
              className="input textarea"
            />
          </div>

          {/* Lyrics Editor */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <label className="label">Lyrics (LRC Format)</label>
              <button
                onClick={() => setLyrics(EXAMPLE_LYRICS)}
                className="text-sm text-accent-primary hover:underline"
              >
                Load Example
              </button>
            </div>

            <div className="bg-surface-1 rounded-lg p-3 mb-3">
              <div className="flex items-start gap-2 text-sm text-foreground-muted">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p>
                    Use LRC format with timestamps: <code>[MM:SS.CC]</code> followed by lyrics.
                  </p>
                  <p className="mt-1">
                    Example: <code>[00:15.00] This is the first line</code>
                  </p>
                </div>
              </div>
            </div>

            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder={`[00:00.00] First line of your song
[00:05.00] Second line...`}
              rows={12}
              className="input textarea font-mono text-sm"
            />

            <div className="flex justify-between text-sm text-foreground-muted">
              <span>{lyrics.split('\n').length} lines</span>
            </div>
          </div>

          {/* Duration */}
          <div className="card p-6 space-y-4">
            <label className="label flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Duration: {formatDuration(duration)}
            </label>

            <input
              type="range"
              min={30}
              max={currentProviderInfo?.max_duration_seconds || 285}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full accent-accent-primary"
            />

            <div className="flex justify-between text-xs text-foreground-muted">
              <span>0:30</span>
              <span>{formatDuration(currentProviderInfo?.max_duration_seconds || 285)} max</span>
            </div>
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
                  <label className="label text-sm mb-2">
                    Inference Steps: {numSteps}
                  </label>
                  <input
                    type="range"
                    min={25}
                    max={200}
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
                    max={15}
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
                status={`Generating music... ${Math.round(currentJob.progress * 100)}%`}
                details={currentJob.status}
              />
            </div>
          )}

          {/* Result */}
          {currentJob?.status === 'completed' && currentJob.output_path && (
            <div className="card p-6 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Generated Music</h3>
                <span className="badge badge-success">Completed</span>
              </div>

              <audio
                ref={audioRef}
                src={getMusicDownloadUrl(currentJob.id)}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />

              <div className="flex items-center gap-4">
                <button
                  onClick={handlePlayPause}
                  className="btn btn-primary p-4 rounded-full"
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6" />
                  ) : (
                    <Play className="w-6 h-6" />
                  )}
                </button>

                <div className="flex-1">
                  <p className="font-medium">
                    {selectedPreset !== 'Custom' ? selectedPreset : 'Custom'} Track
                  </p>
                  <p className="text-sm text-foreground-muted">
                    {formatDuration(duration)} - {currentProviderInfo?.name}
                  </p>
                </div>

                <button onClick={handleDownload} className="btn btn-secondary">
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>

              {/* Stem Separation */}
              {stemAvailable && (
                <div className="border-t border-border pt-4 mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-medium flex items-center gap-2">
                        <Scissors className="w-4 h-4" />
                        Separate Stems
                      </h4>
                      <p className="text-sm text-foreground-muted">
                        Extract vocals, drums, bass, and other instruments
                      </p>
                    </div>

                    {stemModels.length > 1 && (
                      <select
                        value={selectedStemModel}
                        onChange={(e) => setSelectedStemModel(e.target.value)}
                        className="input py-1 px-2 text-sm w-auto"
                        disabled={isSeparating}
                      >
                        {stemModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {!stemJob && !isSeparating && (
                    <button
                      onClick={handleSeparateStems}
                      disabled={isSeparating}
                      className="btn btn-secondary w-full"
                    >
                      <Scissors className="w-4 h-4" />
                      Separate Stems (Demucs)
                    </button>
                  )}

                  {isSeparating && stemJob && (
                    <ProgressBar
                      progress={stemJob.progress * 100}
                      status={`Separating stems... ${Math.round(stemJob.progress * 100)}%`}
                      details={stemJob.status}
                    />
                  )}

                  {stemJob?.status === 'completed' && stemJob.output_stems && (
                    <div className="space-y-2">
                      <p className="text-sm text-foreground-muted mb-2">
                        Stems extracted:
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(stemJob.output_stems).map(([stemName]) => (
                          <a
                            key={stemName}
                            href={getStemDownloadUrl(stemJob.id, stemName)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2 rounded-lg bg-surface-1 hover:bg-surface-2 transition-colors"
                          >
                            {getStemIcon(stemName)}
                            <span className="capitalize text-sm">{stemName}</span>
                            <Download className="w-3 h-3 ml-auto text-foreground-muted" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column - Generate button and info */}
        <div className="space-y-6">
          <div className="card p-6 sticky top-24 space-y-4">
            <div className="text-center">
              <Music className="w-16 h-16 mx-auto text-accent-primary mb-4" />
              <h3 className="text-lg font-semibold mb-2">Ready to Create</h3>
              <p className="text-sm text-foreground-muted">
                AI will generate a complete song with vocals and instrumentals matching your lyrics
                and style.
              </p>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !lyrics.trim()}
              className="btn btn-primary w-full py-4 text-base animate-pulse-glow"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 fill-current" />
                  Generate Music
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
                  <span className="text-foreground-muted">Max Duration</span>
                  <span>{formatDuration(currentProviderInfo.max_duration_seconds)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-muted">VRAM Required</span>
                  <span>{currentProviderInfo.vram_gb}GB</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
