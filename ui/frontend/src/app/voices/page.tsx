'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  Play,
  Pause,
  Trash2,
  Plus,
  X,
  Loader2,
  Mic,
  Scissors,
  Video,
} from 'lucide-react';
import { getVoices, createVoice, deleteVoice, analyzeVoice, getAudioUrl, Voice } from '@/lib/api';
import { cn } from '@/lib/utils';
import VoiceRecorder from '@/components/VoiceRecorder';
import { AudioTrimmer } from '@/components/AudioTrimmer';

export default function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [totalSizeMb, setTotalSizeMb] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [newVoiceName, setNewVoiceName] = useState('');
  const [newVoiceTags, setNewVoiceTags] = useState('');
  const [newVoiceFile, setNewVoiceFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>('');

  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const [inputMode, setInputMode] = useState<'upload' | 'record'>('upload');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [showTrimmer, setShowTrimmer] = useState(false);

  useEffect(() => {
    loadVoices();
  }, []);

  const loadVoices = async () => {
    try {
      const response = await getVoices();
      setVoices(response.voices);
      setTotalSizeMb(response.total_size_mb);
    } catch {
      setError('Failed to load voices');
    } finally {
      setIsLoading(false);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setNewVoiceFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.wav', '.mp3', '.flac', '.ogg', '.m4a'],
    },
    maxFiles: 1,
  });

  const handleSaveVoice = async () => {
    const audioSource = inputMode === 'upload' ? newVoiceFile : recordedBlob;

    if (!audioSource || !newVoiceName.trim()) {
      setError('Provide a name and audio');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveStatus('Saving voice...');

    try {
      let audioFile: File;
      if (inputMode === 'record' && recordedBlob) {
        audioFile = new File([recordedBlob], `recording_${Date.now()}.webm`, {
          type: recordedBlob.type,
        });
      } else {
        audioFile = newVoiceFile!;
      }

      const voice = await createVoice(newVoiceName, newVoiceTags, audioFile);
      setVoices((prev) => [...prev, voice]);

      setSaveStatus('Analyzing voice...');
      try {
        const analysisResult = await analyzeVoice(voice.id);
        setVoices((prev) =>
          prev.map((v) =>
            v.id === voice.id ? { ...v, analysis: analysisResult.analysis } : v
          )
        );
      } catch {
        // Analysis is optional
      }

      setShowForm(false);
      setNewVoiceName('');
      setNewVoiceTags('');
      setNewVoiceFile(null);
      setRecordedBlob(null);
      setRecordedDuration(0);
      setInputMode('upload');
      setSaveStatus('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save voice');
    } finally {
      setIsSaving(false);
      setSaveStatus('');
    }
  };

  const handleRecordingComplete = (blob: Blob, duration: number) => {
    setRecordedBlob(blob);
    setRecordedDuration(duration);
  };

  const handleDeleteVoice = async (voiceId: string) => {
    if (!confirm('Delete this voice?')) return;

    try {
      await deleteVoice(voiceId);
      setVoices((prev) => prev.filter((v) => v.id !== voiceId));
    } catch {
      setError('Failed to delete voice');
    }
  };

  const playVoice = (voice: Voice) => {
    if (playingVoice === voice.id) {
      audioElement?.pause();
      setPlayingVoice(null);
      return;
    }

    audioElement?.pause();
    const audio = new Audio(getAudioUrl(`/voice-files/${voice.filename}`));
    audio.onended = () => setPlayingVoice(null);
    audio.play();
    setAudioElement(audio);
    setPlayingVoice(voice.id);
  };

  const getBadgeClass = (category: string) => {
    switch (category) {
      case 'soft':
      case 'slow':
      case 'low':
        return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30';
      case 'moderate':
      case 'normal':
      case 'medium':
        return 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30';
      case 'loud':
      case 'fast':
      case 'high':
        return 'bg-amber-500/20 text-amber-200 border-amber-500/30';
      default:
        return 'bg-white/10 text-slate-400 border-white/10';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Voice Library</h1>
          <p className="mt-1 text-slate-400">
            Store voice samples for cloning and reuse
          </p>
        </div>
        <div className="flex items-center gap-3">
          {voices.length > 0 && (
            <div className="text-sm text-slate-400">
              {voices.length} voices | {totalSizeMb} MB
            </div>
          )}
          <button
            onClick={() => setShowTrimmer(true)}
            className="btn btn-secondary"
          >
            <Scissors className="w-4 h-4" />
            Import Media
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" />
            Add Voice
          </button>
        </div>
      </div>

      {error && (
        <div className="glass-card p-4 border-red-500/30 bg-red-500/10 text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {showTrimmer && (
        <AudioTrimmer
          onVoiceSaved={() => {
            loadVoices();
            setShowTrimmer(false);
          }}
          onClose={() => setShowTrimmer(false)}
        />
      )}

      {showForm && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-100">Add New Voice</h2>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Voice Name</label>
              <input
                type="text"
                value={newVoiceName}
                onChange={(e) => setNewVoiceName(e.target.value)}
                placeholder="My Voice, David, Maria..."
                className="input"
              />
            </div>

            <div>
              <label className="label">Tags (optional)</label>
              <input
                type="text"
                value={newVoiceTags}
                onChange={(e) => setNewVoiceTags(e.target.value)}
                placeholder="male, narrator, calm"
                className="input"
              />
            </div>

            <div>
              <label className="label">Audio Sample</label>
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setInputMode('upload')}
                  className={cn(
                    'flex-1 btn',
                    inputMode === 'upload' ? 'btn-primary' : 'btn-secondary'
                  )}
                >
                  <Upload className="w-4 h-4" />
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('record')}
                  className={cn(
                    'flex-1 btn',
                    inputMode === 'record' ? 'btn-primary' : 'btn-secondary'
                  )}
                >
                  <Mic className="w-4 h-4" />
                  Record
                </button>
              </div>

              {inputMode === 'upload' && (
                <div
                  {...getRootProps()}
                  className={cn(
                    'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
                    isDragActive ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/10 hover:border-white/20',
                    newVoiceFile && 'border-emerald-400 bg-emerald-500/10'
                  )}
                >
                  <input {...getInputProps()} />
                  {newVoiceFile ? (
                    <div className="text-emerald-200">
                      <p className="font-medium">{newVoiceFile.name}</p>
                      <p className="text-sm">Click or drag to replace</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 mx-auto text-slate-400" />
                      <p className="mt-2 text-sm text-slate-400">
                        Drag and drop an audio file, or click to select
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        WAV, MP3, FLAC, OGG supported
                      </p>
                    </>
                  )}
                </div>
              )}

              {inputMode === 'record' && (
                <div className="glass p-4 rounded-xl">
                  {recordedBlob ? (
                    <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                      <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                        <Mic className="w-5 h-5 text-emerald-200" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-emerald-200">Recording ready</p>
                        <p className="text-sm text-slate-400">Duration: {recordedDuration}s</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setRecordedBlob(null);
                          setRecordedDuration(0);
                        }}
                        className="btn btn-secondary text-sm"
                      >
                        Re-record
                      </button>
                    </div>
                  ) : (
                    <VoiceRecorder
                      onRecordingComplete={handleRecordingComplete}
                      disabled={isSaving}
                    />
                  )}
                </div>
              )}
            </div>

            {saveStatus && (
              <div className="flex items-center gap-2 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-200">
                <Loader2 className="w-4 h-4 animate-spin" />
                {saveStatus}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSaveVoice}
                disabled={isSaving || (!newVoiceFile && !recordedBlob) || !newVoiceName.trim()}
                className="btn btn-primary flex-1"
              >
                {isSaving ? 'Processing...' : 'Save Voice'}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setRecordedBlob(null);
                  setRecordedDuration(0);
                  setInputMode('upload');
                  setNewVoiceName('');
                  setNewVoiceTags('');
                  setNewVoiceFile(null);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {voices.length === 0 && !showTrimmer ? (
        <div className="glass-card p-12 text-center">
          <Mic className="w-12 h-12 mx-auto text-slate-400 mb-4" />
          <p className="text-slate-400 font-medium">No voices saved yet</p>
          <p className="text-sm text-slate-400 mt-2">
            Add a voice sample to start cloning
          </p>
          <div className="flex gap-3 justify-center mt-4">
            <button onClick={() => setShowTrimmer(true)} className="btn btn-secondary">
              <Video className="w-4 h-4" />
              Import Media
            </button>
            <button onClick={() => setShowForm(true)} className="btn btn-primary">
              Add Voice
            </button>
          </div>
        </div>
      ) : voices.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {voices.map((voice) => (
            <div key={voice.id} className="glass-card p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-100 truncate">{voice.name}</h3>
                    {voice.size_mb !== undefined && (
                      <span className="text-xs text-slate-400">{voice.size_mb} MB</span>
                    )}
                  </div>
                  {voice.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {voice.tags.map((tag) => (
                        <span key={tag} className="badge text-xs">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteVoice(voice.id)}
                  className="btn btn-ghost btn-icon"
                  title="Delete voice"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {voice.analysis && (
                <div className="mb-3 p-3 glass rounded-lg">
                  <p className="text-sm text-slate-400 mb-2">
                    {voice.analysis.description}
                  </p>
                  <div className="flex gap-1 text-xs flex-wrap">
                    <span className={cn('badge border', getBadgeClass(voice.analysis.pitch_category))}>
                      {voice.analysis.pitch_category} pitch
                    </span>
                    <span className={cn('badge border', getBadgeClass(voice.analysis.energy_category))}>
                      {voice.analysis.energy_category}
                    </span>
                    <span className={cn('badge border', getBadgeClass(voice.analysis.tempo_category))}>
                      {voice.analysis.tempo_category}
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={() => playVoice(voice)}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors',
                  playingVoice === voice.id
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white/5 text-slate-100 hover:bg-white/10'
                )}
              >
                {playingVoice === voice.id ? (
                  <>
                    <Pause className="w-4 h-4" />
                    Playing...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Play Sample
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="glass-card p-4">
        <h3 className="font-medium text-slate-100 mb-1">Voice cloning tips</h3>
        <p className="text-sm text-slate-400">
          Upload or record 5 to 15 seconds of clear speech. Select the saved voice
          in the Text to Speech page to generate audio.
        </p>
      </div>
    </div>
  );
}
