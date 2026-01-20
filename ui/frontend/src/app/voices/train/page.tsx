'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Mic2,
  Upload,
  Loader2,
  AlertCircle,
  Play,
  Pause,
  Trash2,
  CheckCircle,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Clock,
  FileAudio,
  Languages,
  Cpu,
  Info,
} from 'lucide-react';
import { ProgressBar } from '@/components/ProgressBar';
import {
  getTrainingEngines,
  createTrainingDataset,
  uploadAudioToDataset,
  getDatasetEntries,
  getDatasetStats,
  updateDatasetEntry,
  deleteDatasetEntry,
  transcribeDataset,
  startVoiceTraining,
  getTrainingStatus,
  cancelVoiceTraining,
  TrainingEngine,
  DatasetEntry,
  DatasetStats,
  TrainingStatus,
} from '@/lib/api';

type Step = 'upload' | 'transcribe' | 'configure' | 'training';

export default function VoiceTrainPage() {
  // Step state
  const [currentStep, setCurrentStep] = useState<Step>('upload');

  // Engines
  const [engines, setEngines] = useState<TrainingEngine[]>([]);
  const [selectedEngine, setSelectedEngine] = useState('styletts2');

  // Dataset state
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [entries, setEntries] = useState<DatasetEntry[]>([]);
  const [stats, setStats] = useState<DatasetStats | null>(null);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Transcription state
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionModel, setTranscriptionModel] = useState('base');

  // Training configuration
  const [voiceName, setVoiceName] = useState('');
  const [epochs, setEpochs] = useState(100);
  const [batchSize, setBatchSize] = useState(4);
  const [learningRate, setLearningRate] = useState(0.0001);
  const [language, setLanguage] = useState('en');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Training state
  const [isTraining, setIsTraining] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatus | null>(null);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Load engines
  useEffect(() => {
    async function loadEngines() {
      try {
        const data = await getTrainingEngines();
        setEngines(data);
        if (data.length > 0) {
          setSelectedEngine(data[0].id);
        }
      } catch (err) {
        console.error('Failed to load training engines:', err);
      }
    }
    loadEngines();
  }, []);

  // Create dataset on mount
  useEffect(() => {
    async function initDataset() {
      try {
        const { dataset_id } = await createTrainingDataset('Voice Training');
        setDatasetId(dataset_id);
      } catch (err) {
        console.error('Failed to create dataset:', err);
      }
    }
    initDataset();
  }, []);

  // Load entries and stats when dataset changes
  useEffect(() => {
    if (!datasetId) return;

    async function loadDataset() {
      try {
        const [entriesData, statsData] = await Promise.all([
          getDatasetEntries(datasetId!),
          getDatasetStats(datasetId!),
        ]);
        setEntries(entriesData);
        setStats(statsData);
      } catch (err) {
        console.error('Failed to load dataset:', err);
      }
    }
    loadDataset();
  }, [datasetId]);

  // Poll training status
  useEffect(() => {
    if (!isTraining) return;

    const interval = setInterval(async () => {
      try {
        const status = await getTrainingStatus();
        setTrainingStatus(status);

        if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
          setIsTraining(false);
          if (status.status === 'failed') {
            setError(status.error || 'Training failed');
          }
        }
      } catch (err) {
        console.error('Failed to get training status:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isTraining]);

  const currentEngineInfo = engines.find((e) => e.id === selectedEngine);

  const handleFilesSelect = useCallback(
    async (files: FileList | File[]) => {
      if (!datasetId) return;

      setIsUploading(true);
      setError(null);

      const fileArray = Array.from(files);

      for (const file of fileArray) {
        if (!file.type.startsWith('audio/')) {
          continue;
        }

        try {
          const entry = await uploadAudioToDataset(datasetId, file);
          setEntries((prev) => [...prev, entry]);
        } catch (err: any) {
          console.error('Failed to upload file:', err);
          setError(err.message || 'Upload failed');
        }
      }

      // Refresh stats
      try {
        const statsData = await getDatasetStats(datasetId);
        setStats(statsData);
      } catch (err) {
        console.error('Failed to refresh stats:', err);
      }

      setIsUploading(false);
    },
    [datasetId]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFilesSelect(e.dataTransfer.files);
    },
    [handleFilesSelect]
  );

  const handleDeleteEntry = async (entryId: string) => {
    if (!datasetId) return;

    try {
      await deleteDatasetEntry(datasetId, entryId);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));

      // Refresh stats
      const statsData = await getDatasetStats(datasetId);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to delete entry:', err);
    }
  };

  const handleUpdateTranscription = async (entryId: string) => {
    if (!datasetId) return;

    try {
      const updated = await updateDatasetEntry(datasetId, entryId, editText);
      setEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)));
      setEditingEntry(null);
      setEditText('');

      // Refresh stats
      const statsData = await getDatasetStats(datasetId);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to update transcription:', err);
    }
  };

  const handleTranscribeAll = async () => {
    if (!datasetId) return;

    setIsTranscribing(true);
    setError(null);

    try {
      const results = await transcribeDataset(datasetId, undefined, transcriptionModel);

      // Update entries with new transcriptions
      setEntries((prev) =>
        prev.map((e) => {
          if (results[e.id] && !results[e.id].startsWith('ERROR:')) {
            return { ...e, transcription: results[e.id] };
          }
          return e;
        })
      );

      // Refresh stats
      const statsData = await getDatasetStats(datasetId);
      setStats(statsData);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Transcription failed');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleStartTraining = async () => {
    if (!datasetId || !voiceName.trim()) {
      setError('Please enter a voice name');
      return;
    }

    setError(null);
    setIsTraining(true);
    setTrainingStatus(null);
    setCurrentStep('training');

    try {
      await startVoiceTraining({
        dataset_id: datasetId,
        voice_name: voiceName,
        engine: selectedEngine,
        epochs,
        batch_size: batchSize,
        learning_rate: learningRate,
        language,
      });

      // Start polling for status
      const status = await getTrainingStatus();
      setTrainingStatus(status);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to start training');
      setIsTraining(false);
      setCurrentStep('configure');
    }
  };

  const handleCancelTraining = async () => {
    try {
      await cancelVoiceTraining();
    } catch (err) {
      console.error('Failed to cancel training:', err);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatEta = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const canProceedToTranscribe = entries.length >= 10;
  const canProceedToConfigure =
    stats && stats.entries_with_transcription >= stats.valid_entries * 0.8;
  const canStartTraining = voiceName.trim() && canProceedToConfigure;

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <Link href="/voices" className="btn btn-ghost p-2">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-4xl font-bold text-gradient tracking-tight">Voice Training</h1>
            <p className="text-foreground-secondary text-lg">
              Create a custom TTS voice from your audio samples
            </p>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="card p-4 flex items-center gap-3 border-error/30 bg-error/10">
          <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
          <p className="text-error-300">{error}</p>
        </div>
      )}

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-4">
        {(['upload', 'transcribe', 'configure', 'training'] as Step[]).map((step, index) => (
          <div key={step} className="flex items-center">
            <button
              onClick={() => {
                if (step === 'training' && !isTraining) return;
                setCurrentStep(step);
              }}
              disabled={
                (step === 'transcribe' && !canProceedToTranscribe) ||
                (step === 'configure' && !canProceedToConfigure) ||
                (step === 'training' && !isTraining && !trainingStatus?.output_voice_id)
              }
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                currentStep === step
                  ? 'bg-accent-primary text-black'
                  : 'bg-surface-1 text-foreground-muted hover:bg-surface-2'
              }`}
            >
              <span className="w-6 h-6 rounded-full bg-surface-2 flex items-center justify-center text-sm">
                {index + 1}
              </span>
              <span className="capitalize hidden sm:inline">{step}</span>
            </button>
            {index < 3 && (
              <div className="w-8 h-px bg-border mx-2" />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: Upload */}
          {currentStep === 'upload' && (
            <>
              <div className="card p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Upload className="w-5 h-5" />
                    Upload Audio Samples
                  </h2>
                  {stats && (
                    <span className="text-sm text-foreground-muted">
                      {entries.length} files ({stats.total_duration_minutes.toFixed(1)} min)
                    </span>
                  )}
                </div>

                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                    isDragging
                      ? 'border-accent-primary bg-accent-primary/10'
                      : 'border-border hover:border-border-hover'
                  }`}
                >
                  <Mic2 className="w-12 h-12 mx-auto text-foreground-muted mb-4" />
                  <p className="text-foreground-secondary mb-2">
                    Drag and drop audio files here, or
                  </p>
                  <label className="btn btn-secondary cursor-pointer">
                    Select Files
                    <input
                      type="file"
                      accept="audio/*"
                      multiple
                      onChange={(e) => e.target.files && handleFilesSelect(e.target.files)}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-foreground-muted mt-4">
                    Upload at least 10 audio clips (15-60 min recommended)
                  </p>
                </div>

                {isUploading && (
                  <div className="flex items-center gap-2 text-sm text-foreground-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading...
                  </div>
                )}
              </div>

              {/* Entry List */}
              {entries.length > 0 && (
                <div className="card p-6 space-y-4">
                  <h3 className="font-semibold">Uploaded Files</h3>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-surface-1"
                      >
                        <FileAudio className="w-5 h-5 text-foreground-muted flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{entry.filename}</p>
                          <p className="text-xs text-foreground-muted">
                            {formatDuration(entry.duration_seconds)}
                          </p>
                        </div>
                        {entry.is_valid ? (
                          <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-error flex-shrink-0" />
                        )}
                        <button
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="p-1 hover:bg-surface-2 rounded"
                        >
                          <Trash2 className="w-4 h-4 text-foreground-muted" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Step 2: Transcribe */}
          {currentStep === 'transcribe' && (
            <>
              <div className="card p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Languages className="w-5 h-5" />
                    Transcribe Audio
                  </h2>
                  {stats && (
                    <span className="text-sm text-foreground-muted">
                      {stats.entries_with_transcription}/{stats.valid_entries} transcribed
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <select
                    value={transcriptionModel}
                    onChange={(e) => setTranscriptionModel(e.target.value)}
                    className="input w-auto"
                    disabled={isTranscribing}
                  >
                    <option value="tiny">Tiny (Fast)</option>
                    <option value="base">Base (Balanced)</option>
                    <option value="small">Small (Better)</option>
                    <option value="medium">Medium (Best)</option>
                  </select>

                  <button
                    onClick={handleTranscribeAll}
                    disabled={isTranscribing}
                    className="btn btn-primary"
                  >
                    {isTranscribing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Transcribing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Transcribe All
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Entry List with Transcriptions */}
              <div className="card p-6 space-y-4">
                <h3 className="font-semibold">Review Transcriptions</h3>
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {entries.map((entry) => (
                    <div key={entry.id} className="p-3 rounded-lg bg-surface-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{entry.filename}</span>
                        <span className="text-xs text-foreground-muted">
                          {formatDuration(entry.duration_seconds)}
                        </span>
                      </div>

                      {editingEntry === entry.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="input textarea w-full text-sm"
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleUpdateTranscription(entry.id)}
                              className="btn btn-primary btn-sm"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingEntry(null);
                                setEditText('');
                              }}
                              className="btn btn-ghost btn-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => {
                            setEditingEntry(entry.id);
                            setEditText(entry.transcription);
                          }}
                          className={`text-sm cursor-pointer p-2 rounded border ${
                            entry.transcription
                              ? 'border-transparent hover:border-border'
                              : 'border-dashed border-border text-foreground-muted'
                          }`}
                        >
                          {entry.transcription || 'Click to add transcription...'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Step 3: Configure */}
          {currentStep === 'configure' && (
            <>
              <div className="card p-6 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Cpu className="w-5 h-5" />
                  Training Configuration
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="label">Voice Name</label>
                    <input
                      type="text"
                      value={voiceName}
                      onChange={(e) => setVoiceName(e.target.value)}
                      placeholder="My Custom Voice"
                      className="input w-full"
                    />
                  </div>

                  <div>
                    <label className="label">Training Engine</label>
                    <div className="grid grid-cols-1 gap-3 mt-2">
                      {engines.map((engine) => (
                        <button
                          key={engine.id}
                          onClick={() => setSelectedEngine(engine.id)}
                          disabled={!engine.available}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            selectedEngine === engine.id
                              ? 'border-accent-primary bg-accent-primary/10'
                              : 'border-border hover:border-border-hover bg-surface-1'
                          } ${!engine.available ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold">{engine.name}</span>
                            <span className="text-xs px-2 py-1 rounded-full bg-surface-2">
                              {engine.vram_gb_training}GB VRAM
                            </span>
                          </div>
                          <p className="text-sm text-foreground-muted">{engine.description}</p>
                          {!engine.available && (
                            <p className="text-xs text-warning mt-2">
                              Not installed - {engine.install_command}
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="label">Language</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="input w-full"
                    >
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                      <option value="ja">Japanese</option>
                      <option value="zh">Chinese</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Advanced Settings */}
              <div className="card p-6">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center justify-between w-full"
                >
                  <span className="font-semibold">Advanced Settings</span>
                  {showAdvanced ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </button>

                {showAdvanced && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="label text-sm">Epochs: {epochs}</label>
                      <input
                        type="range"
                        min={10}
                        max={500}
                        value={epochs}
                        onChange={(e) => setEpochs(Number(e.target.value))}
                        className="w-full accent-accent-primary"
                      />
                    </div>

                    <div>
                      <label className="label text-sm">Batch Size: {batchSize}</label>
                      <input
                        type="range"
                        min={1}
                        max={16}
                        value={batchSize}
                        onChange={(e) => setBatchSize(Number(e.target.value))}
                        className="w-full accent-accent-primary"
                      />
                    </div>

                    <div>
                      <label className="label text-sm">
                        Learning Rate: {learningRate.toExponential(1)}
                      </label>
                      <input
                        type="range"
                        min={-5}
                        max={-3}
                        step={0.5}
                        value={Math.log10(learningRate)}
                        onChange={(e) =>
                          setLearningRate(Math.pow(10, Number(e.target.value)))
                        }
                        className="w-full accent-accent-primary"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Step 4: Training */}
          {currentStep === 'training' && trainingStatus && (
            <div className="card p-6 space-y-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                Training in Progress
              </h2>

              <ProgressBar
                progress={(trainingStatus.progress || 0) * 100}
                status={`${trainingStatus.status} - Epoch ${trainingStatus.current_epoch || 0}/${trainingStatus.total_epochs || 0}`}
                details={
                  trainingStatus.eta_seconds
                    ? `ETA: ${formatEta(trainingStatus.eta_seconds)}`
                    : undefined
                }
              />

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-1 rounded-lg p-4">
                  <p className="text-sm text-foreground-muted">Current Loss</p>
                  <p className="text-2xl font-bold">
                    {trainingStatus.current_loss?.toFixed(4) || '-'}
                  </p>
                </div>
                <div className="bg-surface-1 rounded-lg p-4">
                  <p className="text-sm text-foreground-muted">Best Loss</p>
                  <p className="text-2xl font-bold">
                    {trainingStatus.best_loss !== Infinity
                      ? trainingStatus.best_loss?.toFixed(4)
                      : '-'}
                  </p>
                </div>
              </div>

              {isTraining && (
                <button onClick={handleCancelTraining} className="btn btn-secondary w-full">
                  Cancel Training
                </button>
              )}

              {trainingStatus.status === 'completed' && (
                <div className="text-center space-y-4">
                  <CheckCircle className="w-16 h-16 mx-auto text-success" />
                  <h3 className="text-xl font-semibold">Training Complete!</h3>
                  <p className="text-foreground-muted">
                    Your voice "{voiceName}" is now available in the Voices library.
                  </p>
                  <Link href="/voices" className="btn btn-primary">
                    Go to Voices
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column - Stats and info */}
        <div className="space-y-6">
          <div className="card p-6 sticky top-24 space-y-4">
            <h3 className="font-semibold">Dataset Status</h3>

            {stats && (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-foreground-muted">Audio Files</span>
                  <span className={entries.length >= 10 ? 'text-success' : 'text-warning'}>
                    {entries.length}/10 min
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-foreground-muted">Total Duration</span>
                  <span>{stats.total_duration_minutes.toFixed(1)} min</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-foreground-muted">Transcribed</span>
                  <span
                    className={
                      stats.entries_with_transcription >= stats.valid_entries * 0.8
                        ? 'text-success'
                        : 'text-warning'
                    }
                  >
                    {stats.entries_with_transcription}/{stats.valid_entries}
                  </span>
                </div>

                <div className="w-full bg-surface-2 rounded-full h-2 mt-2">
                  <div
                    className="bg-accent-primary h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (stats.total_duration_minutes / 30) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-foreground-muted text-center">
                  {Math.min(100, Math.round((stats.total_duration_minutes / 30) * 100))}% of recommended (30 min)
                </p>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="pt-4 space-y-2">
              {currentStep === 'upload' && (
                <button
                  onClick={() => setCurrentStep('transcribe')}
                  disabled={!canProceedToTranscribe}
                  className="btn btn-primary w-full"
                >
                  Continue to Transcription
                </button>
              )}

              {currentStep === 'transcribe' && (
                <button
                  onClick={() => setCurrentStep('configure')}
                  disabled={!canProceedToConfigure}
                  className="btn btn-primary w-full"
                >
                  Continue to Configuration
                </button>
              )}

              {currentStep === 'configure' && (
                <button
                  onClick={handleStartTraining}
                  disabled={!canStartTraining || isTraining}
                  className="btn btn-primary w-full"
                >
                  {isTraining ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Start Training
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Info box */}
            <div className="bg-surface-1 rounded-lg p-4">
              <div className="flex items-start gap-2 text-sm text-foreground-muted">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground mb-1">Tips for best results</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Use high-quality, noise-free audio</li>
                    <li>Include varied speech patterns</li>
                    <li>Keep clips between 3-15 seconds</li>
                    <li>Ensure accurate transcriptions</li>
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
