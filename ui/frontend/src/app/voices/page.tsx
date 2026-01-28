'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Search,
  Filter,
  Grid,
  List,
  User,
  ChevronRight,
  Sparkles,
  Music,
  MessageSquare,
  BookOpen,
  Gamepad2,
} from 'lucide-react';
import { getVoices, createVoice, deleteVoice, analyzeVoice, getAudioUrl, Voice } from '@/lib/api';
import { cn } from '@/lib/utils';
import VoiceRecorder from '@/components/VoiceRecorder';
import { AudioTrimmer } from '@/components/AudioTrimmer';

type TabType = 'my-voices' | 'explore';
type ViewType = 'grid' | 'list';

// Voice categories for filtering
const VOICE_CATEGORIES = [
  { id: 'all', label: 'All', icon: null },
  { id: 'conversational', label: 'Conversational', icon: MessageSquare },
  { id: 'narration', label: 'Narration', icon: BookOpen },
  { id: 'characters', label: 'Characters', icon: Gamepad2 },
  { id: 'music', label: 'Music', icon: Music },
];

export default function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [totalSizeMb, setTotalSizeMb] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs & Filters
  const [activeTab, setActiveTab] = useState<TabType>('my-voices');
  const [viewType, setViewType] = useState<ViewType>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Form state
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

  // Filter voices
  const filteredVoices = useMemo(() => {
    return voices.filter(voice => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = voice.name.toLowerCase().includes(query);
        const matchesTags = voice.tags.some(tag => tag.toLowerCase().includes(query));
        if (!matchesName && !matchesTags) return false;
      }

      // Category filter (based on tags)
      if (selectedCategory !== 'all') {
        const hasCategory = voice.tags.some(tag => 
          tag.toLowerCase().includes(selectedCategory.toLowerCase())
        );
        // Also check analysis description
        const analysisMatches = voice.analysis?.description?.toLowerCase().includes(selectedCategory) ?? false;
        if (!hasCategory && !analysisMatches) return false;
      }

      return true;
    });
  }, [voices, searchQuery, selectedCategory]);

  const getBadgeClass = (category: string) => {
    switch (category) {
      case 'soft':
      case 'slow':
      case 'low':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'moderate':
      case 'normal':
      case 'medium':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      case 'loud':
      case 'fast':
      case 'high':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      default:
        return 'bg-surface-2 text-foreground-muted border-glass-border';
    }
  };

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-foreground-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gradient">Voice Library</h1>
          <p className="mt-1 text-foreground-secondary">
            Store voice samples for cloning and reuse
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary"
        >
          <Plus className="w-4 h-4" />
          Create a Voice
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="tabs-container">
          <button
            onClick={() => setActiveTab('my-voices')}
            className={cn('tab-button', activeTab === 'my-voices' && 'active')}
          >
            My Voices
          </button>
          <button
            onClick={() => setActiveTab('explore')}
            className={cn('tab-button', activeTab === 'explore' && 'active')}
          >
            Explore
          </button>
        </div>

        <div className="flex items-center gap-2 text-sm text-foreground-muted">
          <span>{voices.length} voices</span>
          <span className="text-foreground-muted/50">|</span>
          <span>{totalSizeMb.toFixed(1)} MB used</span>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="search-input-wrapper flex-1">
          <Search className="search-icon w-4 h-4" />
          <input
            type="text"
            placeholder="Search library voices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1 p-1 bg-surface-1 rounded-lg">
          <button
            onClick={() => setViewType('grid')}
            className={cn(
              'p-2 rounded-md transition-colors',
              viewType === 'grid'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-foreground-muted hover:text-foreground'
            )}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewType('list')}
            className={cn(
              'p-2 rounded-md transition-colors',
              viewType === 'list'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-foreground-muted hover:text-foreground'
            )}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Category Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
        {VOICE_CATEGORIES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSelectedCategory(id)}
            className={cn('filter-pill', selectedCategory === id && 'active')}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {label}
          </button>
        ))}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="card p-4 border-red-500/30 bg-red-500/10 text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-sm underline">Dismiss</button>
        </div>
      )}

      {/* Audio Trimmer Modal */}
      {showTrimmer && (
        <AudioTrimmer
          onVoiceSaved={() => {
            loadVoices();
            setShowTrimmer(false);
          }}
          onClose={() => setShowTrimmer(false)}
        />
      )}

      {/* Add Voice Form */}
      {showForm && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Add New Voice</h2>
            <button onClick={() => setShowForm(false)} className="text-foreground-muted hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
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
                  isDragActive ? 'border-accent-primary bg-accent-primary/10' : 'border-glass-border hover:border-glass-border-hover',
                  newVoiceFile && 'border-green-400 bg-green-500/10'
                )}
              >
                <input {...getInputProps()} />
                {newVoiceFile ? (
                  <div className="text-green-300">
                    <p className="font-medium">{newVoiceFile.name}</p>
                    <p className="text-sm text-foreground-muted">Click or drag to replace</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 mx-auto text-foreground-muted" />
                    <p className="mt-2 text-sm text-foreground-muted">
                      Drag and drop an audio file, or click to select
                    </p>
                    <p className="mt-1 text-xs text-foreground-muted/60">
                      WAV, MP3, FLAC, OGG supported
                    </p>
                  </>
                )}
              </div>
            )}

            {inputMode === 'record' && (
              <div className="card p-4">
                {recordedBlob ? (
                  <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                      <Mic className="w-5 h-5 text-green-300" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-green-300">Recording ready</p>
                      <p className="text-sm text-foreground-muted">Duration: {recordedDuration}s</p>
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
            <div className="flex items-center gap-2 p-3 bg-accent-primary/10 border border-accent-primary/20 rounded-lg text-accent-primary">
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
      )}

      {/* My Voices Tab Content */}
      {activeTab === 'my-voices' && (
        <>
          {filteredVoices.length === 0 && !showTrimmer ? (
            <div className="card p-12 text-center">
              <Mic className="w-12 h-12 mx-auto text-foreground-muted mb-4" />
              <p className="text-foreground font-medium">
                {voices.length === 0 ? 'No voices saved yet' : 'No voices match your search'}
              </p>
              <p className="text-sm text-foreground-muted mt-2">
                {voices.length === 0 ? 'Add a voice sample to start cloning' : 'Try a different search term'}
              </p>
              {voices.length === 0 && (
                <div className="flex gap-3 justify-center mt-4">
                  <button onClick={() => setShowTrimmer(true)} className="btn btn-secondary">
                    <Video className="w-4 h-4" />
                    Import Media
                  </button>
                  <button onClick={() => setShowForm(true)} className="btn btn-primary">
                    Add Voice
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className={cn(
              viewType === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                : 'space-y-2'
            )}>
              {filteredVoices.map((voice) => (
                viewType === 'grid' ? (
                  // Grid Card View
                  <div key={voice.id} className="voice-card group">
                    <div className="flex items-start gap-3 mb-3">
                      {/* Avatar */}
                      <div className="voice-avatar">
                        {getInitials(voice.name)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground truncate">{voice.name}</h3>
                          {voice.size_mb !== undefined && (
                            <span className="text-xs text-foreground-muted">{voice.size_mb}MB</span>
                          )}
                        </div>
                        {voice.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {voice.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-foreground-muted">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <button
                        onClick={() => handleDeleteVoice(voice.id)}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-foreground-muted hover:text-red-400 transition-all"
                        title="Delete voice"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {voice.analysis && (
                      <p className="text-sm text-foreground-muted mb-3 line-clamp-2">
                        {voice.analysis.description}
                      </p>
                    )}

                    {voice.analysis && (voice.analysis.pitch_category || voice.analysis.energy_category || voice.analysis.tempo_category) && (
                      <div className="flex gap-1 mb-3 flex-wrap">
                        {voice.analysis.pitch_category && (
                          <span className={cn('text-xs px-2 py-0.5 rounded-full border', getBadgeClass(voice.analysis.pitch_category))}>
                            {voice.analysis.pitch_category} pitch
                          </span>
                        )}
                        {voice.analysis.energy_category && (
                          <span className={cn('text-xs px-2 py-0.5 rounded-full border', getBadgeClass(voice.analysis.energy_category))}>
                            {voice.analysis.energy_category}
                          </span>
                        )}
                        {voice.analysis.tempo_category && (
                          <span className={cn('text-xs px-2 py-0.5 rounded-full border', getBadgeClass(voice.analysis.tempo_category))}>
                            {voice.analysis.tempo_category}
                          </span>
                        )}
                      </div>
                    )}

                    <button
                      onClick={() => playVoice(voice)}
                      className={cn(
                        'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors',
                        playingVoice === voice.id
                          ? 'bg-accent-primary text-background'
                          : 'bg-surface-2 text-foreground hover:bg-surface-3'
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
                ) : (
                  // List View
                  <div
                    key={voice.id}
                    className="flex items-center gap-4 p-4 card group hover:bg-surface-1/50 transition-colors"
                  >
                    <div className="voice-avatar w-10 h-10 text-sm">
                      {getInitials(voice.name)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground">{voice.name}</h3>
                        {voice.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-foreground-muted">
                            {tag}
                          </span>
                        ))}
                      </div>
                      {voice.analysis && (
                        <p className="text-sm text-foreground-muted truncate mt-0.5">
                          {voice.analysis.description}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => playVoice(voice)}
                        className={cn(
                          'p-2 rounded-lg transition-colors',
                          playingVoice === voice.id
                            ? 'bg-accent-primary text-background'
                            : 'bg-surface-2 text-foreground-muted hover:text-foreground hover:bg-surface-3'
                        )}
                      >
                        {playingVoice === voice.id ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      
                      <button
                        onClick={() => handleDeleteVoice(voice.id)}
                        className="p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-foreground-muted hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}

          {/* Import Media FAB */}
          {voices.length > 0 && (
            <button
              onClick={() => setShowTrimmer(true)}
              className="fixed bottom-6 right-6 btn btn-secondary shadow-lg"
            >
              <Scissors className="w-4 h-4" />
              Import Media
            </button>
          )}
        </>
      )}

      {/* Explore Tab Content */}
      {activeTab === 'explore' && (
        <div className="card p-12 text-center">
          <Sparkles className="w-12 h-12 mx-auto text-foreground-muted mb-4" />
          <h3 className="text-lg font-medium text-foreground">Community Voices Coming Soon</h3>
          <p className="text-sm text-foreground-muted mt-2">
            Explore and discover voices created by the community
          </p>
        </div>
      )}

      {/* Tips Card */}
      <div className="card p-4">
        <h3 className="font-medium text-foreground mb-1">Voice cloning tips</h3>
        <p className="text-sm text-foreground-muted">
          Upload or record 5 to 15 seconds of clear speech. Select the saved voice
          in the Text to Speech page to generate audio with your cloned voice.
        </p>
      </div>
    </div>
  );
}
